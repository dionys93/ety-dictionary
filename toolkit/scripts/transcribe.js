/**
 * ============================================================================
 * INGLISCE TRANSCRIBER
 * * This script takes standard English text and translates it into Inglisce
 * using the compiled `translationBrain.json`. It uses `compromise.js` to 
 * analyze sentence context, ensuring homographs (like the noun vs verb "record") 
 * are translated correctly based on their grammar. Unmapped words are safely 
 * wrapped in [brackets] to serve as a to-do list for future dictionary entries.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import nlp from 'compromise';

// ============================================================================
// 1. SETUP & VALIDATION
// ============================================================================

const args = process.argv.slice(2);
const inputFile = args[0];
// Default output path if the user doesn't provide one
const outputFile = args[1] || path.join(import.meta.dirname, '..', 'dist', 'test_transcription.txt');

if (!inputFile || !fs.existsSync(inputFile)) {
    console.error('❌ Error: Missing or invalid input file. Usage: node scripts/transcribe.js <input.txt> [output.txt]');
    process.exit(1);
}

const brainPath = path.join(import.meta.dirname, '..', 'dist', 'translationBrain.json');
if (!fs.existsSync(brainPath)) {
    console.error('❌ Error: translationBrain.json is missing. Run `node scripts/compileBrain.js` first.');
    process.exit(1);
}

// Load data into memory
const brain = JSON.parse(fs.readFileSync(brainPath, 'utf8'));
const text = fs.readFileSync(inputFile, 'utf8');

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

/**
 * Determines the best Inglisce translation for a specific NLP term.
 * Priority is strictly ordered to prevent generic parts of speech from 
 * hijacking specialized structural words.
 * @param {Object} term - The Compromise.js term object
 * @param {Object} brainEntry - The dictionary of available translations for this word
 * @returns {string|null} The chosen Inglisce word, or null if no safe match is found
 */
const getReplacement = (term, brainEntry) => {
    // 1. SPECIFIC/STRUCTURAL VERBS 
    // In compromise.js, Modals/Auxiliaries inherit the general #Verb tag. 
    // We MUST check for these specialized tags first, otherwise the engine will 
    // lazily grab the generic Verb translation (e.g., turning "can" into "cane").
    if (term.has('#Copula') && brainEntry.Copula) return brainEntry.Copula;
    if (term.has('#Auxiliary') && brainEntry.Auxiliary) return brainEntry.Auxiliary;
    if (term.has('#Modal') && brainEntry.Modal) return brainEntry.Modal;
    
    // 2. GENERIC PARTS OF SPEECH
    // Maps standard grammatical tags to the brain's explicit dictionary mappings.
    if (term.has('#Verb') && brainEntry.Verb) return brainEntry.Verb;
    if (term.has('#Noun') && brainEntry.Noun) return brainEntry.Noun;
    if (term.has('#Adjective') && brainEntry.Adjective) return brainEntry.Adjective;
    if (term.has('#Determiner') && brainEntry.Determiner) return brainEntry.Determiner;
    if (term.has('#Value') && brainEntry.Value) return brainEntry.Value;
    if (term.has('#Preposition') && brainEntry.Preposition) return brainEntry.Preposition;
    if (term.has('#Pronoun') && brainEntry.Pronoun) return brainEntry.Pronoun;
    if (term.has('#Adverb') && brainEntry.Adverb) return brainEntry.Adverb;
    
    // 3. FALLBACK & SAFETY CHECKS
    // If the word only has one translation in our dictionary, use it...
    const keys = Object.keys(brainEntry);
    if (keys.length === 1) {
        const onlyPos = keys[0];
        
        // ...UNLESS the NLP explicitly caught a homograph collision. 
        // (e.g. Do not overwrite a Noun with a Verb translation).
        if (onlyPos === 'Verb' && term.has('#Noun')) return null;
        if (onlyPos === 'Noun' && term.has('#Verb')) return null;
        
        return brainEntry[onlyPos];
    }
    
    // Absolute fallback: just grab the first available definition
    return brainEntry[keys[0]];
};


// ============================================================================
// 3. TRANSCRIPTION ENGINE
// ============================================================================

console.log(`🤖 Transcribing: ${inputFile}...`);

// Tracks words not found in the dictionary for the end-of-script audit report
const missingWords = new Set();

// Extract all explicitly mapped multi-word phrases (e.g., "do not", "isn't")
// so we can intercept them before compromise.js tries to split them.
const multiWords = Object.keys(brain).filter(k => k.includes(' ') || k.includes("'"));

// Split text by explicit newline characters to perfectly preserve paragraph
// spacing and formatting, which nlp(text) would otherwise strip out.
const lines = text.split('\n');

const transcribedLines = lines.map(line => {
    // Skip completely blank lines
    if (!line.trim()) return line;

    const doc = nlp(line);

    // --- PASS 1: MULTI-WORD INTERCEPTOR ---
    // Safely translates contractions and phrases as single units.
    multiWords.forEach(key => {
        const entry = brain[key];
        // Grab the most likely action-oriented translation for the phrase
        const fallback = entry.Verb || entry.Copula || entry.Auxiliary || entry.Modal || Object.values(entry)[0];
        
        if (fallback) {
            doc.match(key).forEach(m => {
                m.replaceWith(fallback, { keepTags: true, keepCase: true });
                // Tag it as translated so the standard pass doesn't touch it
                m.tag('#Translated'); 
            });
        }
    });

    // --- PASS 2: STANDARD WORD PASS ---
    // Loops through every individual term remaining in the sentence.
    doc.terms().forEach((term) => {
        // Skip words we already handled in Pass 1
        if (term.has('#Translated')) return;

        const normal = term.text('normal');
        if (!normal) return;

        // Attempt lookup and replacement
        if (brain[normal]) {
            const replacement = getReplacement(term, brain[normal]);
            if (replacement) {
                term.replaceWith(replacement, { keepTags: true, keepCase: true });
                term.tag('#Translated');
                return; // Early exit: word successfully translated, skip to the next term
            }
        }

        // Auditing: Wrap untranslated words in brackets (Only runs if we didn't return early)
        const rawText = term.text();
        // Prevent accidental double-bracketing 
        if (!rawText.includes('[')) {
            term.replaceWith(`[${rawText}]`, { keepTags: true });
        }
        missingWords.add(normal);
    });

    // Return the processed line as a string
    return doc.text();
});

// ============================================================================
// 4. OUTPUT & REPORTING
// ============================================================================

// Ensure destination folder exists
const outDir = path.dirname(outputFile);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Stitch the document back together with its original linebreaks
fs.writeFileSync(outputFile, transcribedLines.join('\n'), 'utf8');

console.log(`✅ Transcription complete! Saved to: ${outputFile}`);

// Print the To-Do list of missing words
if (missingWords.size > 0) {
    console.log(`\n⚠️  Missing Words Tracker (${missingWords.size} untranslated words):`);
    console.log(Array.from(missingWords).sort().join(', '));
}