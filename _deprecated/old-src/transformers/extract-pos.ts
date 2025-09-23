// src/cli/commands/extract-pos.ts
// Extract stanzas with part-of-speech indicators into separate files
import * as path from 'path'
import { Result, ok, err, fold } from '../core'
import { 
  log, 
  logError, 
  ensureDirExists,
  stringToTextLine,
  splitIntoStanzas,
  cleanLine,
  extractFirstWord,
  removePOSFromLine,
  hasLanguageTag,
  hasMEorMITag
} from '../utils'
import { PATTERNS } from '../config'
import { parseLanguageOrigin } from '../transformers'
import { mapLanguageToPath } from '../config'
import { Command } from '../cli/types'
import { io } from '../cli/shared/io-instances'
import { createSafeFileWriter } from '../io/file-operations'
import { findTextFilesInAlphabeticalDirs } from '../io/alpha-file-finder'

// Part of speech mapping - keeping this local since reverse mapping isn't worth it
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
 * Represents a stanza with optional part of speech information
 */
interface Stanza {
  lines: string[]
  partOfSpeech?: string
  modernWord?: string | null  // Word from [ME] or [MI] line
  posLineIndex?: number  // Index of the line containing POS indicator
  hasInlinePOS?: boolean  // True if [ME]/[MI] and (pos) are on same line
}

/**
 * Processing statistics for tracking progress
 */
interface ProcessingStats {
  extractedCount: number
  skippedNoModern: number
  filesProcessed: number
  totalFiles: number
}

/**
 * Extract part of speech from a line
 * Returns the POS abbreviation if found, null otherwise
 */
function extractPartOfSpeech(line: string): string | null {
  const match = line.match(PATTERNS.POS)
  
  if (match) {
    const pos = match[1].trim()
    // Check if it's a known part of speech
    if (POS_ABBREVIATIONS[pos]) {
      return pos
    }
  }
  
  return null
}

/**
 * Extract the first word from a line with language tag using existing parser
 */
function extractWordFromTaggedLine(line: string): string | null {
  const textLine = stringToTextLine(line)
  const parsed = parseLanguageOrigin(textLine)
  
  // Check if it's [ME] or [MI]
  if (parsed.language === 'ME' || parsed.language === 'MI') {
    // Skip "to" at the beginning for infinitive verbs
    const text = parsed.text.replace(PATTERNS.INFINITIVE, '')
    const match = text.match(PATTERNS.WORD)
    return match ? match[1] : null
  }
  
  return null
}

/**
 * Try to find the modern word from various sources
 */
function findModernWord(stanza: Stanza, lines: string[]): string | null {
  // Priority 1: [ME] tag
  for (const line of lines) {
    if (hasMEorMITag(line) && line.includes('[ME]')) {
      const word = extractWordFromTaggedLine(line)
      if (word) return word
    }
  }
  
  // Priority 2: [MI] tag
  for (const line of lines) {
    if (hasMEorMITag(line) && line.includes('[MI]')) {
      const word = extractWordFromTaggedLine(line)
      if (word) return word
    }
  }
  
  // Priority 3: Line before POS (fallback)
  if (stanza.posLineIndex !== undefined && stanza.posLineIndex > 0) {
    const lineBeforePOS = lines[stanza.posLineIndex - 1]
    return extractFirstWord(lineBeforePOS)
  }
  
  return null
}

/**
 * Process a stanza and extract POS information
 */
function processStanza(lines: string[]): Stanza {
  const stanza: Stanza = { lines }
  
  // First, find if there's a POS indicator in any line
  let posFound = false
  let posLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const pos = extractPartOfSpeech(lines[i])
    if (pos) {
      stanza.partOfSpeech = pos
      posLineIndex = i
      posFound = true
      break
    }
  }
  
  // If no POS found, return early
  if (!posFound) {
    return stanza
  }
  
  // Store the index of the POS line
  stanza.posLineIndex = posLineIndex
  
  // Check if this line also has any language tag
  const posLine = lines[posLineIndex]
  
  if (hasLanguageTag(posLine)) {
    stanza.hasInlinePOS = true
    // Extract word from this line (handles any language tag)
    const word = extractFirstWord(posLine)
    if (word) {
      stanza.modernWord = word
      return stanza
    }
  }
  
  // Look for word in priority order
  stanza.modernWord = findModernWord(stanza, lines)
  
  return stanza
}

/**
 * Generate output content for a stanza
 */
function generateOutputContent(stanza: Stanza): string {
  let linesToWrite: string[]
  
  if (stanza.hasInlinePOS && stanza.posLineIndex !== undefined) {
    // [ME]/[MI] and POS are on the same line
    // Keep the line but remove the POS part
    linesToWrite = stanza.lines.map((line, index) => {
      if (index === stanza.posLineIndex) {
        return removePOSFromLine(line)
      }
      return line
    })
  } else {
    // [ME]/[MI] and POS are on different lines
    // Remove the entire POS line
    linesToWrite = stanza.posLineIndex !== undefined 
      ? stanza.lines.filter((_, index) => index !== stanza.posLineIndex)
      : stanza.lines
  }
  
  return linesToWrite.join('\n')
}

/**
 * Process a single stanza and write output if valid
 */
function processAndWriteStanza(
  stanzaLines: string[], 
  targetDir: string,
  stats: ProcessingStats,
  writer: ReturnType<typeof createSafeFileWriter>
): Result<void> {
  const stanza = processStanza(stanzaLines)
  
  if (stanza.partOfSpeech && stanza.modernWord) {
    // Create filename: word_pos.txt
    const posAbbrev = POS_ABBREVIATIONS[stanza.partOfSpeech] || stanza.partOfSpeech
    const fileName = `${stanza.modernWord}_${posAbbrev}.txt`
    const targetPath = path.join(targetDir, fileName)
    
    // Generate and write content
    const content = generateOutputContent(stanza)
    const writeResult = writer(targetPath, content)
    
    if (writeResult.isSuccess) {
      stats.extractedCount++
      return ok(undefined)
    } else {
      return writeResult
    }
  } else if (stanza.partOfSpeech && !stanza.modernWord) {
    // Has POS but no word found
    stats.skippedNoModern++
  }
  
  return ok(undefined)
}

/**
 * Process a single file and extract stanzas with POS indicators
 */
function processFile(
  filePath: string, 
  fromDir: string, 
  toDir: string,
  stats: ProcessingStats
): Result<void> {
  // Read file content
  const readResult = io.reader(filePath)
  
  return fold(
    (error: Error) => err(new Error(`Failed to read ${filePath}: ${error.message}`)),
    (content: string) => {
      // Get relative path from source directory
      const relativePath = path.relative(fromDir, filePath)
      const dirName = path.dirname(relativePath)
      const targetDir = path.join(toDir, dirName)
      
      // Ensure target directory exists
      ensureDirExists(targetDir)
      
      // Split into stanzas using the shared utility
      const stanzas = splitIntoStanzas(content)
      
      // Create a text file writer
      const writer = createSafeFileWriter()
      
      // Process each stanza
      const localStats = {
        extractedCount: 0,
        skippedNoModern: 0
      }
      
      for (const stanzaLines of stanzas) {
        const tempStats = { ...stats }
        const result = processAndWriteStanza(stanzaLines, targetDir, tempStats, writer)
        
        if (result.isSuccess) {
          localStats.extractedCount += tempStats.extractedCount - stats.extractedCount
          localStats.skippedNoModern += tempStats.skippedNoModern - stats.skippedNoModern
        }
      }
      
      // Update global stats
      stats.extractedCount += localStats.extractedCount
      stats.skippedNoModern += localStats.skippedNoModern
      
      // Log file-specific results
      if (localStats.extractedCount > 0) {
        log(`Extracted: ${relativePath} → ${dirName}/ (${localStats.extractedCount} files)`)
      }
      if (localStats.skippedNoModern > 0) {
        log(`  Note: Skipped ${localStats.skippedNoModern} stanza(s) with POS but no word found`)
      }
      
      return ok(undefined)
    }
  )(readResult)
}

/**
 * Core extraction options
 */
export interface ExtractPosOptions {
  sourceDir: string
  outputDir: string
  dryRun: boolean
  verbose: boolean
  dirs?: string[]
}

/**
 * Core extraction functionality that can be used by other commands
 * This is the internal implementation
 */
export function extractPosCore(options: ExtractPosOptions): Result<void> {
  const { sourceDir, outputDir, dryRun, verbose, dirs } = options
  
  // Ensure output directory exists
  ensureDirExists(outputDir)
  
  // Find all text files in alphabetical directories only
  const filesResult = findTextFilesInAlphabeticalDirs(sourceDir)
  
  return fold(
    (error: Error) => err(error),
    (filePaths: string[]) => {
      // Filter by specific directories if requested
      let filesToProcess = filePaths
      if (dirs && dirs.length > 0) {
        filesToProcess = filePaths.filter(filePath => {
          const relativePath = path.relative(sourceDir, filePath)
          const firstDir = relativePath.split(path.sep)[0]
          return dirs.includes(firstDir)
        })
      }
      
      if (filesToProcess.length === 0) {
        return err(new Error('No files found to process'))
      }
      
      log(`Found ${filesToProcess.length} files to process`)
      
      if (dryRun) {
        log(`DRY RUN: Would process ${filesToProcess.length} files`)
        filesToProcess.slice(0, 5).forEach(file => 
          log(` - ${path.relative(sourceDir, file)}`)
        )
        if (filesToProcess.length > 5) {
          log(`  ... and ${filesToProcess.length - 5} more files`)
        }
        return ok(undefined)
      }
      
      // Process all files
      const stats: ProcessingStats = {
        extractedCount: 0,
        skippedNoModern: 0,
        filesProcessed: 0,
        totalFiles: filesToProcess.length
      }
      
      for (const filePath of filesToProcess) {
        const result = processFile(filePath, sourceDir, outputDir, stats)
        stats.filesProcessed++
        
        if (!result.isSuccess && verbose) {
          logError(`Failed to process ${filePath}: ${result.error!.message}`)
        }
        
        // Log progress every 100 files
        if (stats.filesProcessed % 100 === 0) {
          log(`Progress: ${stats.filesProcessed}/${stats.totalFiles} files processed`)
        }
      }
      
      // Final summary
      log(`\nProcessing complete!`)
      log(`Extracted ${stats.extractedCount} stanzas with part-of-speech indicators`)
      if (stats.skippedNoModern > 0) {
        log(`Note: Skipped ${stats.skippedNoModern} stanzas that had POS but no extractable word`)
      }
      
      return ok(undefined)
    }
  )(filesResult)
}

/**
 * Parse command line arguments for extract-pos
 */
interface ExtractPosArgs {
  language: string
  outputDir: string
  dryRun: boolean
  verbose: boolean
  dirs?: string[]
}

function parseExtractPosArgs(args: string[]): Result<ExtractPosArgs> {
  const nonOptionArgs = args.filter(arg => !arg.startsWith('-'))
  
  if (nonOptionArgs.length < 1) {
    return err(new Error('Output directory is required'))
  }
  
  const parsed: ExtractPosArgs = {
    language: 'inglish',
    outputDir: nonOptionArgs[0],
    dryRun: false,
    verbose: false
  }
  
  // If two non-option args, first is language
  if (nonOptionArgs.length >= 2) {
    parsed.language = nonOptionArgs[0]
    parsed.outputDir = nonOptionArgs[1]
  }
  
  // Process options
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    switch (arg) {
      case '--dry-run':
      case '-d':
        parsed.dryRun = true
        break
        
      case '--verbose':
      case '-v':
        parsed.verbose = true
        break
        
      case '--dirs':
        if (i + 1 < args.length) {
          parsed.dirs = args[i + 1].split(',').map(d => d.trim())
        }
        break
    }
  }
  
  return ok(parsed)
}

/**
 * Create the extract-pos command
 */
export function createExtractPosCommand(): Command {
  return {
    description: 'Extract stanzas with part-of-speech indicators',
    
    execute(args: string[]): Result<void> {
      const parsedArgsResult = parseExtractPosArgs(args)
      
      return fold(
        (error: Error) => err(error),
        (parsedArgs: ExtractPosArgs) => {
          const languagePathsResult = mapLanguageToPath(parsedArgs.language)
          
          return fold(
            (error: Error) => err(error),
            (paths: { source: string, target: string }) => {
              const { source: sourceDir } = paths
              const outputDir = parsedArgs.outputDir
              
              log(`Processing files from ${sourceDir} to ${outputDir}...`)
              log(`Note: Only processing single-character directories (a-z, A-Z)`)
              
              // Ensure output directory exists
              ensureDirExists(outputDir)
              
              // Find all text files in alphabetical directories
              const filesResult = findTextFilesInAlphabeticalDirs(sourceDir)
              
              return fold(
                (error: Error) => err(error),
                (filePaths: string[]) => {
                  // Filter by specific directories if requested
                  let filesToProcess = filePaths
                  if (parsedArgs.dirs && parsedArgs.dirs.length > 0) {
                    filesToProcess = filePaths.filter(filePath => {
                      const relativePath = path.relative(sourceDir, filePath)
                      const firstDir = relativePath.split(path.sep)[0]
                      return parsedArgs.dirs!.includes(firstDir)
                    })
                  }
                  
                  if (filesToProcess.length === 0) {
                    return err(new Error('No files found to process'))
                  }
                  
                  log(`Found ${filesToProcess.length} files to process`)
                  
                  if (parsedArgs.dryRun) {
                    log(`DRY RUN: Would process ${filesToProcess.length} files`)
                    filesToProcess.slice(0, 5).forEach(file => 
                      log(` - ${path.relative(sourceDir, file)}`)
                    )
                    if (filesToProcess.length > 5) {
                      log(`  ... and ${filesToProcess.length - 5} more files`)
                    }
                    return ok(undefined)
                  }
                  
                  // Process all files
                  const stats: ProcessingStats = {
                    extractedCount: 0,
                    skippedNoModern: 0,
                    filesProcessed: 0,
                    totalFiles: filesToProcess.length
                  }
                  
                  for (const filePath of filesToProcess) {
                    const result = processFile(filePath, sourceDir, outputDir, stats)
                    stats.filesProcessed++
                    
                    if (!result.isSuccess && parsedArgs.verbose) {
                      logError(`Failed to process ${filePath}: ${result.error!.message}`)
                    }
                    
                    // Log progress every 100 files
                    if (stats.filesProcessed % 100 === 0) {
                      log(`Progress: ${stats.filesProcessed}/${stats.totalFiles} files processed`)
                    }
                  }
                  
                  // Final summary
                  log(`\nProcessing complete!`)
                  log(`Extracted ${stats.extractedCount} stanzas with part-of-speech indicators`)
                  if (stats.skippedNoModern > 0) {
                    log(`Note: Skipped ${stats.skippedNoModern} stanzas that had POS but no extractable word`)
                  }
                  
                  return ok(undefined)
                }
              )(filesResult)
            }
          )(languagePathsResult)
        }
      )(parsedArgsResult)
    },
    
    printHelp() {
      log(`Usage: etymology extract-pos [language] <output-dir> [options]`)
      log(``)
      log(`Extract stanzas with part-of-speech indicators into separate files.`)
      log(`Only processes files within single-character alphabetical directories.`)
      log(``)
      log(`Arguments:`)
      log(`  language       Language directory to process (default: inglish)`)
      log(`  output-dir     Directory to write extracted files`)
      log(``)
      log(`Options:`)
      log(`  --dry-run, -d        Preview what would be extracted`)
      log(`  --verbose, -v        Show detailed processing information`)
      log(`  --dirs <a,b,c>      Only process specific directories`)
      log(``)
      log(`Examples:`)
      log(`  etymology extract-pos output/               Extract from inglish to output/`)
      log(`  etymology extract-pos inglish histories/    Extract from inglish to histories/`)
      log(`  etymology extract-pos --dirs a,b,c output/  Only process a/, b/, c/ directories`)
      log(`  etymology extract-pos -d -v output/         Dry run with verbose output`)
      log(``)
      log(`Output format:`)
      log(`  Files are named: <word>_<pos>.txt`)
      log(`  Example: abandon_v.txt, butter_n.txt`)
      log(``)
      log(`Note: The line containing the part-of-speech indicator is removed from output.`)
      log(`      If [ME]/[MI] and (pos) are on the same line, only the (pos) is removed.`)
    }
  }
}