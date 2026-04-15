// src/pipeline/family-factories.ts

import {
  BasicPipelineConfig,
  PosAwarePipelineConfig,
  BasicEntryTransformer,
  PosAwareEntryTransformer
} from '../types/pipeline-families'
import { 
  replaceSpecialCharacters,
  parsePartOfSpeech,
  groupByEntryPatterns,
  extractFromLastLanguageTag,
  transformToWordEntry,
  createPosNameExtractor,
  createPosEntryTransformer
} from '../'

/**
 * Creates a basic pipeline configuration with standard word entry output
 */
export function createBasicPipelineConfig(
  overrides: Partial<BasicPipelineConfig> = {}
): BasicPipelineConfig {
  const defaultConfig: BasicPipelineConfig = {
    textTransform: replaceSpecialCharacters,
    lineParser: parsePartOfSpeech,
    entryGrouper: groupByEntryPatterns(parsePartOfSpeech),
    wordNameExtractor: extractFromLastLanguageTag,
    entryTransformer: transformToWordEntry as BasicEntryTransformer,
    customTransformers: {}
  }
  
  // Handle lineParser override properly
  const lineParser = overrides.lineParser || defaultConfig.lineParser
  const entryGrouper = overrides.entryGrouper || groupByEntryPatterns(lineParser)
  
  return {
    ...defaultConfig,
    ...overrides,
    entryGrouper
  }
}

/**
 * Creates a POS-aware pipeline configuration with enhanced output
 */
export function createPosAwarePipelineConfig(
  overrides: Partial<PosAwarePipelineConfig> = {}
): PosAwarePipelineConfig {
  const defaultConfig: PosAwarePipelineConfig = {
    textTransform: replaceSpecialCharacters,
    lineParser: parsePartOfSpeech,
    entryGrouper: groupByEntryPatterns(parsePartOfSpeech),
    wordNameExtractor: createPosNameExtractor(),
    entryTransformer: createPosEntryTransformer() as PosAwareEntryTransformer,
    customTransformers: {}
  }
  
  // Handle lineParser override properly
  const lineParser = overrides.lineParser || defaultConfig.lineParser
  const entryGrouper = overrides.entryGrouper || groupByEntryPatterns(lineParser)
  
  return {
    ...defaultConfig,
    ...overrides,
    entryGrouper
  }
}