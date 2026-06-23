/** build-dictionary.js
 * ============================================================================
 * TRANSLATION BRAIN COMPILER
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ============================================================================
 * IRREGULAR VERB REGISTRY (The "No Hoops" Schema)
 * ============================================================================
 */

const CLASS_6_SCHEMAS = {
    'be': ['am', 'is', 'are', 'was', 'were', 'been', 'being', "isn't", "aren't", "wasn't", "weren't"],
    'do_aux': ['does', 'did', "don't", "doesn't", "didn't"],
    'do_verb': ['does', 'did', 'done', 'doing', "don't", "doesn't", "didn't"],
    'have': ['has', 'had', 'having', "haven't", "hasn't", "hadn't"]
};

const MODAL_PAST_MAP = { 
    'can': 'could', 'will': 'would', 'shall': 'should', 'may': 'might' 
};

/**
 * ============================================================================
 * TYPE DEFINITIONS & STANDARD MAPS
 * ============================================================================
 */

/**
 * @template L, R
 * @typedef { {status: 'skipped', error: L} | {status: 'success', value: R} } Either
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
        for (const key in obj) { normalized[key] = deepNormalize(obj[key]); }
        return normalized;
    }
    return obj;
};

/**
 * THE ADAPTER: Dynamically zips the Bash array to the defined schema.
 */
const normalizeConjugations = (baseEng, rawConj, posCategories) => {
    if (!Array.isArray(rawConj)) return rawConj;

    const zip = (schema) => schema.reduce((acc, key, i) => ({ ...acc, [key]: rawConj[i] }), {});

    if (baseEng === 'be') return { explicit: zip(CLASS_6_SCHEMAS.be) };
    if (baseEng === 'do') return { explicit: zip(rawConj.length < 7 ? CLASS_6_SCHEMAS.do_aux : CLASS_6_SCHEMAS.do_verb) };
    if (baseEng === 'have') return { explicit: zip(CLASS_6_SCHEMAS.have) };

    if (posCategories.includes('Modal')) return { past: rawConj[0], negated_present: rawConj[1], negated_past: rawConj[2] };
    if (posCategories.includes('Noun')) return { plural: rawConj[0] };

    return { forms: rawConj }; 
};

/**
 * THE IRREGULAR PIPELINE: Handles all Modals and Explicit Overrides in one place.
 */
const applyIrregularRules = (baseEng, baseIng, pos, conj) => {
    const rules = [];

    // 1. Process Class 6 Overrides (be, do, have)
    if (conj.explicit) {
        Object.entries(conj.explicit).forEach(([engForm, ingForm]) => {
            if (!ingForm) return; // Skip if the Bash array didn't have this item
            
            const primaryPos = baseEng === 'be' ? 'Copula' : 'Verb';
            const secondaryPos = baseEng === 'be' ? 'Verb' : 'Auxiliary';

            rules.push({ eng: engForm, ing: ingForm, pos: primaryPos, conj: null });
            rules.push({ eng: engForm, ing: ingForm, pos: secondaryPos, conj: null });
        });
    }

    // 2. Process Modals
    if (pos === 'Modal') {
        const pastEng = MODAL_PAST_MAP[baseEng];
        const pastIng = conj.past && !conj.past.startsWith('-') ? conj.past : null;
        const negPresent = conj.negated_present || (conj.third_singular && !conj.third_singular.startsWith('-') ? conj.third_singular : baseIng);

        if (pastEng && pastIng) {
            rules.push({ eng: pastEng, ing: pastIng, pos: 'Modal', conj: null });
            rules.push({ eng: pastEng, ing: pastIng, pos: 'Auxiliary', conj: null });
        }

        if (baseEng === 'can') rules.push({ eng: 'cannot', ing: negPresent, pos: 'Modal', conj: null });
    }

    return rules;
};

/**
 * ============================================================================
 * THE PIPELINE STEPS (A -> B)
 * ============================================================================
 */

const validateAndClean = (row) => {
    if (!row || !row.me_word || !row.inglisce_word) return Failure('Missing core words');

    const baseEng = row.me_word.replace(/\([^)]+\)/g, '').replace(/\[[^\]]+\]/g, '').replace(/^to\s+/i, '').trim().split(/\s+/)[0].toLowerCase().normalize('NFC');
    const baseIng = (typeof row.inglisce_word === 'string' ? row.inglisce_word.replace(/[.,!?()[\]{}]/g, '').trim() : row.inglisce_word).normalize('NFC');

    if (!baseEng) return Failure('English word sanitized to empty string');

    const posCategories = (row.pos || '').split(',').map(p => posMap[p.toLowerCase().trim()]).filter(Boolean);
    if (posCategories.length === 0) return Failure('No valid POS categories found');

    const rawConjugations = deepNormalize(row.conjugations || {});
    const cleanConjugations = normalizeConjugations(baseEng, rawConjugations, posCategories);

    return Success({ baseEng, baseIng, posCategories, conjugations: cleanConjugations, mappings: [] });
};

const generateMappings = (result) => {
    if (result.status === 'skipped') return result;

    const { baseEng, baseIng, posCategories, conjugations } = result.value;
    const mappings = [];

    posCategories.forEach(posCategory => {
        // Map the root
        mappings.push({ eng: baseEng, ing: baseIng, pos: posCategory, conj: conjugations });
        
        // Pass it through the unified irregular handler
        mappings.push(...applyIrregularRules(baseEng, baseIng, posCategory, conjugations));
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
        
        result.value.mappings.forEach(({ eng, ing, pos, conj }) => {
            acc[eng] = acc[eng] || {};
            acc[eng][pos] = ing;

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