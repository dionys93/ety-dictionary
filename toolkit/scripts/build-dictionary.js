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
 * SCHEMA CONTRACT (see etym-parse.awk header)
 * ============================================================================
 * The parser is the single schema authority. `conjugations` is ALWAYS a
 * named object:
 *   slot verbs:      { present, third_singular, past, participle, gerund }
 *   explicit verbs:  { explicit: { "<english form>": "<inglisce form>" } }
 *                    — keys zipped from the stanza's own [ME] line, so no
 *                    English form lists live in this file anymore
 *   nouns:           { plural [, variants] }
 *   everything else: { forms: [...] }  or  {}
 * A raw ARRAY reaching this compiler means a stale master_dataset.jsonl —
 * it is rejected loudly, never positionally guessed at.
 */

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
 * EXPLICIT EXPANSION: every {explicit} pair becomes its own brain entry.
 * Each English form maps under 'Verb' (so the transcriber's AUX/VERB routing
 * always hits) plus the row's own POS category. There is nothing to zip,
 * order, or guess: the parser already paired English↔Inglisce from the
 * stanza's own lines.
 *
 * Note: the 'Copula' category is retired — it was only ever produced for
 * 'be', and the transcriber's AUX routing checks entry.Verb first anyway, so
 * it never actually resolved. resolveCategory keeps its Copula branch for
 * backward tolerance of old brains.
 */
const applyExplicitRules = (baseEng, baseIng, pos, conj) => {
    const rules = [];

    if (conj.explicit) {
        Object.entries(conj.explicit).forEach(([engForm, ingForm]) => {
            if (!engForm || !ingForm) return;

            rules.push({ eng: engForm, ing: ingForm, pos: 'Verb', conj: null });
            if (pos !== 'Verb') rules.push({ eng: engForm, ing: ingForm, pos, conj: null });
        });
    }

    // 'cannot' is the one fused negation English writes as a single word; it
    // maps to the negated present ("can't" pair) when the data provides one.
    if (pos === 'Modal' && baseEng === 'can') {
        const ing = (conj.explicit && conj.explicit["can't"]) || baseIng;
        rules.push({ eng: 'cannot', ing, pos: 'Modal', conj: null });
        rules.push({ eng: 'cannot', ing, pos: 'Verb', conj: null });
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

    const rawConjugations = row.conjugations || {};
    if (Array.isArray(rawConjugations)) {
        return Failure('legacy array conjugations — stale master_dataset.jsonl; re-run etym-build-dataset with the current parser');
    }
    const conjugations = deepNormalize(rawConjugations);

    return Success({ baseEng, baseIng, posCategories, conjugations, mappings: [] });
};

const generateMappings = (result) => {
    if (result.status === 'skipped') return result;

    const { baseEng, baseIng, posCategories, conjugations } = result.value;
    const mappings = [];

    posCategories.forEach(posCategory => {
        // Map the root
        mappings.push({ eng: baseEng, ing: baseIng, pos: posCategory, conj: conjugations });
        
        // Expand every explicit English↔Inglisce pair into its own entry
        mappings.push(...applyExplicitRules(baseEng, baseIng, posCategory, conjugations));
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

    // Sort top-level lemma keys so translationBrain.json diffs cleanly in git.
    // Inner key order is left as-is: resolveCategory's fallback reads the
    // first category, so reordering inside entries would change behavior.
    const sortedBrain = Object.fromEntries(
        Object.keys(brain).sort().map(k => [k, brain[k]])
    );
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sortedBrain, null, 2));
    console.log(`✅ Brain compiled to ${OUTPUT_FILE}`);
    console.log(`📊 Loaded ${compiledCount} base dictionary files!`);
    console.log(`🧠 Generated ${Object.keys(brain).length} pure lemma mappings!`);
}
