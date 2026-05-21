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
import { resolveForm, matchCasing } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

const INPUT_DIR = path.join(PROJECT_ROOT, 'data-text', 'books');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data-text', 'inglisce', 'books');
const BRAIN_PATH = path.join(PROJECT_ROOT, 'toolkit', 'dist', 'translationBrain.json');

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
let filesProcessed = 0; // Numerical Collection

const getReplacement = (term, brainEntry) => {
    // 1. Core Verbs
    if (term.has('#Copula') && brainEntry.Copula) return brainEntry.Copula;
    if (term.has('#Auxiliary') && brainEntry.Auxiliary) return brainEntry.Auxiliary;
    if (term.has('#Modal') && brainEntry.Modal) return brainEntry.Modal;
    
    // 2. Strict Homograph Checks
    if (term.has('#Verb') && brainEntry.Verb) return brainEntry.Verb;
    if (term.has('#Noun') && brainEntry.Noun) return brainEntry.Noun;
    if (term.has('#Adjective') && brainEntry.Adjective) return brainEntry.Adjective;
    if (term.has('#Determiner') && brainEntry.Determiner) return brainEntry.Determiner;
    if (term.has('#Value') && brainEntry.Value) return brainEntry.Value;
    
    // 3. Structural Bypass (Ignores NLP homograph checks)
    if (brainEntry.Preposition) return brainEntry.Preposition;
    if (brainEntry.Conjunction) return brainEntry.Conjunction;
    if (brainEntry.Pronoun) return brainEntry.Pronoun;
    if (brainEntry.Adverb) return brainEntry.Adverb;
    
    // 4. Safe Single-Map Fallback
    const keys = Object.keys(brainEntry);
    if (keys.length === 1) {
        const onlyPos = keys[0];
        if (onlyPos === 'Verb' && term.has('#Noun')) return null;
        if (onlyPos === 'Noun' && term.has('#Verb')) return null;
        return brainEntry[onlyPos];
    }
    return brainEntry[keys[0]];
};

function transcribeFile(inputFile, outputFile) {
    const text = fs.readFileSync(inputFile, 'utf8');

    // Normalize curly apostrophes globally so brain keys always match
    const normalizedText = text.replace(/[\u2018\u2019\u02BC]/g, "'");
    const lines = normalizedText.split('\n');

    const transcribedLines = lines.map(line => {
        if (!line.trim()) return line;

        // --- PASS 1: Protect hardcoded contractions with placeholders ---
        const placeholders = {};
        let phIndex = 0;
        let processedLine = line;

        Object.keys(HARDCODED_OVERRIDES).forEach(key => {
            const escaped = key.replace(/['']/g, "[''']");
            const regex = new RegExp(`(?<![a-zA-Z\u00C0-\u024F])${escaped}(?![a-zA-Z\u00C0-\u024F])`, 'g');
            processedLine = processedLine.replace(regex, (match) => {
                const ph = `XXPH${phIndex++}XX`;
                placeholders[ph] = matchCasing(match, HARDCODED_OVERRIDES[key]);
                return ph;
            });
        });

        const doc = nlp(processedLine);

        doc.terms().forEach(t => {
            if (t.text().trim() === '') t.tag('#GhostWord');
        });

        // --- PASS 2: Multi-word phrases ---
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

        // --- PASS 3: Term loop with contraction lookahead ---
        doc.terms().forEach((term, i) => {
            if (term.has('#Translated')) return;

            if (term.has('#GhostWord')) {
                term.replaceWith('');
                term.tag('#Translated');
                return;
            }

            const rawText = term.text();
            const rawNormal = term.text('normal');
            if (!rawNormal) return;

            // Skip placeholder tokens so they survive untouched to Pass 4
            if (/^XXPH\d+XX$/.test(rawText)) {
                term.tag('#Translated');
                return;
            }

            // These are compromise-split contraction suffixes ("n't", "'s", "'re" etc.).
            // Tag them as translated so they pass through untouched and naturally
            // concatenate with the preceding translated word in doc.text() output.
            if (/^(n['']t|[''][srelldvem])$/i.test(rawNormal)) {
                term.tag('#Translated');
                return;
            }

            // Check if the next term is "n't" — if so, look up the negated brain form
            const nextTerm = doc.terms().eq(i + 1);
            const nextIsNegation = nextTerm && /^n['']t$/i.test(nextTerm.text('normal'));

            if (nextIsNegation) {
                const negKey = rawNormal + "n't";
                if (brain[negKey]) {
                    const negEntry = brain[negKey];
                    const replacement = negEntry.Modal || negEntry.Verb ||
                        negEntry.Copula || negEntry.Auxiliary ||
                        Object.values(negEntry)[0];
                    if (replacement) {
                        term.replaceWith(matchCasing(rawText, replacement), { keepTags: true, keepCase: false });
                        term.tag('#Translated');
                        nextTerm.tag('#Translated');
                        return;
                    }
                }
                // No negated brain form — fall through to normal lookup.
                // The n't term will be tagged #Translated on its own pass above.
            }

            // Normal lookup
            const wordWithoutPunctuation = rawText.replace(/[^a-zA-Z'']/g, '');
            const suffixMatch = wordWithoutPunctuation.match(/([''](s|re|ll|d|ve|m))$/i);
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
                const bracketedText = rawText.replace(/([a-zA-Z]+(?:[''][a-zA-Z]+)*)/, '[$1]');
                term.replaceWith(bracketedText, { keepTags: true, keepCase: false });
            }
            globalMissingWords.add(normal);
        });

        // --- PASS 4: Restore placeholders ---
        let result = doc.text();
        Object.keys(placeholders).forEach(ph => {
            result = result.replace(ph, placeholders[ph]);
        });
        return result;
    });

    const outDir = path.dirname(outputFile);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outputFile, transcribedLines.join('\n'), 'utf8');
    filesProcessed++;
}

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

console.log(`📚 Compiling Library from: ${INPUT_DIR}`);
console.log(`➡️  Outputting to: ${OUTPUT_DIR}\n`);

crawlAndTranscribe(INPUT_DIR);

console.log(`✅ Library Transcription Complete!`);
console.log(`📄 Total Pages Transcribed: ${filesProcessed}`);

if (globalMissingWords.size > 0) {
    console.log(`\n⚠️  Master Missing Words Tracker (${globalMissingWords.size} unique untranslated words):`);
    console.log(Array.from(globalMissingWords).sort().join(', '));
}