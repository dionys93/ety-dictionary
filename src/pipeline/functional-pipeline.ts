// src/pipeline/functional-pipeline.ts

import { 
  Result, 
  ok, 
  err, 
  map, 
  flatMap,
  RawLine, 
  ParsedLine,
  parsePartOfSpeech,
  replaceSpecialCharacters
} from '../'

/**
 * Core types for the new architecture
 */
interface EtymologyEntry {
  readonly rootForms: readonly ParsedLine[]
  readonly modernForm: ParsedLine
  readonly inglishForm?: ParsedLine
  readonly sources: readonly ParsedLine[]
}

interface ProcessedEntry {
  readonly word: string
  readonly pos: readonly string[]
  readonly etymology: readonly ParsedLine[]
  readonly morphology?: string
  readonly sources: readonly string[]
}

/**
 * Pure functions for file structure recognition
 */
function detectEntryBoundaries(lines: readonly RawLine[]): Result<readonly RawLine[][]> {
  try {
    const entries: RawLine[][] = []
    let currentEntry: RawLine[] = []
    let lastWasSource = false
    
    for (const line of lines) {
      const isSource = line.content.startsWith('http')
      const hasLanguageTag = /\[([A-Z]+)\]/.test(line.content)
      
      // New entry starts when we see a root form after sources
      if (hasLanguageTag && lastWasSource && currentEntry.length > 0) {
        entries.push([...currentEntry])
        currentEntry = [line]
      } else {
        currentEntry.push(line)
      }
      
      lastWasSource = isSource
    }
    
    if (currentEntry.length > 0) {
      entries.push(currentEntry)
    }
    
    return ok(entries)
  } catch (error) {
    return err(new Error(`Failed to detect entry boundaries: ${error}`))
  }
}

// Parse a single etymology entry using existing line parser
function parseEtymologyEntry(lines: readonly RawLine[]): Result<EtymologyEntry> {
  try {
    // Reuse existing parsePartOfSpeech function for consistency
    const parsed = lines.map(line => parsePartOfSpeech(line))
    
    const rootForms = parsed.filter(p => !p.isUrl && p.language !== 'ME' && p.origin !== 'Inglish')
    const modernForm = parsed.find(p => p.language === 'ME')
    const inglishForm = parsed.find(p => p.origin === 'Inglish')
    const sources = parsed.filter(p => p.isUrl)
    
    if (!modernForm) {
      return err(new Error('No Modern English form found'))
    }
    
    return ok({
      rootForms,
      modernForm,
      inglishForm,
      sources
    })
  } catch (error) {
    return err(new Error(`Failed to parse etymology entry: ${error}`))
  }
}

// Transform etymology entry to processed entry
function transformEntry(entry: EtymologyEntry): Result<ProcessedEntry> {
  try {
    const word = entry.modernForm.text
    const pos = entry.inglishForm?.partOfSpeech || []
    const etymology = [
      ...entry.rootForms,
      entry.modernForm,
      ...(entry.inglishForm ? [entry.inglishForm] : [])
    ]
    const morphology = entry.inglishForm?.text
    const sources = entry.sources.map(s => s.text)
    
    return ok({
      word,
      pos,
      etymology,
      morphology,
      sources
    })
  } catch (error) {
    return err(new Error(`Failed to transform entry: ${error}`))
  }
}

// Process a single file through the pipeline - reusing existing text transformer
function processFileContent(content: string): Result<readonly ProcessedEntry[]> {
  // Apply existing text transformations for consistency
  const transformedContent = replaceSpecialCharacters(content)
  
  // Split into lines
  const lines: RawLine[] = transformedContent
    .split('\n')
    .map((content, lineNumber) => ({ content: content.trim(), lineNumber: lineNumber + 1 }))
    .filter(line => line.content.length > 0)
  
  // Use monadic composition
  return flatMap((entryGroups: readonly RawLine[][]) => {
    // Process each entry group using functional composition
    const entryResults = entryGroups.map(group => 
      flatMap(transformEntry)(parseEtymologyEntry(group))
    )
    
    // Collect successes (partial success pattern)
    const successes = entryResults
      .filter(result => result.isSuccess)
      .map(result => result.value!)
    
    return ok(successes)
    
  })(detectEntryBoundaries(lines))
}

/**
 * Output formatters - pure functions with shared patterns
 */
type OutputFormatter<T> = (entries: readonly ProcessedEntry[]) => T

// Helper for creating etymology objects consistently
function createEtymologyObject(e: ParsedLine) {
  return {
    name: e.text,
    origin: e.origin,
    ...(e.partOfSpeech && e.partOfSpeech.length > 0 ? { 'part-of-speech': e.partOfSpeech } : {})
  }
}

// Helper for POS distribution calculation (reusable across formatters)
function calculatePOSDistribution(entries: readonly ProcessedEntry[]): Record<string, number> {
  return entries.reduce((acc, entry) => {
    for (const pos of entry.pos) {
      acc[pos] = (acc[pos] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)
}

// Output formatters using shared helpers
const formatStandard: OutputFormatter<any[]> = (entries) =>
  entries.map(entry => ({
    name: entry.word,
    etymology: entry.etymology.map(createEtymologyObject),
    sources: entry.sources
  }))

const formatPOSAware: OutputFormatter<any[]> = (entries) =>
  entries.map(entry => ({
    word: entry.word,
    pos: entry.pos,
    morphology: entry.morphology,
    etymology_chain: entry.etymology.map(e => ({
      form: e.text,
      language: e.origin
    })),
    sources: entry.sources
  }))

const formatCompact: OutputFormatter<any> = (entries) => ({
  total_entries: entries.length,
  languages: [...new Set(entries.flatMap(e => e.etymology.map(et => et.origin)))],
  pos_distribution: calculatePOSDistribution(entries),
  entries: entries.map(e => ({
    word: e.word,
    pos: e.pos,
    source_count: e.sources.length
  }))
})

// Formatter registry for DRY output format selection
const OUTPUT_FORMATTERS = {
  standard: formatStandard,
  pos: formatPOSAware, 
  compact: formatCompact
} as const

type OutputFormat = keyof typeof OUTPUT_FORMATTERS

/**
 * Safe file operations using functional composition
 */
function safeReadFile(filePath: string): Result<string> {
  try {
    const fs = require('fs')
    const content = fs.readFileSync(filePath, 'utf8')
    return ok(content)
  } catch (error) {
    return err(new Error(`Failed to read ${filePath}: ${error}`))
  }
}

function safeWriteFile(filePath: string, data: any): Result<string> {
  try {
    const fs = require('fs')
    const path = require('path')
    
    // Ensure target directory exists
    const targetDir = path.dirname(filePath)
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    return ok(filePath)
  } catch (error) {
    return err(new Error(`Failed to write ${filePath}: ${error}`))
  }
}

/**
 * Functional file processor factory - creates processors for different output formats
 */
function createFileProcessor(outputFormat: OutputFormat = 'standard') {
  const formatter = OUTPUT_FORMATTERS[outputFormat]
  
  return function processFile(filePath: string, targetDir: string): Result<string> {
    const path = require('path')
    
    return flatMap((content: string) =>
      flatMap((entries: readonly ProcessedEntry[]) => {
        const data = formatter(entries)
        const fileName = path.basename(filePath, '.txt')
        const outputPath = path.join(targetDir, `${fileName}.json`)
        
        return map((writtenPath: string) =>
          `Processed: ${filePath} -> ${writtenPath}`
        )(safeWriteFile(outputPath, data))
        
      })(processFileContent(content))
    )(safeReadFile(filePath))
  }
}

/**
 * Functional directory processor using composition
 */
function createDirectoryProcessor(fileProcessor: (filePath: string, targetDir: string) => Result<string>) {
  return function processDirectory(
    sourceDir: string, 
    targetDir: string
  ): Result<{ successes: string[], failures: Error[] }> {
    try {
      const fs = require('fs')
      const path = require('path')
      
      const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
      const results = { successes: [] as string[], failures: [] as Error[] }
      
      for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name)
        
        if (entry.isFile() && entry.name.endsWith('.txt')) {
          const result = fileProcessor(sourcePath, targetDir)
          
          if (result.isSuccess) {
            results.successes.push(result.value!)
          } else {
            results.failures.push(result.error!)
          }
        } else if (entry.isDirectory()) {
          // Recursive processing with maintained directory structure
          const subTargetDir = path.join(targetDir, entry.name)
          const subResult = processDirectory(sourcePath, subTargetDir)
          
          if (subResult.isSuccess) {
            results.successes.push(...subResult.value!.successes)
            results.failures.push(...subResult.value!.failures)
          } else {
            results.failures.push(subResult.error!)
          }
        }
      }
      
      return ok(results)
      
    } catch (error) {
      return err(new Error(`Failed to process directory ${sourceDir}: ${error}`))
    }
  }
}

/**
 * Main pipeline function - composes all the functional pieces
 */
export function processWithFunctionalPipeline(
  sourceDir: string,
  targetDir: string,
  outputFormat: OutputFormat = 'standard'
): Result<string> {
  
  const fileProcessor = createFileProcessor(outputFormat)
  const directoryProcessor = createDirectoryProcessor(fileProcessor)
  
  return map((result: { successes: string[], failures: Error[] }) => {
    const { successes, failures } = result
    
    // Log failures for debugging
    if (failures.length > 0) {
      console.warn(`\nProcessing completed with ${failures.length} failures:`)
      failures.forEach(error => console.warn(`- ${error.message}`))
    }
    
    // Log successes if verbose
    if (successes.length > 0) {
      console.log(`\nSuccessfully processed ${successes.length} files:`)
      successes.slice(0, 5).forEach(msg => console.log(`- ${msg}`))
      if (successes.length > 5) {
        console.log(`... and ${successes.length - 5} more`)
      }
    }
    
    return `Successfully processed ${successes.length} files to ${targetDir}${
      failures.length > 0 ? ` (${failures.length} failures - see above)` : ''
    }`
    
  })(directoryProcessor(sourceDir, targetDir))
}