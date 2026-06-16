// /**
//  * Calculates the full Inglisce spelling from a dictionary shorthand suffix.
//  */
// export const resolveForm = (form, rootWord, isGerund = false) => {
//     if (!form || typeof form !== 'string') return null;
//     if (!form.startsWith('-')) return form.replace(/[()]/g, '');
//     if (!rootWord || typeof rootWord !== 'string') return form;

//     const suffix = form.slice(1);
//     const startsWithVowel = /^[aeiouy]/.test(suffix);

//     const base = 
//         // Gerunds: lie + ing -> lying
//         (rootWord.endsWith('ie') && suffix.startsWith('i') && isGerund) ? rootWord.slice(0, -2) + 'y' :
        
//         // Nouns ending in -ie with -is plural: berrie + is -> berris
//         (rootWord.endsWith('ie') && suffix === 'is') ? rootWord.slice(0, -2) :
        
//         // RULE 1: If verb in ue or che +s, remove ue/he (slice off the last two letters)
//         ((rootWord.endsWith('ue') || rootWord.endsWith('che')) && suffix === 's') ? rootWord.slice(0, -2) :
        
//         // RULE 2: If +ing (or +ed), remove -e (slice off the last letter)
//         (rootWord.endsWith('e') && (isGerund || startsWithVowel)) ? rootWord.slice(0, -1) :
        
//         rootWord;

//     return base + suffix;
// };

// /**
//  * Matches the capitalization of the original English text.
//  */
// export const matchCasing = (originalText, replacementWord) => {
//     if (!originalText || typeof originalText !== 'string') return replacementWord;
//     if (!replacementWord || typeof replacementWord !== 'string') return originalText;

//     const cleanOriginal = originalText.replace(/[^a-zA-Z]/g, '');
//     if (!cleanOriginal) return replacementWord;

//     const toInglisceUpper = (char) => char === 'þ' ? 'Ћ' : char.toUpperCase();

//     if (cleanOriginal === cleanOriginal.toUpperCase()) {
//         return replacementWord.split('').map(toInglisceUpper).join('');
//     }
//     if (/^[A-Z]/.test(cleanOriginal)) {
//         return toInglisceUpper(replacementWord.charAt(0)) + replacementWord.slice(1);
//     }
//     return replacementWord;
// };

/**
 * Calculates the full Inglisce spelling from a dictionary shorthand suffix.
 */
export const resolveForm = (form, rootWord, isGerund = false) => {
    if (!form || typeof form !== 'string') return null;
    if (!form.startsWith('-')) return form.replace(/[()]/g, '');
    if (!rootWord || typeof rootWord !== 'string') return form;

    const suffix = form.slice(1);
    const startsWithVowel = /^[aeiouy]/.test(suffix);

    const base = 
        (rootWord.endsWith('ie') && suffix.startsWith('i') && isGerund) ? rootWord.slice(0, -2) + 'y' :
        (rootWord.endsWith('ie') && suffix === 'is') ? rootWord.slice(0, -2) :
        ((rootWord.endsWith('ue') || rootWord.endsWith('che')) && suffix === 's') ? rootWord.slice(0, -2) :
        (rootWord.endsWith('e') && (isGerund || startsWithVowel)) ? rootWord.slice(0, -1) :
        rootWord;

    return base + suffix;
};

/**
 * Matches the capitalization of the original English text.
 */
export const matchCasing = (originalText, replacementWord) => {
    if (!originalText || typeof originalText !== 'string') return replacementWord;
    if (!replacementWord || typeof replacementWord !== 'string') return originalText;

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
