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
let compiledCount = 0; 

// Maps standard text file abbreviations to compromise.js internal tags
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
 * Safely adds an English -> Inglisce mapping to the brain.
 * Strips punctuation to ensure clean 1:1 string matching during transcription.
 * @param {string} eng - The calculated English word (e.g., "circles")
 * @param {string} inglisce - The target Inglisce word (e.g., "circuls")
 * @param {string} pos - The Part of Speech tag (e.g., "Noun")
 */
function addWord(eng, inglisce, pos) {
    if (!eng || !inglisce) return;
    
    // Normalize casing for the lookup key
    const cleanEng = eng.toLowerCase().trim();
    // Strip trailing dictionary punctuation from the value
    const cleanIng = inglisce.replace(/[.,!?()[\]{}]/g, '').trim();
    
    // Initialize nested objects if they don't exist
    brain[cleanEng] = brain[cleanEng] || {};
    
    // Prevent overwriting an existing definition for this specific Part of Speech
    brain[cleanEng][pos] = brain[cleanEng][pos] || cleanIng;
}

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
        const posCategory = posMap[data.pos] || 'Unknown';
        
        // Strip out any rogue [LANG] tags that accidentally bled into the array
        const conjugations = (data.conjugations || []).filter(w => !w.startsWith('['));

        if (!engWord || !inglisceWord || posCategory === 'Unknown') continue;

        // Map the base/root word
        addWord(engWord, inglisceWord, posCategory);
        compiledCount++;

        // ====================================================================
        // MAPPING ROUTER
        // Uses an if/else if chain to prevent structural words from falling 
        // into the dynamic NLP processors.
        // ====================================================================

        // 1. 'Do' (Auxiliary Form)
        // Blueprint: [do, does, did, don't, doesn't, didn't]
        if (posCategory === 'Auxiliary' && engWord === 'do' && conjugations.length >= 6) {
            addWord('do', conjugations[0], 'Auxiliary');
            addWord('does', conjugations[1], 'Auxiliary');
            addWord('did', conjugations[2], 'Auxiliary');
            addWord('do not', conjugations[3], 'Auxiliary');
            addWord("don't", conjugations[3], 'Auxiliary');
            addWord('does not', conjugations[4], 'Auxiliary');
            addWord("doesn't", conjugations[4], 'Auxiliary');
            addWord('did not', conjugations[5], 'Auxiliary');
            addWord("didn't", conjugations[5], 'Auxiliary');
        }

        // 2. 'Do' (Verb Form)
        // Blueprint: [do, does, did, done, doing, don't, doesn't, didn't]
        else if (posCategory === 'Verb' && engWord === 'do' && conjugations.length >= 8) {
            addWord('do', conjugations[0], 'Verb');
            addWord('does', conjugations[1], 'Verb');
            addWord('did', conjugations[2], 'Verb');
            addWord('done', conjugations[3], 'Verb');
            addWord('doing', conjugations[4], 'Verb');
            addWord('do not', conjugations[5], 'Verb');
            addWord("don't", conjugations[5], 'Verb');
            addWord('does not', conjugations[6], 'Verb');
            addWord("doesn't", conjugations[6], 'Verb');
            addWord('did not', conjugations[7], 'Verb');
            addWord("didn't", conjugations[7], 'Verb');
        }

        // 3. 'Be' (Copula Form)
        // Blueprint: [am, is, are, was, were, been, being, isn't, aren't, wasn't, weren't]
        else if (posCategory === 'Auxiliary' && engWord === 'be' && conjugations.length >= 11) {
            addWord('be', inglisceWord, 'Copula'); // Base word
            addWord('am', conjugations[0], 'Copula');
            addWord('is', conjugations[1], 'Copula');
            addWord('are', conjugations[2], 'Copula');
            addWord('was', conjugations[3], 'Copula');
            addWord('were', conjugations[4], 'Copula');
            addWord('been', conjugations[5], 'Copula');
            addWord('being', conjugations[6], 'Copula');
            addWord('is not', conjugations[7], 'Copula');
            addWord("isn't", conjugations[7], 'Copula');
            addWord('are not', conjugations[8], 'Copula');
            addWord("aren't", conjugations[8], 'Copula');
            addWord('was not', conjugations[9], 'Copula');
            addWord("wasn't", conjugations[9], 'Copula');
            addWord('were not', conjugations[10], 'Copula');
            addWord("weren't", conjugations[10], 'Copula');
        }

        // 4. Modals (can, will, shall, may)
        // Blueprint base: inglisceWord
        // Blueprint array: [past, present_negative, past_negative]
        else if (posCategory === 'Modal' && conjugations.length >= 3) {
            addWord(engWord, inglisceWord, 'Modal'); 
            
            // Hardcode irregular past tenses for lookup
            let past = '';
            if (engWord === 'can') past = 'could';
            if (engWord === 'will') past = 'would';
            if (engWord === 'shall') past = 'should';
            if (engWord === 'may') past = 'might';

            if (past) addWord(past, conjugations[0], 'Modal');
            
            // Map explicitly expanded negatives to prevent compromise.js splitting errors
            addWord(`${engWord} not`, conjugations[1], 'Modal');
            addWord(`${engWord}n't`, conjugations[1], 'Modal');
            if (engWord === 'can') addWord('cannot', conjugations[1], 'Modal');
            if (engWord === 'will') addWord("won't", conjugations[1], 'Modal');
            
            if (past && conjugations[2]) {
                addWord(`${past} not`, conjugations[2], 'Modal');
                addWord(`${past}n't`, conjugations[2], 'Modal');
            }
        }

        // 5. Standard Verbs
        else if (posCategory === 'Verb' && conjugations.length > 0) {
            // Force compromise.js to treat homographs (like 'record' or 'circle') as a Verb
            const doc = nlp(engWord).tag('Verb');
            const conj = doc.verbs().conjugate()[0];
            
            if (conj) {
                // Index 0 is always Present Tense (e.g., -s)
                addWord(conj.PresentTense, conjugations[0], 'Verb');
                
                // Regular Verbs: Past and Participle share the same form (-ed)
                if (conjugations.length === 3) {
                    addWord(conj.PastTense, conjugations[1], 'Verb');
                    addWord(conj.Participle, conjugations[1], 'Verb');
                    addWord(conj.Gerund, conjugations[2], 'Verb');
                } 
                // Irregular/Strong Verbs: Participle has its own explicit form
                else if (conjugations.length >= 4) {
                    addWord(conj.PastTense, conjugations[1], 'Verb');
                    addWord(conj.Participle, conjugations[2], 'Verb');
                    addWord(conj.Gerund, conjugations[3], 'Verb');
                }
            }
        }

        // 6. Standard Nouns (Plurals)
        else if (posCategory === 'Noun' && conjugations.length > 0) {
            // Force compromise.js to treat homographs as Nouns to ensure pluralization triggers
            const doc = nlp(engWord).tag('Noun');
            const englishPlural = doc.nouns().toPlural().text('normal');
            
            if (englishPlural) addWord(englishPlural, conjugations[0], 'Noun');
        }
    }

    // Save the fully compiled brain
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));
    
    // Output compilation stats
    console.log(`✅ Brain compiled to ${OUTPUT_FILE}`);
    console.log(`📊 Loaded ${compiledCount} base dictionary files!`);
    console.log(`🧠 Generated ${Object.keys(brain).length} exact English forms!`);
}

compile();