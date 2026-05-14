/**
 * ============================================================================
 * TRANSLATION BRAIN COMPILER
 * * This script ingests the flattened JSONL dictionary and uses `compromise.js` 
 * to calculate all valid English morphological variations (plurals, tenses).
 * It then builds a massive 1:1 lookup table (`translationBrain.json`) mapping 
 * every possible English form to its exact Inglisce equivalent.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import nlp from 'compromise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input/Output Paths
const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

// Global State
const brain = {};
let compiledCount = 0; // Numerical Collection

const posMap = {
    'verb': 'Verb', 'transitive verb': 'Verb', 'intransitive verb': 'Verb',
    'noun': 'Noun', 'masculine noun': 'Noun', 'feminine noun': 'Noun',
    'adjective': 'Adjective', 'adverb': 'Adverb', 'preposition': 'Preposition',
    'pronoun': 'Pronoun', 'conjunction': 'Conjunction', 'number': 'Value', 'num': 'Value',
    'article': 'Determiner', 'art': 'Determiner', 'definite article': 'Determiner', 'indefinite article': 'Determiner',
    'defin': 'Determiner', 'indefin': 'Determiner',
    'modal': 'Modal', 'aux': 'Auxiliary', 'auxiliary': 'Auxiliary'
};

/**
 * Calculates the full Inglisce spelling from a dictionary shorthand suffix.
 * Automatically drops the silent '-e' for vowel suffixes and progressive participles.
 */
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

const addWord = (eng, inglisce, pos) => {
    if (!eng || !inglisce) return;
    const cleanEng = eng.toLowerCase().trim();
    const cleanIng = inglisce.replace(/[.,!?()[\]{}]/g, '').trim();
    
    brain[cleanEng] = brain[cleanEng] || {};
    brain[cleanEng][pos] = brain[cleanEng][pos] || cleanIng;
};

async function compile() {
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

        // ====================================================================
        // DATA SANITIZATION (The Bleed Fix)
        // Strips rogue tags, cleans commas, and drops alternative roots
        // ====================================================================
        const rawConjs = (data.conjugations || [])
            .map(w => w.replace(/,/g, ''))
            .filter(w => !w.startsWith('['));

        // Find where the actual suffixes begin
        const firstSuffixIdx = rawConjs.findIndex(w => w.startsWith('-'));

        // If suffixes exist, slice away the alternative roots (e.g. "to", "throne")
        // If no suffixes exist (irregulars), safely remove the word 'to' if it bled.
        const conjugations = firstSuffixIdx > 0 
            ? rawConjs.slice(firstSuffixIdx) 
            : rawConjs.filter((w, i, arr) => w !== 'to' && arr[i - 1] !== 'to');

        if (!engWord || !inglisceWord) continue;

        const validPosCategories = data.pos.split(', ').map(p => posMap[p]).filter(Boolean);
        if (validPosCategories.length > 0) compiledCount++;

        validPosCategories.forEach(posCategory => {
            addWord(engWord, inglisceWord, posCategory);

            // 1. 'Do' (Auxiliary Form)
            if (posCategory === 'Auxiliary' && engWord === 'do' && conjugations.length >= 6) {
                addWord('do', resolveForm(conjugations[0], inglisceWord), 'Auxiliary');
                addWord('does', resolveForm(conjugations[1], inglisceWord), 'Auxiliary');
                addWord('did', resolveForm(conjugations[2], inglisceWord), 'Auxiliary');
                addWord('do not', resolveForm(conjugations[3], inglisceWord), 'Auxiliary');
                addWord("don't", resolveForm(conjugations[3], inglisceWord), 'Auxiliary');
                addWord('does not', resolveForm(conjugations[4], inglisceWord), 'Auxiliary');
                addWord("doesn't", resolveForm(conjugations[4], inglisceWord), 'Auxiliary');
                addWord('did not', resolveForm(conjugations[5], inglisceWord), 'Auxiliary');
                addWord("didn't", resolveForm(conjugations[5], inglisceWord), 'Auxiliary');
            }
            // 2. 'Do' (Verb Form)
            else if (posCategory === 'Verb' && engWord === 'do' && conjugations.length >= 8) {
                addWord('do', resolveForm(conjugations[0], inglisceWord), 'Verb');
                addWord('does', resolveForm(conjugations[1], inglisceWord), 'Verb');
                addWord('did', resolveForm(conjugations[2], inglisceWord), 'Verb');
                addWord('done', resolveForm(conjugations[3], inglisceWord), 'Verb');
                addWord('doing', resolveForm(conjugations[4], inglisceWord, true), 'Verb');
                addWord('do not', resolveForm(conjugations[5], inglisceWord), 'Verb');
                addWord("don't", resolveForm(conjugations[5], inglisceWord), 'Verb');
                addWord('does not', resolveForm(conjugations[6], inglisceWord), 'Verb');
                addWord("doesn't", resolveForm(conjugations[6], inglisceWord), 'Verb');
                addWord('did not', resolveForm(conjugations[7], inglisceWord), 'Verb');
                addWord("didn't", resolveForm(conjugations[7], inglisceWord), 'Verb');
            }
            // 3. 'Be' (Copula Form)
            else if (posCategory === 'Auxiliary' && engWord === 'be' && conjugations.length >= 11) {
                addWord('be', inglisceWord, 'Copula'); 
                addWord('am', resolveForm(conjugations[0], inglisceWord), 'Copula');
                addWord('is', resolveForm(conjugations[1], inglisceWord), 'Copula');
                addWord('are', resolveForm(conjugations[2], inglisceWord), 'Copula');
                addWord('was', resolveForm(conjugations[3], inglisceWord), 'Copula');
                addWord('were', resolveForm(conjugations[4], inglisceWord), 'Copula');
                addWord('been', resolveForm(conjugations[5], inglisceWord), 'Copula');
                addWord('being', resolveForm(conjugations[6], inglisceWord, true), 'Copula');
                addWord('is not', resolveForm(conjugations[7], inglisceWord), 'Copula');
                addWord("isn't", resolveForm(conjugations[7], inglisceWord), 'Copula');
                addWord('are not', resolveForm(conjugations[8], inglisceWord), 'Copula');
                addWord("aren't", resolveForm(conjugations[8], inglisceWord), 'Copula');
                addWord('was not', resolveForm(conjugations[9], inglisceWord), 'Copula');
                addWord("wasn't", resolveForm(conjugations[9], inglisceWord), 'Copula');
                addWord('were not', resolveForm(conjugations[10], inglisceWord), 'Copula');
                addWord("weren't", resolveForm(conjugations[10], inglisceWord), 'Copula');
            }
            // 4. Modals
            else if (posCategory === 'Modal' && conjugations.length >= 3) {
                addWord(engWord, inglisceWord, 'Modal'); 
                const past = engWord === 'can' ? 'could' :
                             engWord === 'will' ? 'would' :
                             engWord === 'shall' ? 'should' :
                             engWord === 'may' ? 'might' : null;

                if (past) addWord(past, resolveForm(conjugations[0], inglisceWord), 'Modal');
                
                addWord(`${engWord} not`, resolveForm(conjugations[1], inglisceWord), 'Modal');
                addWord(`${engWord}n't`, resolveForm(conjugations[1], inglisceWord), 'Modal');
                if (engWord === 'can') addWord('cannot', resolveForm(conjugations[1], inglisceWord), 'Modal');
                if (engWord === 'will') addWord("won't", resolveForm(conjugations[1], inglisceWord), 'Modal');
                
                if (past && conjugations[2]) {
                    addWord(`${past} not`, resolveForm(conjugations[2], inglisceWord), 'Modal');
                    addWord(`${past}n't`, resolveForm(conjugations[2], inglisceWord), 'Modal');
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
            // 7. Adjectives
            else if (posCategory === 'Adjective' && conjugations.length > 0) {
                conjugations.forEach(conjStr => {
                    const resolved = resolveForm(conjStr, inglisceWord);
                    if (resolved) {
                        if (conjStr.includes('ly') || conjStr.includes('y')) {
                            const adv = nlp(engWord).adjectives().adverbs().text('normal');
                            if (adv) addWord(adv, resolved, 'Adverb');
                        } else if (conjStr.includes('ness')) {
                            const nn = nlp(engWord).adjectives().nouns().text('normal');
                            if (nn) addWord(nn, resolved, 'Noun');
                        }
                    }
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