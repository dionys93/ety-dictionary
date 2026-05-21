/**
 * ============================================================================
 * INGLISCE TRANSCRIBER (BRUTE-FORCE / HARDCODED BYPASS)
 * * All NLP tools have been removed to guarantee punctuation integrity.
 * * Uses a simple Regex tokenization and direct dictionary lookups.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// 1. HARDCODED OVERRIDES (The Escape Hatch)
// ============================================================================
// If a word is destroying your pipeline, add it here. 
// It will bypass the dictionary entirely.
const HARDCODED_OVERRIDES = {
    "I'll": "I’ll",
    "I've": "I've",
    "I'd": "I'd",
    "we've": "uie've",
    "we'd": "uie'd",
    "We've": "Uie've",
    "We'd": "Uie'd",
    "You've": "You've",
    "You'd": "You'd",
    "you've": "you've",
    "you'd": "you'd",
    "it's": "it's",
    "It's": "It's",
    "it'd": "it'd",
    "It'd": "It'd",
    "she's": "sie's",
    "She's": "Sie's",
    "she'd": "sie'd",
    "She'd": "Sie'd",
    "he's": "hie’s",
    "he’d": "hie’d",
    "He's": "Hie’s",
    "He’d": "Hie’d",
    "They've": "Ћey've",
    "They'd": "Ћey'd",
    "they've": "þey've",
    "they'd": "þey'd"
};

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================

const matchCasing = (original, replacement) => {
    if (!original || !replacement) return replacement;
    if (original === original.toUpperCase() && original.length > 1) {
        return replacement.toUpperCase();
    }
    if (original[0] === original[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement.toLowerCase();
};

// ============================================================================
// 3. TRANSLATION ENGINE
// ============================================================================

export function transcribe(text, brainDictionary) {
    text = text.normalize('NFC'); 
    const missingWords = new Set();

    const lines = text.split('\n');

    const transcribedLines = lines.map(line => {
        if (!line.trim()) return line;

        // 1. Apply Hardcoded Overrides First
        let processedLine = line;
        Object.keys(HARDCODED_OVERRIDES).forEach(key => {
            // Replace exact matches, preserving surrounding punctuation boundaries
            const regex = new RegExp(`\\b${key.replace(/['’]/g, "['’]")}\\b`, 'gi');
            processedLine = processedLine.replace(regex, (match) => {
                return matchCasing(match, HARDCODED_OVERRIDES[key]);
            });
        });

        // 2. Dumb Tokenizer (Mathematically isolates words from punctuation)
        const chunks = processedLine.split(/([a-zA-Z\u00C0-\u024F]+(?:['’][a-zA-Z\u00C0-\u024F]+)*)/);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (!chunk) continue;

            // Even indices are strictly non-words (commas, em-dashes, spaces, brackets). Skip them.
            if (i % 2 === 0) continue;

            const originalWord = chunk;
            const lowerWord = originalWord.toLowerCase();

            // If it was already hardcoded, skip it
            if (Object.values(HARDCODED_OVERRIDES).map(v => v.toLowerCase()).includes(lowerWord)) {
                continue;
            }

            // 3. Brute-Force Suffix Stripper
            let suffix = '';
            let rootWord = lowerWord;
            const suffixMatch = lowerWord.match(/(['’](s|re|ll|d|ve|m))$/);
            
            if (suffixMatch) {
                suffix = suffixMatch[1]; 
                rootWord = lowerWord.slice(0, -suffix.length);
            }

            // 4. Dictionary Lookup
            const entry = brainDictionary[rootWord];
            if (entry) {
                // Grab the first available part of speech blindly
                let replacement = entry.Verb || entry.Noun || entry.Pronoun || Object.values(entry)[0];
                
                if (replacement) {
                    replacement += suffix; 
                    chunks[i] = matchCasing(originalWord, replacement);
                    continue; 
                }
            }

            // 5. Missing Words Tracker
            chunks[i] = `[${originalWord}]`;
            missingWords.add(rootWord);
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
// 4. CLI EXECUTION & REPORTING
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