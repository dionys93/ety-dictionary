// // src/pipeline/pipeline-factory.ts
// import { TextProcessingPipeline } from '../types/pipeline-types';
// import { replaceSpecialCharacters } from '../transformers/text-transformers';
// import { parsePartOfSpeech } from '../transformers/line-parsers';
// import { groupByDoubleNewline, groupByEntryPatterns } from '../transformers/entry-groupers';
// import { extractFromLastLanguageTag, extractFromModernEnglish } from '../transformers/name-extractors';
// import { transformToWordEntry } from '../transformers/entry-transformers';
// import { stanzaTransformer, compactTransformer } from '../custom/custom-transformers';

// export const createDefaultPipeline = (): TextProcessingPipeline => ({
//   textTransform: replaceSpecialCharacters,
//   lineParser: parsePartOfSpeech,
//   entryGrouper: groupByEntryPatterns(parsePartOfSpeech),
//   wordNameExtractor: extractFromLastLanguageTag,
//   entryTransformer: transformToWordEntry,
//   customTransformers: {}
// });

// export const createPipeline = (overrides: Partial<TextProcessingPipeline>): TextProcessingPipeline => {
//   const defaultPipeline = createDefaultPipeline();
  
//   // If lineParser is overridden, we need to update entryGrouper with the new parser
//   const lineParser = overrides.lineParser || defaultPipeline.lineParser;
//   const entryGrouper = overrides.entryGrouper || groupByDoubleNewline(lineParser);
  
//   return {
//     ...defaultPipeline,
//     ...overrides,
//     entryGrouper, // Ensure entryGrouper uses the correct lineParser
//   };
// };

// export const pipelines = {
//   standard: createPipeline({}),
  
//   stanza: createPipeline({
//     customTransformers: {
//       stanza: stanzaTransformer
//     }
//   }),
  
//   compact: createPipeline({
//     customTransformers: {
//       compact: compactTransformer
//     }
//   }),
  
//   multi: createPipeline({
//     customTransformers: {
//       stanza: stanzaTransformer,
//       compact: compactTransformer,
//       standard: (group) => transformToWordEntry(group, 
//         extractFromModernEnglish(group, 'unknown'))
//     }
//   }),
  
//   // Example of a completely custom pipeline
//   lowercase: createPipeline({
//     textTransform: (text) => text.toLowerCase(),
//     wordNameExtractor: (group, fallback) => 
//       extractFromModernEnglish(group, fallback).toLowerCase()
//   })
// };

// src/pipeline/pipeline-factory.ts
import { TextProcessingPipeline } from '../types/pipeline-types';
import { replaceSpecialCharacters } from '../transformers/text-transformers';
import { parsePartOfSpeech } from '../transformers/line-parsers';
import { groupByDoubleNewline, groupByEntryPatterns } from '../transformers/entry-groupers';
import { extractFromLastLanguageTag, extractFromModernEnglish } from '../transformers/name-extractors';
import { transformToWordEntry } from '../transformers/entry-transformers';
import { stanzaTransformer, compactTransformer } from '../custom/custom-transformers';

export const createDefaultPipeline = (): TextProcessingPipeline => ({
  textTransform: replaceSpecialCharacters,
  lineParser: parsePartOfSpeech,
  entryGrouper: groupByEntryPatterns(parsePartOfSpeech),
  wordNameExtractor: extractFromLastLanguageTag,
  entryTransformer: transformToWordEntry,
  customTransformers: {}
});

export const createPipeline = (overrides: Partial<TextProcessingPipeline>): TextProcessingPipeline => {
  const defaultPipeline = createDefaultPipeline();
  
  // If lineParser is overridden, we need to update entryGrouper with the new parser
  const lineParser = overrides.lineParser || defaultPipeline.lineParser;
  const entryGrouper = overrides.entryGrouper || groupByDoubleNewline(lineParser);
  
  return {
    ...defaultPipeline,
    ...overrides,
    entryGrouper, // Ensure entryGrouper uses the correct lineParser
  };
};

export const pipelines = {
  standard: createPipeline({}),
  
  stanza: createPipeline({
    customTransformers: {
      stanza: stanzaTransformer
    }
  }),
  
  compact: createPipeline({
    customTransformers: {
      compact: compactTransformer
    }
  }),
  
  multi: createPipeline({
    customTransformers: {
      stanza: stanzaTransformer,
      compact: compactTransformer,
      standard: (group) => transformToWordEntry(group, 
        extractFromModernEnglish(group, 'unknown'))
    }
  }),
  
  // Example of a completely custom pipeline
  lowercase: createPipeline({
    textTransform: (text) => text.toLowerCase(),
    wordNameExtractor: (group, fallback) => 
      extractFromModernEnglish(group, fallback).toLowerCase()
  })
};