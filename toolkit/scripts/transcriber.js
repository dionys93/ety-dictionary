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
 * @property {string} text - The raw text from spaCy
 * @property {string} lemma - The lemmatized root word
 * @property {string} pos - The coarse UPOS tag (e.g., 'VERB', 'NOUN')
 * @property {string} tag - The fine-grained Penn Treebank tag
 * @property {boolean} is_ent - Protected Named Entity flag
 * @property {string} whitespace - Trailing whitespace string
 */

/**
 * @typedef {Object} Conjugations
 * @property {string} [third_singular]
 * @property {string} [past]
 * @property {string} [participle]
 * @property {string} [gerund]
 */

/**
 * @typedef {Object} BrainEntry
 * @property {string} [Verb]
 * @property {string} [Noun]
 * @property {string} [Adjective]
 * @property {string} [Adverb]
 * @property {string} [Pronoun]
 * @property {string} [Determiner]
 * @property {string} [Preposition]
 * @property {string} [Conjunction]
 * @property {string} [Copula]
 * @property {string} [Auxiliary]
 * @property {string} [Modal]
 * @property {Conjugations|string[]} [conjugations] - Explicit dictionary overrides
 */

/**
 * ============================================================================
 * RAILWAY PRIMITIVES (The Either Monad)
 * ============================================================================
 */

const Success = (value) => ({ status: 'success', value });
const Failure = (error) => ({ status: 'missing', error });

/**
 * Native functional pipe: Passes a value through a sequence of pure functions.
 */
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

/**
 * ============================================================================
 * THE PIPELINE STEPS (Pure Composable Functions)
 * ============================================================================
 */

/**
 * STEP 1: Look up the token in the dictionary.
 * @param {ASTToken} token 
 * @param {Object} brain 
 */
const matchDictionary = (token, brain) => {
    // Structural Bypass: Move straight to formatting if not a translatable word
    if (token.pos === 'SPACE' || token.pos === 'PUNCT' || token.pos === 'X' || token.is_ent) {
        return Success({ word: token.text, brainEntry: null, token, isBypass: true });
    }

    // Strict NFC normalization applied just-in-time to catch byte-level mismatches from spaCy
    const searchWord = token.lemma.toLowerCase().normalize('NFC');
    const rawWord = token.text.toLowerCase().normalize('NFC');
    
    // Priority: Explicit raw word (e.g. 'are') -> Lemmatized root (e.g. 'be')
    const brainEntry = brain[rawWord] || brain[searchWord];
    if (!brainEntry) return Failure(searchWord); // Switch to the Error Track

    let baseReplacement = null;
    const pos = token.pos;

    // Verb / Aux routing
    if ((pos === 'VERB' || pos === 'AUX') && brainEntry.Verb) baseReplacement = brainEntry.Verb;
    if (pos === 'AUX') {
        if (brainEntry.Copula) baseReplacement = brainEntry.Copula;
        else if (brainEntry.Auxiliary) baseReplacement = brainEntry.Auxiliary;
        else if (brainEntry.Modal) baseReplacement = brainEntry.Modal;
    }
    
    // Standard routing
    if (!baseReplacement) {
        if ((pos === 'NOUN' || pos === 'PROPN') && brainEntry.Noun) baseReplacement = brainEntry.Noun;
        else if (pos === 'ADJ' && brainEntry.Adjective) baseReplacement = brainEntry.Adjective;
        else if (pos === 'ADV' && brainEntry.Adverb) baseReplacement = brainEntry.Adverb;
        else if (pos === 'PRON' && brainEntry.Pronoun) baseReplacement = brainEntry.Pronoun;
        else if (pos === 'DET' && brainEntry.Determiner) baseReplacement = brainEntry.Determiner;
        else if ((pos === 'ADP' || pos === 'SCONJ' || pos === 'CCONJ')) {
            if (brainEntry.Preposition) baseReplacement = brainEntry.Preposition;
            else if (brainEntry.Conjunction) baseReplacement = brainEntry.Conjunction;
        }
    }

    // Absolute Option Fallback
    if (!baseReplacement) {
        const keys = Object.keys(brainEntry).filter(k => k !== 'conjugations');
        baseReplacement = keys.length > 0 ? brainEntry[keys[0]] : null;
    }

    // If we resolved the exact raw word (e.g., "are"), assume it is pre-conjugated
    const isPreConjugated = !!brain[rawWord];

    return baseReplacement 
        ? Success({ word: baseReplacement, brainEntry, token, isPreConjugated, isBypass: false })
        : Failure(searchWord);
};

/**
 * STEP 2: Apply suffix math or irregular dictionary overrides.
 */
const applyMorphology = (result) => {
    // Skip if on the error track, or if it's punctuation, or already conjugated
    if (result.status === 'missing' || result.value.isBypass || result.value.isPreConjugated) return result;

    const { word, brainEntry, token } = result.value;
    const c = brainEntry.conjugations || {};
    let finalWord = word;

    // resolveForm naturally drops the terminal -e for gerunds based on your linguistic rules
    switch (token.tag) {
        case 'NNS': 
            const pluralSuffix = Array.isArray(c) && c.length > 0 ? c[0] : '-s';
            finalWord = resolveForm(pluralSuffix, word, false); 
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

/**
 * STEP 3: Match the original casing structure.
 */
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
    
    // Create the pure execution pipeline
    const processToken = pipe(
        (token) => matchDictionary(token, brain),
        applyMorphology,
        formatCasing
    );

    // Map -> Reduce execution
    return astTokens
        .map(processToken)
        .reduce((acc, result, index) => {
            const token = astTokens[index]; // We need the original whitespace regardless of success/fail

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
 * PART 3: THE CLI EXECUTION BOUNDARY (IMPURE SIDE-EFFECTS)
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