import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { transcribeFromAST } from '../../scripts/transcriber.js';
import { buildBrain } from '../../scripts/build-dictionary.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

        const fileContent = fs.readFileSync(JSONL_PATH, 'utf-8').trim();
        const dataset = fileContent.split('\n').filter(Boolean).map(line => JSON.parse(line));
        const { brain } = buildBrain(dataset);
        return Object.freeze(brain);
    };

    const liveBrain = loadRealBrain();

    // Helper to mock spaCy's AST token output
    const makeToken = (text, lemma, pos, tag, whitespace = ' ') => ({
        text, lemma, pos, tag, whitespace, is_ent: false
    });

    // --- RULE 1: PROGRESSIVE PARTICIPLES ---
    it('forms progressive participles by dropping the final "-e" and adding "-ing"', () => {
        const ast = [
            makeToken('They', 'they', 'PRON', 'PRP'),
            makeToken('are', 'be', 'AUX', 'VBP'),
            makeToken('circling', 'circle', 'VERB', 'VBG'),
            makeToken('the', 'the', 'DET', 'DT'),
            makeToken('drain', 'drain', 'NOUN', 'NN', ''),
            makeToken('.', '.', 'PUNCT', '.', '')
        ];
        
        const { text: result } = transcribeFromAST(ast, liveBrain);

        expect(result).toContain('circling');
        expect(result).not.toContain('circleing');
    });

    // --- RULE 2: ETYMOLOGICAL TRANSPARENCY ---
    it('preserves structural Latinizations despite phonetic softening', () => {
        const ast = [
            makeToken('I', 'I', 'PRON', 'PRP'),
            makeToken('have', 'have', 'VERB', 'VBP'),
            makeToken('the', 'the', 'DET', 'DT'),
            makeToken('receipts', 'receipt', 'NOUN', 'NNS', ''),
            makeToken('.', '.', 'PUNCT', '.', '')
        ];
        
        const { text: result } = transcribeFromAST(ast, liveBrain);
        expect(result).toContain('recípts'.normalize('NFC'));
    });

    // --- RULE 3: NLP CONTEXTUAL DISAMBIGUATION ---
    it('correctly maps the Emphatic "Do" vs Main Verb "Do"', () => {
        const ast = [
            makeToken('She', 'she', 'PRON', 'PRP'),
            makeToken('does', 'do', 'AUX', 'VBZ'),
            makeToken('do', 'do', 'VERB', 'VB'),
            makeToken('yoga', 'yoga', 'NOUN', 'NN', ''),
            makeToken('.', '.', 'PUNCT', '.', '')
        ];
        
        const { text: result } = transcribeFromAST(ast, liveBrain);

        // Auxiliary 'does' -> 'dus', Main Verb 'do' -> 'dou'
        expect(result).toContain('dus');
        expect(result).toContain('dou');

        const dusIndex = result.indexOf('dus');
        const douIndex = result.indexOf('dou');
        expect(dusIndex).toBeLessThan(douIndex);
    });

    // --- RULE 4: PRE-CLUSTER SHORTENING & ORTHOGRAPHIC COLLAPSE ---
    it('applies verb mutations using Orthographic Collapse rules', () => {
        const ast = [
            makeToken('I', 'I', 'PRON', 'PRP'),
            makeToken('write', 'write', 'VERB', 'VBP'),
            makeToken('the', 'the', 'DET', 'DT'),
            makeToken('code', 'code', 'NOUN', 'NN', ''),
            makeToken(',', ',', 'PUNCT', ',', ' '),
            makeToken('I', 'I', 'PRON', 'PRP'),
            makeToken('wrote', 'write', 'VERB', 'VBD'),
            makeToken('the', 'the', 'DET', 'DT'),
            makeToken('code', 'code', 'NOUN', 'NN', ''),
            makeToken('.', '.', 'PUNCT', '.', '')
        ];

        const { text: result } = transcribeFromAST(ast, liveBrain);

        expect(result).toContain('r̃aite');
        expect(result).toContain('r̃oat');
    });

    it('shows distinction between third-person conjugation and noun plurals', () => {
        const ast1 = [
            makeToken('She', 'she', 'PRON', 'PRP'),
            makeToken('makes', 'make', 'VERB', 'VBZ'),
            makeToken('the', 'the', 'DET', 'DT'),
            makeToken('cakes', 'cake', 'NOUN', 'NNS', '')
        ];
        const ast2 = [
            makeToken('She', 'she', 'PRON', 'PRP'),
            makeToken('made', 'make', 'VERB', 'VBD'),
            makeToken('the', 'the', 'DET', 'DT'),
            makeToken('cake', 'cake', 'NOUN', 'NN', '')
        ];
        const ast3 = [
            makeToken('She', 'she', 'PRON', 'PRP'),
            makeToken('circles', 'circle', 'VERB', 'VBZ'),
            makeToken('the', 'the', 'DET', 'DT'),
            makeToken('circles', 'circle', 'NOUN', 'NNS', '')
        ];
        
        const { text: result1 } = transcribeFromAST(ast1, liveBrain);
        const { text: result2 } = transcribeFromAST(ast2, liveBrain);
        const { text: result3 } = transcribeFromAST(ast3, liveBrain);

        expect(result1).toContain('Sie mâcs þe caix'.normalize('NFC'));
        expect(result2).toContain('Sie mâde þe câc'.normalize('NFC'));
        expect(result3).toContain('Sie circles þe circuls'.normalize('NFC'));
    });
});