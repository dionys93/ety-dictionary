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
// Checks (ok:true/false) are CODE contract; warnings are DATA issues that
// should be fixed in the dictionary, not the code — they never fail the run.
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
    const warnings = [];
    const ck = (label, ok) => checks.push({ label, ok: !!ok });
    // All literals below are NFC; brain values are NFC via deepNormalize().
    // Source .txt files are NFD — the parser passes bytes through untouched
    // and normalization is the Node layer's job. That IS part of the contract.
    const NFC = (s) => s.normalize('NFC');

    // ── Class 6 explicit verbs: be / do / have ──────────────────────────────
    ck("be: brain['be'].Auxiliary === 'bie'", brain.be?.Auxiliary === 'bie');
    ck("be: brain['was'] → Copula primary, Verb secondary ('uas')",
        brain.was?.Copula === 'uas' && brain.was?.Verb === 'uas');
    ck("be: brain[\"wasn't\"].Copula === \"uasn't\"", brain["wasn't"]?.Copula === "uasn't");
    ck("do: verb stanza (7-item array) zips CLASS_6_SCHEMAS.do_verb → brain['done'].Verb === 'don'",
        brain.done?.Verb === 'don');
    ck("do: aux stanza (5-item array) zips do_aux via the length<7 heuristic → brain['did'] exists",
        brain.did?.Verb === 'did' && brain.did?.Auxiliary === 'did');
    ck("have: brain['had'].Verb === 'had' (6-item zip)", brain.had?.Verb === 'had');
    ck("have: brain['having'].Auxiliary === 'having'", brain.having?.Auxiliary === 'having');
    // Load-bearing quirk, pinned on purpose: have's '(aux, v)' tag does NOT
    // match the parser's is_verb() (anchored single tags), so conjugations
    // arrive as a RAW ARRAY — exactly what the CLASS_6 zip expects. If
    // is_verb() ever learns multi-POS tags, this fails loudly.
    ck("have: multi-POS '(aux, v)' bypasses is_verb → conjugations arrive as raw array",
        Array.isArray(dataset.find(r => r.me_word === 'have')?.conjugations));

    // ── Modals ──────────────────────────────────────────────────────────────
    ck(`can: brain['could'].Modal === '${NFC('coûd')}'`, brain.could?.Modal === NFC('coûd'));
    ck("can: brain['cannot'].Modal === \"can't\"", brain.cannot?.Modal === "can't");
    ck(`shall: brain['should'].Modal === '${NFC('seûd')}'`, brain.should?.Modal === NFC('seûd'));
    if (brain.would?.Modal === NFC("uon't")) {
        warnings.push(
            "DATA — will.txt orders forms (neg-pres, past, neg-past): 'uill, uon't, oûd, oûdn't', " +
            "but can.txt/shall.txt use (past, neg-pres, neg-past). Result: brain['would'].Modal " +
            "=== \"uon't\" — every 'would' translates as WON'T. Fix will.txt to " +
            "'uill, oûd, uon't, oûdn't', refreeze w_will.jsonl, and this warning " +
            "auto-converts to a passing assertion.");
    } else {
        ck(`will: brain['would'].Modal === '${NFC('oûd')}' (ordering fixed)`,
            brain.would?.Modal === NFC('oûd'));
    }
    if (brain.may?.Modal === NFC('máit')) {
        warnings.push(
            "DATA — may.txt AND might.txt both carry ME line 'may, might'; resolve_me_word " +
            "takes the first token, so BOTH records key as me_word 'may'. Last file wins: " +
            "brain['may'].Modal === 'máit' (that's might!) and modal 'might' has no entry at " +
            "all. Fix might.txt's ME line to just 'might [ME]', refreeze m_might.jsonl.");
    } else {
        ck("may/might: distinct modal entries ('maie' / 'máit')",
            brain.may?.Modal === 'maie' && brain.might?.Modal === NFC('máit'));
    }

    // ── Regular + irregular verbs ───────────────────────────────────────────
    ck(`catch: brain['catch'].Verb === '${NFC('caic̃e')}' (combining tilde survives NFC)`,
        brain.catch?.Verb === NFC('caic̃e'));
    ck("catch: Verb_conjugations.past === 'cauht'", brain.catch?.Verb_conjugations?.past === 'cauht');
    ck("see: class 3 distinct participle 'sine'", brain.see?.Verb_conjugations?.participle === 'sine');
    ck("work: class 4 two-stem — Verb 'uirche', present 'uirc'",
        brain.work?.Verb === 'uirche' && brain.work?.Verb_conjugations?.present === 'uirc');
    ck(`shake: class 5 past '${NFC('seôc')}', participle 'seacan'`,
        brain.shake?.Verb_conjugations?.past === NFC('seôc')
        && brain.shake?.Verb_conjugations?.participle === 'seacan');

    // ── Nouns, determiners, pronouns, multi-POS ─────────────────────────────
    ck("hammer: Noun 'hamere', plural 'hamirs'",
        brain.hammer?.Noun === 'hamere' && brain.hammer?.Noun_conjugations?.plural === 'hamirs');
    ck(`work: irregular plural '${NFC('uêx')}'`, brain.work?.Noun_conjugations?.plural === NFC('uêx'));
    ck("bulwark: suffix-shorthand plural '-x'", brain.bulwark?.Noun_conjugations?.plural === '-x');
    ck(`child: irregular plural '${NFC('c̃ildren')}' (combining tilde)`,
        brain.child?.Noun_conjugations?.plural === NFC('c̃ildren'));
    ck("beat: multi-stanza multi-POS → Verb + Adjective + Noun all 'biete'",
        brain.beat?.Verb === 'biete' && brain.beat?.Adjective === 'biete' && brain.beat?.Noun === 'biete');
    ck(`the: pos 'defin' → brain['the'].Determiner === '${NFC('þe')}'`,
        brain.the?.Determiner === NFC('þe'));
    ck("he: brain['he'].Pronoun === 'hie'", brain.he?.Pronoun === 'hie');
    ck(`with: brain['with'].Preposition === '${NFC('uiþ')}'`, brain.with?.Preposition === NFC('uiþ'));
    if (brain.seer?.Noun_conjugations?.plural === 'sihor') {
        warnings.push(
            "SCHEMA (item 5 material) — seer.txt's 'siheur, sihor -s' pattern: 'sihor' is a " +
            "variant singular, but the Noun zip {plural: rawConj[0]} records it as the PLURAL. " +
            "brain['seer'] pluralizes as 'sihor' instead of siheur+s.");
    }

    return {
        checks,
        warnings,
        compiledCount,
        datasetCount: dataset.length,
        lemmaCount: Object.keys(brain).length,
    };
}

// ── CLI entry (used by tests/test-etym-parse.sh stage 5) ─────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { checks, warnings, compiledCount, datasetCount, lemmaCount } = runContract();
    console.log(`Compiled ${compiledCount}/${datasetCount} golden records into ${lemmaCount} lemma mappings`);
    for (const { label, ok } of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`);
    for (const w of warnings) console.log(`  ⚠️  ${w}`);
    const failed = checks.filter(c => !c.ok);
    console.log(`CONTRACT: ${checks.length - failed.length} passed, ${failed.length} failed, ${warnings.length} data warning(s)`);
    process.exit(failed.length === 0 ? 0 : 1);
}
