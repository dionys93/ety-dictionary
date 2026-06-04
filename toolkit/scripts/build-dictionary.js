/** build-dictionary.js
 * ============================================================================
 * TRANSLATION BRAIN COMPILER
 * * This script ingests the flattened JSONL dictionary and uses `compromise.js` 
 * to calculate all valid English variations, dynamically sanitizing any 
 * polluted Bash extraction data before it reaches the brain.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nlp from 'compromise';
import { resolveForm } from './utils.js';

// Maps Bash/Dictionary shorthand POS tags to standard compromise.js tags
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

// ============================================================================
// COMPILER CORE (Exported for Testing)
// ============================================================================

/**
 * Builds the comprehensive Translation Brain mapping from a raw dataset.
 * @param {Array<Object>} dataset - The parsed JSONL dictionary rows.
 * @returns {Object} An object containing the compiled `brain` map and `compiledCount`.
 */
export function buildBrain(dataset) {
    const brain = {};
    let compiledCount = 0;

    /**
     * Safely inserts a word into the brain. 
     * Ensures no garbage from Bash ever pollutes the lookup keys by stripping
     * parentheses, brackets, and infinitive "to " prefixes.
     */
    const addWord = (eng, inglisce, pos) => {
        if (!eng || !inglisce) return;

        const cleanEng = eng.replace(/\([^)]+\)/g, '')
            .replace(/\[[^\]]+\]/g, '')
            .replace(/^to\s+/i, '')
            .trim()
            .split(/\s+/)[0]
            .toLowerCase();

        const cleanIng = inglisce.replace(/[.,!?()[\]{}]/g, '').trim();

        if (!cleanEng) return;

        brain[cleanEng] = brain[cleanEng] || {};
        brain[cleanEng][pos] = brain[cleanEng][pos] || cleanIng;
    };

    // Iterate through every stanza extracted by etym-parse
    dataset.forEach(data => {
        if (!data || !data.me_word || !data.inglisce_word) return;

        // Force strict NFC composition early to prevent byte-level mismatches downstream
        const engWord = data.me_word.toLowerCase().trim().normalize('NFC');
        const inglisceWord = data.inglisce_word.normalize('NFC');
        
        // `c` can be an Object (standard verb slots) OR an Array (explicit irregular lists)
        const c = data.conjugations || {};
        const isVerbConj = !Array.isArray(c);

        /**
         * Helper: resolves a named conjugation slot.
         * If the dictionary provided a fully explicit array (e.g., 'to be') or 
         * a two-stem verb class (indicated by c.present), it bypasses suffix 
         * stripping entirely, as the words are already fully formed.
         */
        const resolve = (slot, isGerund = false) => {
            if (!slot) return inglisceWord;
            return (isVerbConj && c.present) || Array.isArray(c)
                ? slot                                     
                : resolveForm(slot, inglisceWord, isGerund);
        };

        const validPosCategories = (data.pos || '')
            .split(',')
            .map(p => posMap[p.toLowerCase().trim()])
            .filter(Boolean);

        if (validPosCategories.length > 0) compiledCount++;

        // Base context passed to all specific POS handlers
        const ctx = { addWord, resolve, engWord, inglisceWord, c };

        validPosCategories.forEach(posCategory => {
            ctx.posCategory = posCategory;
            addWord(engWord, inglisceWord, posCategory);

            // Route to the appropriate morphologic generator
            if (engWord === 'be') handleBe(ctx);
            else if (engWord === 'do') handleDo(ctx);
            else if (engWord === 'have') handleHave(ctx);
            else if (posCategory === 'Modal') handleModal(ctx);
            else if (posCategory === 'Verb' || posCategory === 'Auxiliary') handleVerb(ctx);
            else if (posCategory === 'Noun' && c.length > 0) handleNoun(ctx);
            else if (posCategory === 'Adjective' && c.length > 0) handleAdjective(ctx);
        });
    });

    return { brain, compiledCount };
}

// ============================================================================
// PART-OF-SPEECH HANDLERS
// ============================================================================

/**
 * Reusable helper for 'be', 'do', and 'have' to map their highly irregular 
 * arrays to multiple grammatical roles (e.g., Auxiliary and Verb) without code duplication.
 */
function processExplicitAuxiliary(ctx, slots, forms, primaryPos, secondaryPos, generateNegative) {
    const { addWord, resolve, inglisceWord, engWord } = ctx;
    
    addWord(engWord, inglisceWord, primaryPos);
    addWord(engWord, inglisceWord, secondaryPos);

    forms.forEach((form, i) => {
        const ingForm = resolve(slots[i]);
        addWord(form, ingForm, primaryPos);
        addWord(form, ingForm, secondaryPos);
        
        if (generateNegative && !form.includes("n't")) {
            addWord(`${form} not`, ingForm, primaryPos);
        }
    });
}

function handleBe(ctx) {
    // Check if the Bash parser handed us a fully explicit custom array for 'be'
    // If not, map to standard object slots.
    const slots = Array.isArray(ctx.c) ? ctx.c : [
        ctx.c.third_singular, ctx.c.third_singular, ctx.c.present || ctx.c.third_singular,
        ctx.c.past, ctx.c.past, ctx.c.participle || ctx.c.past, ctx.c.gerund,
        ctx.c.past, ctx.c.present || ctx.c.third_singular, ctx.c.past, ctx.c.past
    ];
    const forms = [
        'am', 'is', 'are', 'was', 'were', 'been', 'being',
        "isn't", "aren't", "wasn't", "weren't"
    ];
    processExplicitAuxiliary(ctx, slots, forms, 'Copula', 'Verb', true);
}

function handleDo(ctx) {
    const slots = Array.isArray(ctx.c) ? ctx.c : [
        ctx.c.third_singular, ctx.c.past, ctx.c.participle || ctx.c.past,
        ctx.c.gerund, ctx.c.past, ctx.c.third_singular, ctx.c.past
    ];
    const forms = ['does', 'did', 'done', 'doing', "don't", "doesn't", "didn't"];
    processExplicitAuxiliary(ctx, slots, forms, 'Verb', 'Auxiliary', false);
}

function handleHave(ctx) {
    const slots = Array.isArray(ctx.c) ? ctx.c : [
        ctx.c.third_singular, ctx.c.past, ctx.c.gerund,
        ctx.c.past, ctx.c.third_singular, ctx.c.past
    ];
    const forms = ['has', 'had', 'having', "haven't", "hasn't", "hadn't"];
    processExplicitAuxiliary(ctx, slots, forms, 'Verb', 'Auxiliary', false);
}

function handleModal(ctx) {
    const { engWord, inglisceWord, c, resolve, addWord } = ctx;
    
    // Modals are heavily irregular, define explicit past/negated mappings
    const pastMap = { 'can': 'could', 'will': 'would', 'shall': 'should', 'may': 'might' };
    const negMap  = { 'can': "can't", 'will': "won't", 'shall': "shan't" };

    const pastEng = pastMap[engWord] || null;
    const negContraction = negMap[engWord] || `${engWord}n't`;

    if (pastEng) {
        const pastIng = resolve(c.past);
        addWord(pastEng, pastIng, 'Modal');
        
        const negPast = pastIng || inglisceWord;
        addWord(`${pastEng} not`, negPast, 'Modal');
        addWord(`${pastEng}n't`, negPast, 'Modal');
    }

    const negPresent = resolve(c.third_singular) || inglisceWord;
    addWord(`${engWord} not`, negPresent, 'Modal');
    addWord(negContraction, negPresent, 'Modal');
    
    if (engWord === 'can') {
        addWord('cannot', negPresent, 'Modal');
    }
}

function handleVerb(ctx) {
    const { engWord, inglisceWord, posCategory, c, addWord } = ctx;
    
    // Leverage NLP to automatically determine the correct English targets
    const conj = nlp(engWord).tag('Verb').verbs().conjugate()[0];
    if (!conj) return;

    if (c.present) {
        // Two-stem verbs: The forms provided are exact, fully-spelled words
        addWord(conj.PresentTense, c.third_singular, posCategory);
        addWord(conj.Gerund, c.gerund, posCategory);
        if (c.past) {
            addWord(conj.PastTense, c.past, posCategory);
            addWord(conj.Participle, c.participle || c.past, posCategory);
        }
    } else {
        // Standard/Semi-Irregular verbs: Require suffix resolution
        const presentForm = resolveForm(c.third_singular, inglisceWord);
        const pastForm = resolveForm(c.past, inglisceWord);
        const participleForm = resolveForm(c.participle, inglisceWord);
        const gerundForm = resolveForm(c.gerund, inglisceWord, true);

        if (presentForm) addWord(conj.PresentTense, presentForm, posCategory);
        if (pastForm) addWord(conj.PastTense, pastForm, posCategory);
        if (participleForm) addWord(conj.Participle, participleForm, posCategory);
        if (gerundForm) addWord(conj.Gerund, gerundForm, posCategory);
    }
}

function handleNoun(ctx) {
    const { engWord, inglisceWord, c, addWord } = ctx;
    // Let NLP generate the correct English plural target
    const englishPlural = nlp(engWord).tag('Noun').nouns().toPlural().text('normal');
    const inglPlural = resolveForm(c[0], inglisceWord);
    
    if (englishPlural && inglPlural) {
        addWord(englishPlural, inglPlural, 'Noun');
    }
}

function handleAdjective(ctx) {
    const { engWord, inglisceWord, c, addWord } = ctx;
    const conj = nlp(engWord).tag('Adjective').adjectives().conjugate()[0];

    // Adjectives frequently spawn Adverbs and Nouns natively
    c.forEach(conjStr => {
        const resolved = resolveForm(conjStr, inglisceWord);
        if (!resolved) return;

        if (conjStr.includes('est') && conj?.Superlative) addWord(conj.Superlative, resolved, 'Adjective');
        else if (conjStr.includes('er') && conj?.Comparative) addWord(conj.Comparative, resolved, 'Adjective');
        else if ((conjStr.includes('ly') || conjStr.includes('y')) && conj?.Adverb) addWord(conj.Adverb, resolved, 'Adverb');
        else if (conjStr.includes('ness') && conj?.Noun) addWord(conj.Noun, resolved, 'Noun');
    });
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    const __dirname = path.dirname(__filename);
    const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
    const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

    console.log('🧠 Compiling Translation Brain...');

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
    console.log(`🧠 Generated ${Object.keys(brain).length} exact English forms!`);
}