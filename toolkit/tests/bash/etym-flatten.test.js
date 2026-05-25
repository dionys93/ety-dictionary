import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Adjust these paths depending on where etym-lib.sh is relative to this test file
const BASH_LIB_PATH = path.resolve(__dirname, '../../etym-lib.sh');
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/dictionary');
const OUTPUT_FILE = path.resolve(__dirname, '../fixtures/flatten-out/master.jsonl');

describe('Bash Extractor: etym-flatten', () => {

    beforeAll(() => {
        // 1. Wipe the old artifact to ensure we are testing a fresh extraction
        if (fs.existsSync(OUTPUT_FILE)) {
            fs.unlinkSync(OUTPUT_FILE);
        }

        // 2. Ensure the output directory exists
        const outDir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        // 3. Execute the Bash script synchronously
        // We source the library, then run etym-flatten targeting the fixtures
        const cmd = `bash -c "source ${BASH_LIB_PATH} && etym-flatten ${FIXTURES_DIR} --jsonl -o ${OUTPUT_FILE}"`;

        try {
            execSync(cmd, { stdio: 'pipe' });
        } catch (error) {
            console.error("Bash Execution Failed:\n", error.stderr.toString());
            throw error;
        }
    });

    it('successfully generates master.jsonl on the hard drive', () => {
        expect(fs.existsSync(OUTPUT_FILE)).toBe(true);
    });

    it('extracts valid JSON objects with the required data schema', () => {
        const content = fs.readFileSync(OUTPUT_FILE, 'utf-8').trim().split('\n');
        expect(content.length).toBeGreaterThan(0);

        const firstRow = JSON.parse(content[0]);

        expect(firstRow).toHaveProperty('me_word');
        expect(firstRow).toHaveProperty('inglisce_word');
        expect(firstRow).toHaveProperty('pos');

        // conjugations is an object for verbs, array for everything else
        const conj = firstRow.conjugations;
        const isValidShape = Array.isArray(conj) || (typeof conj === 'object' && conj !== null);
        expect(isValidShape).toBe(true);

        // If it's a verb conjugation object, assert the named slots are present
        if (!Array.isArray(conj)) {
            expect(conj).toHaveProperty('third_singular');
            expect(conj).toHaveProperty('past');
            expect(conj).toHaveProperty('gerund');
        }
    });
});