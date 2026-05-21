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

    // Normalize curly apostrophes to straight so brain keys always match
    text = text.replace(/[\u2018\u2019]/g, "'");

    const lines = text.split('\n');

    const transcribedLines = lines.map(line => {
        if (!line.trim()) return line;

        // 1. Apply hardcoded overrides using placeholders to prevent double-processing
        const placeholders = {};
        let placeholderIndex = 0;
        let processedLine = line;

        Object.keys(HARDCODED_OVERRIDES).forEach(key => {
            const regex = new RegExp(`(?<![a-zA-Z])${key.replace(/['']/g, "[''']")}(?![a-zA-Z])`, 'g');
            processedLine = processedLine.replace(regex, (match) => {
                const placeholder = `\x00PLACEHOLDER${placeholderIndex++}\x00`;
                placeholders[placeholder] = matchCasing(match, HARDCODED_OVERRIDES[key]);
                return placeholder;
            });
        });

        // 2. Tokenize and translate
        const chunks = processedLine.split(/([a-zA-Z\u00C0-\u024F]+(?:[''][a-zA-Z\u00C0-\u024F]+)*)/);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (!chunk || i % 2 === 0) continue;

            const originalWord = chunk;
            const lowerWord = originalWord.toLowerCase();

            // 3. Suffix stripper — now includes n't
            let suffix = '';
            let rootWord = lowerWord;

            const negMatch = lowerWord.match(/n['']t$/);
            if (negMatch) {
                suffix = negMatch[0];
                rootWord = lowerWord.slice(0, -suffix.length);
                // 'won't' -> root is 'wo', map back to 'will'
                if (rootWord === 'wo') rootWord = 'will';
                if (rootWord === 'ca') rootWord = 'can';
            } else {
                const suffixMatch = lowerWord.match(/(['](s|re|ll|d|ve|m))$/);
                if (suffixMatch) {
                    suffix = suffixMatch[1];
                    rootWord = lowerWord.slice(0, -suffix.length);
                }
            }

            // 4. Dictionary lookup
            const entry = brainDictionary[rootWord];
            if (entry) {
                let replacement = entry.Verb || entry.Copula || entry.Modal || 
                                  entry.Auxiliary || entry.Noun || entry.Pronoun || 
                                  Object.values(entry)[0];
                if (replacement) {
                    // For n't, use the negated form from the brain if it exists
                    if (negMatch && brainDictionary[rootWord + "n't"]) {
                        const negEntry = brainDictionary[rootWord + "n't"];
                        replacement = negEntry.Modal || negEntry.Verb || 
                                      negEntry.Copula || Object.values(negEntry)[0];
                        suffix = ''; // negated form already includes the negation
                    } else {
                        replacement += suffix;
                    }
                    chunks[i] = matchCasing(originalWord, replacement);
                    continue;
                }
            }

            chunks[i] = `[${originalWord}]`;
            missingWords.add(rootWord);
        }

        // 5. Restore placeholders
        let result = chunks.join('');
        Object.keys(placeholders).forEach(placeholder => {
            result = result.replace(placeholder, placeholders[placeholder]);
        });
        return result;
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