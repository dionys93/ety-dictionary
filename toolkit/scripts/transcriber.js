import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { matchCasing, resolveForm } from './utils.js';

/**
 * ============================================================================
 * TYPE DEFINITIONS (Algebraic Data Types)
 * ============================================================================
 */

/**
 * @template L, R
 * @typedef { {status: 'missing', error: L} | {status: 'success', value: R} } Either
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
 * @typedef {Object} TranslationState
 * @property {string} word
 * @property {Object|null} brainEntry
 * @property {string|null} matchedCategory
 * @property {ASTToken} token
 * @property {boolean} isPreConjugated
 * @property {boolean} isBypass
 */

/**
 * ============================================================================
 * RAILWAY PRIMITIVES & ROUTERS
 * ============================================================================
 */

/** @type {function(<R>(value: R) => Either<any, R>)} */
const Success = (value) => ({ status: 'success', value });

/** @type {function(<L>(error: L) => Either<L, any>)} */
const Failure = (error) => ({ status: 'missing', error });

const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

/**
 * Pure evaluator replacing imperative if/else routing
 */
const resolveCategory = (pos, entry) => {
    if ((pos === 'VERB' || pos === 'AUX') && entry.Verb) return { baseReplacement: entry.Verb, matchedCategory: 'Verb' };
    
    if (pos === 'AUX') {
        if (entry.Copula) return { baseReplacement: entry.Copula, matchedCategory: 'Copula' };
        if (entry.Auxiliary) return { baseReplacement: entry.Auxiliary, matchedCategory: 'Auxiliary' };
        if (entry.Modal) return { baseReplacement: entry.Modal, matchedCategory: 'Modal' };
    }
    
    if ((pos === 'NOUN' || pos === 'PROPN') && entry.Noun) return { baseReplacement: entry.Noun, matchedCategory: 'Noun' };
    if (pos === 'ADJ' && entry.Adjective) return { baseReplacement: entry.Adjective, matchedCategory: 'Adjective' };
    if (pos === 'ADV' && entry.Adverb) return { baseReplacement: entry.Adverb, matchedCategory: 'Adverb' };
    if (pos === 'PRON' && entry.Pronoun) return { baseReplacement: entry.Pronoun, matchedCategory: 'Pronoun' };
    if (pos === 'DET' && entry.Determiner) return { baseReplacement: entry.Determiner, matchedCategory: 'Determiner' };
    
    if (pos === 'ADP' || pos === 'SCONJ' || pos === 'CCONJ') {
        if (entry.Preposition) return { baseReplacement: entry.Preposition, matchedCategory: 'Preposition' };
        if (entry.Conjunction) return { baseReplacement: entry.Conjunction, matchedCategory: 'Conjunction' };
    }

    const keys = Object.keys(entry).filter(k => !k.includes('_conjugations'));
    if (keys.length > 0) return { baseReplacement: entry[keys[0]], matchedCategory: keys[0] };

    return { baseReplacement: null, matchedCategory: null };
};

/**
 * Pure evaluator replacing the switch statement mutation
 */
const evaluateMorphology = (tag, word, c) => {
    switch (tag) {
        case 'NNS': return resolveForm(c.plural || '-s', word, false);
        case 'VBP': return c.present || word;
        case 'VBZ': return resolveForm(c.third_singular || '-s', word, false);
        case 'VBD': return resolveForm(c.past || '-d', word, false);
        case 'VBN': return resolveForm(c.participle || c.past || '-d', word, false);
        case 'VBG': return resolveForm(c.gerund || '-ing', word, true);
        default: return word;
    }
};

/**
 * ============================================================================
 * THE PIPELINE STEPS (A -> B)
 * ============================================================================
 */

/**
 * Curried Lookup: A -> (B -> Either<L, R>)
 * @param {Object} brain 
 * @returns {function(ASTToken): Either<string, TranslationState>}
 */
const matchDictionary = (brain) => (token) => {
    const rawText = token.text.toLowerCase().normalize('NFC');

    // 1. Structural & Clitic Bypass
    // Skips punctuation, spaces, proper nouns, and English clitics ('s, 'd, 've, 'll, 're, 'm, n't)
    if (
        token.pos === 'SPACE' || 
        token.pos === 'PUNCT' || 
        token.pos === 'X' || 
        token.is_ent ||
        /^('[a-z]+|n't|’[a-z]+|n’t)$/.test(rawText)
    ) {
        return Success({ 
            word: token.text, 
            brainEntry: null, 
            matchedCategory: null, 
            token, 
            isPreConjugated: true, 
            isBypass: true 
        });
    }

    const searchWord = token.lemma.toLowerCase().normalize('NFC');
    
    // 2. Dictionary Search (Raw Word takes priority over Lemma)
    const brainEntry = brain[rawText] || brain[searchWord];
    if (!brainEntry) return Failure(searchWord); 

    const { baseReplacement, matchedCategory } = resolveCategory(token.pos, brainEntry);
    const isPreConjugated = !!brain[rawText] && rawText !== searchWord;

    return baseReplacement 
        ? Success({ word: baseReplacement, brainEntry, matchedCategory, token, isPreConjugated, isBypass: false })
        : Failure(searchWord);
};

/**
 * Either<string, TranslationState> -> Either<string, TranslationState>
 */
const applyMorphology = (result) => {
    if (result.status === 'missing' || result.value.isBypass || result.value.isPreConjugated) return result;

    const { word, brainEntry, matchedCategory, token } = result.value;
    const c = brainEntry[`${matchedCategory}_conjugations`] || {};
    
    const finalWord = evaluateMorphology(token.tag, word, c);

    return Success({ ...result.value, word: finalWord });
};

/**
 * Either<string, TranslationState> -> Either<string, TranslationState>
 */
const formatCasing = (result) => {
    if (result.status === 'missing' || result.value.isBypass) return result;
    
    const formattedWord = matchCasing(result.value.token.text, result.value.word);
    return Success({ ...result.value, word: formattedWord });
};

/**
 * ============================================================================
 * CORE ENGINE
 * ============================================================================
 */

export const transcribeFromAST = (astTokens, brain) => {
    const processToken = pipe(
        matchDictionary(brain),
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
    const stat = fs.statSync(inputPath);
    const globalMissingWords = new Set();

    const processSingleFile = (input, output) => {
        const astTokens = JSON.parse(fs.readFileSync(input, 'utf8'));
        const { text, missingWords } = transcribeFromAST(astTokens, brain);
        
        missingWords.forEach(word => globalMissingWords.add(word));
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, text, 'utf8');
        
        return 1;
    };

    const crawlAndTranscribe = (currentInputDir, currentOutputDir) => {
        if (!fs.existsSync(currentOutputDir)) fs.mkdirSync(currentOutputDir, { recursive: true });
        const entries = fs.readdirSync(currentInputDir, { withFileTypes: true });

        return entries.reduce((processedCount, entry) => {
            const fullInputPath = path.join(currentInputDir, entry.name);

            if (entry.isDirectory()) {
                const fullOutputPath = path.join(currentOutputDir, entry.name);
                return processedCount + crawlAndTranscribe(fullInputPath, fullOutputPath);
            } 
            
            if (entry.name.endsWith('.json')) {
                const outFileName = entry.name.replace(/\.json$/, '.txt');
                const fullOutputPath = path.join(currentOutputDir, outFileName);
                return processedCount + processSingleFile(fullInputPath, fullOutputPath);
            }

            return processedCount;
        }, 0);
    };

    const filesProcessed = stat.isDirectory() 
        ? (() => {
            console.log(`📂 Crawling AST directory: ${inputPath}`);
            return crawlAndTranscribe(inputPath, outputPath);
        })()
        : (() => {
            console.log(`📝 Transcribing single AST: ${inputPath}`);
            return processSingleFile(inputPath, outputPath);
        })();

    console.log(`\n✅ Transcription Complete! Processed ${filesProcessed} files.`);
    console.log(`➡️  Saved to: ${outputPath}`);

    if (globalMissingWords.size > 0) {
        console.log(`\n⚠️  Master Missing Words Tracker (${globalMissingWords.size} unique untranslated words):`);
        console.log(Array.from(globalMissingWords).sort().join(', '));
    }
}
