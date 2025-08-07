// lang_text_to_histories.ts
// Script to extract stanzas with part-of-speech indicators into separate files
//
// Only processes single-character directories at the root level (alphabetical organization)
// This ensures we only process word directories like /a/, /b/, /c/, etc.
// and skip special directories like /grammar/, /pronouns/, etc.
//
// File naming: Uses the first word from the line containing [ME] tag (priority) or [MI] tag (fallback)
// The line containing the part-of-speech indicator (e.g., "byṫyr (m n)") is excluded from the output
// If [ME] and (pos) are on the same line, only the POS part is removed
// 
// Example transformations:
// "to achieve [ME] -s -d -ing (v)" → "to achieve [ME]" in output file achieve_v.txt
// From /lang/b/butter.txt stanza with "butter [ME]" and "byṫyr (m n)":
//   → /to_dir/b/butter_n.txt (without the "byṫyr (m n)" line)

import * as fs from 'fs'
import * as path from 'path'
import { 
  ensureDirExists, 
  log, 
  logError, 
  Result, 
  ok, 
  err, 
  fold,
  parseLanguageOrigin,
  PATTERNS,
  stringToTextLine,
  splitIntoStanzas,
  cleanLine,
  extractFirstWord,
  removePOSFromLine,
  hasLanguageTag,
  hasMEorMITag
} from './src'

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
 * Type for single-character directory names (alphabetical organization)
 */
type AlphabeticalDir = string & { readonly __brand: 'AlphabeticalDir' }

/**
 * Check if a directory name is a valid single-character alphabetical directory
 * Used to filter out directories like 'grammar', 'pronouns', etc.
 */
function isAlphabeticalDir(dirName: string): dirName is AlphabeticalDir {
  return dirName.length === 1 && /^[a-zA-Z]$/.test(dirName)
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
 * Processing statistics for a file
 */
interface ProcessingStats {
  extractedCount: number
  skippedNoModern: number
}

/**
 * Parse command line arguments
 */
function parseArgs(): Result<{ fromDir: string; toDir: string }> {
  const args = process.argv.slice(2)
  
  if (args.length !== 2) {
    return err(new Error('Usage: tsx lang_text_to_histories.ts <from_dir> <to_dir>'))
  }
  
  return ok({
    fromDir: args[0],
    toDir: args[1]
  })
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
  stats: ProcessingStats
): void {
  const stanza = processStanza(stanzaLines)
  
  if (stanza.partOfSpeech && stanza.modernWord) {
    // Create filename: word_pos.txt
    const posAbbrev = POS_ABBREVIATIONS[stanza.partOfSpeech] || stanza.partOfSpeech
    const fileName = `${stanza.modernWord}_${posAbbrev}.txt`
    const targetPath = path.join(targetDir, fileName)
    
    // Generate and write content
    const content = generateOutputContent(stanza)
    fs.writeFileSync(targetPath, content, 'utf8')
    
    stats.extractedCount++
  } else if (stanza.partOfSpeech && !stanza.modernWord) {
    // Has POS but no word found
    stats.skippedNoModern++
  }
}

/**
 * Process a single file and extract stanzas with POS indicators
 */
function processFile(filePath: string, fromDir: string, toDir: string): Result<ProcessingStats> {
  try {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf8')
    
    // Get relative path from source directory
    const relativePath = path.relative(fromDir, filePath)
    const dirName = path.dirname(relativePath)
    const targetDir = path.join(toDir, dirName)
    
    // Ensure target directory exists
    ensureDirExists(targetDir)
    
    // Split into stanzas using the shared utility
    const stanzas = splitIntoStanzas(content)
    
    // Process each stanza
    const stats: ProcessingStats = {
      extractedCount: 0,
      skippedNoModern: 0
    }
    
    for (const stanzaLines of stanzas) {
      processAndWriteStanza(stanzaLines, targetDir, stats)
    }
    
    // Log file-specific results
    if (stats.extractedCount > 0) {
      log(`Extracted: ${relativePath} → ${dirName}/ (${stats.extractedCount} files)`)
    }
    if (stats.skippedNoModern > 0) {
      log(`  Note: Skipped ${stats.skippedNoModern} stanza(s) with POS but no word found in ${relativePath}`)
    }
    
    return ok(stats)
  } catch (error) {
    return err(new Error(`Failed to process ${filePath}: ${error}`))
  }
}

/**
 * Process a directory recursively
 */
function processDirectory(fromDir: string, toDir: string, currentPath: string = ''): Result<ProcessingStats> {
  const fullPath = path.join(fromDir, currentPath)
  
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
    const totalStats: ProcessingStats = {
      extractedCount: 0,
      skippedNoModern: 0
    }
    
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      
      if (entry.isDirectory()) {
        // Check directory depth by counting path separators
        const depth = currentPath.split(path.sep).filter(p => p).length
        
        // At depth 0 (root level), only process single-character directories
        if (depth === 0 && !isAlphabeticalDir(entry.name)) {
          log(`Skipping non-alphabetical directory: ${entry.name}`)
          continue
        }
        
        // Process the directory
        const result = processDirectory(fromDir, toDir, entryPath)
        fold(
          (error: Error) => logError(error.message),
          (stats: ProcessingStats) => {
            totalStats.extractedCount += stats.extractedCount
            totalStats.skippedNoModern += stats.skippedNoModern
          }
        )(result)
      } else if (entry.name.endsWith('.txt')) {
        // Process text files
        const filePath = path.join(fromDir, entryPath)
        const result = processFile(filePath, fromDir, toDir)
        
        fold(
          (error: Error) => logError(error.message),
          (stats: ProcessingStats) => {
            totalStats.extractedCount += stats.extractedCount
            totalStats.skippedNoModern += stats.skippedNoModern
          }
        )(result)
      }
    }
    
    return ok(totalStats)
  } catch (error) {
    return err(new Error(`Failed to process directory ${fullPath}: ${error}`))
  }
}

/**
 * Main function
 */
function main(): void {
  const argsResult = parseArgs()
  
  fold(
    (error: Error) => {
      logError(error.message)
      process.exit(1)
    },
    (args: { fromDir: string; toDir: string }) => {
      const { fromDir, toDir } = args
      log(`Processing files from ${fromDir} to ${toDir}...`)
      log(`Note: Only processing single-character directories (a-z, A-Z)`)
      
      // Check if source directory exists
      if (!fs.existsSync(fromDir)) {
        logError(`Source directory does not exist: ${fromDir}`)
        process.exit(1)
      }
      
      // Ensure target directory exists
      ensureDirExists(toDir)
      
      // Process all files
      const result = processDirectory(fromDir, toDir)
      
      fold(
        (error: Error) => {
          logError(`Processing failed: ${error.message}`)
          process.exit(1)
        },
        (stats: ProcessingStats) => {
          log(`\nProcessing complete! Extracted ${stats.extractedCount} stanzas with part-of-speech indicators.`)
          if (stats.skippedNoModern > 0) {
            log(`Note: Skipped ${stats.skippedNoModern} stanzas total that had POS but no extractable word.`)
          }
        }
      )(result)
    }
  )(argsResult)
}

// Run the script
main()