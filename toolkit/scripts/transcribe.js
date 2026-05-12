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
    
    // Fallback: If dictionary only has one definition, use it (unless NLP strictly forbids it)
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
const doc = nlp(text);

doc.terms().forEach((term) => {
    const normal = term.text('normal');
    
    if (brain[normal]) {
        // --- 🔍 X-RAY DEBUGGER ---
        if (normal === 'record' || normal === 'object' || normal === 'the') {
            console.log(`\n🔍 X-RAY: '${normal}'`);
            console.log(`   ↳ Context Tags:`, term.json()[0].terms[0].tags);
            console.log(`   ↳ Dictionary Data:`, brain[normal]);
        }

        const replacement = getReplacement(term, brain[normal]);
        if (replacement) {
            term.replaceWith(replacement, { keepTags: true, keepCase: true });
        }
    }
});

const outDir = path.dirname(outputFile);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputFile, doc.text(), 'utf8');
console.log(`\n✅ Transcription complete! Saved to: ${outputFile}`);