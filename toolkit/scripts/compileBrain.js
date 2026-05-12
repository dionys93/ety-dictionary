import fs from 'node:fs';
import path from 'node:path';

const DICT_DIR = path.resolve('./data-text/inglisce/dictionary');
const OUTPUT_FILE = path.resolve('./toolkit/dist/translationBrain.json');

const brain = {};

const posMap = {
    '(v)': 'Verb', '(tr v)': 'Verb', '(intr v)': 'Verb',
    '(n)': 'Noun', '(m n)': 'Noun', '(f n)': 'Noun',
    '(adj)': 'Adjective',
    '(adv)': 'Adverb',
    '(prep)': 'Preposition',
    '(pron)': 'Pronoun',
    '(conj)': 'Conjunction'
};

// Replaced the 'for' loop with a functional .forEach()
function crawlDirectory(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(file => {
        const fullPath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
            crawlDirectory(fullPath);
        } else if (file.name.endsWith('.txt')) {
            processFile(fullPath);
        }
    });
}

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Replaced the outer 'for' loop with .forEach()
    content.split(/\n\s*\n/).forEach(stanza => {
        const lines = stanza.split('\n').map(l => l.trim()).filter(Boolean);
        
        // Use .find() to immediately grab the correct lines without an inner loop
        const engLine = lines.find(line => line.includes('[ME]') || line.includes('[MI]'));
        const ingLine = lines.find(line => /\([^)]+\)/.test(line) && !line.includes('http'));
        
        // Extract values using ternaries directly into constants (eliminating 'let')
        const engWord = engLine 
            ? engLine.replace(/\[[A-Z]+\]/g, '').replace(/^to\s+/i, '').split(',')[0].trim().toLowerCase() 
            : null;
            
        const posMatch = ingLine ? ingLine.match(/\([^)]+\)/) : null;
        const posCategory = posMatch ? (posMap[posMatch[0]] || 'Unknown') : 'Unknown';
        
        const inglisceWord = (ingLine && posCategory !== 'Unknown')
            ? ingLine.replace(/\[[A-Z]+\]/g, '').replace(/\([^)]+\)/g, '').replace(/^to\s+/i, '').split(/[\s,]+/)[0].trim()
            : null;

        // Safely map the data into the dictionary object
        if (engWord && inglisceWord && posCategory !== 'Unknown') {
            // Short-circuit assignment creates the nested object if it doesn't exist
            brain[engWord] = brain[engWord] || {};
            // Only assign the translation if that POS slot is currently empty
            brain[engWord][posCategory] = brain[engWord][posCategory] || inglisceWord;
        }
    });
}

console.log('🧠 Compiling Translation Brain...');

crawlDirectory(DICT_DIR);

const outDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brain, null, 2));

console.log(`✅ Brain compiled to ${OUTPUT_FILE} with ${Object.keys(brain).length} root words!`);