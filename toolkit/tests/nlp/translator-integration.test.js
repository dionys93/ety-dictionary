import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { transcribe } from '../../scripts/translator.js';
import { buildBrain } from '../../scripts/build-dictionary.js';

const JSONL_PATH = path.resolve(__dirname, '../fixtures/flatten-out/master.jsonl');

describe('Node Transcriber: NLP Engine', () => {
    it.todo('accurately distinguishes homographs based on sentence context');
    it.todo('safely wraps untranslated words in brackets while ignoring punctuation');
    it.todo('destroys ghost words created by split contractions');
});

describe('Inglisce Transcription Engine', () => {

    const loadRealBrain = () => {
        if (!fs.existsSync(JSONL_PATH)) {
            throw new Error(`CRITICAL: master.jsonl not found at ${JSONL_PATH}. Run etym-flatten tests to generate the test data first.`);
        }

        // 1. Read the real, raw flattened output from the filesystem
        const fileContent = fs.readFileSync(JSONL_PATH, 'utf-8').trim();
        const dataset = fileContent.split('\n').filter(Boolean).map(line => JSON.parse(line));

        // 2. Compile the real brain dynamically exactly as it happens in production
        const { brain } = buildBrain(dataset);
        return Object.freeze(brain);
    };

    // Compiles the brain synchronously one time for the whole suite
    const liveBrain = loadRealBrain();

    // --- RULE 1: PROGRESSIVE PARTICIPLES ---
    it('forms progressive participles by dropping the final "-e" and adding "-ing"', () => {
        const text = "They are circling the drain.";
        const result = transcribe(text, liveBrain);

        expect(result).toContain('circling');
        expect(result).not.toContain('circleing');
    });

    // --- RULE 2: ETYMOLOGICAL TRANSPARENCY ---
    it('preserves structural Latinizations despite phonetic softening', () => {
        const text = "I have the receipts.";
        const result = transcribe(text, liveBrain);

        expect(result).toContain('recípts'.normalize('NFC'));
    });

    // --- RULE 3: NLP CONTEXTUAL DISAMBIGUATION ---
    it('correctly maps the Emphatic "Do" vs Main Verb "Do"', () => {
        const text = "She does do yoga.";
        const result = transcribe(text, liveBrain);
        console.log({ result })

        // Auxiliary 'does' -> 'dus', Main Verb 'do' -> 'dou'
        expect(result).toContain('dus');
        expect(result).toContain('dou');

        // Ensure they were parsed in the correct grammatical order
        const dusIndex = result.indexOf('dus');
        const douIndex = result.indexOf('dou');
        expect(dusIndex).toBeLessThan(douIndex);
    });

    // --- RULE 4: PRE-CLUSTER SHORTENING & ORTHOGRAPHIC COLLAPSE ---
    it('applies verb mutations using Orthographic Collapse rules', () => {
        const text = "I write the code, I wrote the code.";
        const result = transcribe(text, liveBrain);

        expect(result).toContain('r̃aite');
        expect(result).toContain('r̃oat');
    });

    it('shows distinction between third-person conjugation and noun plurals', () => {
        const text1 = "She makes the cakes";
        const text2 = "She made the cake";
        const text3 = "She circles the circles"
        
        const result1 = transcribe(text1, liveBrain);
        const result2 = transcribe(text2, liveBrain);
        const result3 = transcribe(text3, liveBrain);

        expect(result1).toContain('Sie mâcs þe caix'.normalize('NFC'));
        expect(result2).toContain('Sie mâde þe câc'.normalize('NFC'));
        expect(result3).toContain('Sie circles þe circuls'.normalize('NFC'));
    });
});