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

// Import the new POS-specific functions
import {
  createPosSpecificNameExtractor,
  createPosSpecificEntryTransformer,
  createPosAwareTransformer,
  getDetectedPartOfSpeech
} from '../transformers/pos-specific-transformers';

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

/**
 * NEW: Create a POS-aware pipeline that uses specialized transformers
 */
export function createPosAwarePipeline(overrides: Partial<TextProcessingPipeline> = {}): TextProcessingPipeline {
  return createPipeline({
    wordNameExtractor: createPosSpecificNameExtractor(),
    entryTransformer: createPosSpecificEntryTransformer(),
    ...overrides
  });
}

/**
 * Custom transformers for POS-specific analysis
 */
function verbSpecificTransformer(group: any) {
  const pos = getDetectedPartOfSpeech(group)
  
  if (pos !== 'verb') {
    return { notAVerb: true, detectedAs: pos }
  }
  
  const nameExtractor = createPosSpecificNameExtractor()
  const transformer = createPosSpecificEntryTransformer()
  const wordName = nameExtractor(group, 'unknown')
  const result = transformer(group, wordName) as any
  
  return {
    infinitive: result.name,
    conjugations: result.conjugations,
    etymology: result.etymology.map((e: any) => e.name)
  }
}

function nounSpecificTransformer(group: any) {
  const pos = getDetectedPartOfSpeech(group)
  
  if (pos !== 'noun') {
    return { notANoun: true, detectedAs: pos }
  }
  
  const nameExtractor = createPosSpecificNameExtractor()
  const transformer = createPosSpecificEntryTransformer()
  const wordName = nameExtractor(group, 'unknown')
  const result = transformer(group, wordName) as any
  
  return {
    noun: result.name,
    gender: result.gender,
    number: result.number,
    etymology: result.etymology.map((e: any) => e.name)
  }
}

function posAnalysisTransformer(group: any) {
  const posType = getDetectedPartOfSpeech(group)
  const nameExtractor = createPosSpecificNameExtractor()
  const wordName = nameExtractor(group, 'unknown')
  
  return {
    word: wordName,
    detectedPos: posType,
    hasConjugations: posType === 'verb',
    hasGender: posType === 'noun',
    hasDegrees: posType === 'adjective'
  }
}

// Custom transformer version that works with the CustomTransformer type
function posAwareCustomTransformer(group: any) {
  const posAwareTransformer = createPosAwareTransformer()
  return posAwareTransformer(group, 'unknown')
}

export const pipelines = {
  // Your existing pipelines
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
  
  lowercase: createPipeline({
    textTransform: (text) => text.toLowerCase(),
    wordNameExtractor: (group, fallback) => 
      extractFromModernEnglish(group, fallback).toLowerCase()
  }),

  // NEW: POS-aware pipelines
  posAware: createPosAwarePipeline(),
  
  posAnalysis: createPipeline({
    customTransformers: {
      posAnalysis: posAnalysisTransformer
    }
  }),
  
  verbFocus: createPosAwarePipeline({
    customTransformers: {
      verbDetails: verbSpecificTransformer,
      standard: posAwareCustomTransformer
    }
  }),
  
  nounFocus: createPosAwarePipeline({
    customTransformers: {
      nounDetails: nounSpecificTransformer,
      standard: posAwareCustomTransformer
    }
  })
};