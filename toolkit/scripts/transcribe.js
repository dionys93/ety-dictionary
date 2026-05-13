import fs from 'fs';
import path from 'path';
import nlp from 'compromise';

const args = process.argv.slice(2);
const inputFile = args[0];
const defaultOut = path.join(import.meta.dirname, '..', 'dist', 'test_transcription.txt');
const outputFile = args[1] || defaultOut;

if (!inputFile) {
    console.error('❌ Error: Missing input file.');
    process.exit(1);
}

const brainPath = path.join(import.meta.dirname, '..', 'dist', 'translationBrain.json');
if (!fs.existsSync(inputFile) || !fs.existsSync(brainPath)) {
    console.error(`❌ Error: Missing input file or translationBrain.json`);
    process.exit(1);
}

console.log(`🧠 Loading Translation Brain...`);
const brain = JSON.parse(fs.readFileSync(brainPath, 'utf8'));
const text = fs.readFileSync(inputFile, 'utf8');

const getReplacement = (term, brainEntry) => {
    if (term.has('#Noun') && brainEntry.Noun) return brainEntry.Noun;
    if (term.has('#Verb') && brainEntry.Verb) return brainEntry.Verb;
    if (term.has('#Adjective') && brainEntry.Adjective) return brainEntry.Adjective;
    if (term.has('#Determiner') && brainEntry.Determiner) return brainEntry.Determiner;
    if (term.has('#Value') && brainEntry.Value) return brainEntry.Value;
    if (term.has('#Preposition') && brainEntry.Preposition) return brainEntry.Preposition;
    if (term.has('#Pronoun') && brainEntry.Pronoun) return brainEntry.Pronoun;
    if (term.has('#Adverb') && brainEntry.Adverb) return brainEntry.Adverb;
    
    const keys = Object.keys(brainEntry);
    if (keys.length === 1) {
        const onlyPos = keys[0];
        if (onlyPos === 'Verb' && term.has('#Noun')) return null;
        if (onlyPos === 'Noun' && term.has('#Verb')) return null;
        return brainEntry[onlyPos];
    }
    
    return brainEntry[keys[0]];
};

console.log(`🤖 Transcribing: ${inputFile}...`);

const missingWords = new Set();

// Process line-by-line to perfectly preserve paragraphs, double-spaces, and line breaks
const lines = text.split('\n');
const transcribedLines = lines.map(line => {
    // If the line is completely empty, leave it exactly as-is
    if (!line.trim()) return line;

    const doc = nlp(line);

    doc.terms().forEach((term) => {
        const normal = term.text('normal');
        if (!normal) return;

        let replaced = false;

        // Try to replace the word
        if (brain[normal]) {
            const replacement = getReplacement(term, brain[normal]);
            if (replacement) {
                term.replaceWith(replacement, { keepTags: true, keepCase: true });
                replaced = true;
            }
        }

        // Handle missing or skipped words
        if (!replaced) {
            // Retrieve the exact text of the word (without surrounding punctuation) to preserve capitalization
            const originalWord = term.json()[0].terms[0].text;
            
            term.replaceWith(`[${originalWord}]`, { keepTags: true });
            missingWords.add(normal);
        }
    });

    return doc.text();
});

const outDir = path.dirname(outputFile);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Stitch the lines back together with exact original line breaks
fs.writeFileSync(outputFile, transcribedLines.join('\n'), 'utf8');

console.log(`\n✅ Transcription complete! Saved to: ${outputFile}`);

if (missingWords.size > 0) {
    console.log(`\n⚠️  Missing Words Tracker (${missingWords.size} untranslated words):`);
    console.log(Array.from(missingWords).sort().join(', '));
}