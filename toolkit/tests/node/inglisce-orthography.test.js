import { describe, it, expect } from 'vitest';
// Pointing to the new spelling logic domain
import { resolveForm, matchCasing } from '../../scripts/inglisce-orthography.js';

describe('resolveForm (Morphological Suffix Resolver)', () => {
    it('returns null for empty forms', () => {
        expect(resolveForm(undefined, 'test')).toBeNull();
    });

    it('returns the form directly if it does not start with a hyphen', () => {
        expect(resolveForm('did', 'do')).toBe('did');
    });

    it('strips parentheses from hardcoded irregulars', () => {
        expect(resolveForm('(went)', 'go')).toBe('went');
    });

    it('attaches standard consonant suffixes', () => {
        expect(resolveForm('-s', 'book')).toBe('books');
        expect(resolveForm('-ly', 'sad')).toBe('sadly');
    });

    it('drops the silent -e for vowel suffixes', () => {
        expect(resolveForm('-ed', 'translate')).toBe('translated');
        expect(resolveForm('-ingue', 'make')).toBe('makingue');
    });

    it('keeps the silent -e for consonant suffixes', () => {
        expect(resolveForm('-s', 'make')).toBe('makes');
        expect(resolveForm('-ment', 'state')).toBe('statement');
    });

    it('handles the -ie to -y gerund swap (e.g. tie -> tying)', () => {
        expect(resolveForm('-ing', 'tie')).toBe('tying');
    });

    it('forces silent -e drop for all gerunds even if suffix starts with consonant', () => {
        expect(resolveForm('-ing', 'make', true)).toBe('making');
    });
});

describe('matchCasing (Capitalization Preserver)', () => {
    it('returns lowercase for lowercase input', () => {
        expect(matchCasing('hello', 'hialo')).toBe('hialo');
    });

    it('capitalizes the first letter if the original was Title Case', () => {
        expect(matchCasing('Hello', 'hialo')).toBe('Hialo');
    });

    it('uppercases the entire word if the original was ALL CAPS', () => {
        expect(matchCasing('HELLO', 'hialo')).toBe('HIALO');
    });

    it('properly handles the thorn (þ) to capital thorn (Ћ) conversion', () => {
        expect(matchCasing('The', 'þe')).toBe('Ћe');
        expect(matchCasing('THE', 'þe')).toBe('ЋE');
    });

    it('ignores punctuation attached to the original word when determining case', () => {
        expect(matchCasing('Hello,', 'hialo')).toBe('Hialo');
        expect(matchCasing('"HELLO"', 'hialo')).toBe('HIALO');
        expect(matchCasing('[hello]', 'hialo')).toBe('hialo');
    });
});
