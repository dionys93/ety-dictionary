import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

// 1. Get the directory of THIS exact script file (toolkit/scripts/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. Resolve paths relative to this script's location, guaranteeing it never gets lost
const JSONL_FILE = path.resolve(__dirname, '../dist/master_dataset.jsonl');
const OUTPUT_FILE = path.resolve(__dirname, '../dist/translationBrain.json');

const brain = {};

// Maps your exact Bash POS tags to broad NLP categories
const posMap = {
    'v': 'Verb', 'tr v': 'Verb', 'intr v': 'Verb',
    'n': 'Noun', 'm n': 'Noun', 'f n': 'Noun',
    'adj': 'Adjective',
    'adv': 'Adverb',
    'prep': 'Preposition',
    'pron': 'Pronoun',
    'conj': 'Conjunction'
};

async function compile() {
    console.log('🧠 Compiling Translation Brain from JSONL...');

    if (!fs.existsSync(JSONL_FILE)) {
        console.error(`❌ JSONL file not found at ${JSONL_FILE}! Please run "etym-jsonl" in your terminal first.`);
        process.exit(1);
    }

    // Stream the file so it never maxes out memory
    const fileStream = fs.createReadStream(JSONL_FILE);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        if (!line.trim()) continue;
        
        const data = JSON.parse(line);
        const engWord = data.me_word;
        const inglisceWord = data.inglisce_word;
        const posCategory = posMap[data.pos] || 'Unknown';

        // Map it to the brain
        if (engWord && inglisceWord && posCategory !== 'Unknown') {
            brain[engWord] = brain[engWord] || {};
            // Prefer the first found instance of a POS to avoid overwrites
            brain[engWord][posCategory] = brain[engWord][posCategory] || inglisceWord;
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));
    console.log(`✅ Brain compiled to ${OUTPUT_FILE} with ${Object.keys(brain).length} root words!`);
}

compile();