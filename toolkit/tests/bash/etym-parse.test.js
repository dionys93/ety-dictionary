// etym-parse.test.js — Golden-file suite for the extracted canonical parser
//
// Covers etym-parse.awk directly (no lib sourcing needed except the wrapper
// test). Fixtures live in tests/fixtures/parser/ — a SEPARATE tree from
// tests/fixtures/dictionary/ on purpose: lookup/flatten tests are free to
// grow the shared dictionary without invalidating frozen parser goldens.
//
// To refreeze after an intentional parser or fixture change:
//   find tests/fixtures/parser -name '*.txt' | sort | while read f; do
//     rel="${f#tests/fixtures/parser/}"
//     awk -f etym-parse.awk "$f" > "tests/snapshots/parser/$(echo "${rel%.txt}" | tr '/' '_').jsonl"
//   done

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TOOLKIT = path.resolve(import.meta.dirname, '../..');
const PARSER = path.join(TOOLKIT, 'etym-parse.awk');
const LIB = path.join(TOOLKIT, 'etym-lib.sh');
const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/parser');
const GOLDEN = path.resolve(import.meta.dirname, '../snapshots/parser');
const AWK = process.env.ETYM_AWK || 'awk';

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name))
        : e.name.endsWith('.txt') ? [path.join(dir, e.name)] : [])
    .sort();

const fixtures = walk(FIXTURES);
const parse = (files) => execSync(
    `${AWK} -f "${PARSER}" ${files.map(f => `"${f}"`).join(' ')}`,
    { encoding: 'utf-8' });

// Stanzas the parser is EXPECTED to skip (no recognizable reformed line).
// Every other fixture must convert 100% of stanzas to records. If you add a
// fixture with an intentionally unparseable stanza, register it here.
// (tie.txt was originally mis-registered here from reading a truncated view
// of the file — its final stanza IS complete and parses. 0 drops.)
const DOCUMENTED_DROPS = {
    'c/claw.txt': 1, // verb stanza's reformed line lacks its '(v)' POS tag
};

// Count stanzas exactly the way the parser segments them (awk paragraph
// mode, RS=""). A JS regex like /\n\s*\n/ is NOT equivalent: it treats
// whitespace-only lines as stanza breaks, awk does not — and the dictionary
// contains trailing-whitespace lines (see etym-lint's WARN class).
const countStanzas = (file) => parseInt(execSync(
    `${AWK} 'BEGIN { RS = "" ; n = 0 } { n++ } END { print n }' "${file}"`,
    { encoding: 'utf-8' }), 10);

describe('etym-parse.awk (Canonical Stanza Parser)', () => {

    describe('golden-file comparisons', () => {
        for (const fixture of fixtures) {
            const rel = path.relative(FIXTURES, fixture);
            const golden = path.join(GOLDEN, rel.replace(/\.txt$/, '.jsonl').replace(/[\\/]/g, '_'));
            it(`${rel} matches its frozen golden`, () => {
                expect(fs.existsSync(golden), `missing golden: ${golden}`).toBe(true);
                expect(parse([fixture])).toBe(fs.readFileSync(golden, 'utf-8'));
            });
        }
    });

    it('emits valid JSON for every record across all fixtures', () => {
        const lines = parse(fixtures).split('\n').filter(l => l.trim());
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
            expect(() => JSON.parse(line), `invalid JSON: ${line.slice(0, 80)}…`).not.toThrow();
        }
    });

    it('escapes hostile characters losslessly (backslash, quote, tab)', () => {
        const rec = JSON.parse(parse([path.join(FIXTURES, 'e/escape.txt')]).split('\n')[0]);
        expect(rec.etymology[0].form).toBe('es"ca\\pe');
        expect(rec.etymology[1].form).toBe('es\tcape');
        expect(rec.sources[0]).toBe('https://example.com/esc"ape\\path');
    });

    it('never merges records across file boundaries in one multi-file invocation', () => {
        // _etym_stream runs ONE awk process over every file; paragraph mode
        // (RS="") must terminate records at EOF even without a trailing blank
        // line. fixtures/parser/q/quick.txt has no trailing newline at all.
        const single = parse(fixtures);
        const perFile = fixtures.map(f => parse([f])).join('');
        expect(single).toBe(perFile);
    });

    it('drops exactly the documented unparseable stanzas — no silent losses', () => {
        for (const fixture of fixtures) {
            const rel = path.relative(FIXTURES, fixture).replace(/\\/g, '/');
            const stanzas = countStanzas(fixture);
            const records = parse([fixture]).split('\n').filter(l => l.trim()).length;
            const expectedDrops = DOCUMENTED_DROPS[rel] ?? 0;
            expect(stanzas - records,
                `${rel}: ${stanzas} stanzas → ${records} records (expected ${expectedDrops} drop(s))`
            ).toBe(expectedDrops);
        }
    });

    it('etym-parse (sourced lib wrapper) produces identical output to direct awk', () => {
        const sample = path.join(FIXTURES, 't/thunder.txt');
        const viaLib = execSync(
            `bash -c "source ${LIB} && etym-parse ${sample}"`,
            {
                env: { ...process.env, DICT_DIR: FIXTURES, ETYM_QUIET: '1' },
                encoding: 'utf-8',
                stdio: 'pipe',
            });
        expect(viaLib).toBe(parse([sample]));
    });
});