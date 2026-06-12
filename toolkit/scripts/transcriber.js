import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchCasing, resolveForm } from './utils.js';

/**
 * Maps spaCy's UPOS (Universal Part of Speech) tags to your dictionary keys.
 */
export const getReplacement = (pos, brainEntry) => {
    if ((pos === 'VERB' || pos === 'AUX') && brainEntry.Verb) return brainEntry.Verb;

    // Fallbacks for Auxiliaries
    if (pos === 'AUX') {
        if (brainEntry.Copula) return brainEntry.Copula;
        if (brainEntry.Auxiliary) return brainEntry.Auxiliary;
        if (brainEntry.Modal) return brainEntry.Modal;
    }

    if ((pos === 'NOUN' || pos === 'PROPN') && brainEntry.Noun) return brainEntry.Noun;
    if (pos === 'ADJ' && brainEntry.Adjective) return brainEntry.Adjective;
    if (pos === 'ADV' && brainEntry.Adverb) return brainEntry.Adverb;
    if (pos === 'PRON' && brainEntry.Pronoun) return brainEntry.Pronoun;
    if (pos === 'DET' && brainEntry.Determiner) return brainEntry.Determiner;

    if ((pos === 'ADP' || pos === 'SCONJ' || pos === 'CCONJ')) {
        if (brainEntry.Preposition) return brainEntry.Preposition;
        if (brainEntry.Conjunction) return brainEntry.Conjunction;
    }

    // Single-Map & Absolute Fallbacks
    const keys = Object.keys(brainEntry);
    return keys.length > 0 ? brainEntry[keys[0]] : null;
};

/**
 * Applies morphological rules using spaCy's fine-grained Penn Treebank tags.
 */
const applyMorphology = (word, tag) => {
    switch (tag) {
        case 'NNS': // Plural Noun
        case 'VBZ': // 3rd Person Singular Verb
            // FIXED: Suffix first, Base word second
            return resolveForm('-s', word, false); 
        case 'VBD': // Past Tense Verb
        case 'VBN': // Past Participle
            return resolveForm('-d', word, false);
        case 'VBG': // Gerund / Present Participle
            // FIXED: isGerund boolean set to true
            return resolveForm('-ing', word, true); 
        default:
            return word; // Base form
    }
};

/**
 * Core Transcriber: Pure mapping function that processes AST arrays without mutable state.
 */
export const transcribeFromAST = (astTokens, brain, missingWordsTracker = new Set()) => {
    return astTokens.map(token => {
        // 1. Pass through formatting, punctuation, and Protected Entities
        if (token.pos === 'SPACE' || token.pos === 'PUNCT' || token.pos === 'X' || token.is_ent) {
            return token.text + token.whitespace;
        }

        const searchWord = token.lemma.toLowerCase();
        const rawWord = token.text.toLowerCase();
        
        // 2. FIXED: PRIORITY SWAP
        // Always check the exact word on the page first to catch irregulars (me, are, was).
        // Only fall back to the lemma (root) if the exact word isn't in the dictionary.
        const brainEntry = brain[rawWord] || brain[searchWord];

        // 3. Translation and Conjugation logic
        if (brainEntry) {
            const baseReplacement = getReplacement(token.pos, brainEntry);
            if (baseReplacement) {
                // Only conjugate if we fell back to the lemma.
                // If we found the raw word (e.g. "are"), it is ALREADY conjugated!
                const finalWord = brain[rawWord] 
                    ? baseReplacement 
                    : applyMorphology(baseReplacement, token.tag);

                return matchCasing(token.text, finalWord) + token.whitespace;
            }
        }

        // 4. Missing word handling
        missingWordsTracker.add(searchWord);
        return `[${token.text}]` + token.whitespace;
        
    }).join('');
};

// ============================================================================
// CLI EXECUTION & RECURSIVE DIRECTORY CRAWLER
// ============================================================================

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3];
    const __dirname = path.dirname(__filename);
    const BRAIN_PATH = path.resolve(__dirname, '../../toolkit/dist/translationBrain.json');

    if (!inputPath || !outputPath) {
        console.error("Usage: node scripts/transcriber.js <input_dir_or_file> <output_dir_or_file>");
        process.exit(1);
    }

    if (!fs.existsSync(BRAIN_PATH)) {
        console.error(`❌ Error: translationBrain.json is missing at ${BRAIN_PATH}`);
        process.exit(1);
    }

    const brain = JSON.parse(fs.readFileSync(BRAIN_PATH, 'utf8'));
    const globalMissingWords = new Set();
    let filesProcessed = 0;

    // Recursive function to walk directories and mirror the structure
    function crawlAndTranscribe(currentInputDir, currentOutputDir) {
        // 1. Check and create the directory ONCE per folder, not once per file
        if (!fs.existsSync(currentOutputDir)) {
            fs.mkdirSync(currentOutputDir, { recursive: true });
        }

        const entries = fs.readdirSync(currentInputDir, { withFileTypes: true });

        // 2. Loop through the contents
        for (const entry of entries) {
            const fullInputPath = path.join(currentInputDir, entry.name);

            if (entry.isDirectory()) {
                const fullOutputPath = path.join(currentOutputDir, entry.name);
                crawlAndTranscribe(fullInputPath, fullOutputPath);
            } else if (entry.name.endsWith('.json')) {
                const outFileName = entry.name.replace(/\.json$/, '.txt');
                const fullOutputPath = path.join(currentOutputDir, outFileName);

                const astTokens = JSON.parse(fs.readFileSync(fullInputPath, 'utf8'));
                const transcribedText = transcribeFromAST(astTokens, brain, globalMissingWords);

                fs.writeFileSync(fullOutputPath, transcribedText, 'utf8');
                filesProcessed++;
            }
        }
    }

    const stat = fs.statSync(inputPath);

    if (stat.isDirectory()) {
        console.log(`📂 Crawling AST directory: ${inputPath}`);
        crawlAndTranscribe(inputPath, outputPath);
    } else {
        // Fallback: If the user just passed a single file instead of a directory
        console.log(`📝 Transcribing single AST: ${inputPath}`);
        const astTokens = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        const transcribedText = transcribeFromAST(astTokens, brain, globalMissingWords);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, transcribedText, 'utf8');
        filesProcessed++;
    }

    console.log(`\n✅ Transcription Complete! Processed ${filesProcessed} files.`);
    console.log(`➡️  Saved to: ${outputPath}`);

    if (globalMissingWords.size > 0) {
        console.log(`\n⚠️  Master Missing Words Tracker (${globalMissingWords.size} unique untranslated words):`);
        console.log(Array.from(globalMissingWords).sort().join(', '));
    }
}
