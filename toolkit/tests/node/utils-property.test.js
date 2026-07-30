// utils-property.test.js — Property & fuzz coverage (deterministic, seeded)
//
// Two hardening suites:
//   1. resolveForm's silent-ending rules (-e / -ie / -ue / -che) exercised
//      across generated roots, asserting the documented invariants rather
//      than hand-picked examples.
//   2. A fuzz round-trip through etym-parse.awk's esc(): random hostile
//      strings are planted in a stanza's etymology line, parsed, and must
//      survive JSON.parse byte-for-byte.
//
// Both use a seeded LCG so failures are reproducible — no randomness between
// runs, no fast-check dependency.

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveForm } from '../../scripts/utils.js';

// ── Seeded PRNG ──────────────────────────────────────────────────────────────
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

const makeRand = (seed) => {
    const next = lcg(seed);
    return {
        int: (n) => Math.floor(next() * n),
        pick: (arr) => arr[Math.floor(next() * arr.length)],
    };
};

describe('resolveForm properties (seeded, 300 cases each)', () => {
    const LETTERS = 'abcdefghijklmnopqrstuvwxyzþc̃âêîôûíóú';

    const randomRoot = (r, suffix = '') => {
        let root = '';
        const len = 2 + r.int(6);
        for (let i = 0; i < len; i++) root += r.pick([...LETTERS]);
        return root + suffix;
    };

    it('non-hyphen forms pass through with parentheses stripped', () => {
        const r = makeRand(101);
        for (let i = 0; i < 300; i++) {
            const w = randomRoot(r);
            expect(resolveForm(w, 'anything')).toBe(w);
            expect(resolveForm(`(${w})`, 'anything')).toBe(w);
        }
    });

    it('consonant suffixes attach without mutating the root', () => {
        const r = makeRand(202);
        for (let i = 0; i < 300; i++) {
            const root = randomRoot(r) + r.pick(['t', 'n', 'd', 'l', 'c']); // consonant-final
            expect(resolveForm('-s', root, false)).toBe(root + 's');
            expect(resolveForm('-ly', root, false)).toBe(root + 'ly');
        }
    });

    it("silent -e drops before vowel suffixes and gerunds, survives consonant suffixes", () => {
        const r = makeRand(303);
        for (let i = 0; i < 300; i++) {
            // avoid the more specific ie/ue/che endings — tested separately
            let root = randomRoot(r) + r.pick(['t', 'n', 'd', 'l', 'p']) + 'e';
            expect(resolveForm('-ing', root, true)).toBe(root.slice(0, -1) + 'ing');
            expect(resolveForm('-ed', root, false)).toBe(root.slice(0, -1) + 'ed');
            expect(resolveForm('-s', root, false)).toBe(root + 's');   // consonant suffix keeps the e
        }
    });

    it("-ie roots: gerund i-suffix rewrites to y; 'is' plural drops both", () => {
        const r = makeRand(404);
        for (let i = 0; i < 300; i++) {
            const root = randomRoot(r) + 'ie';
            expect(resolveForm('-ing', root, true)).toBe(root.slice(0, -2) + 'y' + 'ing');
            expect(resolveForm('-is', root, false)).toBe(root.slice(0, -2) + 'is');
        }
    });

    it("-ue / -che roots drop two letters before a plain 's'", () => {
        const r = makeRand(505);
        for (let i = 0; i < 300; i++) {
            const ue = randomRoot(r) + 'ue';
            const che = randomRoot(r) + 'che';
            expect(resolveForm('-s', ue, false)).toBe(ue.slice(0, -2) + 's');
            expect(resolveForm('-s', che, false)).toBe(che.slice(0, -2) + 's');
        }
    });

    it('never throws and never returns undefined across arbitrary inputs', () => {
        const r = makeRand(606);
        const junk = [null, undefined, 42, '', '-', '-x', 'word', '(x)', '-ing'];
        for (let i = 0; i < 300; i++) {
            const form = r.pick(junk);
            const root = r.pick([...junk, randomRoot(r)]);
            expect(() => resolveForm(form, root, r.int(2) === 1)).not.toThrow();
            expect(resolveForm(form, root)).not.toBe(undefined);
        }
    });
});

describe('etym-parse.awk esc() fuzz round-trip (seeded, 60 stanzas)', () => {
    const PARSER = path.resolve(import.meta.dirname, '../../etym-parse.awk');
    const AWK = process.env.ETYM_AWK || 'awk';

    // Alphabet: hostile-but-line-safe. No newlines/CR (line-based format), no
    // brackets (would read as [TAG]s), no parens (would read as a reformed
    // line or POS tag), no leading-trim ambiguity (handled by construction).
    const ALPHABET = [..."abcXYZ019þéÐœ", '\\', '"', '\t', "'", ',', '\u0001', '\u0007', '\u001f', '\\\\', '\\"'];

    const genString = (r) => {
        let out = '';
        const len = 1 + r.int(24);
        for (let i = 0; i < len; i++) out += r.pick(ALPHABET);
        // the parser trims leading/trailing whitespace off etymology forms and
        // strips a leading "to " — normalize the EXPECTED value accordingly
        out = 'x' + out + 'x'; // guarantee non-space, non-"to " edges
        return out;
    };

    it('every fuzzed etymology form survives parse → JSON.parse losslessly', () => {
        const r = makeRand(0xF00D);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etym-fuzz-'));
        try {
            for (let i = 0; i < 60; i++) {
                const nasty = genString(r);
                const file = path.join(dir, `f${i}.txt`);
                fs.writeFileSync(file, `${nasty} [OE]\nfuzzword [ME]\nfuzz -s (m n)\n`, 'utf8');

                const out = execSync(`${AWK} -f "${PARSER}" "${file}"`, { encoding: 'utf-8' });
                const rec = JSON.parse(out.trim());   // throws on any escaping bug
                expect(rec.etymology[0].form).toBe(nasty);
                expect(rec.etymology[0].lang).toBe('OE');
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
