import fs from 'node:fs';
import path from 'path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import nlp from 'compromise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

const brain = {};

const posMap = {
    'verb': 'Verb', 
    'transitive verb': 'Verb', 
    'intransitive verb': 'Verb',
    'noun': 'Noun', 
    'masculine noun': 'Noun', 
    'feminine noun': 'Noun',
    'adjective': 'Adjective',
    'adverb': 'Adverb',
    'preposition': 'Preposition',
    'pronoun': 'Pronoun',
    'conjunction': 'Conjunction',
    'number': 'Value',
    'num': 'Value'
};

// Helper: Safely add a word pair to the brain, stripping dictionary typos (e.g. bleu(e -> bleue)
function addWord(eng, inglisce, pos) {
    if (!eng || !inglisce) return;
    
    let cleanEng = eng.toLowerCase().trim();
    let cleanIng = inglisce.replace(/[.,!?()[\]{}]/g, '').trim();

    brain[cleanEng] = brain[cleanEng] || {};
    // Prevent overwriting if a form is already registered
    brain[cleanEng][pos] = brain[cleanEng][pos] || cleanIng;
}

// Helper: Apply a dictionary suffix array (e.g., "-s" or full word "circuls")
function applyForm(baseInglisce, modifier) {
    if (!modifier) return null;
    if (modifier.startsWith('-')) {
        // e.g. base: "þrîve", modifier: "-s" -> "þrîves"
        return baseInglisce + modifier.slice(1);
    }
    // If it's not a hyphenated suffix, it's an explicit full spelling
    return modifier;
}

async function compile() {
    console.log('🧠 Compiling Translation Brain with Pre-Computed Morphology...');

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
        const conjugations = data.conjugations || [];

        if (!engWord || !inglisceWord || posCategory === 'Unknown') continue;

        // 1. Always map the base word
        addWord(engWord, inglisceWord, posCategory);

        // 2. Pre-compute and map VERBS
        if (posCategory === 'Verb' && conjugations.length > 0) {
            let doc = nlp(engWord);
            let conj = doc.verbs().conjugate()[0]; // Gets English variations

            if (conj) {
                // Assuming standard dictionary metadata: [0] = present/plural, [1] = past, [2] = gerund
                addWord(conj.PresentTense, applyForm(inglisceWord, conjugations[0]), 'Verb');
                addWord(conj.PastTense, applyForm(inglisceWord, conjugations[1]), 'Verb');
                addWord(conj.Gerund, applyForm(inglisceWord, conjugations[2]), 'Verb');
            }
        }

        // 3. Pre-compute and map NOUNS
        if (posCategory === 'Noun' && conjugations.length > 0) {
            let doc = nlp(engWord);
            let englishPlural = doc.nouns().toPlural().text('normal');

            if (englishPlural) {
                // Assuming standard dictionary metadata: [0] = plural form
                addWord(englishPlural, applyForm(inglisceWord, conjugations[0]), 'Noun');
            }
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));
    console.log(`✅ Brain compiled to ${OUTPUT_FILE}`);
    console.log(`📊 Loaded ${Object.keys(brain).length} total English forms!`);
}

compile();