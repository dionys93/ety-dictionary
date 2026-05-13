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
 */
const getReplacement = (term, brainEntry) => {
    // 1. SPECIFIC/STRUCTURAL VERBS 
    if (term.has('#Copula') && brainEntry.Copula) return brainEntry.Copula;
    if (term.has('#Auxiliary') && brainEntry.Auxiliary) return brainEntry.Auxiliary;
    if (term.has('#Modal') && brainEntry.Modal) return brainEntry.Modal;
    
    // 2. GENERIC PARTS OF SPEECH
    if (term.has('#Verb') && brainEntry.Verb) return brainEntry.Verb;
    if (term.has('#Noun') && brainEntry.Noun) return brainEntry.Noun;
    if (term.has('#Adjective') && brainEntry.Adjective) return brainEntry.Adjective;
    if (term.has('#Determiner') && brainEntry.Determiner) return brainEntry.Determiner;
    if (term.has('#Value') && brainEntry.Value) return brainEntry.Value;
    if (term.has('#Preposition') && brainEntry.Preposition) return brainEntry.Preposition;
    if (term.has('#Pronoun') && brainEntry.Pronoun) return brainEntry.Pronoun;
    if (term.has('#Adverb') && brainEntry.Adverb) return brainEntry.Adverb;
    
    // 3. FALLBACK & SAFETY CHECKS
    const keys = Object.keys(brainEntry);
    if (keys.length === 1) {
        const onlyPos = keys[0];
        if (onlyPos === 'Verb' && term.has('#Noun')) return null;
        if (onlyPos === 'Noun' && term.has('#Verb')) return null;
        return brainEntry[onlyPos];
    }
    
    return brainEntry[keys[0]];
};

/**
 * Custom Unicode-Aware Casing Engine
 * Forces Inglisce replacements to perfectly match the capitalization of the original 
 * English word, handling custom constructed-language orthography (like þ -> Ћ).
 */
const matchCasing = (originalText, replacementWord) => {
    // Strip punctuation from the original word so we only analyze alphabetical case
    const cleanOriginal = originalText.replace(/[^a-zA-Z]/g, '');
    if (!cleanOriginal) return replacementWord;

    // Custom Inglisce Uppercase Map
    // JavaScript natively turns 'þ' into 'Þ', but Inglisce explicitly uses 'Ћ'
    const toInglisceUpper = (char) => char === 'þ' ? 'Ћ' : char.toUpperCase();

    // 1. Check for ALL CAPS (e.g., "THE" -> "ЋE")
    if (cleanOriginal === cleanOriginal.toUpperCase()) {
        return replacementWord.split('').map(toInglisceUpper).join('');
    }
    
    // 2. Check for Title Case (e.g., "The" -> "Ћe")
    if (/^[A-Z]/.test(cleanOriginal)) {
        return toInglisceUpper(replacementWord.charAt(0)) + replacementWord.slice(1);
    }

    // Default to lowercase
    return replacementWord;
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
    multiWords.forEach(key => {
        const entry = brain[key];
        const fallback = entry.Verb || entry.Copula || entry.Auxiliary || entry.Modal || Object.values(entry)[0];
        
        if (fallback) {
            doc.match(key).forEach(m => {
                // Manually calculate case before replacement
                const casedFallback = matchCasing(m.text(), fallback);
                
                // keepCase is FALSE so the engine doesn't overwrite our custom þ -> Ћ math
                m.replaceWith(casedFallback, { keepTags: true, keepCase: false });
                m.tag('#Translated'); 
            });
        }
    });

    // --- PASS 2: STANDARD WORD PASS ---
    doc.terms().forEach((term) => {
        if (term.has('#Translated')) return;

        const normal = term.text('normal');
        if (!normal) return;

        // Attempt lookup and replacement
        if (brain[normal]) {
            const replacement = getReplacement(term, brain[normal]);
            if (replacement) {
                // Manually calculate case before replacement
                const casedReplacement = matchCasing(term.text(), replacement);
                
                // keepCase is FALSE so the engine doesn't overwrite our custom þ -> Ћ math
                term.replaceWith(casedReplacement, { keepTags: true, keepCase: false });
                term.tag('#Translated');
                return;
            }
        }

        // Auditing: Wrap untranslated words in brackets
        const rawText = term.text();
        if (!rawText.includes('[')) {
            term.replaceWith(`[${rawText}]`, { keepTags: true });
        }
        missingWords.add(normal);
    });

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