// src/core/text-processing.ts - Pure business logic for text processing
//
// This module provides pure functional text processing capabilities that integrate
// with the existing pipeline architecture. All functions return Result types for
// safe error handling and maintain functional purity.

//imports need fixed

import { 
  Result, 
  ok, 
  err, 
  map, 
  flatMap,
  fold,
  safe,
  maybeOf,
  maybeMap,
  findFirst,
  collectSomes
} from '../monads'

import {
  TextLine,
  TextProcessingPipeline,
  EntryGroup,
  ParsedLine,
  WordEntry,
  VerbEntry,
  PosAwareWordEntry,
  CustomTransformer,
  EntryTransformer
} from '../types/pipeline-types'

import { 
  TextBlock,
  groupIntoBlocks,
  textToLines,
  toRawLine
} from '../transformations/text-to-lines'

import { 
  processGroup,
  groupByDoubleNewline 
} from '../transformers/entry-groupers'

import {
  createSafeTextProcessor,
  createSafePipelineProcessor,
  safeProcessGroups
} from '../transformers/safe-transformers'

/**
 * Processing result with detailed metadata
 */
export interface ProcessingResult<T> {
  data: T[]
  metadata: {
    fileName: string
    entryCount: number
    successCount: number
    errorCount: number
    processingTime: number
  }
  errors: Array<{ index: number; error: Error }>
}

/**
 * Create a result builder for consistent result construction
 */
function createProcessingResult<T>(
  fileName: string,
  startTime: number
): (data: T[], errors: Array<{ index: number; error: Error }>) => ProcessingResult<T> {
  return function buildResult(data, errors) {
    return {
      data,
      metadata: {
        fileName,
        entryCount: data.length + errors.length,
        successCount: data.length,
        errorCount: errors.length,
        processingTime: Date.now() - startTime
      },
      errors
    }
  }
}

/**
 * Enhanced text analyzer with more detailed analysis
 */
export interface EnhancedTextAnalysis {
  entryCount: number
  lineCount: number
  languageTags: Map<string, number> // tag -> count
  partOfSpeechTags: Map<string, number> // pos -> count
  hasMultipleEntries: boolean
  averageLinesPerEntry: number
  hasUrls: boolean
  urlCount: number
}

/**
 * Create an enhanced text analyzer using existing parsers
 */
export function createEnhancedTextAnalyzer(
  lineParser: (line: TextLine) => ParsedLine
): (content: string) => Result<EnhancedTextAnalysis> {
  return function analyzeText(content: string): Result<EnhancedTextAnalysis> {
    return flatMap((lines: readonly TextLine[]) => {
      try {
        const languageTags = new Map<string, number>()
        const partOfSpeechTags = new Map<string, number>()
        let urlCount = 0
        
        // Analyze each line using the provided parser
        for (const line of lines) {
          const parsed = lineParser(line)
          
          // Count language tags
          if (parsed.language) {
            languageTags.set(
              parsed.language, 
              (languageTags.get(parsed.language) || 0) + 1
            )
          }
          
          // Count part of speech tags
          if (parsed.partOfSpeech) {
            for (const pos of parsed.partOfSpeech) {
              partOfSpeechTags.set(pos, (partOfSpeechTags.get(pos) || 0) + 1)
            }
          }
          
          // Count URLs
          if (parsed.isUrl) {
            urlCount++
          }
        }
        
        // Group into blocks to count entries
        const blocksResult = groupIntoBlocks(lines)
        
        return map((blocks: readonly TextBlock[]) => {
          const entryCount = blocks.length
          const nonEmptyLineCount = lines.filter(l => !l.isEmpty).length
          
          return {
            entryCount,
            lineCount: nonEmptyLineCount,
            languageTags,
            partOfSpeechTags,
            hasMultipleEntries: entryCount > 1,
            averageLinesPerEntry: entryCount > 0 
              ? Math.round(nonEmptyLineCount / entryCount) 
              : 0,
            hasUrls: urlCount > 0,
            urlCount
          }
        })(blocksResult)
      } catch (error) {
        return err(new Error(`Enhanced analysis failed: ${error instanceof Error ? error.message : String(error)}`))
      }
    })(textToLines(content))
  }
}

/**
 * Create a streaming processor for large files
 * Processes entries one at a time to avoid memory issues
 */
export function createStreamingProcessor<TEntry = WordEntry, TCustom = any>(
  pipeline: TextProcessingPipeline<TEntry, TCustom>
): (content: string, fileName: string, onEntry: (entry: TEntry | Record<string, TCustom>, index: number) => void) => Result<ProcessingResult<TEntry | Record<string, TCustom>>> {
  // Cast to base types for safe processor
  const baseTransformer = pipeline.entryTransformer as EntryTransformer<WordEntry>
  
  const safeProcessor = createSafePipelineProcessor(
    pipeline.textTransform,
    pipeline.lineParser,
    pipeline.entryGrouper,
    pipeline.wordNameExtractor,
    baseTransformer,
    pipeline.customTransformers
  )
  
  return function streamProcess(content, fileName, onEntry) {
    const startTime = Date.now()
    const resultBuilder = createProcessingResult<TEntry | Record<string, TCustom>>(fileName, startTime)
    
    const processResult = safeProcessor(content, fileName)
    
    return map((entries: any[]) => {
      const errors: Array<{ index: number; error: Error }> = []
      const typedEntries = entries as Array<TEntry | Record<string, TCustom>>
      
      // Stream each entry through the callback
      typedEntries.forEach((entry, index) => {
        try {
          onEntry(entry, index)
        } catch (error) {
          errors.push({
            index,
            error: error instanceof Error ? error : new Error(String(error))
          })
        }
      })
      
      return resultBuilder(typedEntries, errors)
    })(processResult)
  }
}

/**
 * Create a batch processor with progress tracking
 */
export interface BatchProgress {
  total: number
  processed: number
  errors: number
  currentFile?: string
}

export function createBatchProcessor<TEntry = WordEntry, TCustom = any>(
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  onProgress?: (progress: BatchProgress) => void
): (files: Array<{ path: string; content: string }>) => Result<Map<string, ProcessingResult<TEntry | Record<string, TCustom>>>> {
  const processor = createAdvancedProcessor(pipeline)
  
  return function processBatch(files) {
    const results = new Map<string, ProcessingResult<TEntry | Record<string, TCustom>>>()
    const progress: BatchProgress = {
      total: files.length,
      processed: 0,
      errors: 0
    }
    
    try {
      for (const file of files) {
        progress.currentFile = file.path
        
        const result = processor(file.content, file.path)
        
        fold(
          (error: Error) => {
            progress.errors++
            results.set(file.path, {
              data: [],
              metadata: {
                fileName: file.path,
                entryCount: 0,
                successCount: 0,
                errorCount: 1,
                processingTime: 0
              },
              errors: [{ index: 0, error }]
            })
          },
          (processingResult: ProcessingResult<TEntry | Record<string, TCustom>>) => {
            results.set(file.path, processingResult)
            if (processingResult.errors.length > 0) {
              progress.errors += processingResult.errors.length
            }
          }
        )(result)
        
        progress.processed++
        onProgress?.(progress)
      }
      
      return ok(results)
    } catch (error) {
      return err(new Error(`Batch processing failed: ${error instanceof Error ? error.message : String(error)}`))
    }
  }
}

/**
 * Create an advanced processor with all features
 */
export function createAdvancedProcessor<TEntry = WordEntry, TCustom = any>(
  pipeline: TextProcessingPipeline<TEntry, TCustom>
): (content: string, fileName: string) => Result<ProcessingResult<TEntry | Record<string, TCustom>>> {
  // Cast to base type for compatibility
  const baseTransformer = pipeline.entryTransformer as EntryTransformer<WordEntry>
  
  const safeProcessor = createSafePipelineProcessor(
    pipeline.textTransform,
    pipeline.lineParser,
    pipeline.entryGrouper,
    pipeline.wordNameExtractor,
    baseTransformer,
    pipeline.customTransformers
  )
  
  return function processAdvanced(content, fileName) {
    const startTime = Date.now()
    const resultBuilder = createProcessingResult<TEntry | Record<string, TCustom>>(fileName, startTime)
    
    return map((entries: any[]) => {
      // Cast entries to the expected type
      const typedEntries = entries as Array<TEntry | Record<string, TCustom>>
      return resultBuilder(typedEntries, [])
    })(safeProcessor(content, fileName))
  }
}

/**
 * Create a differential processor that tracks changes
 * Constrained to work with entries that have a name property
 */
export interface DiffResult<T> {
  added: T[]
  removed: T[]
  modified: T[]
  unchanged: T[]
}

export interface NamedEntry {
  name: string
  [key: string]: any
}

export function createDifferentialProcessor<TEntry extends NamedEntry = WordEntry>(
  pipeline: TextProcessingPipeline<TEntry, any>,
  compareKey: keyof TEntry = 'name' as keyof TEntry
): (oldContent: string, newContent: string, fileName: string) => Result<DiffResult<TEntry>> {
  const processor = createAdvancedProcessor<TEntry>(pipeline)
  
  return function processDiff(oldContent, newContent, fileName) {
    const oldResult = processor(oldContent, fileName)
    const newResult = processor(newContent, fileName)
    
    return flatMap((oldProcessing: ProcessingResult<TEntry | Record<string, any>>) => 
      map((newProcessing: ProcessingResult<TEntry | Record<string, any>>) => {
        // Filter to only TEntry types (not custom transformer results)
        const isEntry = (item: any): item is TEntry => 
          item && typeof item === 'object' && compareKey in item
        
        const oldEntries = oldProcessing.data.filter(isEntry)
        const newEntries = newProcessing.data.filter(isEntry)
        
        const oldMap = new Map(
          oldEntries.map(entry => [entry[compareKey], entry])
        )
        const newMap = new Map(
          newEntries.map(entry => [entry[compareKey], entry])
        )
        
        const diff: DiffResult<TEntry> = {
          added: [],
          removed: [],
          modified: [],
          unchanged: []
        }
        
        // Find added and modified entries
        for (const [key, newEntry] of newMap) {
          if (!oldMap.has(key)) {
            diff.added.push(newEntry)
          } else {
            const oldEntry = oldMap.get(key)!
            if (JSON.stringify(oldEntry) !== JSON.stringify(newEntry)) {
              diff.modified.push(newEntry)
            } else {
              diff.unchanged.push(newEntry)
            }
          }
        }
        
        // Find removed entries
        for (const [key, oldEntry] of oldMap) {
          if (!newMap.has(key)) {
            diff.removed.push(oldEntry)
          }
        }
        
        return diff
      })(newResult)
    )(oldResult)
  }
}

/**
 * Create a pipeline validator that checks pipeline configuration
 */
export interface PipelineValidation {
  isValid: boolean
  warnings: string[]
  errors: string[]
}

export function validatePipeline<TEntry = WordEntry, TCustom = any>(
  pipeline: TextProcessingPipeline<TEntry, TCustom>
): PipelineValidation {
  const validation: PipelineValidation = {
    isValid: true,
    warnings: [],
    errors: []
  }
  
  // Check required components
  if (!pipeline.textTransform) {
    validation.errors.push('Missing required textTransform function')
    validation.isValid = false
  }
  
  if (!pipeline.lineParser) {
    validation.errors.push('Missing required lineParser function')
    validation.isValid = false
  }
  
  if (!pipeline.entryGrouper) {
    validation.errors.push('Missing required entryGrouper function')
    validation.isValid = false
  }
  
  if (!pipeline.wordNameExtractor) {
    validation.errors.push('Missing required wordNameExtractor function')
    validation.isValid = false
  }
  
  if (!pipeline.entryTransformer) {
    validation.errors.push('Missing required entryTransformer function')
    validation.isValid = false
  }
  
  // Check for potential issues
  if (Object.keys(pipeline.customTransformers).length > 5) {
    validation.warnings.push('Pipeline has many custom transformers, which may impact performance')
  }
  
  // Test with sample data to ensure pipeline works
  try {
    const sampleText = "test [ME]\ntest line"
    const baseTransformer = pipeline.entryTransformer as EntryTransformer<WordEntry>
    
    const testProcessor = createSafePipelineProcessor(
      pipeline.textTransform,
      pipeline.lineParser,
      pipeline.entryGrouper,
      pipeline.wordNameExtractor,
      baseTransformer,
      pipeline.customTransformers
    )
    
    const testResult = testProcessor(sampleText, "test.txt")
    if (!testResult.isSuccess) {
      validation.warnings.push('Pipeline failed with sample data - check configuration')
    }
  } catch (error) {
    validation.warnings.push(`Pipeline test failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  
  return validation
}

/**
 * Type-safe processor creators with proper constraints
 */
export function createSimpleProcessor(
  pipeline: TextProcessingPipeline<WordEntry, any>
): (content: string, fileName: string) => Result<ProcessingResult<WordEntry | Record<string, any>>> {
  return createAdvancedProcessor<WordEntry>(pipeline)
}

export function createValidatedProcessor(
  pipeline: TextProcessingPipeline<WordEntry, any>
): (content: string, fileName: string) => Result<ProcessingResult<WordEntry | Record<string, any>>> {
  const validation = validatePipeline(pipeline)
  
  if (!validation.isValid) {
    throw new Error(`Invalid pipeline configuration:\n${validation.errors.join('\n')}`)
  }
  
  if (validation.warnings.length > 0) {
    console.warn(`Pipeline warnings:\n${validation.warnings.join('\n')}`)
  }
  
  return createAdvancedProcessor<WordEntry>(pipeline)
}

/**
 * Create a processor for POS-aware pipelines
 */
export function createPosAwareProcessor(
  pipeline: TextProcessingPipeline<VerbEntry | PosAwareWordEntry, any>
): (content: string, fileName: string) => Result<ProcessingResult<VerbEntry | PosAwareWordEntry | Record<string, any>>> {
  return createAdvancedProcessor<VerbEntry | PosAwareWordEntry>(pipeline)
}