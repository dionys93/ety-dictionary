// brain-contract.assertions.mjs — The awk → Node.js schema contract
// ============================================================================
// SINGLE SOURCE OF TRUTH for the contract between etym-parse.awk's output
// (frozen in tests/snapshots/parser/) and buildBrain() in
// scripts/build-dictionary.js. Two consumers, one implementation:
//
//   * tests/node/brain-contract.test.js  — Vitest wrapper (npm test)
//   * tests/test-etym-parse.sh stage 5   — runs this file directly with node
//                                          (no vitest / node_modules needed)
//
// Contract summary (see etym-parse.awk header for the authoritative spec):
//   * conjugations is ALWAYS a named object; buildBrain rejects raw arrays
//     as stale data rather than positionally guessing at them
//   * explicit verb/modal forms are English↔Inglisce pairs zipped from each
//     stanza's own [ME] line — no English form lists exist in JS anymore
//   * every explicit pair maps under 'Verb' plus the row's own POS category
//     ('Copula' is retired; the transcriber's AUX routing hits 'Verb' first)
//   * nouns carry { plural [, variants] }; other non-verbs carry { forms }
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBrain } from '../../scripts/build-dictionary.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GOLDEN_DIR = path.join(HERE, '..', 'snapshots', 'parser');

export function loadGoldenDataset(goldenDir = GOLDEN_DIR) {
    return fs.readdirSync(goldenDir)
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .flatMap(f => fs.readFileSync(path.join(goldenDir, f), 'utf8')
            .split('\n')
            .filter(l => l.trim())
            .map(l => JSON.parse(l)));
}

export function runContract(goldenDir = GOLDEN_DIR) {
    const dataset = loadGoldenDataset(goldenDir);
    const { brain, compiledCount } = buildBrain(dataset);

    const checks = [];
    const ck = (label, ok) => checks.push({ label, ok: !!ok });
    // All literals below are NFC; brain values are NFC via deepNormalize().
    // Source .txt files are NFD — the parser passes bytes through untouched
    // and normalization is the Node layer's job. That IS part of the contract.
    const NFC = (s) => s.normalize('NFC');

    // ── Schema shape ────────────────────────────────────────────────────────
    ck('every golden record carries object conjugations (arrays are stale data)',
        dataset.every(r => !Array.isArray(r.conjugations)));
    ck('buildBrain compiles every golden record', compiledCount === dataset.length);
    ck('buildBrain rejects a legacy array row as a loud Failure, not a guess',
        buildBrain([{ me_word: 'x', inglisce_word: 'y', pos: 'v', conjugations: ['a'] }]).compiledCount === 0);

    // ── Explicit verbs (ME-zip): be / do / have ─────────────────────────────
    ck("be: brain['be'].Auxiliary === 'bie'", brain.be?.Auxiliary === 'bie');
    ck("be: brain['was'].Verb === 'uas' (explicit pair from the stanza's ME line)",
        brain.was?.Verb === 'uas');
    ck("be: brain[\"wasn't\"].Verb === \"uasn't\"", brain["wasn't"]?.Verb === "uasn't");
    ck("do: verb stanza (7 ME-zipped pairs) → brain['done'].Verb === 'don'",
        brain.done?.Verb === 'don');
    ck("do: brain['does'].Verb === 'dus' (integration Rule 3 dependency)",
        brain.does?.Verb === 'dus');
    ck("do: aux stanza (5 pairs) → brain['did'].Verb + .Auxiliary === 'did'",
        brain.did?.Verb === 'did' && brain.did?.Auxiliary === 'did');
    ck("have: '(aux, v)' is now verbish; explicit pairs still land — brain['had'].Verb === 'had'",
        brain.had?.Verb === 'had' && brain.having?.Auxiliary === 'having');

    // ── Modals (same ME-zip mechanism — no MODAL_PAST_MAP) ──────────────────
    ck(`can: brain['could'].Modal === '${NFC('coûd')}'`, brain.could?.Modal === NFC('coûd'));
    ck("can: brain['cannot'].Modal === \"can't\" (fused negation ← explicit \"can't\" pair)",
        brain.cannot?.Modal === "can't");
    ck(`shall: brain['should'].Modal === '${NFC('seûd')}' (via extended ME line)`,
        brain.should?.Modal === NFC('seûd'));
    ck(`will: brain['would'].Modal === '${NFC('oûd')}' — the ordering bug class is structurally dead`,
        brain.would?.Modal === NFC('oûd'));
    ck(`will: brain["won't"].Modal === '${NFC("uon't")}'`, brain["won't"]?.Modal === NFC("uon't"));
    ck(`may/might: distinct entries — 'maie' / '${NFC('máit')}' (me_word collision fixed)`,
        brain.may?.Modal === 'maie' && brain.might?.Modal === NFC('máit'));

    // ── Slot verbs (classes 1–5, unchanged semantics) ───────────────────────
    ck(`catch: brain['catch'].Verb === '${NFC('caic̃e')}', past 'cauht'`,
        brain.catch?.Verb === NFC('caic̃e') && brain.catch?.Verb_conjugations?.past === 'cauht');
    ck("see: class 3 distinct participle 'sine'", brain.see?.Verb_conjugations?.participle === 'sine');
    ck("work: class 4 two-stem — Verb 'uirche', present 'uirc'",
        brain.work?.Verb === 'uirche' && brain.work?.Verb_conjugations?.present === 'uirc');
    ck(`shake: class 5 past '${NFC('seôc')}', participle 'seacan'`,
        brain.shake?.Verb_conjugations?.past === NFC('seôc')
        && brain.shake?.Verb_conjugations?.participle === 'seacan');
    ck("claw: restored verb stanza slots as class 1 (past '-d')",
        brain.claw?.Verb === 'claue' && brain.claw?.Verb_conjugations?.past === '-d');

    // ── Nouns & the rest ────────────────────────────────────────────────────
    ck("hammer: { plural: 'hamirs' } named at the parser, no JS re-derivation",
        brain.hammer?.Noun === 'hamere' && brain.hammer?.Noun_conjugations?.plural === 'hamirs');
    ck(`work: irregular plural '${NFC('uêx')}'`, brain.work?.Noun_conjugations?.plural === NFC('uêx'));
    ck("bulwark: suffix-shorthand plural '-x'", brain.bulwark?.Noun_conjugations?.plural === '-x');
    ck(`child: irregular plural '${NFC('c̃ildren')}' (combining tilde)`,
        brain.child?.Noun_conjugations?.plural === NFC('c̃ildren'));
    ck("seer: plural '-s' with variants ['sihor'] — the variant-as-plural bug is fixed",
        brain.seer?.Noun_conjugations?.plural === '-s'
        && brain.seer?.Noun_conjugations?.variants?.[0] === 'sihor');
    ck("alternate: suffix-first noun row keeps '-s' as plural, '-ly' shelved in forms",
        brain.alternate?.Noun_conjugations?.plural === '-s'
        && brain.alternate?.Noun_conjugations?.forms?.[0] === '-ly');
    ck("beat: multi-stanza multi-POS → Verb + Adjective + Noun all 'biete'",
        brain.beat?.Verb === 'biete' && brain.beat?.Adjective === 'biete' && brain.beat?.Noun === 'biete');
    ck(`the: pos 'defin' → brain['the'].Determiner === '${NFC('þe')}'`,
        brain.the?.Determiner === NFC('þe'));
    ck("he: brain['he'].Pronoun === 'hie'", brain.he?.Pronoun === 'hie');
    ck(`with: brain['with'].Preposition === '${NFC('uiþ')}'`, brain.with?.Preposition === NFC('uiþ'));

    return {
        checks,
        compiledCount,
        datasetCount: dataset.length,
        lemmaCount: Object.keys(brain).length,
    };
}

// ── CLI entry (used by tests/test-etym-parse.sh stage 5) ─────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { checks, compiledCount, datasetCount, lemmaCount } = runContract();
    console.log(`Compiled ${compiledCount}/${datasetCount} golden records into ${lemmaCount} lemma mappings`);
    for (const { label, ok } of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    const failed = checks.filter(c => !c.ok);
    console.log(`CONTRACT: ${checks.length - failed.length} passed, ${failed.length} failed`);
    process.exit(failed.length === 0 ? 0 : 1);
}
