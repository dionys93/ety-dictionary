/** build-dictionary.js
 * ============================================================================
 * TRANSLATION BRAIN COMPILER
 * * This script ingests the flattened JSONL dictionary and indexes it into a 
 * clean JSON map. It delegates morphological transformations to the JIT 
 * Transcriber by passing explicit conjugation data alongside the roots.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    const addWord = (eng, inglisce, pos, conjugations = null) => {
        if (!eng || !inglisce) return;

        const cleanEng = eng.replace(/\([^)]+\)/g, '')
            .replace(/\[[^\]]+\]/g, '')
            .replace(/^to\s+/i, '')
            .trim()
            .split(/\s+/)[0]
            .toLowerCase();

        const cleanIng = typeof inglisce === 'string'
            ? inglisce.replace(/[.,!?()[\]{}]/g, '').trim()
            : inglisce;

        if (!cleanEng) return;

        brain[cleanEng] = brain[cleanEng] || {};
        brain[cleanEng][pos] = cleanIng;

        // Attach conjugations to the lemma entry so transcriber.js can apply JIT morphology
        if (conjugations && !Array.isArray(conjugations) && Object.keys(conjugations).length > 0) {
            brain[cleanEng].conjugations = brain[cleanEng].conjugations || {};
            Object.assign(brain[cleanEng].conjugations, conjugations);
        }
    };

    dataset.forEach(data => {
        if (!data || !data.me_word || !data.inglisce_word) return;

        // Force strict NFC composition early to prevent byte-level mismatches downstream
        const engWord = data.me_word.toLowerCase().trim().normalize('NFC');
        const inglisceWord = data.inglisce_word.normalize('NFC');
        const c = data.conjugations || {};

        const validPosCategories = (data.pos || '')
            .split(',')
            .map(p => posMap[p.toLowerCase().trim()])
            .filter(Boolean);

        if (validPosCategories.length > 0) compiledCount++;

        validPosCategories.forEach(posCategory => {
            // Always add the base lemma to the dictionary
            addWord(engWord, inglisceWord, posCategory, c);

            // ----------------------------------------------------------------
            // IRREGULAR OVERRIDES
            // The following blocks only run if a word is so irregular that 
            // spaCy might fail to lemmatize it, requiring direct `rawWord` lookup.
            // ----------------------------------------------------------------
            
            // Handle Class 6 Explicit Arrays 
            if (Array.isArray(c)) {
                if (engWord === 'be') {
                    const forms = ['am', 'is', 'are', 'was', 'were', 'been', 'being', "isn't", "aren't", "wasn't", "weren't"];
                    forms.forEach((form, i) => {
                        if (c[i]) {
                            addWord(form, c[i], 'Copula');
                            addWord(form, c[i], 'Verb');
                        }
                    });
                } else if (engWord === 'do') {
                    const forms = ['does', 'did', 'done', 'doing', "don't", "doesn't", "didn't"];
                    forms.forEach((form, i) => {
                        if (c[i]) {
                            addWord(form, c[i], 'Verb');
                            addWord(form, c[i], 'Auxiliary');
                        }
                    });
                } else if (engWord === 'have') {
                    const forms = ['has', 'had', 'having', "haven't", "hasn't", "hadn't"];
                    forms.forEach((form, i) => {
                        if (c[i]) {
                            addWord(form, c[i], 'Verb');
                            addWord(form, c[i], 'Auxiliary');
                        }
                    });
                }
            }
            
            // Handle Modals
            else if (posCategory === 'Modal') {
                const pastMap = { 'can': 'could', 'will': 'would', 'shall': 'should', 'may': 'might' };
                const pastEng = pastMap[engWord];

                // Modals do not take standard suffixes, they use explicitly defined distinct words
                if (pastEng && c.past && !c.past.startsWith('-')) {
                    addWord(pastEng, c.past, 'Modal');
                }
                
                const negPresent = (c.third_singular && !c.third_singular.startsWith('-')) 
                    ? c.third_singular 
                    : inglisceWord;
                    
                if (engWord === 'can') addWord('cannot', negPresent, 'Modal');
            }
        });
    });

    return { brain, compiledCount };
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    const __dirname = path.dirname(__filename);
    const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
    const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

    console.log('🧠 Compiling JIT Translation Brain...');

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