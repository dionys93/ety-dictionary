/**
 * ============================================================================
 * INGLISCE LIBRARY TRANSCRIBER
 * * Recursively crawls `/data-text/books`, replicates the exact folder 
 * structure in `/data-text/inglisce/books`, and transcribes every page.
 * Loads the translation brain into memory ONCE for maximum performance.
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import nlp from 'compromise';
import { fileURLToPath } from 'url';

// ============================================================================
// 1. PATH CONFIGURATION
// ============================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const INPUT_DIR = path.join(PROJECT_ROOT, 'data-text', 'books');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data-text', 'inglisce', 'books');
const BRAIN_PATH = path.join(PROJECT_ROOT, 'toolkit', 'dist', 'translationBrain.json');

if (!fs.existsSync(BRAIN_PATH)) {
    console.error('❌ Error: translationBrain.json is missing. Run `node scripts/compileBrain.js` first.');
    process.exit(1);
}

if (!fs.existsSync(INPUT_DIR)) {
    console.error(`❌ Error: Input directory not found at ${INPUT_DIR}`);
    process.exit(1);
}

const brain = JSON.parse(fs.readFileSync(BRAIN_PATH, 'utf8'));
const multiWords = Object.keys(brain).filter(k => k.includes(' ') || k.includes("'"));
const globalMissingWords = new Set();
let filesProcessed = 0; // The only 'let' (Numerical Collection)

// ============================================================================
// 2. HELPER FUNCTIONS
// ============================================================================
const getReplacement = (term, brainEntry) => {
    if (term.has('#Copula') && brainEntry.Copula) return brainEntry.Copula;
    if (term.has('#Auxiliary') && brainEntry.Auxiliary) return brainEntry.Auxiliary;
    if (term.has('#Modal') && brainEntry.Modal) return brainEntry.Modal;
    
    if (term.has('#Verb') && brainEntry.Verb) return brainEntry.Verb;
    if (term.has('#Noun') && brainEntry.Noun) return brainEntry.Noun;
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
// 3. CORE TRANSCRIBER ENGINE
// ============================================================================
function transcribeFile(inputFile, outputFile) {
    const text = fs.readFileSync(inputFile, 'utf8');
    const lines = text.split('\n');

    const transcribedLines = lines.map(line => {
        if (!line.trim()) return line;
        const doc = nlp(line);

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

            const rawText = term.text();
            if (rawText.trim() === '') {
                term.tag('#Translated');
                return;
            }

            const rawNormal = term.text('normal');
            if (!rawNormal) return;

            // Isolate suffix logic using const and ternaries
            const wordWithoutPunctuation = rawText.replace(/[^a-zA-Z'’]/g, '');
            const suffixMatch = wordWithoutPunctuation.match(/(['’](s|re|ll|d|ve|m))$/i);
            const suffix = suffixMatch ? suffixMatch[1] : '';
            
            const normal = suffix 
                ? rawNormal.replace(new RegExp(suffix + '$', 'i'), '') 
                : rawNormal;

            if (brain[normal]) {
                const baseReplacement = getReplacement(term, brain[normal]);
                if (baseReplacement) {
                    const finalReplacement = baseReplacement + suffix; 
                    const casedReplacement = matchCasing(rawText, finalReplacement);
                    term.replaceWith(casedReplacement, { keepTags: true, keepCase: false });
                    term.tag('#Translated');
                    return;
                }
            }

            if (!rawText.includes('[')) {
                const bracketedText = rawText.replace(/([a-zA-Z]+(?:['’][a-zA-Z]+)*)/, '[$1]');
                term.replaceWith(bracketedText, { keepTags: true });
            }
            globalMissingWords.add(normal);
        });

        return doc.text();
    });

    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outputFile, transcribedLines.join('\n'), 'utf8');
    filesProcessed++;
}

// ============================================================================
// 4. RECURSIVE DIRECTORY CRAWLER
// ============================================================================
function crawlAndTranscribe(currentDir) {
    const files = fs.readdirSync(currentDir, { withFileTypes: true });

    files.forEach(file => {
        const fullPath = path.join(currentDir, file.name);

        if (file.isDirectory()) {
            crawlAndTranscribe(fullPath);
        } else if (file.name.endsWith('.txt')) {
            const relativePath = path.relative(INPUT_DIR, fullPath);
            const outputPath = path.join(OUTPUT_DIR, relativePath);
            
            transcribeFile(fullPath, outputPath);
        }
    });
}

// ============================================================================
// 5. EXECUTION & REPORTING
// ============================================================================
console.log(`📚 Compiling Library from: ${INPUT_DIR}`);
console.log(`➡️  Outputting to: ${OUTPUT_DIR}\n`);

crawlAndTranscribe(INPUT_DIR);

console.log(`✅ Library Transcription Complete!`);
console.log(`📄 Total Pages Transcribed: ${filesProcessed}`);

if (globalMissingWords.size > 0) {
    console.log(`\n⚠️  Master Missing Words Tracker (${globalMissingWords.size} unique untranslated words):`);
    console.log(Array.from(globalMissingWords).sort().join(', '));
}