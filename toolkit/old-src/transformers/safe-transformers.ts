// src/transformers/safe-transformers.ts
import { 
  Result, 
  ok, 
  err, 
  map, 
  flatMap,
  TextTransformer, 
  LineParser, 
  EntryGrouper, 
  WordNameExtractor, 
  EntryTransformer,
  CustomTransformer,
  TextLine, 
  ParsedLine, 
  EntryGroup,
  WordEntry 
} from '../'

/**
 * Safe wrapper for text transformers that handles exceptions
 */
export const safeTextTransform = (transformer: TextTransformer) => 
  (text: string): Result<string> => {
    try {
      console.log(`Debug: safeTextTransform input: ${typeof text}, length: ${text?.length || 'undefined'}`)
      const result = transformer(text)
      console.log(`Debug: safeTextTransform output: ${typeof result}, length: ${result?.length || 'undefined'}`)
      return ok(result)
    } catch (error) {
      console.log(`Debug: safeTextTransform error: ${error}`)
      return err(new Error(`Text transformation failed: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Safe wrapper for line parsers that handles parsing errors
 */
export const safeLineParser = (parser: LineParser) => 
  (line: TextLine): Result<ParsedLine> => {
    try {
      const result = parser(line)
      return ok(result)
    } catch (error) {
      return err(new Error(`Line parsing failed for line ${line.lineNumber}: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Safe wrapper for entry groupers that handles grouping errors
 */
export const safeEntryGrouper = (grouper: EntryGrouper) => 
  (lines: TextLine[]): Result<EntryGroup[]> => {
    try {
      const result = grouper(lines)
      return ok(result)
    } catch (error) {
      return err(new Error(`Entry grouping failed: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Safe wrapper for word name extractors
 */
export const safeWordNameExtractor = (extractor: WordNameExtractor) => 
  (group: EntryGroup, fallbackName: string): Result<string> => {
    try {
      const result = extractor(group, fallbackName)
      return ok(result)
    } catch (error) {
      return err(new Error(`Word name extraction failed: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Safe wrapper for entry transformers
 */
export const safeEntryTransformer = (transformer: EntryTransformer) => 
  (group: EntryGroup, wordName: string): Result<WordEntry> => {
    try {
      const result = transformer(group, wordName)
      return ok(result)
    } catch (error) {
      return err(new Error(`Entry transformation failed: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Safe wrapper for custom transformers
 */
export const safeCustomTransformer = (transformer: CustomTransformer) => 
  (group: EntryGroup): Result<any> => {
    try {
      const result = transformer(group)
      return ok(result)
    } catch (error) {
      return err(new Error(`Custom transformation failed: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Process multiple lines safely, collecting both successes and failures
 */
export const safeProcessLines = (
  parser: LineParser
) => (lines: TextLine[]): { successes: ParsedLine[], errors: Error[] } => {
  const safeParser = safeLineParser(parser)
  const results = lines.map(line => ({ line, result: safeParser(line) }))
  
  const successes: ParsedLine[] = []
  const errors: Error[] = []
  
  for (const { result } of results) {
    if (result.isSuccess) {
      successes.push(result.value!)
    } else {
      errors.push(result.error!)
    }
  }
  
  return { successes, errors }
}

/**
 * Process multiple groups safely with a transformer function
 */
export const safeProcessGroups = <T>(transformer: (group: EntryGroup) => T) => 
  (groups: EntryGroup[]): { successes: T[], errors: Error[] } => {
    const safeTransformer = (group: EntryGroup): Result<T> => {
      try {
        return ok(transformer(group))
      } catch (error) {
        return err(new Error(`Group processing failed: ${error instanceof Error ? error.message : String(error)}`))
      }
    }
    
    const results = groups.map(group => ({ group, result: safeTransformer(group) }))
    
    const successes: T[] = []
    const errors: Error[] = []
    
    for (const { result } of results) {
      if (result.isSuccess) {
        successes.push(result.value!)
      } else {
        errors.push(result.error!)
      }
    }
    
    return { successes, errors }
  }

/**
 * Compose safe transformations in a pipeline
 */
export const composeSafeTransformations = <A, B, C>(
  transform1: (input: A) => Result<B>,
  transform2: (input: B) => Result<C>
) => (input: A): Result<C> => {
  return flatMap((intermediate: B) => transform2(intermediate))(transform1(input))
}

/**
 * Apply multiple transformations and collect all results
 */
export const applyMultipleTransformations = <T>(
  transformations: Array<(input: T) => Result<any>>
) => (input: T): { successes: any[], errors: Error[] } => {
  const results = transformations.map(transform => transform(input))
  
  const successes: any[] = []
  const errors: Error[] = []
  
  for (const result of results) {
    if (result.isSuccess) {
      successes.push(result.value!)
    } else {
      errors.push(result.error!)
    }
  }
  
  return { successes, errors }
}

/**
 * Safe text processing pipeline that handles errors at each step
 */
export const createSafeTextProcessor = (
  textTransform: TextTransformer,
  lineParser: LineParser,
  entryGrouper: EntryGrouper
) => (textContent: string, fileName: string): Result<EntryGroup[]> => {
  // Debug: Log input
  console.log(`Debug: Input content type: ${typeof textContent}, length: ${textContent?.length || 'undefined'}`)
  
  // Step 1: Safe text transformation
  const transformedTextResult = safeTextTransform(textTransform)(textContent)
  
  return flatMap((transformedText: string) => {
    // Debug: Log transformed text
    console.log(`Debug: Transformed text type: ${typeof transformedText}, length: ${transformedText?.length || 'undefined'}`)
    
    // Ensure we have a string
    if (typeof transformedText !== 'string') {
      return err(new Error(`Text transformation returned ${typeof transformedText}, expected string`))
    }
    
    // Step 2: Convert to TextLine[] with isEmpty property
    const textLines: TextLine[] = transformedText
      .split('\n')
      .map((content, index) => ({ 
        content, 
        lineNumber: index + 1,
        isEmpty: content.trim().length === 0
      }))
      .filter(line => !line.isEmpty)  // Filter out empty lines
    
    console.log(`Debug: Created ${textLines.length} non-empty lines`)
    
    // Step 3: Safe entry grouping
    return safeEntryGrouper(entryGrouper)(textLines)
  })(transformedTextResult)
}

/**
 * Safe pipeline processor that handles the complete transformation
 */
export const createSafePipelineProcessor = (
  textTransform: TextTransformer,
  lineParser: LineParser,
  entryGrouper: EntryGrouper,
  wordNameExtractor: WordNameExtractor,
  entryTransformer: EntryTransformer,
  customTransformers: Record<string, CustomTransformer>
) => (textContent: string, fileName: string): Result<any[]> => {
  // Ensure we have a string input
  if (typeof textContent !== 'string') {
    return err(new Error(`Expected string input, got ${typeof textContent}`))
  }
  
  const textProcessor = createSafeTextProcessor(textTransform, lineParser, entryGrouper)
  
  return flatMap((groups: EntryGroup[]) => {
    const processedGroups: any[] = []
    const errors: Error[] = []
    
    for (const group of groups) {
      // Determine word name safely
      const wordNameResult = safeWordNameExtractor(wordNameExtractor)(group, fileName.replace('.txt', ''))
      
      if (!wordNameResult.isSuccess) {
        errors.push(wordNameResult.error!)
        continue
      }
      
      const wordName = wordNameResult.value!
      
      // Apply transformations
      if (Object.keys(customTransformers).length > 0) {
        const result: any = {}
        for (const [key, transformer] of Object.entries(customTransformers)) {
          const transformResult = safeCustomTransformer(transformer)(group)
          if (transformResult.isSuccess) {
            result[key] = transformResult.value!
          } else {
            errors.push(transformResult.error!)
          }
        }
        processedGroups.push(result)
      } else {
        const entryResult = safeEntryTransformer(entryTransformer)(group, wordName)
        if (entryResult.isSuccess) {
          processedGroups.push(entryResult.value!)
        } else {
          errors.push(entryResult.error!)
        }
      }
    }
    
    // Return partial success if we have some results
    if (processedGroups.length > 0) {
      return ok(processedGroups)
    } else if (errors.length > 0) {
      return err(errors[0])
    } else {
      return err(new Error('No groups processed successfully'))
    }
  })(textProcessor(textContent, fileName))
}