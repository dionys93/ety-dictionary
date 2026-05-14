// toolkit/scripts/utils.js

/**
 * Calculates the full Inglisce spelling from a dictionary shorthand suffix.
 */
export const resolveForm = (form, rootWord, isGerund = false) => {
    if (!form) return null;
    if (!form.startsWith('-')) return form.replace(/[()]/g, '');

    const suffix = form.slice(1);
    const startsWithVowel = /^[aeiouy]/.test(suffix);

    const base = 
        (rootWord.endsWith('ie') && suffix.startsWith('i')) ? rootWord.slice(0, -2) + 'y' :
        (rootWord.endsWith('e') && (isGerund || startsWithVowel)) ? rootWord.slice(0, -1) :
        rootWord;

    return base + suffix;
};

/**
 * Matches the capitalization of the original English text.
 */
export const matchCasing = (originalText, replacementWord) => {
    const cleanOriginal = originalText.replace(/[^a-zA-Z]/g, '');
    if (!cleanOriginal) return replacementWord;

    const toInglisceUpper = (char) => char === 'þ' ? 'Ћ' : char.toUpperCase();

    if (cleanOriginal === cleanOriginal.toUpperCase()) {
        return replacementWord.split('').map(toInglisceUpper).join('');
    }
    if (/^[A-Z]/.test(cleanOriginal)) {
        return toInglisceUpper(replacementWord.charAt(0)) + replacementWord.slice(1);
    }
    return replacementWord;
};