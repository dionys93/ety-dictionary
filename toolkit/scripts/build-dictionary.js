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
 * THE ADAPTER: Quarantines positional bash arrays and translates them into 
 * strict key-value pairs before they enter the JavaScript pipeline.
 */
const normalizeConjugations = (baseEng, rawConj, posCategories) => {
    if (!Array.isArray(rawConj)) return rawConj; // Already a clean object

    if (baseEng === 'be') {
        return {
            explicit: {
                am: rawConj[0], is: rawConj[1], are: rawConj[2], was: rawConj[3],
                were: rawConj[4], been: rawConj[5], being: rawConj[6], "isn't": rawConj[7],
                "aren't": rawConj[8], "wasn't": rawConj[9], "weren't": rawConj[10]
            }
        };
    }
    if (baseEng === 'do') {
        // THE FIX: Check if we are processing the shorter Auxiliary array or the full Verb array
        if (posCategories.includes('Auxiliary')) {
            return {
                explicit: {
                    does: rawConj[0],
                    did: rawConj[1],
                    "don't": rawConj[2],
                    "doesn't": rawConj[3],
                    "didn't": rawConj[4]
                }
            };
        } else {
            return {
                explicit: {
                    does: rawConj[0],
                    did: rawConj[1],
                    done: rawConj[2],
                    doing: rawConj[3],
                    "don't": rawConj[4],
                    "doesn't": rawConj[5],
                    "didn't": rawConj[6]
                }
            };
        }
    }
    if (baseEng === 'have') {
        return {
            explicit: {
                has: rawConj[0], had: rawConj[1], having: rawConj[2],
                "haven't": rawConj[3], "hasn't": rawConj[4], "hadn't": rawConj[5]
            }
        };
    }
    if (posCategories.includes('Modal')) {
        return { negated_present: rawConj[0], past: rawConj[1], negated_past: rawConj[2] };
    }
    if (posCategories.includes('Noun')) {
        return { plural: rawConj[0] };
    }

    return { forms: rawConj }; // Generic fallback for adjectives/adverbs
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

    // NORMALIZE THE ARRAY TO AN OBJECT IMMEDIATELY
    const rawConjugations = deepNormalize(row.conjugations || {});
    const cleanConjugations = normalizeConjugations(baseEng, rawConjugations, posCategories);

    return Success({
        baseEng,
        baseIng,
        posCategories,
        conjugations: cleanConjugations,
        mappings: []
    });
};

const generateMappings = (result) => {
    if (result.status === 'skipped') return result;

    const { baseEng, baseIng, posCategories, conjugations } = result.value;
    const mappings = [];

    posCategories.forEach(posCategory => {
        // 1. Always map the base lemma
        mappings.push({ eng: baseEng, ing: baseIng, pos: posCategory, conj: conjugations });

        // 2. Map explicit irregular overrides (be, do, have)
        if (conjugations.explicit) {
            Object.entries(conjugations.explicit).forEach(([engForm, ingForm]) => {
                if (ingForm) {
                    if (baseEng === 'be') {
                        mappings.push({ eng: engForm, ing: ingForm, pos: 'Copula', conj: null });
                        mappings.push({ eng: engForm, ing: ingForm, pos: 'Verb', conj: null });
                    } else {
                        mappings.push({ eng: engForm, ing: ingForm, pos: 'Verb', conj: null });
                        mappings.push({ eng: engForm, ing: ingForm, pos: 'Auxiliary', conj: null });
                    }
                }
            });
        }

        // 3. Map Modals
        if (posCategory === 'Modal') {
            const pastMap = { 'can': 'could', 'will': 'would', 'shall': 'should', 'may': 'might' };
            const pastEng = pastMap[baseEng];

            const pastIng = conjugations.past && !conjugations.past.startsWith('-') ? conjugations.past : null;
            const negPresent = conjugations.negated_present || (conjugations.third_singular && !conjugations.third_singular.startsWith('-') ? conjugations.third_singular : baseIng);

            if (pastEng && pastIng) {
                mappings.push({ eng: pastEng, ing: pastIng, pos: 'Modal', conj: null });
                mappings.push({ eng: pastEng, ing: pastIng, pos: 'Auxiliary', conj: null });
            }

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