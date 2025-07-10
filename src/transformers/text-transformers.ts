// src/transformers/text-transformers.ts
export const replaceSpecialCharacters = (text: string): string => {
    return text.replace(/ng/g, "ng");
};