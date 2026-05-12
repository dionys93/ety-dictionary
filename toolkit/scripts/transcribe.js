import fs from 'node:fs';
import path from 'node:path';
import nlp from 'compromise';

// Load the compiled brain
const brainPath = path.resolve('./scripts/translationBrain.json');
if (!fs.existsSync(brainPath)) {
    console.error('❌ Brain not found! Run "node scripts/compileBrain.js" first.');
    process.exit(1);
}
const brain = JSON.parse(fs.readFileSync(brainPath, 'utf-8'));

// The file you want to translate, and where to save it
const INPUT_FILE = path.resolve('./books/poems/the-road-not-taken.txt');
const OUTPUT_FILE = path.resolve('./books/inglisce-poems/the-road-not-taken.txt');

function transcribe() {
    console.log(`📖 Reading: ${INPUT_FILE}`);
    const rawText = fs.readFileSync(INPUT_FILE, 'utf-8');
    
    // Parse the entire document with NLP
    let doc = nlp(rawText);

    // Loop through every single word token
    doc.terms().forEach((term) => {
        // Get the base dictionary form of the word (e.g., "leaves" -> "leaf")
        const baseWord = term.machineBase() || term.text('normal');
        const entry = brain[baseWord];

        if (entry) {
            let replacement = null;

            // Check the NLP tags against our Brain POS categories
            if (term.has('#Verb') && entry['Verb']) {
                replacement = entry['Verb'];
                // NOTE: Morphological rules (adding -s, -ing, -ed) to the replacement would go here.
            } 
            else if (term.has('#Noun') && entry['Noun']) {
                replacement = entry['Noun'];
                // NOTE: Plural rules (adding -s) would go here.
            }
            else if (term.has('#Adjective') && entry['Adjective']) {
                replacement = entry['Adjective'];
            }
            else if (term.has('#Adverb') && entry['Adverb']) {
                replacement = entry['Adverb'];
            }

            // If we found a valid replacement for this part of speech, swap it!
            if (replacement) {
                // Check if the original word was Capitalized or UPPERCASE and match it
                if (term.has('#TitleCase')) {
                    replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
                } else if (term.text() === term.text().toUpperCase()) {
                    replacement = replacement.toUpperCase();
                }

                // Replace the word, but keep the surrounding punctuation and whitespace
                term.replaceWith(replacement, { keepTags: true, keepCase: false });
            }
        }
    });

    // Ensure the output directory exists
    const outDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // Save the translated text
    fs.writeFileSync(OUTPUT_FILE, doc.text());
    console.log(`✅ Transcribed successfully to: ${OUTPUT_FILE}`);
}

transcribe();