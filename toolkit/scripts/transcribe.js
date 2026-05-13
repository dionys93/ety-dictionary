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

const brain = JSON.parse(fs.readFileSync(brainPath, 'utf8'));
const text = fs.readFileSync(inputFile, 'utf8');

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

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

const matchCasing = (originalText, replacementWord) => {
    const cleanOriginal = originalText.replace(/[^a-zA-Z]/g, '');
    if (!cleanOriginal) return replacementWord;

    const toInglisceUpper = (char) => char === 'þ' ? 'Ћ' : char.toUpperCase();

    if (cleanOriginal === cleanOriginal.toUpperCase()) {
        return replacementWord.split('').map(toInglisceUpper).join('');
    }
    
    if (/^[A-Z]/.test(cleanOriginal)) {
        return toInglisceUpper(replacementWord.charAt(0)) + replacementWord.slice(1);
    }

    return replacementWord;
};

// ============================================================================
// 3. TRANSCRIPTION ENGINE
// ============================================================================

console.log(`🤖 Transcribing: ${inputFile}...`);

const missingWords = new Set();
const multiWords = Object.keys(brain).filter(k => k.includes(' ') || k.includes("'"));

const lines = text.split('\n');

const transcribedLines = lines.map(line => {
    if (!line.trim()) return line;

    // --- PASS 0: PRONOUN CONTRACTION EXPANDER ---
    // Safely expands pronoun contractions BEFORE the NLP engine parses them.
    // This prevents the engine from duplicating implicit token outputs.
    let cleanLine = line
        .replace(/\b([Yy]ou|[Ww]e|[Tt]hey)['’]re\b/g, "$1 are")
        .replace(/\b([Ii])['’]m\b/g, "$1 am")
        .replace(/\b([Ii]|[Yy]ou|[Hh]e|[Ss]he|[Ii]t|[Ww]e|[Tt]hey)['’]ll\b/g, "$1 will")
        .replace(/\b([Ii]|[Yy]ou|[Hh]e|[Ss]he|[Ii]t|[Ww]e|[Tt]hey)['’]d\b/g, "$1 would")
        .replace(/\b([Ii]|[Yy]ou|[Ww]e|[Tt]hey)['’]ve\b/g, "$1 have")
        .replace(/\b([Hh]e|[Ss]he|[Ii]t|[Tt]hat|[Tt]here|[Ww]ho|[Ww]hat|[Ww]here)['’]s\b/g, "$1 is");

    const doc = nlp(cleanLine);

    // --- PASS 1: MULTI-WORD INTERCEPTOR ---
    multiWords.forEach(key => {
        const entry = brain[key];
        const fallback = entry.Verb || entry.Copula || entry.Auxiliary || entry.Modal || Object.values(entry)[0];
        
        if (fallback) {
            doc.match(key).forEach(m => {
                const casedFallback = matchCasing(m.text(), fallback);
                m.replaceWith(casedFallback, { keepTags: true, keepCase: false });
                m.tag('#Translated'); 
            });
        }
    });

    // --- PASS 2: STANDARD WORD PASS ---
    doc.terms().forEach((term) => {
        if (term.has('#Translated')) return;

        let normal = term.text('normal');
        if (!normal) return;

        // --- POSSESSIVE SPLITTER ---
        let isPossessive = false;
        let possessiveSuffix = '';
        
        if (term.has('#Possessive')) {
            isPossessive = true;
            const raw = term.text();
            
            // Isolate the suffix and safely strip it from the lookup word
            if (raw.endsWith("'s") || raw.endsWith("’s")) {
                possessiveSuffix = "'s";
                normal = normal.replace(/['’]s$/, ''); 
            } else if (raw.endsWith("'") || raw.endsWith("’")) {
                possessiveSuffix = "'";
                normal = normal.replace(/['’]$/, ''); 
            }
        }

        // Attempt lookup and replacement
        if (brain[normal]) {
            let replacement = getReplacement(term, brain[normal]);
            if (replacement) {
                // Reattach the Inglisce possessive marker if needed
                if (isPossessive) {
                    replacement += possessiveSuffix; 
                }
                
                const casedReplacement = matchCasing(term.text(), replacement);
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
        
        // Add the clean root word to the tracker (e.g. "dog" instead of "dog's")
        missingWords.add(normal);
    });

    return doc.text();
});

// ============================================================================
// 4. OUTPUT & REPORTING
// ============================================================================

const outDir = path.dirname(outputFile);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputFile, transcribedLines.join('\n'), 'utf8');

console.log(`✅ Transcription complete! Saved to: ${outputFile}`);

if (missingWords.size > 0) {
    console.log(`\n⚠️  Missing Words Tracker (${missingWords.size} untranslated words):`);
    console.log(Array.from(missingWords).sort().join(', '));
}