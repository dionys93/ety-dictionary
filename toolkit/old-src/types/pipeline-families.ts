// src/types/pipeline-families.ts

import { 
  TextTransformer, 
  LineParser, 
  EntryGrouper, 
  WordNameExtractor,
  EntryGroup,
  CustomTransformer
} from './pipeline-types'

// Base types for pipeline outputs
export interface BasicWordEntry {
  name: string
  etymology: Array<{
    name: string
    origin: string
    "part-of-speech"?: string[]
  }>
  sources: string[]
}

export interface PosAwareWordEntry {
  // Use 'infinitive' for verbs, 'name' for others
  infinitive?: string
  name?: string
  etymology: Array<{
    name: string
    origin: string
    "part-of-speech"?: string[]
    conjugations?: {
      thirdPerson?: string
      pastTense?: string
      progressive?: string
    }
    gender?: 'masculine' | 'feminine' | 'neuter'
    number?: 'singular' | 'plural'
    degrees?: {
      positive?: string
      comparative?: string
      superlative?: string
    }
  }>
  sources: string[]
}

// Pipeline family definitions
export type BasicEntryTransformer = (group: EntryGroup, wordName: string) => BasicWordEntry
export type PosAwareEntryTransformer = (group: EntryGroup, wordName: string) => PosAwareWordEntry

// Pipeline configurations for each family
export interface BasicPipelineConfig {
  textTransform: TextTransformer
  lineParser: LineParser
  entryGrouper: EntryGrouper
  wordNameExtractor: WordNameExtractor
  entryTransformer: BasicEntryTransformer
  customTransformers: Record<string, CustomTransformer>
}

export interface PosAwarePipelineConfig {
  textTransform: TextTransformer
  lineParser: LineParser
  entryGrouper: EntryGrouper
  wordNameExtractor: WordNameExtractor
  entryTransformer: PosAwareEntryTransformer
  customTransformers: Record<string, CustomTransformer>
}

// Union type for all pipeline configs
export type PipelineConfig = BasicPipelineConfig | PosAwarePipelineConfig

// Type guards to distinguish pipeline families
export function isBasicPipeline(config: PipelineConfig): config is BasicPipelineConfig {
  // We'll implement a simple check based on the transformer function
  // In practice, you might want to add a discriminator property
  const result = config.entryTransformer({
    etymologyLines: [],
    sourceLines: []
  }, 'test')
  
  return 'name' in result && !('infinitive' in result)
}

export function isPosAwarePipeline(config: PipelineConfig): config is PosAwarePipelineConfig {
  return !isBasicPipeline(config)
}