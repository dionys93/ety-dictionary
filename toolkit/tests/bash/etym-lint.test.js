import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const LINT_DIR = path.resolve(__dirname, '../fixtures/lint-sandbox');
const GOOD_DIR = path.join(LINT_DIR, 'good');
const BAD_DIR  = path.join(LINT_DIR, 'bad');
const WARN_DIR = path.join(LINT_DIR, 'warn');

function runLint(targetDir) {
    try {
        const cmd = `bash -c "source /workspaces/ety-dictionary/toolkit/config/env.sh && source /workspaces/ety-dictionary/toolkit/etym-lib.sh && etym-lint ${targetDir}"`;
        const stdout = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
        return { passed: true, output: stdout };
    } catch (err) {
        return { passed: false, output: err.stdout ? err.stdout.toString() : err.message };
    }
}

describe('etym-lint (Data Integrity Gatekeeper)', () => {

    beforeAll(() => {
        fs.mkdirSync(GOOD_DIR, { recursive: true });
        fs.mkdirSync(BAD_DIR,  { recursive: true });
        fs.mkdirSync(WARN_DIR, { recursive: true });

        fs.writeFileSync(path.join(GOOD_DIR, 'perfect.txt'),
            'perfect [ME]\nperfect (adj)\nhttp://etymonline.com/perfect\n');

        fs.writeFileSync(path.join(BAD_DIR, 'empty.txt'), '');
        fs.writeFileSync(path.join(BAD_DIR, 'no-pos.txt'),
            'broken [ME]\nbroken word\nhttp://example.com\n');
        fs.writeFileSync(path.join(BAD_DIR, 'no-lang.txt'),
            'broken word\nbroken (adj)\nhttp://example.com\n');

        fs.writeFileSync(path.join(WARN_DIR, 'trailing.txt'),
            'trailing [ME] \ntrailing (v)\nhttp://example.com\n');
    });

    afterAll(() => {
        if (fs.existsSync(LINT_DIR)) {
            fs.rmSync(LINT_DIR, { recursive: true, force: true });
        }
    });

    it('passes flawlessly on perfectly formatted files', () => {
        const { passed, output } = runLint(GOOD_DIR);

        expect(passed).toBe(true);
        expect(output).toContain('Fatal Errors:');
        expect(output).not.toContain('[FATAL]');
        expect(output).not.toContain('[ERROR]');
    });

    it('returns a fatal exit code and catches missing tags and empty files', () => {
        const { passed, output } = runLint(BAD_DIR);

        expect(passed).toBe(false);
        expect(output).toContain("[FATAL]\x1b[0m File is empty.");
        expect(output).toContain("[ERROR]\x1b[0m Missing or malformed POS tag '()'");
        expect(output).toContain("[ERROR]\x1b[0m Missing or malformed language tag '[]'");
    });

    it('logs warnings for formatting issues but does not trigger a fatal exit', () => {
        const { passed, output } = runLint(WARN_DIR);

        if (!passed) console.log("🔥 GATEKEEPER COMPLAINT:\n", output);

        expect(output).not.toContain('[FATAL]');
        expect(output).not.toContain('[ERROR]');
        expect(passed).toBe(true);
        expect(output).toContain("[WARN]\x1b[0m  Trailing whitespace on one or more lines.");
    });

});