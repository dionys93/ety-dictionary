import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// tests/fixtures/lint/ holds one small file per rule; the sandbox below holds
// trees built per test. Both are run with DICT_DIR pointed at them.
const FIXTURES = path.resolve(__dirname, '../fixtures/lint');
const SANDBOX = path.resolve(__dirname, '../fixtures/lint-sandbox');
const BASH_LIB_PATH = path.resolve(__dirname, '../../etym-lib.sh');

function runLint(args, dictDir = FIXTURES) {
    try {
        const stdout = execSync(`bash -c 'source "${BASH_LIB_PATH}" && etym-lint ${args}'`, {
            env: { ...process.env, DICT_DIR: dictDir, ETYM_QUIET: '1' },
            encoding: 'utf-8',
            stdio: 'pipe'
        });
        return { status: 0, output: stdout };
    } catch (err) {
        return { status: err.status, output: err.stdout ? err.stdout.toString() : err.message };
    }
}

const rules = (dir) => JSON.parse(runLint(`${dir} --report`).output).rules
    .reduce((acc, r) => ({ ...acc, [r.rule]: r }), {});

describe('etym-lint (Data Integrity Gatekeeper)', () => {

    beforeAll(() => {
        fs.mkdirSync(path.join(SANDBOX, 'good'), { recursive: true });
        fs.writeFileSync(path.join(SANDBOX, 'good', 'perfect.txt'),
            'perfectus [L]\nperfect [ME]\nperfect (adj)\nhttp://etymonline.com/perfect\n');
    });

    afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

    it('passes clean files with exit 0', () => {
        const { status, output } = runLint('good', SANDBOX);
        expect(status).toBe(0);
        expect(output).toContain('Fatal Errors:');
        expect(output).not.toContain('[FATAL]');
        expect(output).not.toContain('[ERROR]');
    });

    it('exits 1 and reports empty files and untagged lines', () => {
        const { status, output } = runLint('');
        expect(status).toBe(1);
        expect(output).toContain('[FATAL]\x1b[0m File is empty.');
        expect(output).toContain("[ERROR]\x1b[0m Stanza 1: 'broken word' — no language tag");
    });

    it('treats a file of blank lines as empty', () => {
        expect(rules('a').empty.files).toEqual(['a/blank.txt', 'a/empty.txt']);
    });

    it('warns on trailing whitespace without failing', () => {
        const { output } = runLint('b/trailing.txt');
        expect(output).toContain('[WARN]\x1b[0m  Trailing whitespace on one or more lines.');
    });

    it('flags a conjugation stanza whose (pos) tag is missing (silent-drop class)', () => {
        const { status, output } = runLint('b/dropped.txt');
        expect(status).toBe(1);
        expect(output).toContain('Stanza 2: conjugation line missing its (pos) tag');
    });

    it('warns on POS tags that are not in parts-of-speech.tsv', () => {
        expect(runLint('b/unknown-pos.txt').output).toContain("Unknown POS tag(s): 'mn' 'zz'");
    });

    it('reports each stanza-shape rule on the stanza that breaks it', () => {
        const r = rules('c');
        expect(r['pos-not-final'].files).toEqual(['c/malformed.txt']);
        expect(r['orphan-sources'].files).toEqual(['c/orphan.txt']);
        expect(r['lang-pos-line'].files).toEqual(['c/same-line.txt']);
        expect(r.unreformed.files).toEqual(['c/unreformed.txt']);
        expect(r.unreformed.severity).toBe('WARN');
    });

    describe('lang-tag: at least one line before the reformed line, each with a tag', () => {
        it('flags a line with no tag, and bracketed text with punctuation', () => {
            const { output } = runLint('d');
            expect(output).toContain("'τριάς' — no language tag");
            expect(output).toContain('[M.L.] is not a language tag');
        });

        it('accepts words joined by single spaces or hyphens', () => {
            // [Greenland Eskimo], [Anglo-Irish]
            expect(runLint('d/multi-word.txt').status).toBe(0);
        });

        it('accepts any letters or digits as a tag, full names included', () => {
            // [Nahuatl], [Narragansett]: whether they are official is etym-langs' business
            expect(runLint('d/named.txt').status).toBe(0);
            expect(runLint('d/positions.txt').output).not.toContain('moos');
        });

        it('allows one tag per line, wherever the line sits', () => {
            const { status, output } = runLint('d/two-tags.txt');
            expect(status).toBe(1);
            expect(output).toContain('Stanza 1: \'moos [Narragansett], moz [Abenaki]\' — 2 language tags');
            expect(output).toContain("Stanza 2: 'Apalaitian [ME] [OE]' — 2 language tags");
        });

        it('does not check lines after the reformed line for a missing tag', () => {
            expect(runLint('d/positions.txt').output).not.toContain('meese');
        });

        it('checks the lines before a conjugation line that lost its (pos) tag', () => {
            expect(runLint('d/positions.txt').output).toContain("'clafu' — no language tag");
        });

        it('catches an untagged conjugation-shaped line ending a chain', () => {
            expect(runLint('d/conj-chain.txt').output).toContain("'half -s -d -ing' — no language tag");
        });

        it('never reads the language register', () => {
            const { output } = runLint('d');
            expect(output).not.toContain('Unregistered');
            expect(output).not.toContain('Retired');
        });

        it('requires at least one line before the reformed line', () => {
            // stanza 2 is a reformed line alone; stanza 3 a conjugation line
            // alone. The parser would give both an empty me_word.
            const { status, output } = runLint('d/no-chain.txt');
            expect(status).toBe(1);
            expect(output).toContain('Stanzas 2 3: nothing before the reformed line');
            expect(output).not.toContain('Stanza 1:');
        });

        it('is an error, and --strict is retired', () => {
            const { status, output } = runLint('d/untagged.txt');
            expect(status).toBe(1);
            expect(output).toContain("[ERROR]\x1b[0m Stanza 1: 'τριάς'");
            expect(runLint('d/untagged.txt --strict').status).toBe(2);
        });
    });

    describe('verb coverage', () => {
        it('counts irv and aux stanzas, not only v', () => {
            const { verbs } = JSON.parse(runLint('f --report').output);
            expect(verbs.standard).toBe(1);
            expect(verbs.nonstandard_stanzas.map(v => v.word)).toEqual(['teic̃e', 'dou', 'þonder']);
        });
    });

    describe('--report', () => {
        it('emits JSON with per-rule counts and files', () => {
            const j = JSON.parse(runLint('--report').output);
            expect(j.files_scanned).toBeGreaterThan(0);
            expect(j.rules.find(r => r.rule === 'lang-tag').file_count).toBeGreaterThan(0);
        });

        it('emits TSV, one finding per row, with a header', () => {
            const rows = runLint('d/untagged.txt --report=tsv').output.trim().split('\n');
            expect(rows[0]).toBe('file\tstanza\tseverity\trule\tmessage');
            expect(rows.slice(1).every(r => r.split('\t')[3] === 'lang-tag')).toBe(true);
        });

        it('rejects an unknown format and unknown options with exit 2', () => {
            expect(runLint('--report=xml').status).toBe(2);
            expect(runLint('--bogus').status).toBe(2);
        });
    });

    describe('--since', () => {
        const REPO = path.join(SANDBOX, 'repo');
        const git = (cmd) => execSync(`git -c user.email=t@t -c user.name=t ${cmd}`, { cwd: REPO, stdio: 'pipe' });

        beforeAll(() => {
            fs.cpSync(FIXTURES, path.join(REPO, 'dict'), { recursive: true });
            git('init -q'); git('add .'); git('commit -qm init');
            fs.appendFileSync(path.join(REPO, 'dict/a/clean.txt'), '\nto cleanse [ME]\nto clense -s -d -ing (v)\n');
            fs.writeFileSync(path.join(REPO, 'dict/a/new.txt'), 'new [ME]\nnu (adj) \n');
            git('rm -q dict/c/orphan.txt');
        });

        it('gates only modified and untracked files, ignoring the untouched backlog', () => {
            const { status, output } = runLint('--since HEAD', path.join(REPO, 'dict'));
            expect(status).toBe(0);
            expect(output).toContain('Files Scanned:   2');
            expect(output).toContain('a/new.txt');
            expect(output).not.toContain('b/dropped.txt');
        });

        it('rejects a ref that is not a commit', () => {
            expect(runLint('--since no-such-ref', path.join(REPO, 'dict')).status).toBe(2);
        });
    });
});