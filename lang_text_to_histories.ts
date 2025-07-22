// lang_text_to_histories.ts
// Script to extract stanzas with part-of-speech indicators into separate files
//
// Only processes single-character directories at the root level (alphabetical organization)
// This ensures we only process word directories like /a/, /b/, /c/, etc.
// and skip special directories like /grammar/, /pronouns/, etc.
//
// File naming: Uses the first word from the line containing [ME] or [MI] tag
// 
// Example transformations:
// Stanza containing "king [ME]" or "king [MI]" with "(m n)" anywhere → /to_dir/k/king_n.txt
// Stanza containing "to king [ME]" with "(v)" anywhere → /to_dir/k/king_v.txt (ignores "to")
// Stanza containing "kingly [ME]" with "(adj)" anywhere → /to_dir/k/kingly_adj.txt
// /inglisc/grammar/* → skipped (not a single-character directory)

import * as fs from 'fs'
import * as path from 'path'
import { ensureDirExists, log, logError, Result, ok, err, fold } from './src'

// Part of speech mapping from your pos-map.ts
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
  modernWord?: string  // Word from [ME] or [MI] line
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
 * Split text into stanzas (groups separated by empty lines)
 */
function splitIntoStanzas(text: string): string[][] {
  const lines = text.split('\n')
  const stanzas: string[][] = []
  let currentStanza: string[] = []
  
  for (const line of lines) {
    if (line.trim() === '') {
      if (currentStanza.length > 0) {
        stanzas.push(currentStanza)
        currentStanza = []
      }
    } else {
      currentStanza.push(line)
    }
  }
  
  // Don't forget the last stanza
  if (currentStanza.length > 0) {
    stanzas.push(currentStanza)
  }
  
  return stanzas
}

/**
 * Extract part of speech from a line
 * Returns the POS abbreviation if found, null otherwise
 */
function extractPartOfSpeech(line: string): string | null {
  // Match content within parentheses at the end of the line
  const match = line.match(/\(([^)]+)\)\s*$/)
  
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
 * Extract the first word from a line with language tag
 */
function extractWordFromTaggedLine(line: string): string | null {
  // Check if line has [ME] or [MI] tag
  if (!line.includes('[ME]') && !line.includes('[MI]')) {
    return null
  }
  
  // Remove the language tag
  const lineWithoutTag = line.replace(/\[M[EI]\]/g, '').trim()
  
  // Skip "to" at the beginning for infinitive verbs
  const lineWithoutTo = lineWithoutTag.replace(/^to\s+/i, '')
  
  // Match the first word (letters, possibly with diacritics)
  const match = lineWithoutTo.match(/^([a-zA-ZÀ-ÿāăąćĉċčďđēĕėęěĝğġģĥħĩīĭįıĵķĸĺļľŀłńņňŉŋōŏőœŕŗřśŝşšţťŧũūŭůűųŵŷźżžǎǐǒǔǖǘǚǜǟǡǣǧǩǫǭǯǵǹǻǽǿȁȃȅȇȉȋȍȏȑȓȕȗșțȟȧȩȫȭȯȱȳḃḋḟġḣṁṅṗṙṡṫẁẃẅẇẋẏẑ]+)/i)
  
  return match ? match[1] : null
}

/**
 * Process a stanza and extract POS information
 */
function processStanza(lines: string[]): Stanza {
  const stanza: Stanza = { lines }
  
  // First, find if there's a POS indicator in any line
  let posFound = false
  for (const line of lines) {
    const pos = extractPartOfSpeech(line)
    if (pos) {
      stanza.partOfSpeech = pos
      posFound = true
      break
    }
  }
  
  // If no POS found, return early
  if (!posFound) {
    return stanza
  }
  
  // Look for a line with [ME] or [MI] tag to get the word
  for (const line of lines) {
    const word = extractWordFromTaggedLine(line)
    if (word) {
      stanza.modernWord = word
      break // Use the first [ME] or [MI] line found
    }
  }
  
  return stanza
}

/**
 * Process a single file and extract stanzas with POS indicators
 */
function processFile(filePath: string, fromDir: string, toDir: string): Result<number> {
  try {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf8')
    
    // Get relative path from source directory
    const relativePath = path.relative(fromDir, filePath)
    const dirName = path.dirname(relativePath)
    const targetDir = path.join(toDir, dirName)
    
    // Ensure target directory exists
    ensureDirExists(targetDir)
    
    // Split into stanzas
    const stanzas = splitIntoStanzas(content)
    
    // Process each stanza
    let extractedCount = 0
    
    for (const stanzaLines of stanzas) {
      const stanza = processStanza(stanzaLines)
      
      if (stanza.partOfSpeech && stanza.modernWord) {
        // Create filename: word_pos.txt
        const posAbbrev = POS_ABBREVIATIONS[stanza.partOfSpeech] || stanza.partOfSpeech
        const fileName = `${stanza.modernWord}_${posAbbrev}.txt`
        const targetPath = path.join(targetDir, fileName)
        
        // Write stanza to file
        const stanzaContent = stanza.lines.join('\n')
        fs.writeFileSync(targetPath, stanzaContent, 'utf8')
        
        log(`Extracted: ${relativePath} -> ${path.join(dirName, fileName)}`)
        extractedCount++
      }
    }
    
    return ok(extractedCount)
  } catch (error) {
    return err(new Error(`Failed to process ${filePath}: ${error}`))
  }
}

/**
 * Process a directory recursively
 */
function processDirectory(fromDir: string, toDir: string, currentPath: string = ''): Result<number> {
  const fullPath = path.join(fromDir, currentPath)
  
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true })
    let totalExtracted = 0
    
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
          (count: number) => totalExtracted += count
        )(result)
      } else if (entry.name.endsWith('.txt')) {
        // Process text files
        const filePath = path.join(fromDir, entryPath)
        const result = processFile(filePath, fromDir, toDir)
        
        fold(
          (error: Error) => logError(error.message),
          (count: number) => totalExtracted += count
        )(result)
      }
    }
    
    return ok(totalExtracted)
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
        (count: number) => {
          log(`\nProcessing complete! Extracted ${count} stanzas with part-of-speech indicators.`)
        }
      )(result)
    }
  )(argsResult)
}

// Run the script
main()