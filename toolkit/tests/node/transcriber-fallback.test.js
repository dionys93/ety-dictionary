// transcriber-fallback.test.js — Cross-POS fallback flagging
//
// resolveCategory's last resort (no category matches the spaCy POS → take the
// first available one) is sometimes exactly right and sometimes the source of
// a weird translation. It is no longer silent: fallback hits are flagged on
// the translation state and aggregated into the run summary / dist file.

import { describe, it, expect } from 'vitest';
import { transcribeFromAST } from '../../scripts/transcriber.js';

const tok = (text, lemma, pos, tag, whitespace = ' ') =>
    ({ text, lemma, pos, tag, whitespace, is_ent: false });

describe('Cross-POS Fallback Tracker', () => {

    const brain = {
        quick: { Noun: 'quic', Noun_conjugations: { plural: '-s' } },
        fox: { Noun: 'fox' },
        jump: { Verb: 'gimpe', Verb_conjugations: { past: '-d' } },
    };

    it('flags a token served by a non-matching POS category', () => {
        // 'quick' arrives as ADJ but the brain only has a Noun entry
        const { text, fallbacks } = transcribeFromAST(
            [tok('quick', 'quick', 'ADJ', 'JJ', '')], brain);

        expect(text).toBe('quic');
        expect(fallbacks.size).toBe(1);
        expect([...fallbacks][0]).toBe('quick (ADJ → Noun)');
    });

    it('does NOT flag clean category matches', () => {
        const { fallbacks } = transcribeFromAST(
            [tok('fox', 'fox', 'NOUN', 'NN'), tok('jumped', 'jump', 'VERB', 'VBD', '')], brain);
        expect(fallbacks.size).toBe(0);
    });

    it('does NOT flag bypassed tokens (punctuation, clitics, entities)', () => {
        const { fallbacks } = transcribeFromAST(
            [tok('.', '.', 'PUNCT', '.'), tok("n't", "n't", 'PART', 'RB', '')], brain);
        expect(fallbacks.size).toBe(0);
    });

    it('missing words and fallbacks accumulate independently', () => {
        const { missingWords, fallbacks } = transcribeFromAST([
            tok('quick', 'quick', 'ADJ', 'JJ'),
            tok('zebra', 'zebra', 'NOUN', 'NN', ''),
        ], brain);
        expect([...missingWords]).toEqual(['zebra']);
        expect(fallbacks.size).toBe(1);
    });
});
