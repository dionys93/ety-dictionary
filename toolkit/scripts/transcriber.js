import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchCasing, resolveForm } from './utils.js';

/**
 * ============================================================================
 * TYPE DEFINITIONS (Type-Driven Design)
 * ============================================================================
 */

/**
 * @typedef {Object} ASTToken
 * @property {string} text
 * @property {string} lemma
 * @property {string} pos
 * @property {string} tag
 * @property {boolean} is_ent
 * @property {string} whitespace
 */

/**
 * ============================================================================
 * RAILWAY PRIMITIVES (The Either Monad)
 * ============================================================================
 */

const Success = (value) => ({ status: 'success', value });
const Failure = (error) => ({ status: 'missing', error });
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

/**
 * ============================================================================
 * THE PIPELINE STEPS (Pure Composable Functions)
 * ============================================================================
 */

const matchDictionary = (token, brain) => {
    if (token.pos === 'SPACE' || token.pos === 'PUNCT' || token.pos === 'X' || token.is_ent) {
        return Success({ word: token.text, brainEntry: null, matchedCategory: null, token, isPreConjugated: true, isBypass: true });
    }

    const searchWord = token.lemma.toLowerCase().normalize('NFC');
    const rawWord = token.text.toLowerCase().normalize('NFC');
    
    const brainEntry = brain[rawWord] || brain[searchWord];
    if (!brainEntry) return Failure(searchWord); 

    let baseReplacement = null;
    let matchedCategory = null; 
    const pos = token.pos;

    // Verb / Aux routing
    if ((pos === 'VERB' || pos === 'AUX') && brainEntry.Verb) {
        baseReplacement = brainEntry.Verb;
        matchedCategory = 'Verb';
    } else if (pos === 'AUX') {
        if (brainEntry.Copula) { baseReplacement = brainEntry.Copula; matchedCategory = 'Copula'; }
        else if (brainEntry.Auxiliary) { baseReplacement = brainEntry.Auxiliary; matchedCategory = 'Auxiliary'; }
        else if (brainEntry.Modal) { baseReplacement = brainEntry.Modal; matchedCategory = 'Modal'; }
    }
    
    // Standard routing
    if (!baseReplacement) {
        if ((pos === 'NOUN' || pos === 'PROPN') && brainEntry.Noun) { baseReplacement = brainEntry.Noun; matchedCategory = 'Noun'; }
        else if (pos === 'ADJ' && brainEntry.Adjective) { baseReplacement = brainEntry.Adjective; matchedCategory = 'Adjective'; }
        else if (pos === 'ADV' && brainEntry.Adverb) { baseReplacement = brainEntry.Adverb; matchedCategory = 'Adverb'; }
        else if (pos === 'PRON' && brainEntry.Pronoun) { baseReplacement = brainEntry.Pronoun; matchedCategory = 'Pronoun'; }
        else if (pos === 'DET' && brainEntry.Determiner) { baseReplacement = brainEntry.Determiner; matchedCategory = 'Determiner'; }
        else if ((pos === 'ADP' || pos === 'SCONJ' || pos === 'CCONJ')) {
            if (brainEntry.Preposition) { baseReplacement = brainEntry.Preposition; matchedCategory = 'Preposition'; }
            else if (brainEntry.Conjunction) { baseReplacement = brainEntry.Conjunction; matchedCategory = 'Conjunction'; }
        }
    }

    // Absolute Option Fallback
    if (!baseReplacement) {
        const keys = Object.keys(brainEntry).filter(k => !k.includes('_conjugations'));
        if (keys.length > 0) {
            matchedCategory = keys[0];
            baseReplacement = brainEntry[matchedCategory];
        }
    }

    // THE FIX: Only skip morphology if it's a distinct irregular form (like "are"), NOT the base lemma (like "work").
    const isPreConjugated = !!brain[rawWord] && rawWord !== searchWord;

    return baseReplacement 
        ? Success({ word: baseReplacement, brainEntry, matchedCategory, token, isPreConjugated, isBypass: false })
        : Failure(searchWord);
};


// ... existing matchDictionary function ...

const applyMorphology = (result) => {
    if (result.status === 'missing' || result.value.isBypass || result.value.isPreConjugated) return result;

    const { word, brainEntry, matchedCategory, token } = result.value;
    const c = brainEntry[`${matchedCategory}_conjugations`] || {};
    let finalWord = word;

    switch (token.tag) {
        case 'NNS': 
            // THE TWEAK: Safely use our new explicit plural key
            finalWord = resolveForm(c.plural || '-s', word, false); 
            break;
        case 'VBP': 
            finalWord = c.present || word;
            break;
        case 'VBZ': 
            finalWord = resolveForm(c.third_singular || '-s', word, false); 
            break;
        case 'VBD': 
            finalWord = resolveForm(c.past || '-d', word, false);
            break;
        case 'VBN': 
            finalWord = resolveForm(c.participle || c.past || '-d', word, false);
            break;
        case 'VBG': 
            finalWord = resolveForm(c.gerund || '-ing', word, true); 
            break;
    }

    return Success({ ...result.value, word: finalWord });
};

const formatCasing = (result) => {
    if (result.status === 'missing' || result.value.isBypass) return result;

    const formattedWord = matchCasing(result.value.token.text, result.value.word);
    return Success({ ...result.value, word: formattedWord });
};


/**
 * ============================================================================
 * CORE ENGINE (The Transcriber Pipeline)
 * ============================================================================
 */

export const transcribeFromAST = (astTokens, brain) => {
    const processToken = pipe(
        (token) => matchDictionary(token, brain),
        applyMorphology,
        formatCasing
    );

    return astTokens
        .map(processToken)
        .reduce((acc, result, index) => {
            const token = astTokens[index]; 

            if (result.status === 'missing') {
                acc.missingWords.add(result.error);
                acc.text += `[${token.text}]` + token.whitespace;
            } else {
                acc.text += result.value.word + token.whitespace;
            }

            return acc;
        }, { text: '', missingWords: new Set() }); 
};

/**
 * ============================================================================
 * CLI EXECUTION BOUNDARY
 * ============================================================================
 */

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

    function crawlAndTranscribe(currentInputDir, currentOutputDir) {
        if (!fs.existsSync(currentOutputDir)) {
            fs.mkdirSync(currentOutputDir, { recursive: true });
        }

        const entries = fs.readdirSync(currentInputDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullInputPath = path.join(currentInputDir, entry.name);

            if (entry.isDirectory()) {
                const fullOutputPath = path.join(currentOutputDir, entry.name);
                crawlAndTranscribe(fullInputPath, fullOutputPath); 
            } else if (entry.name.endsWith('.json')) {
                const outFileName = entry.name.replace(/\.json$/, '.txt');
                const fullOutputPath = path.join(currentOutputDir, outFileName);

                const astTokens = JSON.parse(fs.readFileSync(fullInputPath, 'utf8'));
                
                const { text, missingWords } = transcribeFromAST(astTokens, brain);
                missingWords.forEach(word => globalMissingWords.add(word));
                
                fs.writeFileSync(fullOutputPath, text, 'utf8');
                filesProcessed++;
            }
        }
    }

    const stat = fs.statSync(inputPath);

    if (stat.isDirectory()) {
        console.log(`📂 Crawling AST directory: ${inputPath}`);
        crawlAndTranscribe(inputPath, outputPath);
    } else {
        console.log(`📝 Transcribing single AST: ${inputPath}`);
        const astTokens = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        
        const { text, missingWords } = transcribeFromAST(astTokens, brain);
        missingWords.forEach(word => globalMissingWords.add(word));
        
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, text, 'utf8');
        filesProcessed++;
    }

    console.log(`\n✅ Transcription Complete! Processed ${filesProcessed} files.`);
    console.log(`➡️  Saved to: ${outputPath}`);

    if (globalMissingWords.size > 0) {
        console.log(`\n⚠️  Master Missing Words Tracker (${globalMissingWords.size} unique untranslated words):`);
        console.log(Array.from(globalMissingWords).sort().join(', '));
    }
}