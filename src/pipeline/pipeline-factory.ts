// // src/pipeline/pipeline-factory.ts
// import { TextProcessingPipeline } from '../types/pipeline-types';
// import { replaceSpecialCharacters } from '../transformers/text-transformers';
// import { parsePartOfSpeech } from '../transformers/line-parsers';
// import { groupByDoubleNewline, groupByEntryPatterns } from '../transformers/entry-groupers';
// import { extractFromLastLanguageTag, extractFromModernEnglish } from '../transformers/name-extractors';
// import { transformToWordEntry } from '../transformers/entry-transformers';
// import { stanzaTransformer, compactTransformer } from '../custom/custom-transformers';

// // Import the new POS-specific functions
// import {
//   createPosSpecificNameExtractor,
//   createPosSpecificEntryTransformer,
//   createPosAwareTransformer,
//   getDetectedPartOfSpeech
// } from '../transformers/part-of-speech-transformers';

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

// /**
//  * NEW: Create a POS-aware pipeline that uses specialized transformers
//  */
// export function createPosAwarePipeline(overrides: Partial<TextProcessingPipeline> = {}): TextProcessingPipeline {
//   return createPipeline({
//     wordNameExtractor: createPosSpecificNameExtractor(),
//     entryTransformer: createPosSpecificEntryTransformer(),
//     ...overrides
//   });
// }

// function posAnalysisTransformer(group: any) {
//   const posType = getDetectedPartOfSpeech(group)
//   const nameExtractor = createPosSpecificNameExtractor()
//   const wordName = nameExtractor(group, 'unknown')
  
//   return {
//     word: wordName,
//     detectedPos: posType,
//     hasConjugations: posType === 'verb',
//     hasGender: posType === 'noun',
//     hasDegrees: posType === 'adjective'
//   }
// }

// // Custom transformer version that works with the CustomTransformer type
// function posAwareCustomTransformer(group: any) {
//   const posAwareTransformer = createPosAwareTransformer()
//   return posAwareTransformer(group, 'unknown')
// }

// export const pipelines = {
//   // Your existing pipelines
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
  
//   lowercase: createPipeline({
//     textTransform: (text) => text.toLowerCase(),
//     wordNameExtractor: (group, fallback) => 
//       extractFromModernEnglish(group, fallback).toLowerCase()
//   }),

//   // NEW: POS-aware pipelines
//   posAware: createPosAwarePipeline(),
  
//   posAnalysis: createPipeline({
//     customTransformers: {
//       posAnalysis: posAnalysisTransformer
//     }
//   }),
// };

// src/pipeline/pipeline-factory.ts
import { 
  TextProcessingPipeline, 
  BasicPipeline, 
  PosAwarePipeline,
  WordEntry,
  VerbEntry,
  PosAwareWordEntry
} from '../types/pipeline-types'
import { replaceSpecialCharacters } from '../transformers/text-transformers'
import { parsePartOfSpeech } from '../transformers/line-parsers'
import { groupByDoubleNewline, groupByEntryPatterns } from '../transformers/entry-groupers'
import { extractFromLastLanguageTag, extractFromModernEnglish } from '../transformers/name-extractors'
import { transformToWordEntry } from '../transformers/entry-transformers'
import { stanzaTransformer, compactTransformer } from '../custom/custom-transformers'
import {
  createPosSpecificNameExtractor,
  createPosSpecificEntryTransformer,
  createPosAwareTransformer,
  createPosAnalysisTransformer,
  getDetectedPartOfSpeech
} from '../transformers/part-of-speech-transformers'

// Create a basic pipeline that returns WordEntry
export function createDefaultPipeline(): BasicPipeline {
  return {
    textTransform: replaceSpecialCharacters,
    lineParser: parsePartOfSpeech,
    entryGrouper: groupByEntryPatterns(parsePartOfSpeech),
    wordNameExtractor: extractFromLastLanguageTag,
    entryTransformer: transformToWordEntry,
    customTransformers: {}
  }
}

// Generic pipeline creator with proper typing
export function createPipeline<TEntry = WordEntry, TCustom = any>(
  overrides: Partial<TextProcessingPipeline<TEntry, TCustom>> = {}
): TextProcessingPipeline<TEntry, TCustom> {
  const defaultPipeline = createDefaultPipeline()
  
  const lineParser = overrides.lineParser || defaultPipeline.lineParser
  const entryGrouper = overrides.entryGrouper || groupByDoubleNewline(lineParser)
  
  return {
    ...defaultPipeline,
    ...overrides,
    entryGrouper,
  } as TextProcessingPipeline<TEntry, TCustom>
}

// Create a POS-aware pipeline that returns VerbEntry | PosAwareWordEntry
export function createPosAwarePipeline(
  overrides: Partial<PosAwarePipeline> = {}
): PosAwarePipeline {
  return createPipeline<VerbEntry | PosAwareWordEntry>({
    wordNameExtractor: createPosSpecificNameExtractor(),
    entryTransformer: createPosSpecificEntryTransformer(),
    ...overrides
  })
}

// Define pipeline configurations with explicit types
export const pipelines = {
  // Basic pipelines that return WordEntry
  standard: createPipeline<WordEntry>(),
  
  stanza: createPipeline<WordEntry>({
    customTransformers: {
      stanza: stanzaTransformer
    }
  }),
  
  compact: createPipeline<WordEntry>({
    customTransformers: {
      compact: compactTransformer
    }
  }),
  
  multi: createPipeline<WordEntry>({
    customTransformers: {
      stanza: stanzaTransformer,
      compact: compactTransformer,
      standard: (group) => transformToWordEntry(group, 
        extractFromModernEnglish(group, 'unknown'))
    }
  }),
  
  lowercase: createPipeline<WordEntry>({
    textTransform: (text) => text.toLowerCase(),
    wordNameExtractor: (group, fallback) => 
      extractFromModernEnglish(group, fallback).toLowerCase()
  }),

  // POS-aware pipelines with different return types
  posAware: createPosAwarePipeline(),
  
  posAnalysis: createPipeline({
    customTransformers: {
      posAnalysis: createPosAnalysisTransformer()
    }
  }),
} as const

// Type helper to get the output type of a specific pipeline
export type PipelineOutputType<K extends keyof typeof pipelines> = 
  K extends 'posAware' ? (VerbEntry | PosAwareWordEntry)[] :
  K extends 'posAnalysis' ? Array<{ posAnalysis: ReturnType<ReturnType<typeof createPosAnalysisTransformer>> }> :
  K extends 'stanza' ? Array<{ stanza: any }> :
  K extends 'compact' ? Array<{ compact: any }> :
  K extends 'multi' ? Array<{ stanza: any, compact: any, standard: WordEntry }> :
  WordEntry[]
