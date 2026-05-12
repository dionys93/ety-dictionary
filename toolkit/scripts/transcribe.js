import fs from 'fs';
import path from 'path';
import nlp from 'compromise';

// 1. Capture CLI Arguments
const args = process.argv.slice(2);
const inputFile = args[0];

const defaultOut = path.join(import.meta.dirname, '..', 'dist', 'test_transcription.txt');
const outputFile = args[1] || defaultOut;

if (!inputFile) {
    console.error('❌ Error: Missing input file.');
    console.log('Usage: node scripts/transcribe.js <path/to/input.txt> [path/to/output.txt]');
    process.exit(1);
}

// 2. Define Paths
const brainPath = path.join(import.meta.dirname, '..', 'dist', 'translationBrain.json');

// 3. Validation Checks
if (!fs.existsSync(inputFile)) {
    console.error(`❌ Error: Cannot find input file at ${inputFile}`);
    process.exit(1);
}

if (!fs.existsSync(brainPath)) {
    console.error('❌ Error: translationBrain.json is missing.');
    console.log('👉 Tip: Run `node scripts/compileBrain.js` first.');
    process.exit(1);
}

// 4. Load Data
console.log(`🧠 Loading Translation Brain...`);
const brain = JSON.parse(fs.readFileSync(brainPath, 'utf8'));
const text = fs.readFileSync(inputFile, 'utf8');

// Helper function to resolve the correct POS translation
const getReplacement = (term, brainEntry) => {
    if (term.has('#Noun') && brainEntry.Noun) return brainEntry.Noun;
    if (term.has('#Verb') && brainEntry.Verb) return brainEntry.Verb;
    if (term.has('#Adjective') && brainEntry.Adjective) return brainEntry.Adjective;
    if (term.has('#Value') && brainEntry.Value) return brainEntry.Value;
    
    // Fallback: grab the first available translation
    const firstKey = Object.keys(brainEntry)[0];
    return brainEntry[firstKey];
};

// 5. NLP Parsing & Transcription
console.log(`🤖 Transcribing: ${inputFile}...`);
const doc = nlp(text);

// Iterate through every word in the document
doc.terms().forEach((term) => {
    const normal = term.text('normal');
    let lookupWord = normal;
    let isPluralNoun = false;

    // --- MORPHOLOGY LOGIC ---
    if (!brain[lookupWord] && term.has('#Plural')) {
        // BUGFIX: Use .clone() to keep the original sentence context!
        let singular = term.clone().nouns().toSingular().text('normal');
        
        // Hard fallback just in case compromise still fails
        if (!singular && lookupWord.endsWith('s')) {
            singular = lookupWord.slice(0, -1);
        }

        if (singular && brain[singular]) {
            lookupWord = singular;
            isPluralNoun = true;
        }
    }

    // Check if we found a match (either base word or singular root)
    if (brain[lookupWord]) {
        let replacement = getReplacement(term, brain[lookupWord]);

        if (replacement) {
            // --- SANITIZER ---
            // Strip rogue dictionary punctuation
            replacement = replacement.replace(/[.,!?()[\]{}]/g, '');

            // --- RE-APPLY MORPHOLOGY ---
            if (isPluralNoun) {
                replacement += 's';
            }

            // Apply replacement while preserving original casing and sentence punctuation
            term.replaceWith(replacement, { keepTags: true, keepCase: true });
        }
    }
});

// 6. Save Output
const outDir = path.dirname(outputFile);
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outputFile, doc.text(), 'utf8');
console.log(`✅ Transcription complete!`);
console.log(`📄 Saved to: ${outputFile}`);