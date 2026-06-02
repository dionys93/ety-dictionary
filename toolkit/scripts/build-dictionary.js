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

export function buildBrain(dataset) {
    const brain = {};
    let compiledCount = 0;

    // Ensures no garbage from Bash ever pollutes the lookup keys
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

    dataset.forEach(data => {
        if (!data || !data.me_word || !data.inglisce_word) return;

        const engWord = data.me_word.toLowerCase().trim().normalize('NFC');
        const inglisceWord = data.inglisce_word.normalize('NFC');

        // conjugations is now either an object (verbs) or an array (everything else).
        // Normalise here so the blocks below never have to branch on the shape.
        const c = data.conjugations || {};
        const isVerbConj = !Array.isArray(c);

        // Helper: resolve a named slot, falling back to inglisceWord if empty.
        // Bypasses resolveForm entirely for the two-stem class (c.present is set).
        const resolve = (slot, isGerund = false) => {
            if (!slot) return inglisceWord;
            return isVerbConj && c.present
                ? slot                                     // already fully resolved
                : resolveForm(slot, inglisceWord, isGerund);
        };

        const validPosCategories = (data.pos || '')
            .split(',')
            .map(p => posMap[p.toLowerCase().trim()])
            .filter(Boolean);

        if (validPosCategories.length > 0) compiledCount++;

        validPosCategories.forEach(posCategory => {
            addWord(engWord, inglisceWord, posCategory);

            // 1. 'Be' (Copula & Verb)
            if (engWord === 'be') {
                const beSlots = [
                    c.third_singular,                      // am
                    c.third_singular,                      // is  (same slot — 3ps covers both)
                    c.present || c.third_singular,  // are
                    c.past,                                // was
                    c.past,                                // were
                    c.participle || c.past,            // been
                    c.gerund,                              // being
                    c.past,                                // isn't
                    c.present || c.third_singular,  // aren't
                    c.past,                                // wasn't
                    c.past,                                // weren't
                ];
                const beForms = [
                    'am', 'is', 'are', 'was', 'were',
                    'been', 'being',
                    "isn't", "aren't", "wasn't", "weren't"
                ];

                addWord('be', inglisceWord, 'Copula');
                addWord('be', inglisceWord, 'Verb');

                beForms.forEach((form, i) => {
                    const ingForm = resolve(beSlots[i]);
                    addWord(form, ingForm, 'Copula');
                    addWord(form, ingForm, 'Verb');
                    if (!form.includes("n't")) addWord(`${form} not`, ingForm, 'Copula');
                });
            }

            // 2. 'Do' (Auxiliary & Verb)
            else if (engWord === 'do') {
                const doSlots = [
                    c.third_singular,               // does
                    c.past,                         // did
                    c.participle || c.past,         // done
                    c.gerund,                       // doing
                    c.past,                         // don't   (negated past stem)
                    c.third_singular,               // doesn't
                    c.past,                         // didn't
                ];
                const doForms = ['does', 'did', 'done', 'doing', "don't", "doesn't", "didn't"];

                addWord('do', inglisceWord, 'Verb');
                addWord('do', inglisceWord, 'Auxiliary');

                doForms.forEach((form, i) => {
                    const ingForm = resolve(doSlots[i]);
                    addWord(form, ingForm, 'Verb');
                    addWord(form, ingForm, 'Auxiliary');
                });
            }

            // 3. 'Have' (Auxiliary & Verb)
            else if (engWord === 'have') {
                const haveSlots = [
                    c.third_singular,               // has
                    c.past,                         // had
                    c.gerund,                       // having
                    c.past,                         // haven't
                    c.third_singular,               // hasn't
                    c.past,                         // hadn't
                ];
                const haveForms = ['has', 'had', 'having', "haven't", "hasn't", "hadn't"];

                addWord('have', inglisceWord, 'Verb');
                addWord('have', inglisceWord, 'Auxiliary');

                haveForms.forEach((form, i) => {
                    const ingForm = resolve(haveSlots[i]);
                    addWord(form, ingForm, 'Verb');
                    addWord(form, ingForm, 'Auxiliary');
                });
            }

            // 4. Modals
            else if (posCategory === 'Modal') {
                addWord(engWord, inglisceWord, 'Modal');

                const pastEng = engWord === 'can' ? 'could' :
                    engWord === 'will' ? 'would' :
                        engWord === 'shall' ? 'should' :
                            engWord === 'may' ? 'might' : null;

                const negContraction = engWord === 'can' ? "can't" :
                    engWord === 'will' ? "won't" :
                        engWord === 'shall' ? "shan't" :
                            engWord + "n't";

                if (pastEng) {
                    const pastIng = resolve(c.past);
                    addWord(pastEng, pastIng, 'Modal');
                }

                const negPresent = resolve(c.third_singular) || inglisceWord;
                addWord(`${engWord} not`, negPresent, 'Modal');
                addWord(negContraction, negPresent, 'Modal');
                if (engWord === 'can') addWord('cannot', negPresent, 'Modal');

                if (pastEng) {
                    const negPast = resolve(c.past) || inglisceWord;
                    addWord(`${pastEng} not`, negPast, 'Modal');
                    addWord(`${pastEng}n't`, negPast, 'Modal');
                }
            }
            // 5. Standard Verbs
            else if (posCategory === 'Verb' || posCategory === 'Auxiliary') {
                const doc = nlp(engWord).tag('Verb');
                const conj = doc.verbs().conjugate()[0];
                if (!conj) return;


                // ── Two-stem -er/-ir class ─────────────────────────────────────────────
                // present is populated only for this class (e.g. "þondre").
                // All forms are fully resolved words — bypass resolveForm entirely.
                if (c.present) {
                    addWord(conj.PresentTense, c.third_singular, posCategory);
                    addWord(conj.Gerund, c.gerund, posCategory);
                    if (c.past) {
                        addWord(conj.PastTense, c.past, posCategory);
                        addWord(conj.Participle, c.participle || c.past, posCategory);
                    }

                    // ── Standard and irregular classes ────────────────────────────────────
                    // third_singular, past, participle, gerund may be suffix tokens ("-s",
                    // "-d", "-ing") or fully written irregular forms. resolveForm handles both.
                } else {
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
            // 6. Standard Nouns (Plurals)
            else if (posCategory === 'Noun' && c.length > 0) {
                const doc = nlp(engWord).tag('Noun');
                const englishPlural = doc.nouns().toPlural().text('normal');
                const inglPlural = resolveForm(c[0], inglisceWord);
                if (englishPlural && inglPlural) addWord(englishPlural, inglPlural, 'Noun');
            }
            // 7. Adjectives (Comparatives)
            else if (posCategory === 'Adjective' && c.length > 0) {
                const doc = nlp(engWord).tag('Adjective');
                const conj = doc.adjectives().conjugate()[0];

                c.forEach(conjStr => {
                    const resolved = resolveForm(conjStr, inglisceWord);
                    if (!resolved) return;

                    if (conjStr.includes('est') && conj?.Superlative) addWord(conj.Superlative, resolved, 'Adjective');
                    else if (conjStr.includes('er') && conj?.Comparative) addWord(conj.Comparative, resolved, 'Adjective');
                    else if ((conjStr.includes('ly') || conjStr.includes('y')) && conj?.Adverb) addWord(conj.Adverb, resolved, 'Adverb');
                    else if (conjStr.includes('ness') && conj?.Noun) addWord(conj.Noun, resolved, 'Noun');
                });
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