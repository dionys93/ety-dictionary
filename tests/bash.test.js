import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURE_DIR = path.resolve(import.meta.dirname, './fixtures/dictionary');
const OUTPUT_FILE = path.resolve(import.meta.dirname, '../toolkit/dist/test_master_dataset.jsonl');

describe('Bash Extractor: etym-flatten', () => {
    
    beforeAll(() => {
        // Clean up previous test runs
        if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
    });

    it('successfully generates a JSONL file from the fixture directory', () => {
        // 1. Execute the bash script via Node
        // We source the library, then run etym-flatten pointing at our tiny Sandbox
        const cmd = `bash -c "source toolkit/etym-lib.sh && etym-flatten ${FIXTURE_DIR} --jsonl -o ${OUTPUT_FILE}"`;
        
        execSync(cmd, { stdio: 'pipe' });

        // 2. Assert the file was created
        expect(fs.existsSync(OUTPUT_FILE)).toBe(true);
        
        // 3. Assert the contents
        const lines = fs.readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(Boolean);
        expect(lines.length).toBe(5); // We expect exactly 5 words from our fixture
        
        // 4. Assert data integrity (no Bash bleeding)
        const data = JSON.parse(lines[0]);
        expect(data).toHaveProperty('me_word');
        expect(data).toHaveProperty('inglisce_word');
        expect(data.pos).not.toContain('('); // Ensure POS brackets were stripped
    });
});
