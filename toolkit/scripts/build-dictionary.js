/** build-dictionary.js
 * ============================================================================
 * TRANSLATION BRAIN COMPILER
 * * This script operates as a pure functional pipeline. It maps raw Bash 
 * JSONL rows into explicit "Mapping Instructions", and then reduces those 
 * instructions into the final JIT Translation Brain.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ============================================================================
 * TYPE DEFINITIONS (Type-Driven Design)
 * ============================================================================
 */

/**
 * @typedef {Object} RawRow
 * @property {string} me_word
 * @property {string} inglisce_word
 * @property {string} [pos]
 * @property {Object|Array} [conjugations]
 */

/**
 * @typedef {Object} MappingInstruction
 * @property {string} eng - The target English lookup key
 * @property {string} ing - The resulting Inglisce translation
 * @property {string} pos - The specific grammatical role
 */

/**
 * @typedef {Object} CleanedData
 * @property {string} baseEng
 * @property {string} baseIng
 * @property {string[]} posCategories
 * @property {Object|Array} conjugations
 * @property {MappingInstruction[]} mappings
 */

// Maps Bash/Dictionary shorthand POS tags to standard spaCy tags
const posMap = {
    'verb': 'Verb', 'v': 'Verb', 'tr v': 'Verb', 'intr v': 'Verb',
    'noun': 'Noun', 'n': 'Noun', 'm n': 'Noun', 'f n': 'Noun',
    'masculine noun': 'Noun', 'feminine noun': 'Noun', 'neuter noun': 'Noun',
    'adjective': 'Adjective', 'adj': 'Adjective',
    'adverb': 'Adverb', 'adv': 'Adverb',
    'preposition': 'Preposition', 'prep': 'Preposition',
    'pronoun': 'Pronoun', 'pron': 'Pronoun',
    'conjunction': 'Conjunction', 'conj': 'Conjunction',
    'number': 'Value', 'num': 'Value',
    'article': 'Determiner', 'art': 'Determiner',
    'definite article': 'Determiner', 'indefinite article': 'Determiner',
    'defin': 'Determiner', 'indefin': 'Determiner',
    'modal': 'Modal', 'aux': 'Auxiliary', 'auxiliary': 'Auxiliary'
};

/**
 * ============================================================================
 * RAILWAY PRIMITIVES (The Either Monad)
 * ============================================================================
 */

const Success = (value) => ({ status: 'success', value });
const Failure = (error) => ({ status: 'skipped', error });
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

/**
 * ============================================================================
 * THE PIPELINE STEPS (Pure Composable Functions)
 * ============================================================================
 */

/**
 * STEP 1: Validates and sanitizes the raw Bash row.
 * @param {RawRow} row 
 */
const validateAndClean = (row) => {
    if (!row || !row.me_word || !row.inglisce_word) return Failure('Missing core words');

    // Strict NFC composition to prevent downstream byte-level mismatches
    const baseEng = row.me_word.replace(/\([^)]+\)/g, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/^to\s+/i, '')
        .trim()
        .split(/\s+/)[0]
        .toLowerCase()
        .normalize('NFC');

    const baseIng = (typeof row.inglisce_word === 'string' 
        ? row.inglisce_word.replace(/[.,!?()[\]{}]/g, '').trim() 
        : row.inglisce_word).normalize('NFC');

    if (!baseEng) return Failure('English word sanitized to empty string');

    const posCategories = (row.pos || '')
        .split(',')
        .map(p => posMap[p.toLowerCase().trim()])
        .filter(Boolean);

    if (posCategories.length === 0) return Failure('No valid POS categories found');

    return Success({ 
        baseEng, 
        baseIng, 
        posCategories, 
        conjugations: row.conjugations || {}, 
        mappings: [] 
    });
};

/**
 * STEP 2: Generates the flat array of mappings for the dictionary entry.
 * Calculates explicit irregulars (like 'am' -> 'be') without mutating external state.
 */
const generateMappings = (result) => {
    if (result.status === 'skipped') return result;

    const { baseEng, baseIng, posCategories, conjugations } = result.value;
    const mappings = [];

    posCategories.forEach(posCategory => {
        // 1. Always map the base lemma
        mappings.push({ eng: baseEng, ing: baseIng, pos: posCategory });

        // 2. Map Class 6 Explicit Arrays (be, do, have)
        if (Array.isArray(conjugations)) {
            if (baseEng === 'be') {
                const forms = ['am', 'is', 'are', 'was', 'were', 'been', 'being', "isn't", "aren't", "wasn't", "weren't"];
                forms.forEach((form, i) => {
                    if (conjugations[i]) {
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Copula' });
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Verb' });
                    }
                });
            } else if (baseEng === 'do') {
                const forms = ['does', 'did', 'done', 'doing', "don't", "doesn't", "didn't"];
                forms.forEach((form, i) => {
                    if (conjugations[i]) {
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Verb' });
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Auxiliary' });
                    }
                });
            } else if (baseEng === 'have') {
                const forms = ['has', 'had', 'having', "haven't", "hasn't", "hadn't"];
                forms.forEach((form, i) => {
                    if (conjugations[i]) {
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Verb' });
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Auxiliary' });
                    }
                });
            }
        } 
        
        // 3. Map Modals
        else if (posCategory === 'Modal') {
            const pastMap = { 'can': 'could', 'will': 'would', 'shall': 'should', 'may': 'might' };
            const pastEng = pastMap[baseEng];
            const c = conjugations;

            if (pastEng && c.past && !c.past.startsWith('-')) {
                mappings.push({ eng: pastEng, ing: c.past, pos: 'Modal' });
            }
            
            const negPresent = (c.third_singular && !c.third_singular.startsWith('-')) ? c.third_singular : baseIng;
            if (baseEng === 'can') mappings.push({ eng: 'cannot', ing: negPresent, pos: 'Modal' });
        }
    });

    return Success({ ...result.value, mappings });
};


/**
 * ============================================================================
 * THE CORE REDUCER
 * ============================================================================
 */

export function buildBrain(dataset) {
    const processRow = pipe(validateAndClean, generateMappings);
    
    // Process all rows into a pure array of instructions
    const processedRows = dataset.map(processRow);

    // Fold the instructions into the final Brain object
    // Note: We use a local mutating accumulator here strictly for performance.
    // Deep-copying an object with 10,000+ keys on every reduce iteration would freeze the build.
    // Because the mutation is isolated inside this pure function boundary, it remains functionally safe.
    const brain = processedRows.reduce((acc, result) => {
        if (result.status === 'skipped') return acc;

        const { baseEng, conjugations, mappings } = result.value;

        // Apply all generated mappings
        mappings.forEach(({ eng, ing, pos }) => {
            acc[eng] = acc[eng] || {};
            acc[eng][pos] = ing;
        });

        // Attach conjugations to the lemma root for downstream JIT morphology
        if (conjugations && Object.keys(conjugations).length > 0) {
            if (Array.isArray(conjugations)) {
                acc[baseEng].conjugations = conjugations;
            } else {
                acc[baseEng].conjugations = acc[baseEng].conjugations || {};
                Object.assign(acc[baseEng].conjugations, conjugations);
            }
        }

        return acc;
    }, {});

    const compiledCount = processedRows.filter(r => r.status === 'success').length;

    return { brain, compiledCount };
}

/**
 * ============================================================================
 * CLI EXECUTION
 * ============================================================================
 */

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    const __dirname = path.dirname(__filename);
    const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
    const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

    console.log('🧠 Compiling Typed JIT Brain...');

    if (!fs.existsSync(JSONL_FILE)) {
        console.error(`❌ JSONL file not found at ${JSONL_FILE}!`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(JSONL_FILE, 'utf8');
    const dataset = fileContent.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

    const { brain, compiledCount } = buildBrain(dataset);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));
    console.log(`✅ Brain compiled to ${OUTPUT_FILE}`);
    console.log(`📊 Loaded ${compiledCount} base dictionary files!`);
    console.log(`🧠 Generated ${Object.keys(brain).length} pure lemma mappings!`);
}