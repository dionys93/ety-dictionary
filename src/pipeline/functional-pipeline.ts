// src/pipeline/functional-pipeline.ts

import { Result, ok, err, map, flatMap } from '../monads'
import { RawLine, ParsedLine } from '../types/pipeline-types'

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

// Detect entry boundaries based on your actual data structure
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

// Parse a single etymology entry
function parseEtymologyEntry(lines: readonly RawLine[]): Result<EtymologyEntry> {
  try {
    const parsed = lines.map(line => ({
      text: line.content.replace(/\[.*?\]/, '').trim(),
      origin: extractLanguage(line.content),
      language: extractLanguageCode(line.content),
      isUrl: line.content.startsWith('http'),
      partOfSpeech: extractPOS(line.content)
    }))
    
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

// Extract language from [XX] tags
function extractLanguage(content: string): string {
  const match = content.match(/\[([A-Z]+)\]/)
  if (!match) return 'Unknown'
  
  const languageMap: Record<string, string> = {
    'L': 'Latin',
    'OF': 'Old French', 
    'ME': 'Modern English',
    'OE': 'Old English',
    'FR': 'French',
    'MI': 'Middle English',
    'AF': 'Anglo-French',
    'VL': 'Vulgar Latin',
    'ML': 'Medieval Latin',
    'AG': 'Ancient Greek',
    'GR': 'German',
    'IT': 'Italian',
    'ON': 'Old Norse',
    'AR': 'Arabic',
    'JP': 'Japanese'
  }
  
  return languageMap[match[1]] || match[1]
}

function extractLanguageCode(content: string): string | undefined {
  const match = content.match(/\[([A-Z]+)\]/)
  return match?.[1]
}

function extractPOS(content: string): string[] {
  const match = content.match(/\((.*?)\)$/)
  if (!match) return []
  
  return match[1].split(',').map(p => p.trim())
}

/**
 * Monadic composition functions
 */

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

// Process a single file through the pipeline
function processFileContent(content: string): Result<readonly ProcessedEntry[]> {
  // Split into lines
  const lines: RawLine[] = content
    .split('\n')
    .map((content, lineNumber) => ({ content: content.trim(), lineNumber: lineNumber + 1 }))
    .filter(line => line.content.length > 0)
  
  // Use monadic composition
  return flatMap((entryGroups: readonly RawLine[][]) => {
    // Process each entry group
    const entryResults = entryGroups.map(group => 
      flatMap(transformEntry)(parseEtymologyEntry(group))
    )
    
    // Collect successes and failures
    const successes: ProcessedEntry[] = []
    const failures: Error[] = []
    
    for (const result of entryResults) {
      if (result.isSuccess) {
        successes.push(result.value!)
      } else {
        failures.push(result.error!)
      }
    }
    
    // Return successes even if some failed (partial success)
    return ok(successes)
    
  })(detectEntryBoundaries(lines))
}

/**
 * Output formatters - pure functions
 */

// Standard format
function formatStandard(entries: readonly ProcessedEntry[]): any[] {
  return entries.map(entry => ({
    name: entry.word,
    etymology: entry.etymology.map(e => ({
      name: e.text,
      origin: e.origin,
      ...(e.partOfSpeech && e.partOfSpeech.length > 0 ? { 'part-of-speech': e.partOfSpeech } : {})
    })),
    sources: entry.sources
  }))
}

// POS-aware format
function formatPOSAware(entries: readonly ProcessedEntry[]): any[] {
  return entries.map(entry => ({
    word: entry.word,
    pos: entry.pos,
    morphology: entry.morphology,
    etymology_chain: entry.etymology.map(e => ({
      form: e.text,
      language: e.origin
    })),
    sources: entry.sources
  }))
}

// Compact format
function formatCompact(entries: readonly ProcessedEntry[]): any {
  return {
    total_entries: entries.length,
    languages: [...new Set(entries.flatMap(e => e.etymology.map(et => et.origin)))],
    pos_distribution: entries.reduce((acc, entry) => {
      for (const pos of entry.pos) {
        acc[pos] = (acc[pos] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>),
    entries: entries.map(e => ({
      word: e.word,
      pos: e.pos,
      source_count: e.sources.length
    }))
  }
}

/**
 * Safe file processor that creates individual JSON files
 */
function createSafeFileProcessor(
  outputFormat: 'standard' | 'pos' | 'compact' = 'standard'
): (filePath: string, targetDir: string) => Result<string> {
  
  return function safeProcessFile(filePath: string, targetDir: string): Result<string> {
    const fs = require('fs')
    const path = require('path')
    
    // Safe file reading
    const readResult = safeReadFile(filePath)
    
    return flatMap((content: string) => {
      // Process content
      return flatMap((entries: readonly ProcessedEntry[]) => {
        try {
          // Choose formatter based on output format
          const formatter = {
            standard: formatStandard,
            pos: formatPOSAware, 
            compact: formatCompact
          }[outputFormat]
          
          const data = formatter(entries)
          
          // Create output file path
          const fileName = path.basename(filePath, '.txt')
          const outputPath = path.join(targetDir, `${fileName}.json`)
          
          // Ensure target directory exists
          const targetDirPath = path.dirname(outputPath)
          if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true })
          }
          
          // Write JSON file
          fs.writeFileSync(outputPath, JSON.stringify(data, null, 2))
          
          return ok(`Processed: ${filePath} -> ${outputPath}`)
          
        } catch (error) {
          return err(new Error(`Failed to write output for ${filePath}: ${error}`))
        }
      })(processFileContent(content))
      
    })(readResult)
  }
}

function safeReadFile(filePath: string): Result<string> {
  try {
    const fs = require('fs')
    const content = fs.readFileSync(filePath, 'utf8')
    return ok(content)
  } catch (error) {
    return err(new Error(`Failed to read ${filePath}: ${error}`))
  }
}

/**
 * Safe directory processor that maintains file structure
 */
function createSafeDirectoryProcessor(
  processor: (filePath: string, targetDir: string) => Result<string>
) {
  return function processDirectory(
    sourceDir: string, 
    targetDir: string
  ): Result<{ successes: string[], failures: Error[] }> {
    try {
      const fs = require('fs')
      const path = require('path')
      
      const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
      const successes: string[] = []
      const failures: Error[] = []
      
      for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name)
        
        if (entry.isFile() && entry.name.endsWith('.txt')) {
          const result = processor(sourcePath, targetDir)
          
          if (result.isSuccess) {
            successes.push(result.value!)
          } else {
            failures.push(result.error!)
          }
        } else if (entry.isDirectory()) {
          // Recursive processing - maintain directory structure
          const subTargetDir = path.join(targetDir, entry.name)
          const subResult = processDirectory(sourcePath, subTargetDir)
          
          if (subResult.isSuccess) {
            successes.push(...subResult.value!.successes)
            failures.push(...subResult.value!.failures)
          } else {
            failures.push(subResult.error!)
          }
        }
      }
      
      return ok({ successes, failures })
      
    } catch (error) {
      return err(new Error(`Failed to process directory ${sourceDir}: ${error}`))
    }
  }
}

/**
 * Main pipeline function that creates individual JSON files
 */
export function processWithFunctionalPipeline(
  sourceDir: string,
  targetDir: string,
  outputFormat: 'standard' | 'pos' | 'compact' = 'standard'
): Result<string> {
  
  const fileProcessor = createSafeFileProcessor(outputFormat)
  const directoryProcessor = createSafeDirectoryProcessor(fileProcessor)
  
  return map((result: { successes: string[], failures: Error[] }) => {
    const stats = {
      successes: result.successes.length,
      failures: result.failures.length
    }
    
    // Log failures for debugging
    if (result.failures.length > 0) {
      console.warn(`\nProcessing completed with ${result.failures.length} failures:`)
      result.failures.forEach(error => console.warn(`- ${error.message}`))
    }
    
    // Log successes if verbose
    if (result.successes.length > 0) {
      console.log(`\nSuccessfully processed ${result.successes.length} files:`)
      result.successes.slice(0, 5).forEach(msg => console.log(`- ${msg}`))
      if (result.successes.length > 5) {
        console.log(`... and ${result.successes.length - 5} more`)
      }
    }
    
    return `Successfully processed ${stats.successes} files to ${targetDir}${
      stats.failures > 0 ? ` (${stats.failures} failures - see above)` : ''
    }`
    
  })(directoryProcessor(sourceDir, targetDir))
}