// Pure transformation functions
export { replaceSpecialCharacters } from './text-transformers'
export { parseLanguageOrigin, parsePartOfSpeech } from './line-parsers'
export { processGroup, groupByDoubleNewline, groupByEntryPatterns } from './entry-groupers'
export { extractFromModernEnglish, extractFromLastLanguageTag } from './name-extractors'
export { transformToWordEntry } from './entry-transformers'
export * from './part-of-speech-transformers'
export { stanzaTransformer, compactTransformer } from '../custom/custom-transformers'