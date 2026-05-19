/**
 * ============================================================================
 * TRANSLATION BRAIN COMPILER
 * * This script ingests the flattened JSONL dictionary and uses `compromise.js` 
 * to calculate all valid English variations, dynamically sanitizing any 
 * polluted Bash extraction data before it reaches the brain.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import nlp from 'compromise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

const brain = {};
let compiledCount = 0; // Numerical Collection

const posMap = {
    'verb': 'Verb', 'v': 'Verb', 'tr v': 'Verb', 'intr v': 'Verb',
    'noun': 'Noun', 'n': 'Noun', 'm n': 'Noun', 'f n': 'Noun',
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

const resolveForm = (form, rootWord, isGerund = false) => {
    if (!form) return null;
    if (!form.startsWith('-')) return form.replace(/[()]/g, '');

    const suffix = form.slice(1);
    const startsWithVowel = /^[aeiouy]/.test(suffix);

    const base = 
        (rootWord.endsWith('ie') && suffix.startsWith('i')) ? rootWord.slice(0, -2) :
        (rootWord.endsWith('e') && (isGerund || startsWithVowel)) ? rootWord.slice(0, -1) :
        rootWord;

    return base + suffix;
};

// This ensures no garbage from Bash ever pollutes the lookup keys
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

export async function compile() {
    console.log('🧠 Compiling Translation Brain...');
    
    if (!fs.existsSync(JSONL_FILE)) {
        console.error(`❌ JSONL file not found at ${JSONL_FILE}!`);
        process.exit(1);
    }

    const fileStream = fs.createReadStream(JSONL_FILE);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;
        
        const data = JSON.parse(line);
        const engWord = data.me_word;
        const inglisceWord = data.inglisce_word;

        const rawConjs = (data.conjugations || [])
            .map(w => w.replace(/,/g, ''))
            .filter(w => !w.startsWith('['));

        const firstSuffixIdx = rawConjs.findIndex(w => w.startsWith('-'));
        const conjugations = firstSuffixIdx > 0 
            ? rawConjs.slice(firstSuffixIdx) 
            : rawConjs.filter((w, i, arr) => w !== 'to' && arr[i - 1] !== 'to');

        if (!engWord || !inglisceWord) continue;

        const validPosCategories = data.pos.split(', ').map(p => posMap[p.toLowerCase().trim()]).filter(Boolean);
        if (validPosCategories.length > 0) compiledCount++;

        validPosCategories.forEach(posCategory => {
            addWord(engWord, inglisceWord, posCategory);

            // 1. 'Be' (Copula & Verb)
            if (engWord.includes('be')) {
                const forms = ['am', 'is', 'are', 'was', 'were', 'been', 'being', "isn't", "aren't", "wasn't", "weren't"];
                addWord('be', inglisceWord, 'Copula');
                addWord('be', inglisceWord, 'Verb');
                forms.forEach((form, index) => {
                    const ingForm = conjugations[index] ? resolveForm(conjugations[index], inglisceWord) : inglisceWord;
                    addWord(form, ingForm, 'Copula');
                    addWord(form, ingForm, 'Verb');
                    if (!form.includes("n't")) addWord(`${form} not`, ingForm, 'Copula');
                });
            }
            // 2. 'Do' (Auxiliary & Verb)
            else if (engWord.includes('do')) {
                const forms = ['does', 'did', 'done', 'doing', "don't", "doesn't", "didn't"];
                addWord('do', inglisceWord, 'Verb');
                addWord('do', inglisceWord, 'Auxiliary');
                forms.forEach((form, index) => {
                    const ingForm = conjugations[index] ? resolveForm(conjugations[index], inglisceWord) : inglisceWord;
                    addWord(form, ingForm, 'Verb');
                    addWord(form, ingForm, 'Auxiliary');
                });
            }
            // 3. 'Have' (Auxiliary & Verb)
            else if (engWord.includes('have')) {
                const forms = ['has', 'had', 'having', "haven't", "hasn't", "hadn't"];
                addWord('have', inglisceWord, 'Verb');
                addWord('have', inglisceWord, 'Auxiliary');
                forms.forEach((form, index) => {
                    const ingForm = conjugations[index] ? resolveForm(conjugations[index], inglisceWord) : inglisceWord;
                    addWord(form, ingForm, 'Verb');
                    addWord(form, ingForm, 'Auxiliary');
                });
            }
            // 4. Modals
            else if (posCategory === 'Modal') {
                addWord(engWord, inglisceWord, 'Modal'); 
                const past = engWord.includes('can') ? 'could' :
                             engWord.includes('will') ? 'would' :
                             engWord.includes('shall') ? 'should' :
                             engWord.includes('may') ? 'might' : null;

                if (past) addWord(past, resolveForm(conjugations[0], inglisceWord) || inglisceWord, 'Modal');
                
                const neg1 = resolveForm(conjugations[1], inglisceWord) || inglisceWord;
                addWord(`${engWord} not`, neg1, 'Modal');
                addWord(`${engWord}n't`, neg1, 'Modal');
                if (engWord.includes('can')) addWord('cannot', neg1, 'Modal');
                if (engWord.includes('will')) addWord("won't", neg1, 'Modal');
                
                if (past) {
                    const neg2 = resolveForm(conjugations[2], inglisceWord) || inglisceWord;
                    addWord(`${past} not`, neg2, 'Modal');
                    addWord(`${past}n't`, neg2, 'Modal');
                }
            }
            // 5. Standard Verbs
            else if (posCategory === 'Verb' || posCategory === 'Auxiliary') {
                const doc = nlp(engWord).tag('Verb');
                const conj = doc.verbs().conjugate()[0];
                
                if (conj) {
                    const present = resolveForm(conjugations[0], inglisceWord);
                    if (present) addWord(conj.PresentTense, present, posCategory);
                    
                    if (conjugations.length === 3) {
                        const past = resolveForm(conjugations[1], inglisceWord);
                        const gerund = resolveForm(conjugations[2], inglisceWord, true);
                        if (past) {
                            addWord(conj.PastTense, past, posCategory);
                            addWord(conj.Participle, past, posCategory);
                        }
                        if (gerund) addWord(conj.Gerund, gerund, posCategory);
                    } 
                    else if (conjugations.length >= 4) {
                        const past = resolveForm(conjugations[1], inglisceWord);
                        const participle = resolveForm(conjugations[2], inglisceWord);
                        const gerund = resolveForm(conjugations[3], inglisceWord, true);
                        if (past) addWord(conj.PastTense, past, posCategory);
                        if (participle) addWord(conj.Participle, participle, posCategory);
                        if (gerund) addWord(conj.Gerund, gerund, posCategory);
                    }
                }
            }
            // 6. Standard Nouns (Plurals)
            else if (posCategory === 'Noun' && conjugations.length > 0) {
                const doc = nlp(engWord).tag('Noun');
                const englishPlural = doc.nouns().toPlural().text('normal');
                const inglPlural = resolveForm(conjugations[0], inglisceWord);
                if (englishPlural && inglPlural) addWord(englishPlural, inglPlural, 'Noun');
            }
            // 7. Adjectives (Comparatives)
            else if (posCategory === 'Adjective' && conjugations.length > 0) {
                const doc = nlp(engWord).tag('Adjective');
                const conj = doc.adjectives().conjugate()[0];
                
                conjugations.forEach(conjStr => {
                    const resolved = resolveForm(conjStr, inglisceWord);
                    if (!resolved) return;
                    
                    if (conjStr.includes('est') && conj?.Superlative) addWord(conj.Superlative, resolved, 'Adjective');
                    else if (conjStr.includes('er') && conj?.Comparative) addWord(conj.Comparative, resolved, 'Adjective');
                    else if ((conjStr.includes('ly') || conjStr.includes('y')) && conj?.Adverb) addWord(conj.Adverb, resolved, 'Adverb');
                    else if (conjStr.includes('ness') && conj?.Noun) addWord(conj.Noun, resolved, 'Noun');
                });
            }
        });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));
    console.log(`✅ Brain compiled to ${OUTPUT_FILE}`);
    console.log(`📊 Loaded ${compiledCount} base dictionary files!`);
    console.log(`🧠 Generated ${Object.keys(brain).length} exact English forms!`);
}

compile();
