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
 * @property {Object|Array|null} conj - The conjugations attached to this specific POS
 */

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
 * RAILWAY PRIMITIVES & HELPERS
 * ============================================================================
 */

const Success = (value) => ({ status: 'success', value });
const Failure = (error) => ({ status: 'skipped', error });
const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

/**
 * Recursively applies NFC composition to arrays and objects.
 * This guarantees macOS NFD bytes from etym-parse don't infect the transcription.
 */
const deepNormalize = (obj) => {
    if (typeof obj === 'string') return obj.normalize('NFC');
    if (Array.isArray(obj)) return obj.map(deepNormalize);
    if (obj !== null && typeof obj === 'object') {
        const normalized = {};
        for (const key in obj) {
            normalized[key] = deepNormalize(obj[key]);
        }
        return normalized;
    }
    return obj;
};

/**
 * ============================================================================
 * THE PIPELINE STEPS
 * ============================================================================
 */

const validateAndClean = (row) => {
    if (!row || !row.me_word || !row.inglisce_word) return Failure('Missing core words');

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
        // We must deeply normalize the raw Bash arrays/objects!
        conjugations: deepNormalize(row.conjugations || {}), 
        mappings: [] 
    });
};

const generateMappings = (result) => {
    if (result.status === 'skipped') return result;

    const { baseEng, baseIng, posCategories, conjugations } = result.value;
    const mappings = [];

    posCategories.forEach(posCategory => {
        mappings.push({ eng: baseEng, ing: baseIng, pos: posCategory, conj: conjugations });

        if (Array.isArray(conjugations)) {
            if (baseEng === 'be') {
                const forms = ['am', 'is', 'are', 'was', 'were', 'been', 'being', "isn't", "aren't", "wasn't", "weren't"];
                forms.forEach((form, i) => {
                    if (conjugations[i]) {
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Copula', conj: null });
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Verb', conj: null });
                    }
                });
            } else if (baseEng === 'do') {
                const forms = ['does', 'did', 'done', 'doing', "don't", "doesn't", "didn't"];
                forms.forEach((form, i) => {
                    if (conjugations[i]) {
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Verb', conj: null });
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Auxiliary', conj: null });
                    }
                });
            } else if (baseEng === 'have') {
                const forms = ['has', 'had', 'having', "haven't", "hasn't", "hadn't"];
                forms.forEach((form, i) => {
                    if (conjugations[i]) {
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Verb', conj: null });
                        mappings.push({ eng: form, ing: conjugations[i], pos: 'Auxiliary', conj: null });
                    }
                });
            }
        } 
        else if (posCategory === 'Modal') {
            const pastMap = { 'can': 'could', 'will': 'would', 'shall': 'should', 'may': 'might' };
            const pastEng = pastMap[baseEng];
            const c = conjugations;

            if (pastEng && c.past && !c.past.startsWith('-')) {
                mappings.push({ eng: pastEng, ing: c.past, pos: 'Modal', conj: null });
            }
            
            const negPresent = (c.third_singular && !c.third_singular.startsWith('-')) ? c.third_singular : baseIng;
            if (baseEng === 'can') mappings.push({ eng: 'cannot', ing: negPresent, pos: 'Modal', conj: null });
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
    const processedRows = dataset.map(processRow);

    const brain = processedRows.reduce((acc, result) => {
        if (result.status === 'skipped') return acc;
        const { mappings } = result.value;

        mappings.forEach(({ eng, ing, pos, conj }) => {
            acc[eng] = acc[eng] || {};
            acc[eng][pos] = ing;

            // Namespaced Conjugation Assignment!
            if (conj && Object.keys(conj).length > 0) {
                acc[eng][`${pos}_conjugations`] = conj;
            }
        });

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