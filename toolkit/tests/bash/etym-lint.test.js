import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Sandbox Directories
const LINT_DIR = path.resolve(__dirname, '../fixtures/lint-sandbox');
const GOOD_DIR = path.join(LINT_DIR, 'good');
const BAD_DIR = path.join(LINT_DIR, 'bad');
const WARN_DIR = path.join(LINT_DIR, 'warn');

// Helper to run bash and catch exit codes specifically for the Linter
function runLint(targetDir) {
    try {
        const cmd = `bash -c "source /workspaces/ety-dictionary/toolkit/config/env.sh && source /workspaces/ety-dictionary/toolkit/etym-lib.sh && etym-lint ${targetDir}"`;
        const stdout = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
        return { passed: true, output: stdout };
    } catch (err) {
        // execSync throws if the bash script returns an exit code > 0 (which etym-lint does on errors)
        return { passed: false, output: err.stdout ? err.stdout.toString() : err.message };
    }
}

describe('etym-lint (Data Integrity Gatekeeper)', () => {
    
    // Build the sandbox before running the tests
    beforeAll(() => {
        fs.mkdirSync(GOOD_DIR, { recursive: true });
        fs.mkdirSync(BAD_DIR, { recursive: true });
        fs.mkdirSync(WARN_DIR, { recursive: true });

        // --- 1. THE PERFECT FILE ---
        fs.writeFileSync(path.join(GOOD_DIR, 'perfect.txt'), 'perfect [ME]\nperfect (adj)\nhttp://etymonline.com/perfect\n');

        // --- 2. FATAL & ERROR FILES ---
        fs.writeFileSync(path.join(BAD_DIR, 'empty.txt'), ''); // 0 bytes
        fs.writeFileSync(path.join(BAD_DIR, 'no-pos.txt'), 'broken [ME]\nbroken word\nhttp://example.com\n');
        fs.writeFileSync(path.join(BAD_DIR, 'no-lang.txt'), 'broken word\nbroken (adj)\nhttp://example.com\n');

        // --- 3. WARNING FILES ---
        // Note the deliberate space at the end of the first line
        fs.writeFileSync(path.join(WARN_DIR, 'trailing.txt'), 'trailing [ME] \ntrailing (v)\nhttp://example.com\n');

        // Extra orphaned bracket on the first line (but contains a valid [ME] tag so it avoids a fatal error)
        fs.writeFileSync(path.join(WARN_DIR, 'unclosed.txt'), 'unclosed [ME] [\nunclosed (v)\nhttp://example.com\n');
    });

    // Demolish the sandbox after tests finish so it doesn't clutter your repo
    afterAll(() => {
        if (fs.existsSync(LINT_DIR)) {
            fs.rmSync(LINT_DIR, { recursive: true, force: true });
        }
    });

    it('passes flawlessly on perfectly formatted files', () => {
        const { passed, output } = runLint(GOOD_DIR);
        
        expect(passed).toBe(true);
        expect(output).toContain('Fatal Errors:'); // Ensures the summary table printed
        expect(output).not.toContain('[FATAL]');
        expect(output).not.toContain('[ERROR]');
    });

    it('returns a fatal exit code and catches missing tags/empty files', () => {
        const { passed, output } = runLint(BAD_DIR);
        
        // Assert the script threw an exit code > 0
        expect(passed).toBe(false); 
        
        // Assert it caught the exact correct errors
        expect(output).toContain('[FATAL]\x1b[0m File is completely empty.');
        expect(output).toContain('[ERROR]\x1b[0m Missing or malformed Part of Speech tag');
        expect(output).toContain('[ERROR]\x1b[0m Missing or malformed Language Origin tag');
    });

    it('logs warnings for formatting issues but does NOT trigger a fatal crash', () => {
        // Rewrite the unclosed file to use a dangling parenthesis instead of a bracket
        fs.writeFileSync(path.join(WARN_DIR, 'unclosed.txt'), 'unclosed [ME]\nunclosed (v) (\nhttp://example.com\n');

        const { passed, output } = runLint(WARN_DIR);
        
        // If the gatekeeper crashes, print its exact complaint to the terminal so we can read it
        if (!passed) {
            console.log("🔥 GATEKEEPER COMPLAINT:\n", output);
        }
        
        // Assert no errors snuck in
        expect(output).not.toContain('[FATAL]');
        expect(output).not.toContain('[ERROR]');

        // Warnings shouldn't stop the pipeline, so the exit code should remain 0
        expect(passed).toBe(true);
        
        // Assert it caught the sneaky formatting mistakes
        expect(output).toContain('[WARN]\x1b[0m  Line(s) contain trailing whitespace.');
        expect(output).toContain('[WARN]\x1b[0m  Potentially unclosed or orphaned parentheses.');
    });
    
});