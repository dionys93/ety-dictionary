import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const LINT_DIR = path.resolve(__dirname, '../fixtures/lint-sandbox');
const GOOD_DIR = path.join(LINT_DIR, 'good');
const BAD_DIR  = path.join(LINT_DIR, 'bad');
const WARN_DIR = path.join(LINT_DIR, 'warn');

// Portable: resolve the lib relative to this test file (matches lookup.test.js)
// instead of a hardcoded /workspaces/... devcontainer path.
const BASH_LIB_PATH = path.resolve(__dirname, '../../etym-lib.sh');

function runLint(targetDir) {
    try {
        const cmd = `bash -c "source ${BASH_LIB_PATH} && etym-lint ${targetDir}"`;
        const stdout = execSync(cmd, {
            env: { ...process.env, DICT_DIR: LINT_DIR, ETYM_QUIET: '1' },
            encoding: 'utf-8',
            stdio: 'pipe'
        });
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

        // New stanza-level rules:
        // A conjugation-shaped line with no (pos) tag → stanza silently
        // dropped by etym-parse; must be an ERROR even though a sibling
        // stanza keeps the per-file checks happy.
        fs.writeFileSync(path.join(BAD_DIR, 'dropped-stanza.txt'),
            'clawu [OE]\nclaw [ME]\nclaue, claus (m n)\n\n' +
            'clawian [OE]\nto claw [ME]\nto claue -s -d -ing\nhttp://example.com\n');
        // POS tags absent from parts-of-speech.tsv → buildBrain skips the
        // record; must be a WARN naming the offending tag.
        fs.writeFileSync(path.join(WARN_DIR, 'unknown-pos.txt'),
            'foo [ME]\nfou, fous (mn)\nhttp://example.com\n');
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

    it('flags a conjugation stanza whose (pos) tag is missing (silent-drop class)', () => {
        const { passed, output } = runLint(BAD_DIR);
        expect(passed).toBe(false);
        expect(output).toContain('dropped-stanza.txt');
        expect(output).toContain('missing its (pos) tag');
    });

    it('warns on POS tags that are not in parts-of-speech.tsv', () => {
        const { output } = runLint(WARN_DIR);
        expect(output).toContain('unknown-pos.txt');
        expect(output).toContain("Unknown POS tag(s): 'mn'");
    });
});
