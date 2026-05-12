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

const posMap = {
    'verb': 'Verb', 'transitive verb': 'Verb', 'intransitive verb': 'Verb',
    'noun': 'Noun', 'masculine noun': 'Noun', 'feminine noun': 'Noun',
    'adjective': 'Adjective', 'adverb': 'Adverb', 'preposition': 'Preposition',
    'pronoun': 'Pronoun', 'conjunction': 'Conjunction', 'number': 'Value', 'num': 'Value',
    'article': 'Determiner', 'art': 'Determiner', 
    'definite article': 'Determiner', 'indefinite article': 'Determiner'
};

// Helper: Safely add a word pair to the brain, stripping dictionary typos (e.g. bleu(e -> bleue)
function addWord(eng, inglisce, pos) {
    if (!eng || !inglisce) return;
    
    const cleanEng = eng.toLowerCase().trim();
    const cleanIng = inglisce.replace(/[.,!?()[\]{}]/g, '').trim();

    brain[cleanEng] = brain[cleanEng] || {};
    brain[cleanEng][pos] = brain[cleanEng][pos] || cleanIng;
}

async function compile() {
    console.log('🧠 Compiling Translation Brain with Explicit Morphology...');

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

        // 2. Map Verbs
        if (posCategory === 'Verb' && conjugations.length > 0) {
            const doc = nlp(engWord);
            const conj = doc.verbs().conjugate()[0]; // Gets English variations

            if (conj) {
                // [0] = present 3rd (-s), [1] = past (-ed), [last] = gerund (-ing)
                addWord(conj.PresentTense, conjugations[0], 'Verb');
                
                if (conjugations.length >= 2) {
                    addWord(conj.PastTense, conjugations[1], 'Verb');
                }
                
                if (conjugations.length >= 3) {
                    // Always grab the last item in the array for the Gerund
                    addWord(conj.Gerund, conjugations[conjugations.length - 1], 'Verb');
                }
            }
        }

        // 3. Map Nouns (Plurals)
        if (posCategory === 'Noun' && conjugations.length > 0) {
            const doc = nlp(engWord);
            const englishPlural = doc.nouns().toPlural().text('normal');

            if (englishPlural) {
                addWord(englishPlural, conjugations[0], 'Noun');
            }
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));
    console.log(`✅ Brain compiled to ${OUTPUT_FILE}`);
    console.log(`📊 Loaded ${Object.keys(brain).length} total English forms!`);
}

compile();