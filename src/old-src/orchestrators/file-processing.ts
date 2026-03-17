// src/orchestrators/file-processing.ts - Functional composition layer
//
// This module provides orchestration functions that compose pure I/O operations
// with business logic processors. It follows a functional programming approach
// where each orchestrator is built by composing smaller, focused functions.

import * as path from 'path'
import * as fs from 'fs'
import { 
  Result, 
  ok, 
  err, 
  map, 
  flatMap, 
  fold,
  safe
} from '../monads'

import {
  FileReader,
  FileWriter,
  JsonWriter,
  DirectoryReader,
  PathChecker,
  DirectoryCreator
} from '../io/file-operations'

import { 
  ProcessingResult,
  createAdvancedProcessor,
  createStreamingProcessor,
  createBatchProcessor,
  BatchProgress
} from '../core/text-processing'

import { TextProcessingPipeline } from '../types/pipeline-types'

// Import the correct convertText function
import { convertText } from '../processors/file-processor'

/**
 * Type definitions for processors and orchestrators
 */
export type FileProcessor = (sourcePath: string, targetPath: string) => Result<void>
export type DirectoryProcessor = (sourceDir: string, targetDir: string) => Result<ProcessingSummary>
export type BatchFileProcessor = (files: string[], targetDir: string) => Result<BatchProcessingSummary>

/**
 * Processing summary for directory operations
 */
export interface ProcessingSummary {
  totalFiles: number
  successfulFiles: number
  failedFiles: number
  errors: Array<{ file: string; error: Error }>
  processingTime: number
}

/**
 * Batch processing summary with detailed results
 */
export interface BatchProcessingSummary extends ProcessingSummary {
  results: Map<string, ProcessingResult<any>>
}

/**
 * Create a simple file processor that reads, processes, and writes
 * FIXED: Now uses the correct convertText function that properly splits entries
 */
export function createFileProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  writer: JsonWriter
): FileProcessor {
  // Use the correct convertText that handles double-newline splitting
  const converter = convertText(pipeline)
  
  return function processFile(sourcePath: string, targetPath: string): Result<void> {
    return flatMap((content: string) => {
      const fileName = path.basename(sourcePath)
      const jsonData = converter(content, fileName)
      return writer(targetPath, jsonData)
    })(reader(sourcePath))
  }
}

/**
 * Create a streaming file processor for large files
 */
export function createStreamingFileProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  writer: FileWriter
): (sourcePath: string, targetPath: string, onEntry?: (entry: TEntry | Record<string, TCustom>, index: number) => void) => Result<void> {
  const streamProcessor = createStreamingProcessor<TEntry, TCustom>(pipeline)
  
  return function processFileStreaming(sourcePath, targetPath, onEntry) {
    return flatMap((content: string) => {
      const entries: Array<TEntry | Record<string, TCustom>> = []
      
      // Default onEntry handler that collects entries
      const entryHandler = onEntry || ((entry, _index) => {
        entries.push(entry)
      })
      
      return flatMap((result: ProcessingResult<TEntry | Record<string, TCustom>>) => {
        // If no custom handler, write collected entries
        if (!onEntry) {
          const json = JSON.stringify(entries, null, 2)
          return writer(targetPath, json)
        }
        
        // Otherwise, assume the custom handler dealt with output
        return ok(undefined)
      })(streamProcessor(content, path.basename(sourcePath), entryHandler))
    })(reader(sourcePath))
  }
}

/**
 * Create a directory processor that handles all files in a directory
 */
export function createDirectoryProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  writer: JsonWriter,
  dirReader: DirectoryReader,
  dirCreator: DirectoryCreator,
  pathChecker: PathChecker
): DirectoryProcessor {
  const fileProcessor = createFileProcessor(reader, pipeline, writer)
  
  return function processDirectory(sourceDir: string, targetDir: string): Result<ProcessingSummary> {
    const startTime = Date.now()
    const summary: ProcessingSummary = {
      totalFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      errors: [],
      processingTime: 0
    }
    
    // Ensure target directory exists
    const createDirResult = dirCreator(targetDir)
    if (!createDirResult.isSuccess) {
      return err(createDirResult.error!)
    }
    
    // Process directory recursively
    function processRecursive(currentSourceDir: string, currentTargetDir: string): Result<void> {
      return flatMap((entries: fs.Dirent[]) => {
        for (const entry of entries) {
          const sourcePath = path.join(currentSourceDir, entry.name)
          const targetPath = path.join(currentTargetDir, entry.name)
          
          if (entry.isDirectory()) {
            // Recursively process subdirectories
            const subDirResult = dirCreator(targetPath)
            if (!subDirResult.isSuccess) {
              return err(subDirResult.error!)
            }
            
            const recursiveResult = processRecursive(sourcePath, targetPath)
            if (!recursiveResult.isSuccess) {
              return err(recursiveResult.error!)
            }
          } else if (entry.name.endsWith('.txt')) {
            // Process text files
            summary.totalFiles++
            const jsonPath = targetPath.replace('.txt', '.json')
            const fileResult = fileProcessor(sourcePath, jsonPath)
            
            if (fileResult.isSuccess) {
              summary.successfulFiles++
            } else {
              summary.failedFiles++
              summary.errors.push({
                file: sourcePath,
                error: fileResult.error!
              })
            }
          }
        }
        
        return ok(undefined)
      })(dirReader(currentSourceDir))
    }
    
    return map(() => {
      summary.processingTime = Date.now() - startTime
      return summary
    })(processRecursive(sourceDir, targetDir))
  }
}

/**
 * Create a batch processor with progress tracking
 */
export function createBatchFileProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  writer: JsonWriter,
  onProgress?: (progress: BatchProgress) => void
): BatchFileProcessor {
  const batchProcessor = createBatchProcessor(pipeline, onProgress)
  
  return function processBatch(files: string[], targetDir: string): Result<BatchProcessingSummary> {
    const startTime = Date.now()
    
    // Read all files first
    const fileContents: Array<{ path: string; content: string }> = []
    const readErrors: Array<{ file: string; error: Error }> = []
    
    for (const filePath of files) {
      const readResult = reader(filePath)
      if (readResult.isSuccess) {
        fileContents.push({
          path: filePath,
          content: readResult.value!
        })
      } else {
        readErrors.push({
          file: filePath,
          error: readResult.error!
        })
      }
    }
    
    // Process all files
    return flatMap((results: Map<string, ProcessingResult<TEntry | Record<string, TCustom>>>) => {
      // Write results
      const writeErrors: Array<{ file: string; error: Error }> = []
      let successfulWrites = 0
      
      for (const [filePath, result] of results) {
        const fileName = path.basename(filePath, '.txt')
        const targetPath = path.join(targetDir, `${fileName}.json`)
        const writeResult = writer(targetPath, result.data)
        
        if (writeResult.isSuccess) {
          successfulWrites++
        } else {
          writeErrors.push({
            file: targetPath,
            error: writeResult.error!
          })
        }
      }
      
      const summary: BatchProcessingSummary = {
        totalFiles: files.length,
        successfulFiles: successfulWrites,
        failedFiles: readErrors.length + writeErrors.length,
        errors: [...readErrors, ...writeErrors],
        processingTime: Date.now() - startTime,
        results
      }
      
      return ok(summary)
    })(batchProcessor(fileContents))
  }
}

/**
 * Create a conditional processor that only processes files meeting criteria
 */
export function createConditionalProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  writer: JsonWriter,
  shouldProcess: (filePath: string, content?: string) => boolean
): FileProcessor {
  const baseProcessor = createFileProcessor(reader, pipeline, writer)
  
  return function processConditionally(sourcePath: string, targetPath: string): Result<void> {
    // First check with just the path
    if (!shouldProcess(sourcePath)) {
      return ok(undefined) // Skip this file
    }
    
    // If more detailed check needed, read the content
    return flatMap((content: string) => {
      if (!shouldProcess(sourcePath, content)) {
        return ok(undefined) // Skip after content check
      }
      
      // Process normally
      return baseProcessor(sourcePath, targetPath)
    })(reader(sourcePath))
  }
}

/**
 * Create a transforming processor that modifies the output path
 */
export function createTransformingProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  writer: JsonWriter,
  transformPath: (sourcePath: string) => string
): FileProcessor {
  const baseProcessor = createFileProcessor(reader, pipeline, writer)
  
  return function processWithTransform(sourcePath: string, _targetPath: string): Result<void> {
    const actualTargetPath = transformPath(sourcePath)
    return baseProcessor(sourcePath, actualTargetPath)
  }
}

/**
 * Create a pipeline processor that chains multiple pipelines
 */
export function createPipelineChainProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipelines: Array<{
    pipeline: TextProcessingPipeline<TEntry, TCustom>
    outputSuffix: string
  }>,
  writer: JsonWriter
): (sourcePath: string, targetDir: string) => Result<void[]> {
  return function processWithMultiplePipelines(sourcePath: string, targetDir: string): Result<void[]> {
    const baseName = path.basename(sourcePath, '.txt')
    const results: Result<void>[] = []
    
    for (const { pipeline, outputSuffix } of pipelines) {
      const processor = createFileProcessor(reader, pipeline, writer)
      const targetPath = path.join(targetDir, `${baseName}${outputSuffix}.json`)
      results.push(processor(sourcePath, targetPath))
    }
    
    // Combine all results
    const successes: void[] = []
    const errors: Error[] = []
    
    for (const result of results) {
      if (result.isSuccess) {
        successes.push(result.value!)
      } else {
        errors.push(result.error!)
      }
    }
    
    if (errors.length > 0) {
      return err(new Error(`Pipeline chain failed: ${errors.map(e => e.message).join('; ')}`))
    }
    
    return ok(successes)
  }
}

/**
 * Create a validating processor that checks output before writing
 */
export function createValidatingProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  writer: JsonWriter,
  validator: (data: Array<TEntry | Record<string, TCustom>>) => Result<void>
): FileProcessor {
  // Use the correct convertText
  const converter = convertText(pipeline)
  
  return function processWithValidation(sourcePath: string, targetPath: string): Result<void> {
    return flatMap((content: string) => {
      const fileName = path.basename(sourcePath)
      const jsonData = converter(content, fileName)
      
      return flatMap(() => writer(targetPath, jsonData))(validator(jsonData))
    })(reader(sourcePath))
  }
}

/**
 * Create an alphabetical directory processor that only processes single-character directories
 * at the root level, similar to lang_text_to_histories.ts
 */
export function createAlphabeticalDirectoryProcessor<TEntry = any, TCustom = any>(
  reader: FileReader,
  pipeline: TextProcessingPipeline<TEntry, TCustom>,
  writer: JsonWriter,
  dirReader: DirectoryReader,
  dirCreator: DirectoryCreator,
  pathChecker: PathChecker
): DirectoryProcessor {
  const fileProcessor = createFileProcessor(reader, pipeline, writer)
  
  // Type for single-character directory names
  type AlphabeticalDir = string & { readonly __brand: 'AlphabeticalDir' }
  
  // Check if a directory name is valid single-character alphabetical
  function isAlphabeticalDir(dirName: string): dirName is AlphabeticalDir {
    return dirName.length === 1 && /^[a-zA-Z]$/.test(dirName)
  }
  
  return function processDirectory(sourceDir: string, targetDir: string): Result<ProcessingSummary> {
    const startTime = Date.now()
    const summary: ProcessingSummary = {
      totalFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      errors: [],
      processingTime: 0
    }
    
    // Ensure target directory exists
    const createDirResult = dirCreator(targetDir)
    if (!createDirResult.isSuccess) {
      return err(createDirResult.error!)
    }
    
    // Process directory recursively with alphabetical filtering
    function processRecursive(
      currentSourceDir: string, 
      currentTargetDir: string,
      depth: number = 0
    ): Result<void> {
      return flatMap((entries: fs.Dirent[]) => {
        for (const entry of entries) {
          const sourcePath = path.join(currentSourceDir, entry.name)
          const targetPath = path.join(currentTargetDir, entry.name)
          
          if (entry.isDirectory()) {
            // At root level (depth 0), only process single-character directories
            if (depth === 0 && !isAlphabeticalDir(entry.name)) {
              console.log(`Skipping non-alphabetical directory: ${entry.name}`)
              continue
            }
            
            // Recursively process subdirectories
            const subDirResult = dirCreator(targetPath)
            if (!subDirResult.isSuccess) {
              return err(subDirResult.error!)
            }
            
            const recursiveResult = processRecursive(sourcePath, targetPath, depth + 1)
            if (!recursiveResult.isSuccess) {
              return err(recursiveResult.error!)
            }
          } else if (entry.name.endsWith('.txt')) {
            // Process text files
            summary.totalFiles++
            const jsonPath = targetPath.replace('.txt', '.json')
            const fileResult = fileProcessor(sourcePath, jsonPath)
            
            if (fileResult.isSuccess) {
              summary.successfulFiles++
            } else {
              summary.failedFiles++
              summary.errors.push({
                file: sourcePath,
                error: fileResult.error!
              })
            }
          }
        }
        
        return ok(undefined)
      })(dirReader(currentSourceDir))
    }
    
    return map(() => {
      summary.processingTime = Date.now() - startTime
      return summary
    })(processRecursive(sourceDir, targetDir, 0))
  }
}

/**
 * Export commonly used orchestrator configurations
 */
export { createFileProcessor as createSimpleOrchestrator }
export { createDirectoryProcessor as createRecursiveOrchestrator }
export { createBatchFileProcessor as createBatchOrchestrator }
export { createStreamingFileProcessor as createStreamOrchestrator }