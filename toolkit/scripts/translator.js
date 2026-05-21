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
import { fileURLToPath } from 'url';
import nlp from 'compromise';
import { matchCasing } from './utils.js';

// ============================================================================
// 1. HELPER FUNCTIONS
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

// ============================================================================
// 2. TRANSCRIPTION ENGINE (Exported for Testing)
// ============================================================================

export function transcribe(text, brainDictionary) {

    // Armor the entry point: force all incoming text to standard NFC
    text = text.normalize('NFC'); 
    
    const missingWords = new Set();
    const multiWords = Object.keys(brainDictionary).filter(k => k.includes(' ') || k.includes("'"));

    const lines = text.split('\n');

    const transcribedLines = lines.map(line => {
        if (!line.trim()) return line;

        const doc = nlp(line);

        // --- PASS 1: MULTI-WORD INTERCEPTOR ---
        multiWords.forEach(key => {
            const entry = brainDictionary[key];
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

            let rawText = term.text();
            let normal = term.text('normal');
            if (!normal) return;

            // 1. SILENCE GHOST WORDS
            if (rawText.trim() === '') {
                term.tag('#Translated');
                return;
            }

            // 2. SUFFIX PRESERVER
            let suffix = '';
            const wordWithoutPunctuation = rawText.replace(/[^a-zA-Z'’]/g, '');
            const suffixMatch = wordWithoutPunctuation.match(/(['’](s|re|ll|d|ve|m))$/i);
            
            if (suffixMatch) {
                suffix = suffixMatch[1]; 
                
                // CRITICAL FIX: Because compromise.js morphs smart quotes to straight quotes, 
                // regex matching the suffix against `normal` will silently fail.
                // We securely slice the base word from our raw extracted string instead.
                const baseWord = wordWithoutPunctuation.slice(0, -suffix.length);
                normal = baseWord.toLowerCase();
            }

            // Attempt lookup and replacement
            if (brainDictionary[normal]) {
                let replacement = getReplacement(term, brainDictionary[normal]);
                if (replacement) {
                    replacement += suffix; 
                    const casedReplacement = matchCasing(rawText, replacement);
                    term.replaceWith(casedReplacement, { keepTags: true, keepCase: false });
                    term.tag('#Translated');
                    return;
                }
            }

            // Auditing: Wrap untranslated words in brackets, leaving punctuation untouched
            if (!rawText.includes('[')) {
                const bracketedText = rawText.replace(/([a-zA-Z]+(?:['’][a-zA-Z]+)*)/, '[$1]');
                term.replaceWith(bracketedText, { keepTags: true });
            }
            missingWords.add(normal);
        });

        return doc.text();
    });

    // Mute the missing words tracker during Vitest execution to keep the terminal clean
    if (missingWords.size > 0 && process.env.NODE_ENV !== 'test') {
        console.log(`\n⚠️  Missing Words Tracker (${missingWords.size} untranslated words):`);
        console.log(Array.from(missingWords).sort().join(', '));
    }

    return transcribedLines.join('\n');
}

// ============================================================================
// 3. CLI EXECUTION & REPORTING
// ============================================================================

// Only execute the script logic if run directly from the terminal (e.g., node scripts/translator.js)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const inputFile = args[0];
    const outputFile = args[1] || path.join(import.meta.dirname, '..', 'dist', 'test_transcription.txt');

    if (!inputFile || !fs.existsSync(inputFile)) {
        console.error('❌ Error: Missing or invalid input file. Usage: node scripts/translator.js <input.txt> [output.txt]');
        process.exit(1);
    }

    const brainPath = path.join(import.meta.dirname, '..', 'dist', 'translationBrain.json');
    if (!fs.existsSync(brainPath)) {
        console.error('❌ Error: translationBrain.json is missing. Run `node scripts/build-dictionary.js` first.');
        process.exit(1);
    }

    const brain = JSON.parse(fs.readFileSync(brainPath, 'utf8'));
    const text = fs.readFileSync(inputFile, 'utf8');

    console.log(`🤖 Transcribing: ${inputFile}...`);

    const finalOutput = transcribe(text, brain);

    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outputFile, finalOutput, 'utf8');

    console.log(`✅ Transcription complete! Saved to: ${outputFile}`);
}