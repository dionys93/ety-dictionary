// /**
//  * ============================================================================
//  * INGLISCE LIBRARY TRANSCRIBER & NLP ENGINE
//  * * Recursively crawls `/data-text/books` and transcribes every page.
//  * * Exports `transcribe()` for isolated testing of the compromise.js pipeline.
//  * ============================================================================
//  */

// import fs from 'fs';
// import path from 'path';
// import nlp from 'compromise';
// import { fileURLToPath } from 'url';
// import { matchCasing } from './utils.js';

// /**
//  * HARDCODED_OVERRIDES: 
//  * A safety net for complex, multi-word contractions that traditionally break NLP
//  * tokenizer boundaries. These exact casing matches are swapped with placeholders
//  * *before* the NLP engine reads the text, preventing translation corruption.
//  */
// const HARDCODED_OVERRIDES = {
//     "I'll": "I’ll", "I've": "I've", "I'd": "I'd",
//     "we've": "uie've", "we'd": "uie'd",
//     "We've": "Uie've", "We'd": "Uie'd",
//     "You've": "You've", "You'd": "You'd",
//     "you've": "you've", "you'd": "you'd",
//     "it's": "it's", "It's": "It's",
//     "it'd": "it'd", "It'd": "It'd",
//     "she's": "sie's", "She's": "Sie's",
//     "she'd": "sie'd", "She'd": "Sie'd",
//     "he's": "hie’s", "he’d": "hie’d",
//     "He's": "Hie’s", "He’d": "Hie’d",
//     "They've": "Ћey've", "They'd": "Ћey'd",
//     "they've": "þey've", "they'd": "þey'd"
// };

// // ============================================================================
// // CORE ENGINE (Exported for Testing)
// // ============================================================================

// /**
//  * The Disambiguation Heuristic Engine.
//  * Evaluates the POS tags applied by `compromise` against the available dictionary 
//  * mappings to select the correct homograph (e.g., "circles" as Verb vs Noun).
//  */
// export const getReplacement = (term, brainEntry) => {
//     // 1. Core Verbs: Prioritize highly specific auxiliary/modal tags
//     if (term.has('#Copula') && brainEntry.Copula) return brainEntry.Copula;
//     if (term.has('#Auxiliary') && brainEntry.Auxiliary) return brainEntry.Auxiliary;
//     if (term.has('#Modal') && brainEntry.Modal) return brainEntry.Modal;

//     // 2. Strict Homograph Checks: Match the NLP tag directly to the brain
//     if (term.has('#Verb') && brainEntry.Verb) return brainEntry.Verb;
//     if (term.has('#Noun') && brainEntry.Noun) return brainEntry.Noun;
//     if (term.has('#Adjective') && brainEntry.Adjective) return brainEntry.Adjective;
//     if (term.has('#Determiner') && brainEntry.Determiner) return brainEntry.Determiner;
//     if (term.has('#Value') && brainEntry.Value) return brainEntry.Value;

//     // 3. Structural Bypass: These words rarely have conflicting homographs, 
//     // so we can safely bypass the strict NLP checks for performance/reliability.
//     if (brainEntry.Preposition) return brainEntry.Preposition;
//     if (brainEntry.Conjunction) return brainEntry.Conjunction;
//     if (brainEntry.Pronoun) return brainEntry.Pronoun;
//     if (brainEntry.Adverb) return brainEntry.Adverb;

//     // 4. Safe Single-Map Fallback: If the dictionary only has ONE part of speech
//     // for this word, just use it—unless it directly contradicts a strict Verb/Noun rule.
//     const keys = Object.keys(brainEntry);
//     if (keys.length === 1) {
//         const onlyPos = keys[0];
//         if (onlyPos === 'Verb' && term.has('#Noun')) return null;
//         if (onlyPos === 'Noun' && term.has('#Verb')) return null;
//         return brainEntry[onlyPos];
//     }
//     return brainEntry[keys[0]];
// };

// /**
//  * The primary transcription function. Runs a 4-pass transformation algorithm 
//  * to ensure context-awareness while strictly preserving original punctuation.
//  */
// export function transcribe(text, brain, missingWordsTracker = new Set()) {
//     // 1. Normalize Unicode immediately to prevent NFC/NFD byte mismatches in Vitest
//     text = text.normalize('NFC');

//     // Pre-calculate multi-word terms (e.g., "look out") for Pass 2
//     const multiWords = Object.keys(brain).filter(k => k.includes(' ') || k.includes("'"));

//     // Normalize curly apostrophes globally so brain keys always match cleanly
//     const normalizedText = text.replace(/[\u2018\u2019\u02BC]/g, "'");
//     const lines = normalizedText.split('\n');

//     const transcribedLines = lines.map(line => {
//         if (!line.trim()) return line;

//         // --- PASS 1: Protect hardcoded contractions with placeholders ---
//         // Prevents the NLP engine from aggressively tokenizing these complex forms
//         const placeholders = {};
//         let phIndex = 0;
//         let processedLine = line;

//         Object.keys(HARDCODED_OVERRIDES).forEach(key => {
//             const escaped = key.replace(/['']/g, "[''']");
//             // Negative lookbehinds/lookaheads ensure we only match whole words
//             const regex = new RegExp(`(?<![a-zA-Z\u00C0-\u024F])${escaped}(?![a-zA-Z\u00C0-\u024F])`, 'g');
//             processedLine = processedLine.replace(regex, (match) => {
//                 const ph = `XXPH${phIndex++}XX`;
//                 placeholders[ph] = matchCasing(match, HARDCODED_OVERRIDES[key]);
//                 return ph;
//             });
//         });

//         // Initialize NLP Engine
//         const doc = nlp(processedLine);

//         // Mark completely empty spaces as Ghost Words to drop later
//         doc.terms().forEach(t => {
//             if (t.text().trim() === '') t.tag('#GhostWord');
//         });

//         // --- PASS 2: Multi-word phrases ---
//         // Swap out compound dictionary entries before single-term looping
//         multiWords.forEach(key => {
//             const entry = brain[key];
//             const fallback = entry.Verb || entry.Copula || entry.Auxiliary || entry.Modal || Object.values(entry)[0];

//             if (fallback) {
//                 doc.match(key).forEach(m => {
//                     const casedFallback = matchCasing(m.text(), fallback);
//                     m.replaceWith(casedFallback, { keepTags: true, keepCase: false });
//                     m.tag('#Translated'); // Lock term to prevent Pass 3 from touching it
//                 });
//             }
//         });

//         // --- PASS 3: Term loop with contraction lookahead ---
//         doc.terms().forEach((term, i) => {
//             if (term.has('#Translated')) return;

//             if (term.has('#GhostWord')) {
//                 term.replaceWith('');
//                 term.tag('#Translated');
//                 return;
//             }

//             const rawText = term.text();
//             const rawNormal = term.text('normal');
//             if (!rawNormal) return;

//             // Skip placeholder tokens so they survive untouched to Pass 4
//             if (/^XXPH\d+XX$/.test(rawText)) {
//                 term.tag('#Translated');
//                 return;
//             }

//             // Skip compromise-split contraction suffixes (e.g., 've, 'll). 
//             // They are handled dynamically by the root word processing.
//             if (/^(n['']t|[''][srelldvem])$/i.test(rawNormal)) {
//                 term.tag('#Translated');
//                 return;
//             }

//             // Check if the next token is an NLP-split "n't"
//             const nextTerm = doc.terms().eq(i + 1);
//             const nextIsNegation = nextTerm && /^n['']t$/i.test(nextTerm.text('normal'));

//             if (nextIsNegation) {
//                 const negKey = rawNormal + "n't";
//                 if (brain[negKey]) {
//                     const negEntry = brain[negKey];
//                     // Negations strictly map to verb/auxiliary roles
//                     const replacement = negEntry.Modal || negEntry.Verb ||
//                         negEntry.Copula || negEntry.Auxiliary ||
//                         Object.values(negEntry)[0];
//                     if (replacement) {
//                         term.replaceWith(matchCasing(rawText, replacement), { keepTags: true, keepCase: false });
//                         term.tag('#Translated');
//                         nextTerm.tag('#Translated'); // Lock the "n't" so we don't process it next loop
//                         return;
//                     }
//                 }
//             }

//             // Normal dictionary lookup
//             const wordWithoutPunctuation = rawText.replace(/[^a-zA-Z'']/g, '');
//             // Strip structural suffixes from the lookup query so we query the root
//             const suffixMatch = wordWithoutPunctuation.match(/([''](s|re|ll|d|ve|m))$/i);
//             const suffix = suffixMatch ? suffixMatch[1] : '';
//             const normal = suffix
//                 ? rawNormal.replace(new RegExp(suffix + '$', 'i'), '')
//                 : rawNormal;

//             // Consult the Brain
//             if (brain[normal]) {
//                 const baseReplacement = getReplacement(term, brain[normal]);
//                 if (baseReplacement) {
//                     const finalReplacement = baseReplacement + suffix; // Re-attach structural suffix
//                     const casedReplacement = matchCasing(rawText, finalReplacement);
//                     // keepTags ensures punctuation is perfectly preserved
//                     term.replaceWith(casedReplacement, { keepTags: true, keepCase: false });
//                     term.tag('#Translated');
//                     return;
//                 }
//             }

//             // If word is completely missing from dictionary, wrap it in brackets to highlight it
//             if (!rawText.includes('[')) {
//                 const bracketedText = rawText.replace(/([a-zA-Z]+(?:[''][a-zA-Z]+)*)/, '[$1]');
//                 term.replaceWith(bracketedText, { keepTags: true, keepCase: false });
//             }
//             missingWordsTracker.add(normal);
//         });

//         // --- PASS 4: Restore placeholders ---
//         let result = doc.text();
//         Object.keys(placeholders).forEach(ph => {
//             result = result.replace(ph, placeholders[ph]);
//         });
//         return result;
//     });

//     // Enforce strict NFC composition on the final output to prevent NFD decomposition bugs
//     return transcribedLines.join('\n').normalize('NFC');
// }

// // ============================================================================
// // CLI CRAWLER EXECUTION
// // ============================================================================

// const __filename = fileURLToPath(import.meta.url);
// if (process.argv[1] === __filename) {
//     const __dirname = path.dirname(__filename);
//     const PROJECT_ROOT = path.resolve(__dirname, '../../');

//     const INPUT_DIR = path.join(PROJECT_ROOT, 'data-text', 'books');
//     const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data-text', 'inglisce', 'books');
//     const BRAIN_PATH = path.join(PROJECT_ROOT, 'toolkit', 'dist', 'translationBrain.json');

//     if (!fs.existsSync(BRAIN_PATH)) {
//         console.error('❌ Error: translationBrain.json is missing. Run `node scripts/build-dictionary.js` first.');
//         process.exit(1);
//     }
//     if (!fs.existsSync(INPUT_DIR)) {
//         console.error(`❌ Error: Input directory not found at ${INPUT_DIR}`);
//         process.exit(1);
//     }

//     const brain = JSON.parse(fs.readFileSync(BRAIN_PATH, 'utf8'));
//     const globalMissingWords = new Set();
//     let filesProcessed = 0;

//     // Recursively crawls the input directory to batch process all txt files
//     function crawlAndTranscribe(currentDir) {
//         const files = fs.readdirSync(currentDir, { withFileTypes: true });

//         files.forEach(file => {
//             const fullPath = path.join(currentDir, file.name);

//             if (file.isDirectory()) {
//                 crawlAndTranscribe(fullPath);
//             } else if (file.name.endsWith('.txt')) {
//                 const relativePath = path.relative(INPUT_DIR, fullPath);
//                 const outputPath = path.join(OUTPUT_DIR, relativePath);

//                 const text = fs.readFileSync(fullPath, 'utf8');
//                 // Pass the shared missingWords Set to aggregate failures across the whole library
//                 const transcribed = transcribe(text, brain, globalMissingWords);

//                 const outDir = path.dirname(outputPath);
//                 if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
//                 fs.writeFileSync(outputPath, transcribed, 'utf8');
//                 filesProcessed++;
//             }
//         });
//     }

//     console.log(`📚 Compiling Library from: ${INPUT_DIR}`);
//     console.log(`➡️  Outputting to: ${OUTPUT_DIR}\n`);

//     crawlAndTranscribe(INPUT_DIR);

//     console.log(`✅ Library Transcription Complete!`);
//     console.log(`📄 Total Pages Transcribed: ${filesProcessed}`);

//     if (globalMissingWords.size > 0) {
//         console.log(`\n⚠️  Master Missing Words Tracker (${globalMissingWords.size} unique untranslated words):`);
//         console.log(Array.from(globalMissingWords).sort().join(', '));
//     }
// }

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
            return resolveForm(word, '-s', false);
        case 'VBD': // Past Tense Verb
        case 'VBN': // Past Participle
            return resolveForm(word, '-d', false);
        case 'VBG': // Gerund / Present Participle
            return resolveForm(word, '-ing', false);
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

        // 2. Find brain entry via pure fallback evaluation
        const searchWord = token.lemma.toLowerCase();
        const rawWord = token.text.toLowerCase();
        const brainEntry = brain[searchWord] || brain[rawWord];

        // 3. Translation and Conjugation logic
        if (brainEntry) {
            const baseReplacement = getReplacement(token.pos, brainEntry);
            if (baseReplacement) {
                const conjugated = applyMorphology(baseReplacement, token.tag);
                return matchCasing(token.text, conjugated) + token.whitespace;
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