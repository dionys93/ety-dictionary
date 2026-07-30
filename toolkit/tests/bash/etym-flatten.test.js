import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BASH_LIB_PATH = path.resolve(__dirname, '../../etym-lib.sh');
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/dictionary');
const OUTPUT_FILE = path.resolve(__dirname, '../fixtures/flatten-out/master.jsonl');

describe('Bash Extractor: etym-flatten & etym-build-dataset', () => {
    let dataset = [];

    beforeAll(() => {
        if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
        
        const outDir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        // Using etym-build-dataset as it is the new standard under the hood
        const cmd = `bash -c "source ${BASH_LIB_PATH} && etym-build-dataset ${OUTPUT_FILE}"`;
        // Note: You might need to override DICT_DIR in the env to point to your fixtures, 
        // e.g., DICT_DIR=${FIXTURES_DIR} bash -c ...

        execSync(`export DICT_DIR=${FIXTURES_DIR} && ${cmd}`, { stdio: 'pipe' });

        // Read and parse the entire output into an array of objects
        const content = fs.readFileSync(OUTPUT_FILE, 'utf-8').trim().split('\n');
        dataset = content.filter(line => line).map(line => JSON.parse(line));
    });

    it('successfully generates master.jsonl on the hard drive', () => {
        expect(fs.existsSync(OUTPUT_FILE)).toBe(true);
        expect(dataset.length).toBeGreaterThan(0);
    });

    it('strips all [LANG] tags from me_word and inglisce_word', () => {
        dataset.forEach(entry => {
            expect(entry.me_word).not.toMatch(/\[[A-Z]+\]/);
            expect(entry.inglisce_word).not.toMatch(/\[[A-Z]+\]/);
        });
    });

    it('preserves comma-separated POS tags intact', () => {
        // Assuming you have a fixture like 'close' that acts as multiple POS
        // Change 'close' to whatever fixture uses a comma in the POS
        const multiPosWord = dataset.find(r => r.pos.includes(','));
        if (multiPosWord) {
            expect(multiPosWord.pos).toMatch(/^[a-z]+, [a-z]+/i); 
        }
    });

    it('ensures conjugations is ALWAYS a named object (slot keys, explicit pairs, plural/variants, or forms)', () => {
        // Post schema-refactor contract: the parser is the single schema
        // authority and never emits raw arrays. See etym-parse.awk header.
        dataset.forEach(entry => {
            expect(Array.isArray(entry.conjugations)).toBe(false);
            expect(typeof entry.conjugations).toBe('object');

            const c = entry.conjugations;
            const keys = Object.keys(c);
            if (keys.length === 0) return; // legitimately conjugation-less (e.g. prepositions)

            if (c.explicit) {
                // Explicit verbs/modals: english→inglisce pairs ME-zipped by the parser
                expect(Object.keys(c.explicit).length).toBeGreaterThan(0);
            } else if (c.third_singular !== undefined) {
                // Slot verbs (classes 1-5)
                expect(c).toHaveProperty('past');
                expect(c).toHaveProperty('gerund');
            } else {
                // Nouns ({plural[,variants]}) or generic ({forms})
                expect(c.plural !== undefined || Array.isArray(c.forms)).toBe(true);
            }
        });
    });

    it('correctly populates conjugations.present for two-stem verbs', () => {
        // Use Optional Chaining (?.) to safely check that present exists and is truthy
        // This completely avoids the array trap
        const twoStemVerb = dataset.find(r => r.conjugations?.present);
        
        // Assert we actually found the two-stem fixture (e.g. þondre)
        expect(twoStemVerb).toBeDefined(); 
        expect(twoStemVerb.conjugations.present).not.toBe("");
    });

    it('extracts valid URLs into the sources array', () => {
        dataset.forEach(entry => {
            expect(Array.isArray(entry.sources)).toBe(true);
            entry.sources.forEach(src => {
                expect(src).toMatch(/^http/);
            });
        });
    });

    it('never leaves etymology empty and maps forms/langs correctly', () => {
        dataset.forEach(entry => {
            expect(Array.isArray(entry.etymology)).toBe(true);
            expect(entry.etymology.length).toBeGreaterThan(0);
            
            entry.etymology.forEach(etym => {
                expect(etym).toHaveProperty('form');
                expect(etym).toHaveProperty('lang');
            });
        });
    });
});