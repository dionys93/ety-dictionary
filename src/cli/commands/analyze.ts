// src/cli/commands/analyze.ts
import * as path from 'path'
import { Result, ok, err, fold } from '../../core'
import { log, logError } from '../../utils'
import { findTextFiles } from '../../io/file-operations'
import { DEFAULT_PATHS, mapLanguageToPath, posMap } from '../../config'
import { Command, AnalyzeArgs } from '../types'
import { io } from '../shared/io-instances'

// Part of speech normalization mapping - matches summarize.ts
const POS_ABBREVIATIONS: Record<string, string> = {
  "m n": "n",        // masculine noun -> just use 'n' for noun
  "f n": "n",        // feminine noun -> just use 'n' for noun
  "n": "n",          // noun
  "v": "v",          // verb
  "intr v": "v",     // intransitive verb -> just use 'v'
  "tr v": "v",       // transitive verb -> just use 'v'
  "conj": "conj",    // conjunction
  "adj": "adj",      // adjective
  "prep": "prep",    // preposition
  "pron": "pron",    // pronoun
  "adv": "adv",      // adverb
  "suff": "suff",    // suffix
  "pref": "pref",    // prefix
  "interj": "interj", // interjection
  "obs": "obs"       // obsolete
}

/**
 * Parse command line arguments for the analyze command
 */
function parseAnalyzeArgs(args: string[]): AnalyzeArgs {
  const parsed: AnalyzeArgs = {
    language: 'inglish',
    mode: 'both',
    verbose: false
  }
  
  // Extract non-option arguments
  const nonOptionArgs = args.filter(arg => !arg.startsWith('-'))
  if (nonOptionArgs.length > 0) {
    parsed.language = nonOptionArgs[0]
  }
  
  // Process options
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--mode' || arg === '-m') {
      if (i + 1 < args.length) {
        const mode = args[i + 1]
        if (['pos', 'roots', 'both'].includes(mode)) {
          parsed.mode = mode as 'pos' | 'roots' | 'both'
        }
      }
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true
    }
  }
  
  return parsed
}

// Analysis extraction functions with normalization
const extractPartOfSpeech = (line: string): string[] => {
  try {
    const posRegex = /\(([\w\s,]+)\)$/
    const match = line.trim().match(posRegex)
    
    if (!match) return []
    
    // Split by comma and normalize using POS_ABBREVIATIONS
    return match[1].split(',').map(p => {
      const trimmed = p.trim()
      // Check if it's a known part of speech and normalize it
      return POS_ABBREVIATIONS[trimmed] || trimmed
    })
  } catch {
    return []
  }
}

const extractRootWord = (content: string): string | null => {
  try {
    const lines = content.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        const langMatch = trimmed.match(/^(.+?)\s*\[[\w]+\]/)
        if (langMatch) {
          return langMatch[1].trim()
        }
        return trimmed
      }
    }
    
    return null
  } catch {
    return null
  }
}

const extractRootLanguage = (content: string): string | null => {
  try {
    const lines = content.split('\n')
    
    for (const line of lines) {
      const langMatch = line.match(/\[([\w]+)\]/)
      if (langMatch) {
        return langMatch[1]
      }
    }
    
    return null
  } catch {
    return null
  }
}

const extractModernEnglishWords = (content: string): string[] => {
  try {
    const lines = content.split('\n')
    const meWords: string[] = []
    
    for (const line of lines) {
      if (line.includes('[ME]')) {
        const wordMatch = line.match(/^(.+?)\s*\[ME\]/)
        if (wordMatch) {
          meWords.push(wordMatch[1].trim())
        }
      }
    }
    
    return meWords
  } catch {
    return []
  }
}

// Processing functions that match summarize.ts behavior
function processFileForPos(content: string, fileName: string) {
  const lines = content.split('\n')
  const posTagsInFile = new Set<string>()
  let hasPosTag = false
  let entriesWithMultiplePos = 0
  
  for (const line of lines) {
    if (line.includes('(') && line.includes(')')) {
      const posTags = extractPartOfSpeech(line)
      
      if (posTags.length > 0) {
        hasPosTag = true
        
        for (const posTag of posTags) {
          posTagsInFile.add(posTag)
        }
        
        if (posTags.length > 1) {
          entriesWithMultiplePos++
        }
      }
    }
  }
  
  return {
    fileName,
    hasPosTag,
    posTagsInFile,
    entriesWithMultiplePos
  }
}

function processFileForRoots(content: string, fileName: string) {
  const rootWord = extractRootWord(content)
  const rootLang = extractRootLanguage(content)
  const meWords = extractModernEnglishWords(content)
  
  return {
    fileName,
    rootWord,
    rootLang,
    meWords
  }
}

/**
 * Analyze part-of-speech data from files
 * Matches the output format of summarize.ts
 */
function analyzePosData(files: Array<{path: string, content: string}>, verbose: boolean) {
  log("Analyzing part of speech data...")
  
  const posCounts: Record<string, number> = {}
  const filesByPos: Record<string, string[]> = {}
  const filesWithoutPos: string[] = []
  let totalPosEntries = 0
  let totalEntriesWithMultiplePos = 0
  
  for (const file of files) {
    const result = processFileForPos(file.content, path.basename(file.path))
    
    if (result.hasPosTag) {
      totalPosEntries++
      totalEntriesWithMultiplePos += result.entriesWithMultiplePos
      
      for (const posTag of result.posTagsInFile) {
        if (!posCounts[posTag]) {
          posCounts[posTag] = 0
          filesByPos[posTag] = []
        }
        
        posCounts[posTag]++
        
        if (!filesByPos[posTag].includes(result.fileName)) {
          filesByPos[posTag].push(result.fileName)
        }
      }
    } else {
      filesWithoutPos.push(result.fileName)
    }
  }
  
  // Calculate percentages
  const posDistribution: Record<string, number> = {}
  for (const [pos, count] of Object.entries(posCounts)) {
    posDistribution[pos] = parseFloat(((count / Math.max(totalPosEntries, 1)) * 100).toFixed(1))
  }
  
  // Get full names from posMap
  const posFullNames: Record<string, string> = {}
  for (const [shortPos, fullName] of Object.entries(posMap)) {
    posFullNames[shortPos] = fullName
  }
  
  const summary = {
    totalFiles: files.length,
    processedFiles: files.length,
    failedFiles: 0,
    totalEntriesWithPos: totalPosEntries,
    entriesWithMultiplePos: totalEntriesWithMultiplePos,
    uniquePartsOfSpeech: Object.keys(posCounts),
    posCounts,
    posDistribution,
    posFullNames,
    examples: Object.fromEntries(
      Object.entries(filesByPos).map(([pos, files]) => [
        pos, 
        files.slice(0, 5).map(f => f.replace('.txt', ''))
      ])
    ),
    filesWithoutPos
  }
  
  // Save to file
  const outputPath = path.join(DEFAULT_PATHS.base.analysis, 'pos-summary.json')
  io.writer(outputPath, summary)
  
  log(`Part of speech summary saved to ${outputPath}`)
  
  // Log results
  if (verbose || true) {
    logPosResults(summary)
  }
  
  return summary
}

/**
 * Analyze root words from files
 * Matches the output format of summarize.ts
 */
function analyzeRootWords(files: Array<{path: string, content: string}>, verbose: boolean) {
  log("Analyzing root words...")
  
  const rootWords: Record<string, any> = {}
  const rootLangCount: Record<string, number> = {}
  const missingRoots: string[] = []
  
  for (const file of files) {
    const result = processFileForRoots(file.content, path.basename(file.path))
    
    if (result.rootWord && result.rootLang) {
      if (!rootLangCount[result.rootLang]) {
        rootLangCount[result.rootLang] = 0
      }
      rootLangCount[result.rootLang]++
      
      if (!rootWords[result.rootWord]) {
        rootWords[result.rootWord] = {
          root: result.rootWord,
          language: result.rootLang,
          files: [],
          modernWords: []
        }
      }
      
      rootWords[result.rootWord].files.push(result.fileName)
      for (const meWord of result.meWords) {
        if (!rootWords[result.rootWord].modernWords.includes(meWord)) {
          rootWords[result.rootWord].modernWords.push(meWord)
        }
      }
    } else {
      missingRoots.push(result.fileName)
    }
  }
  
  const summary = {
    totalFiles: files.length,
    processedFiles: files.length,
    failedFiles: 0,
    uniqueRoots: Object.keys(rootWords).length,
    rootsByLanguage: rootLangCount,
    missingRoots: missingRoots.length,
    roots: Object.values(rootWords)
  }
  
  // Save to file
  const outputPath = path.join(DEFAULT_PATHS.base.analysis, 'root-words.json')
  io.writer(outputPath, summary)
  
  log(`Root words summary saved to ${outputPath}`)
  
  // Log results
  if (verbose || true) {
    logRootResults(summary, rootWords, rootLangCount)
  }
  
  return summary
}

// Logging functions
function logPosResults(summary: any): void {
  log("\n=== Parts of Speech Summary ===")
  log(`Total files analyzed: ${summary.totalFiles}`)
  log(`Files with part of speech tags: ${summary.totalEntriesWithPos}`)
  log(`Files without part of speech tags: ${summary.filesWithoutPos.length}`)
  log(`Entries with multiple parts of speech: ${summary.entriesWithMultiplePos}`)
  
  log("\nDistribution:")
  const sortedPos = Object.keys(summary.posCounts).sort((a, b) => summary.posCounts[b] - summary.posCounts[a])
  for (const pos of sortedPos) {
    const count = summary.posCounts[pos]
    const percentage = summary.posDistribution[pos]
    // For normalized POS, show the full name if available
    const fullName = posMap[pos] || pos
    log(`- ${pos}: ${count} entries (${percentage}%) - ${fullName}`)
  }
  
  if (summary.filesWithoutPos.length > 0) {
    log(`\nFiles without POS tags: ${summary.filesWithoutPos.length}`)
    if (summary.filesWithoutPos.length <= 10) {
      summary.filesWithoutPos.forEach((file: string) => {
        log(`- ${file}`)
      })
    } else {
      summary.filesWithoutPos.slice(0, 10).forEach((file: string) => {
        log(`- ${file}`)
      })
      log(`...and ${summary.filesWithoutPos.length - 10} more`)
    }
  }
}

function logRootResults(summary: any, rootWords: Record<string, any>, rootLangCount: Record<string, number>): void {
  log("\n=== Root Words Summary ===")
  log(`Total files analyzed: ${summary.totalFiles}`)
  log(`Unique root words: ${Object.keys(rootWords).length}`)
  log(`Files missing root words: ${summary.missingRoots}`)
  
  log("\nDistribution by language:")
  const sortedLangs = Object.keys(rootLangCount).sort(
    (a, b) => rootLangCount[b] - rootLangCount[a]
  )
  for (const lang of sortedLangs) {
    const count = rootLangCount[lang]
    const percentage = ((count / summary.totalFiles) * 100).toFixed(1)
    log(`- ${lang}: ${count} roots (${percentage}%)`)
  }
  
  log("\nSample root words:")
  const sampleRoots = Object.values(rootWords).slice(0, 5)
  for (const root of sampleRoots) {
    log(`- ${root.root} [${root.language}] → ${root.modernWords.join(', ')}`)
  }
}

/**
 * Create the analyze command
 */
export function createAnalyzeCommand(): Command {
  return {
    description: 'Analyze etymology data for statistics',
    
    execute(args: string[]): Result<void> {
      const parsedArgs = parseAnalyzeArgs(args)
      
      const languagePathsResult = mapLanguageToPath(parsedArgs.language)
      
      return fold(
        (error: Error) => err(error),
        (paths: { source: string, target: string }) => {
          const { source: sourceDir } = paths
          
          log(`Starting analysis for ${sourceDir} in ${parsedArgs.mode} mode...`)
          
          // Ensure analysis directory exists
          io.dirCreator(DEFAULT_PATHS.base.analysis)
          
          // Find all text files
          const filesResult = findTextFiles(sourceDir)
          
          return fold(
            (error: Error) => err(error),
            (filePaths: string[]) => {
              if (filePaths.length === 0) {
                return err(new Error(`No text files found in ${sourceDir}`))
              }
              
              log(`Found ${filePaths.length} text files to analyze.`)
              
              // Read all files
              const files: Array<{path: string, content: string}> = []
              for (const filePath of filePaths) {
                const readResult = io.reader(filePath)
                fold(
                  (error: Error) => log(`Failed to read ${filePath}: ${error.message}`),
                  (content: string) => files.push({ path: filePath, content })
                )(readResult)
              }
              
              // Run analysis based on mode
              if (parsedArgs.mode === 'pos' || parsedArgs.mode === 'both') {
                analyzePosData(files, parsedArgs.verbose)
              }
              
              if (parsedArgs.mode === 'roots' || parsedArgs.mode === 'both') {
                analyzeRootWords(files, parsedArgs.verbose)
              }
              
              log(`\nAnalysis completed successfully!`)
              log(`Output files in: ${DEFAULT_PATHS.base.analysis}`)
              
              return ok(undefined)
            }
          )(filesResult)
        }
      )(languagePathsResult)
    },
    
    printHelp() {
      log(`Usage: etymology analyze [language] [options]`)
      log(``)
      log(`Analyze etymology files for statistics and patterns`)
      log(``)
      log(`Arguments:`)
      log(`  language    Language directory to analyze (default: inglish)`)
      log(``)
      log(`Options:`)
      log(`  --mode, -m <mode>     Analysis mode: pos, roots, or both (default: both)`)
      log(`  --verbose, -v         Show detailed logging`)
      log(``)
      log(`Examples:`)
      log(`  etymology analyze                    Analyze inglish with both modes`)
      log(`  etymology analyze --mode pos         Analyze parts of speech only`)
      log(`  etymology analyze --mode roots       Analyze root words only`)
      log(`  etymology analyze inglish -m both -v Verbose analysis of inglish`)
    }
  }
}