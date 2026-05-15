import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURE_DIR = path.resolve(import.meta.dirname, './fixtures/dictionary');
const OUTPUT_FILE = path.resolve(import.meta.dirname, '../dist/test_master_dataset.jsonl');
const SCRIPT_PATH = path.resolve(import.meta.dirname, '../etym-lib.sh');

describe('Bash Extractor: etym-flatten', () => {
    
    beforeAll(() => {
        // Clean up previous test runs
        if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
    });

    it('successfully generates a JSONL file from the fixture directory', () => {
        // We use absolute paths so the command executes flawlessly regardless of your terminal's working directory
        const cmd = `bash -c "source ${SCRIPT_PATH} && etym-flatten ${FIXTURE_DIR} --jsonl -o ${OUTPUT_FILE}"`;
        
        execSync(cmd, { stdio: 'pipe' });

        expect(fs.existsSync(OUTPUT_FILE)).toBe(true);
        
        const lines = fs.readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(Boolean);
        expect(lines.length).toBeGreaterThan(0); 
        
        const data = JSON.parse(lines[0]);
        expect(data).toHaveProperty('me_word');
        expect(data).toHaveProperty('inglisce_word');
        expect(data.pos).not.toContain('('); 
    });
});
