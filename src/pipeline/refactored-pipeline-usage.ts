// src/pipeline/refactored-pipeline-usage.ts
/**
 * Examples showing how to use the three main refactors together:
 * 1. Result monad consolidation
 * 2. Pipeline builder pattern 
 * 3. Branded types for type safety
 */

import { Result, ok, err, map, flatMap, fold } from '../monads'
import { createPipelineBuilder, createSimplePipeline } from './pipeline-builder'
import { createDefaultPipeline } from './pipeline-factory'
import { 
  safeTextTransform, 
  safeLineParser, 
  createSafePipelineProcessor 
} from '../transformers/safe-transformers'
import { 
  FilePath, 
  PipelineName, 
  WordName,
  safeCreateFilePath,
  safeCreatePipelineName,
  convertToEnhancedWordEntry 
} from '../types/branded-types'
import { replaceSpecialCharacters } from '../transformers/text-transformers'
import { parsePartOfSpeech } from '../transformers/line-parsers'
import { groupByEntryPatterns } from '../transformers/entry-groupers'
import { extractFromLastLanguageTag } from '../transformers/name-extractors'
import { transformToWordEntry } from '../transformers/entry-transformers'
import { stanzaTransformer, compactTransformer } from '../custom/custom-transformers'

/**
 * Example 1: Creating a safe pipeline using the builder pattern
 */
export const createSafeEtymologyPipeline = (name: string): Result<any> => {
  const defaultPipeline = createDefaultPipeline()
  
  return flatMap((pipelineName: PipelineName) => {
    const builder = createPipelineBuilder(defaultPipeline)
      .withSafeDefaults()
    
    // Add custom transformers safely
    const withStanzaResult = builder.withCustomTransformer('stanza', stanzaTransformer)
    
    return flatMap((builderWithStanza: any) => {
      const withCompactResult = builderWithStanza.withCustomTransformer('compact', compactTransformer)
      
      return flatMap((finalBuilder: any) => {
        return finalBuilder.buildSafe()
      })(withCompactResult)
    })(withStanzaResult)
  })(safeCreatePipelineName(name))
}

/**
 * Example 2: Safe file processing with branded types
 */
export const processSingleFileWithSafety = (
  filePath: string, 
  pipelineName: string
): Result<any[]> => {
  return flatMap((safeFilePath: FilePath) => {
    return flatMap((pipeline: any) => {
      // Read file safely
      const fs = require('fs')
      try {
        const content = fs.readFileSync(safeFilePath, 'utf8')
        const fileName = require('path').basename(safeFilePath)
        
        // Debug: Log the content type and length
        console.log(`Debug: Processing file ${fileName}, content type: ${typeof content}, length: ${content.length}`)
        
        // Create safe processor
        const safeProcessor = createSafePipelineProcessor(
          pipeline.textTransform,
          pipeline.lineParser, 
          pipeline.entryGrouper,
          pipeline.wordNameExtractor,
          pipeline.entryTransformer,
          pipeline.customTransformers
        )
        
        // Process with full safety
        return safeProcessor(content, fileName)
      } catch (error) {
        return err(new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`))
      }
    })(createSafeEtymologyPipeline(pipelineName))
  })(safeCreateFilePath(filePath))
}

/**
 * Example 3: Batch processing multiple files with error collection
 */
export const processBatchOfFiles = (
  filePaths: string[],
  pipelineName: string
): Result<{ successes: any[], errors: Error[], partialResults: any[] }> => {
  return flatMap((pipeline: any) => {
    const successes: any[] = []
    const errors: Error[] = []
    const partialResults: any[] = []
    
    for (const filePath of filePaths) {
      const fileResult = processSingleFileWithSafety(filePath, pipelineName)
      
      fold(
        (error: Error) => {
          errors.push(error)
        },
        (results: any[]) => {
          successes.push(...results)
          partialResults.push({ filePath, results })
        }
      )(fileResult)
    }
    
    return ok({ successes, errors, partialResults })
  })(createSafeEtymologyPipeline(pipelineName))
}

/**
 * Example 4: Pipeline testing and validation
 */
export const testPipelineWithSampleData = (pipelineName: string): Result<string> => {
  const sampleLines = [
    { content: 'aquarius [L]', lineNumber: 1 },
    { content: 'aiguiere, eviere [OF]', lineNumber: 2 },
    { content: 'ewer [ME]', lineNumber: 3 },
    { content: 'euar -s (m n)', lineNumber: 4 },
    { content: 'https://www.etymonline.com/word/ewer', lineNumber: 5 }
  ]
  
  return flatMap((pipeline: any) => {
    const builderResult = createPipelineBuilder(createDefaultPipeline())
      .withSafeDefaults()
      .withCustomTransformer('stanza', stanzaTransformer)
    
    return flatMap((builder: any) => {
      const testResult = builder.test(sampleLines)
      
      return map((results: any[]) => {
        const inspection = builder.inspect()
        return `Pipeline Test Results for '${pipelineName}':
${JSON.stringify(results, null, 2)}

Pipeline Inspection:
- Has all required components: ${inspection.hasTextTransform && inspection.hasLineParser}
- Custom transformers: ${inspection.customTransformerNames.join(', ')}
- Test passed: ${results.length > 0}`
      })(testResult)
    })(builderResult)
  })(createSafeEtymologyPipeline(pipelineName))
}

/**
 * Example 5: Converting results to enhanced types with branded strings
 */
export const processFileWithEnhancedTypes = (
  filePath: string,
  pipelineName: string
): Result<{ originalResults: any[], enhancedResults: any[], conversionErrors: Error[] }> => {
  return flatMap((results: any[]) => {
    const enhancedResults: any[] = []
    const conversionErrors: Error[] = []
    
    for (const result of results) {
      // Try to convert to enhanced types if it's a standard word entry
      if (result.name && result.etymology && result.sources) {
        const enhancedResult = convertToEnhancedWordEntry(result)
        
        fold(
          (error: Error) => conversionErrors.push(error),
          (enhanced: any) => enhancedResults.push(enhanced)
        )(enhancedResult)
      } else {
        // Custom transformer result - keep as is
        enhancedResults.push(result)
      }
    }
    
    return ok({
      originalResults: results,
      enhancedResults,
      conversionErrors
    })
  })(processSingleFileWithSafety(filePath, pipelineName))
}

/**
 * Example 6: Creating specialized pipelines for different use cases
 */
export const createSpecializedPipelines = () => {
  const defaultPipeline = createDefaultPipeline()
  
  // Fast processing pipeline with minimal validation
  const fastBuilder = createPipelineBuilder(defaultPipeline)
    .withSafeDefaults()
    .withValidation({ 
      requireTextTransform: false,
      requireWordNameExtractor: false,
      maxCustomTransformers: 3
    })
  
  const fastPipeline = fastBuilder.build()
  
  // Comprehensive pipeline with all transformers
  const comprehensiveBuilder = createPipelineBuilder(defaultPipeline)
    .withSafeDefaults()
    
  const withStanzaResult = comprehensiveBuilder.withCustomTransformer('stanza', stanzaTransformer)
  const comprehensivePipeline = flatMap((builder: any) => 
    flatMap((builderWithCompact: any) => builderWithCompact.build())(
      builder.withCustomTransformer('compact', compactTransformer)
    )
  )(withStanzaResult)
  
  // Debug pipeline with detailed inspection
  const debugBuilder = createPipelineBuilder(defaultPipeline).withSafeDefaults()
  const debugInspection = debugBuilder.inspect()
  
  return {
    fast: fastPipeline,
    comprehensive: comprehensivePipeline,
    debug: { pipeline: debugBuilder.build(), inspection: debugInspection }
  }
}

/**
 * Example 7: Error recovery and fallback strategies
 */
export const processWithFallbacks = (
  filePath: string,
  primaryPipelineName: string,
  fallbackPipelineName: string
): Result<{ source: 'primary' | 'fallback', results: any[] }> => {
  const primaryResult = processSingleFileWithSafety(filePath, primaryPipelineName)
  
  return fold(
    (primaryError: Error) => {
      console.log(`Primary pipeline failed: ${primaryError.message}. Trying fallback...`)
      
      const fallbackResult = processSingleFileWithSafety(filePath, fallbackPipelineName)
      
      return map((results: any[]): { source: 'primary' | 'fallback', results: any[] } => ({
        source: 'fallback',
        results
      }))(fallbackResult)
    },
    (results: any[]): Result<{ source: 'primary' | 'fallback', results: any[] }> => ok({
      source: 'primary',
      results
    })
  )(primaryResult)
}

/**
 * Example 8: Configuration-driven pipeline creation
 */
interface PipelineConfig {
  readonly name: string
  readonly enableStanza: boolean
  readonly enableCompact: boolean
  readonly maxErrors: number
  readonly customTextTransform?: (text: string) => string
}

export const createConfigurablePipeline = (config: PipelineConfig): Result<any> => {
  return flatMap((pipelineName: PipelineName) => {
    const defaultPipeline = createDefaultPipeline()
    const builder = createPipelineBuilder(defaultPipeline).withSafeDefaults()
    
    // Apply custom text transform if provided
    const builderWithTextTransform = config.customTextTransform
      ? builder.withTextTransform(config.customTextTransform)
      : builder
    
    // Add transformers based on config
    const processBuilder = async (currentBuilder: any): Promise<Result<any>> => {
      let finalBuilder = currentBuilder
      
      if (config.enableStanza) {
        const stanzaResult = finalBuilder.withCustomTransformer('stanza', stanzaTransformer)
        if (!stanzaResult.isSuccess) {
          return stanzaResult
        }
        finalBuilder = stanzaResult.value!
      }
      
      if (config.enableCompact) {
        const compactResult = finalBuilder.withCustomTransformer('compact', compactTransformer)
        if (!compactResult.isSuccess) {
          return compactResult
        }
        finalBuilder = compactResult.value!
      }
      
      return finalBuilder.build()
    }
    
    // Since we can't use async in this context, let's simplify
    let currentBuilder = builderWithTextTransform
    
    if (config.enableStanza) {
      const stanzaResult = currentBuilder.withCustomTransformer('stanza', stanzaTransformer)
      if (!stanzaResult.isSuccess) {
        return stanzaResult
      }
      currentBuilder = stanzaResult.value!
    }
    
    if (config.enableCompact) {
      const compactResult = currentBuilder.withCustomTransformer('compact', compactTransformer)
      if (!compactResult.isSuccess) {
        return compactResult
      }
      currentBuilder = compactResult.value!
    }
    
    return currentBuilder.build()
  })(safeCreatePipelineName(config.name))
}

/**
 * Example usage of all refactored components together
 */
export const demonstrateRefactoredPipeline = async (): Promise<void> => {
  console.log('=== Demonstrating Refactored Pipeline ===\n')
  
  // 1. Create a safe pipeline
  const pipelineResult = createSafeEtymologyPipeline('demo-pipeline')
  
  fold(
    (error: Error) => console.error(`Pipeline creation failed: ${error.message}`),
    (pipeline: any) => {
      console.log('✓ Pipeline created successfully with safe error handling')
      
      // 2. Test the pipeline
      const testResult = testPipelineWithSampleData('demo-pipeline')
      
      fold(
        (error: Error) => console.error(`Pipeline test failed: ${error.message}`),
        (testReport: string) => {
          console.log('✓ Pipeline test completed:')
          console.log(testReport)
          
          // 3. Demonstrate specialized pipelines
          const specialized = createSpecializedPipelines()
          console.log('\n✓ Created specialized pipelines:', {
            fast: specialized.fast.isSuccess,
            comprehensive: specialized.comprehensive.isSuccess,
            debug: specialized.debug.pipeline.isSuccess
          })
          
          // 4. Show configuration-driven creation
          const configResult = createConfigurablePipeline({
            name: 'custom-config-pipeline',
            enableStanza: true,
            enableCompact: true,
            maxErrors: 5,
            customTextTransform: (text: string) => text.toLowerCase().replace(/ꬻ/g, 'ng')
          })
          
          fold(
            (error: Error) => console.error(`Config pipeline failed: ${error.message}`),
            () => console.log('✓ Configuration-driven pipeline created successfully')
          )(configResult)
        }
      )(testResult)
    }
  )(pipelineResult)
}