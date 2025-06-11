// src/index.ts

// Types
export * from './types/pipeline-types';
export * from './types/text';
export * from './types/part-of-speech-types'

// Monads
export * from './monads';

// Config
export { languageMap } from './config/language-map';
export { posMap } from './config/pos-map';

// Utils
export { ensureDirExists } from './utils/file-utils';
export * from './utils/console-utils';

// Transformers
export { replaceSpecialCharacters } from './transformers/text-transformers';
export { parseLanguageOrigin, parsePartOfSpeech } from './transformers/line-parsers';
export { processGroup, groupByDoubleNewline, groupByEntryPatterns } from './transformers/entry-groupers';
export { extractFromModernEnglish, extractFromLastLanguageTag } from './transformers/name-extractors';
export { transformToWordEntry } from './transformers/entry-transformers';
export * from './transformers/part-of-speech-transformers';

// Custom transformers
export { stanzaTransformer, compactTransformer } from './custom/custom-transformers';

// Pipeline
export { createDefaultPipeline, createPipeline, createPosAwarePipeline, pipelines } from './pipeline/pipeline-factory';

// Processors
export { convertText, processFile } from './processors/file-processor';
export { processDirectory } from './processors/directory-processor';

// Transformations
export * from './transformations/text-to-lines';