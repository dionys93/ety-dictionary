import fs from 'node:fs';
import path from 'path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

// 1. Get the directory of THIS exact script file (toolkit/scripts/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Resolve paths relative to this script's location
const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

const brain = {};

// Map the VERBOSE tags from the JSONL to the NLP categories
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

async function compile() {
    console.log('🧠 Compiling Translation Brain from JSONL...');

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

        if (engWord && inglisceWord && posCategory !== 'Unknown') {
            brain[engWord] = brain[engWord] || {};
            brain[engWord][posCategory] = brain[engWord][posCategory] || inglisceWord;
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));
    console.log(`✅ Brain compiled to ${OUTPUT_FILE} with ${Object.keys(brain).length} root words!`);
}

compile();