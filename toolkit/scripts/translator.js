/**
 * ============================================================================
 * INGLISCE TRANSCRIBER (NATIVE ARCHITECTURE)
 * * This script uses a Native Regex Tokenizer to guarantee 100% accurate 
 * preservation of commas, brackets, em-dashes, and exact spacing. 
 * It uses `compromise.js` strictly as a read-only "Oracle" to tag the parts 
 * of speech for homograph disambiguation.
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
    
    if (brainEntry.Pronoun) return brainEntry.Pronoun; 

    return brainEntry[keys[0]];
};

// ============================================================================
// 2. TRANSLATION ENGINE
// ============================================================================

export function transcribe(text, brainDictionary) {
    text = text.normalize('NFC'); 
    
    const missingWords = new Set();
    const multiWords = Object.keys(brainDictionary)
        .filter(k => k.includes(' ') || k.includes("'"))
        .sort((a, b) => b.length - a.length);

    const lines = text.split('\n');

    const transcribedLines = lines.map(line => {
        if (!line.trim()) return line;

        // --- PASS 1: MULTI-WORD INTERCEPTOR ---
        let nativeLine = line;
        const translatedPhrases = {};
        let uuidCounter = 0;

        multiWords.forEach(key => {
            // Replaces exact phrases, securely handling smart-quotes within contractions
            const regex = new RegExp(`\\b${key.replace(/'/g, "['’]")}\\b`, 'gi');
            nativeLine = nativeLine.replace(regex, (match) => {
                const entry = brainDictionary[key];
                const fallback = entry.Verb || entry.Copula || entry.Auxiliary || entry.Modal || Object.values(entry)[0];
                const translated = matchCasing(match, fallback);
                
                const token = `___MW${uuidCounter}___`;
                translatedPhrases[token] = translated;
                uuidCounter++;
                return token;
            });
        });

        // --- PASS 2: THE ORACLE (Tagging) ---
        // Runs cleanly on the line, extracting exact character offsets for grammar matching
        const doc = nlp(nativeLine);
        const termsData = doc.terms().json({ offset: true });

        // --- PASS 3: NATIVE TOKENIZER ---
        // Split natively by word boundaries to perfectly isolate and protect punctuation
        const chunks = nativeLine.split(/([a-zA-Z\u00C0-\u024F0-9_]+(?:['’\-\u2013][a-zA-Z\u00C0-\u024F0-9_]+)*)/);
        
        let charIndex = 0;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (!chunk) continue;

            // Even indices are non-words (punctuation, spaces, brackets, em-dashes)
            if (i % 2 === 0) {
                charIndex += chunk.length;
                continue;
            }

            const originalWord = chunk;
            const wordStart = charIndex;
            const wordEnd = charIndex + originalWord.length;

            // 1. Re-inject Multi-words
            if (translatedPhrases[originalWord]) {
                chunks[i] = translatedPhrases[originalWord];
                charIndex += chunk.length;
                continue;
            }

            // 2. Skip purely numeric strings
            if (/^[0-9]+$/.test(originalWord)) {
                charIndex += chunk.length;
                continue;
            }

            // 3. Query the Oracle using overlapping string positions
            const overlappingTerms = termsData.filter(t => {
                if (!t.offset) return false;
                const tStart = t.offset.start;
                const tEnd = t.offset.start + t.offset.length;
                return Math.max(wordStart, tStart) < Math.min(wordEnd, tEnd);
            });

            const tags = new Set();
            overlappingTerms.forEach(t => {
                if (t.terms) {
                    t.terms.forEach(sub => {
                        if (sub.tags) sub.tags.forEach(tag => tags.add(tag));
                    });
                } else if (t.tags) {
                    t.tags.forEach(tag => tags.add(tag));
                }
            });

            const mockTerm = { has: (tag) => tags.has(tag.replace(/^#/, '')) };

            // 4. Suffix Preserver
            let suffix = '';
            let rootWord = originalWord;
            const suffixMatch = originalWord.match(/(['’](s|re|ll|d|ve|m))$/i);
            
            if (suffixMatch) {
                suffix = suffixMatch[1]; 
                rootWord = originalWord.slice(0, -suffix.length);
            }

            const normalRoot = rootWord.toLowerCase();

            // 5. Dictionary Lookup
            if (brainDictionary[normalRoot]) {
                let replacement = getReplacement(mockTerm, brainDictionary[normalRoot]);
                if (replacement) {
                    replacement += suffix; 
                    chunks[i] = matchCasing(originalWord, replacement);
                    charIndex += chunk.length;
                    continue; 
                }
            }

            // 6. Missing Words Pipeline (Wraps exact word natively, dropping punctuation outside)
            chunks[i] = `[${originalWord}]`;
            missingWords.add(normalRoot);
            charIndex += chunk.length;
        }

        return chunks.join('');
    });

    if (missingWords.size > 0 && process.env.NODE_ENV !== 'test') {
        console.log(`\n⚠️  Missing Words Tracker (${missingWords.size} untranslated words):`);
        console.log(Array.from(missingWords).sort().join(', '));
    }

    return transcribedLines.join('\n');
}

// ============================================================================
// 3. CLI EXECUTION & REPORTING
// ============================================================================

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