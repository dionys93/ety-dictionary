// src/pipeline/pipeline-builder.ts
import { Result, ok, err, map, flatMap } from '../monads'
import { 
  TextProcessingPipeline,
  TextTransformer, 
  LineParser, 
  EntryGrouper, 
  WordNameExtractor, 
  EntryTransformer,
  CustomTransformer,
  RawLine
} from '../types/pipeline-types'
import { PipelineName, safeCreatePipelineName } from '../types/branded-types'
import { groupByDoubleNewline } from '../transformers/entry-groupers'

/**
 * Configuration for pipeline validation
 */
interface PipelineValidationConfig {
  readonly requireTextTransform: boolean
  readonly requireLineParser: boolean
  readonly requireEntryGrouper: boolean
  readonly requireWordNameExtractor: boolean
  readonly requireEntryTransformer: boolean
  readonly maxCustomTransformers: number
}

const DEFAULT_VALIDATION_CONFIG: PipelineValidationConfig = {
  requireTextTransform: true,
  requireLineParser: true,
  requireEntryGrouper: true,
  requireWordNameExtractor: true,
  requireEntryTransformer: true,
  maxCustomTransformers: 10
}

/**
 * Pipeline builder state
 */
interface PipelineBuilderState {
  readonly name?: PipelineName
  readonly textTransform?: TextTransformer
  readonly lineParser?: LineParser
  readonly entryGrouper?: EntryGrouper
  readonly wordNameExtractor?: WordNameExtractor
  readonly entryTransformer?: EntryTransformer
  readonly customTransformers: Record<string, CustomTransformer>
  readonly validationConfig: PipelineValidationConfig
}

/**
 * Pipeline inspection result
 */
interface PipelineInspection {
  readonly name?: PipelineName
  readonly hasTextTransform: boolean
  readonly hasLineParser: boolean
  readonly hasEntryGrouper: boolean
  readonly hasWordNameExtractor: boolean
  readonly hasEntryTransformer: boolean
  readonly customTransformerNames: readonly string[]
  readonly validationConfig: PipelineValidationConfig
}

/**
 * Safe pipeline type with Result-returning functions
 */
interface SafeTextProcessingPipeline {
  readonly textTransform: (text: string) => Result<string>
  readonly lineParser: (line: RawLine) => Result<import('../types/pipeline-types').ParsedLine>
  readonly entryGrouper: (lines: RawLine[]) => Result<import('../types/pipeline-types').EntryGroup[]>
  readonly wordNameExtractor: (group: import('../types/pipeline-types').EntryGroup, fallback: string) => Result<string>
  readonly entryTransformer: (group: import('../types/pipeline-types').EntryGroup, wordName: string) => Result<import('../types/pipeline-types').WordEntry>
  readonly customTransformers: Record<string, (group: import('../types/pipeline-types').EntryGroup) => Result<any>>
}

/**
 * Create initial pipeline builder state
 */
const createInitialState = (): PipelineBuilderState => ({
  customTransformers: {},
  validationConfig: DEFAULT_VALIDATION_CONFIG
})

/**
 * Update pipeline builder state immutably
 */
const updateState = (state: PipelineBuilderState) => 
  (updates: Partial<PipelineBuilderState>): PipelineBuilderState => ({
    ...state,
    ...updates
  })

/**
 * Create a new pipeline builder with default settings
 */
export const createPipelineBuilder = (defaultPipeline: TextProcessingPipeline) => {
  const initialState = createInitialState()
  
  const builder = {
    /**
     * Set pipeline name (for debugging and logging)
     */
    withName: (name: string): Result<ReturnType<typeof createPipelineBuilderFromState>> => 
      map((pipelineName: PipelineName) => 
        createPipelineBuilderFromState(updateState(initialState)({ name: pipelineName }), defaultPipeline)
      )(safeCreatePipelineName(name)),
    
    /**
     * Set text transformer
     */
    withTextTransform: (transformer: TextTransformer) => 
      createPipelineBuilderFromState(updateState(initialState)({ textTransform: transformer }), defaultPipeline),
    
    /**
     * Set line parser (automatically updates entry grouper if not explicitly set)
     */
    withLineParser: (parser: LineParser) => {
      const newState = updateState(initialState)({ 
        lineParser: parser,
        // Auto-update entry grouper if not explicitly set
        entryGrouper: initialState.entryGrouper || groupByDoubleNewline(parser)
      })
      return createPipelineBuilderFromState(newState, defaultPipeline)
    },
    
    /**
     * Set entry grouper explicitly
     */
    withEntryGrouper: (grouper: EntryGrouper) => 
      createPipelineBuilderFromState(updateState(initialState)({ entryGrouper: grouper }), defaultPipeline),
    
    /**
     * Set word name extractor
     */
    withWordNameExtractor: (extractor: WordNameExtractor) => 
      createPipelineBuilderFromState(updateState(initialState)({ wordNameExtractor: extractor }), defaultPipeline),
    
    /**
     * Set entry transformer
     */
    withEntryTransformer: (transformer: EntryTransformer) => 
      createPipelineBuilderFromState(updateState(initialState)({ entryTransformer: transformer }), defaultPipeline),
    
    /**
     * Add a custom transformer
     */
    withCustomTransformer: (name: string, transformer: CustomTransformer): Result<ReturnType<typeof createPipelineBuilderFromState>> => {
      if (Object.keys(initialState.customTransformers).length >= initialState.validationConfig.maxCustomTransformers) {
        return err(new Error(`Maximum number of custom transformers (${initialState.validationConfig.maxCustomTransformers}) exceeded`))
      }
      
      if (initialState.customTransformers[name]) {
        return err(new Error(`Custom transformer '${name}' already exists`))
      }
      
      const newTransformers = { ...initialState.customTransformers, [name]: transformer }
      const newState = updateState(initialState)({ customTransformers: newTransformers })
      return ok(createPipelineBuilderFromState(newState, defaultPipeline))
    },
    
    /**
     * Create pipeline with safe defaults for missing components
     */
    withSafeDefaults: (): ReturnType<typeof createPipelineBuilderFromState> => {
      const newState: PipelineBuilderState = {
        ...initialState,
        textTransform: initialState.textTransform || defaultPipeline.textTransform,
        lineParser: initialState.lineParser || defaultPipeline.lineParser,
        entryGrouper: initialState.entryGrouper || defaultPipeline.entryGrouper,
        wordNameExtractor: initialState.wordNameExtractor || defaultPipeline.wordNameExtractor,
        entryTransformer: initialState.entryTransformer || defaultPipeline.entryTransformer
      }
      return createPipelineBuilderFromState(newState, defaultPipeline)
    },
    
    /**
     * Build the pipeline with validation
     */
    build: (): Result<TextProcessingPipeline> => 
      buildPipeline(initialState, defaultPipeline),
    
    /**
     * Build with safe wrappers that handle errors gracefully
     */
    buildSafe: (): Result<SafeTextProcessingPipeline> => 
      buildSafePipeline(initialState, defaultPipeline),
    
    /**
     * Get pipeline information for debugging
     */
    inspect: (): PipelineInspection => 
      inspectPipeline(initialState),
    
    /**
     * Test pipeline with sample data
     */
    test: (sampleLines: RawLine[]): Result<any[]> => 
      testPipeline(initialState, defaultPipeline, sampleLines)
  }
  
  return builder
}

/**
 * Create pipeline builder from existing state
 */
const createPipelineBuilderFromState = (state: PipelineBuilderState, defaultPipeline: TextProcessingPipeline) => ({
  withName: (name: string): Result<ReturnType<typeof createPipelineBuilderFromState>> => 
    map((pipelineName: PipelineName) => 
      createPipelineBuilderFromState(updateState(state)({ name: pipelineName }), defaultPipeline)
    )(safeCreatePipelineName(name)),
  
  withTextTransform: (transformer: TextTransformer) => 
    createPipelineBuilderFromState(updateState(state)({ textTransform: transformer }), defaultPipeline),
  
  withLineParser: (parser: LineParser) => {
    const newState = updateState(state)({ 
      lineParser: parser,
      entryGrouper: state.entryGrouper || groupByDoubleNewline(parser)
    })
    return createPipelineBuilderFromState(newState, defaultPipeline)
  },
  
  withEntryGrouper: (grouper: EntryGrouper) => 
    createPipelineBuilderFromState(updateState(state)({ entryGrouper: grouper }), defaultPipeline),
  
  withWordNameExtractor: (extractor: WordNameExtractor) => 
    createPipelineBuilderFromState(updateState(state)({ wordNameExtractor: extractor }), defaultPipeline),
  
  withEntryTransformer: (transformer: EntryTransformer) => 
    createPipelineBuilderFromState(updateState(state)({ entryTransformer: transformer }), defaultPipeline),
  
  withCustomTransformer: (name: string, transformer: CustomTransformer): Result<ReturnType<typeof createPipelineBuilderFromState>> => {
    if (Object.keys(state.customTransformers).length >= state.validationConfig.maxCustomTransformers) {
      return err(new Error(`Maximum number of custom transformers exceeded`))
    }
    if (state.customTransformers[name]) {
      return err(new Error(`Custom transformer '${name}' already exists`))
    }
    const newTransformers = { ...state.customTransformers, [name]: transformer }
    const newState = updateState(state)({ customTransformers: newTransformers })
    return ok(createPipelineBuilderFromState(newState, defaultPipeline))
  },
  
  withoutCustomTransformer: (name: string) => {
    const { [name]: removed, ...remaining } = state.customTransformers
    return createPipelineBuilderFromState(updateState(state)({ customTransformers: remaining }), defaultPipeline)
  },
  
  withValidation: (config: Partial<PipelineValidationConfig>) => {
    const newConfig = { ...state.validationConfig, ...config }
    return createPipelineBuilderFromState(updateState(state)({ validationConfig: newConfig }), defaultPipeline)
  },
  
  withSafeDefaults: () => {
    const newState: PipelineBuilderState = {
      ...state,
      textTransform: state.textTransform || defaultPipeline.textTransform,
      lineParser: state.lineParser || defaultPipeline.lineParser,
      entryGrouper: state.entryGrouper || defaultPipeline.entryGrouper,
      wordNameExtractor: state.wordNameExtractor || defaultPipeline.wordNameExtractor,
      entryTransformer: state.entryTransformer || defaultPipeline.entryTransformer
    }
    return createPipelineBuilderFromState(newState, defaultPipeline)
  },
  
  build: (): Result<TextProcessingPipeline> => buildPipeline(state, defaultPipeline),
  buildSafe: (): Result<SafeTextProcessingPipeline> => buildSafePipeline(state, defaultPipeline),
  inspect: (): PipelineInspection => inspectPipeline(state),
  test: (sampleLines: RawLine[]): Result<any[]> => testPipeline(state, defaultPipeline, sampleLines)
})

/**
 * Validate pipeline state
 */
const validateState = (state: PipelineBuilderState): Result<PipelineBuilderState> => {
  const config = state.validationConfig
  const missing: string[] = []
  
  if (config.requireTextTransform && !state.textTransform) missing.push('textTransform')
  if (config.requireLineParser && !state.lineParser) missing.push('lineParser')
  if (config.requireEntryGrouper && !state.entryGrouper) missing.push('entryGrouper')
  if (config.requireWordNameExtractor && !state.wordNameExtractor) missing.push('wordNameExtractor')
  if (config.requireEntryTransformer && !state.entryTransformer) missing.push('entryTransformer')
  
  if (missing.length > 0) {
    return err(new Error(`Missing required pipeline components: ${missing.join(', ')}`))
  }
  
  return ok(state)
}

/**
 * Validate pipeline consistency
 */
const validatePipelineConsistency = (pipeline: TextProcessingPipeline): Result<TextProcessingPipeline> => {
  // Check if entry grouper is compatible with line parser
  try {
    const testLine: RawLine = { content: 'test [EN]', lineNumber: 1 }
    const parsedLine = pipeline.lineParser(testLine)
    const testGroup = pipeline.entryGrouper([testLine])
    
    // Basic consistency check passed
    return ok(pipeline)
  } catch (error) {
    return err(new Error(`Pipeline consistency check failed: ${error instanceof Error ? error.message : String(error)}`))
  }
}

/**
 * Build pipeline from state
 */
const buildPipeline = (state: PipelineBuilderState, defaultPipeline: TextProcessingPipeline): Result<TextProcessingPipeline> => {
  return flatMap((validatedState: PipelineBuilderState) => {
    const pipeline: TextProcessingPipeline = {
      textTransform: validatedState.textTransform || defaultPipeline.textTransform,
      lineParser: validatedState.lineParser || defaultPipeline.lineParser,
      entryGrouper: validatedState.entryGrouper || defaultPipeline.entryGrouper,
      wordNameExtractor: validatedState.wordNameExtractor || defaultPipeline.wordNameExtractor,
      entryTransformer: validatedState.entryTransformer || defaultPipeline.entryTransformer,
      customTransformers: validatedState.customTransformers
    }
    
    return validatePipelineConsistency(pipeline)
  })(validateState(state))
}

/**
 * Build safe pipeline from state
 */
const buildSafePipeline = (state: PipelineBuilderState, defaultPipeline: TextProcessingPipeline): Result<SafeTextProcessingPipeline> => {
  const { safeTextTransform, safeLineParser, safeEntryGrouper, safeWordNameExtractor, safeEntryTransformer, safeCustomTransformer } = require('../transformers/safe-transformers')
  
  return map((pipeline: TextProcessingPipeline) => ({
    textTransform: safeTextTransform(pipeline.textTransform),
    lineParser: safeLineParser(pipeline.lineParser),
    entryGrouper: safeEntryGrouper(pipeline.entryGrouper),
    wordNameExtractor: safeWordNameExtractor(pipeline.wordNameExtractor),
    entryTransformer: safeEntryTransformer(pipeline.entryTransformer),
    customTransformers: Object.entries(pipeline.customTransformers).reduce(
      (acc, [name, transformer]) => ({
        ...acc,
        [name]: safeCustomTransformer(transformer)
      }),
      {} as Record<string, (group: any) => Result<any>>
    )
  }))(buildPipeline(state, defaultPipeline))
}

/**
 * Inspect pipeline state
 */
const inspectPipeline = (state: PipelineBuilderState): PipelineInspection => ({
  name: state.name,
  hasTextTransform: !!state.textTransform,
  hasLineParser: !!state.lineParser,
  hasEntryGrouper: !!state.entryGrouper,
  hasWordNameExtractor: !!state.wordNameExtractor,
  hasEntryTransformer: !!state.entryTransformer,
  customTransformerNames: Object.keys(state.customTransformers),
  validationConfig: state.validationConfig
})

/**
 * Test pipeline with sample data
 */
const testPipeline = (state: PipelineBuilderState, defaultPipeline: TextProcessingPipeline, sampleLines: RawLine[]): Result<any[]> => {
  return flatMap((pipeline: TextProcessingPipeline) => {
    try {
      const groups = pipeline.entryGrouper(sampleLines)
      const results = groups.map(group => {
        if (Object.keys(pipeline.customTransformers).length > 0) {
          const result: any = {}
          for (const [key, transformer] of Object.entries(pipeline.customTransformers)) {
            result[key] = transformer(group)
          }
          return result
        } else {
          const wordName = pipeline.wordNameExtractor(group, 'test')
          return pipeline.entryTransformer(group, wordName)
        }
      })
      return ok(results)
    } catch (error) {
      return err(new Error(`Pipeline test failed: ${error instanceof Error ? error.message : String(error)}`))
    }
  })(buildPipeline(state, defaultPipeline))
}

/**
 * Convenience function to create a simple pipeline
 */
export const createSimplePipeline = (defaultPipeline: TextProcessingPipeline) => 
  (overrides: Partial<TextProcessingPipeline>): Result<TextProcessingPipeline> => {
    const builder = createPipelineBuilder(defaultPipeline).withSafeDefaults()
    
    const configuredBuilder = Object.entries(overrides).reduce((currentBuilder, [key, value]) => {
      switch (key) {
        case 'textTransform':
          return currentBuilder.withTextTransform(value as TextTransformer)
        case 'lineParser':
          return currentBuilder.withLineParser(value as LineParser)
        case 'entryGrouper':
          return currentBuilder.withEntryGrouper(value as EntryGrouper)
        case 'wordNameExtractor':
          return currentBuilder.withWordNameExtractor(value as WordNameExtractor)
        case 'entryTransformer':
          return currentBuilder.withEntryTransformer(value as EntryTransformer)
        default:
          return currentBuilder
      }
    }, builder)
    
    return configuredBuilder.build()
  }