// src/processors/file-processor.ts
import * as fs from 'fs'
import * as path from 'path'

// Core types
import { 
  TextLine, 
  TextProcessingPipeline,
  WordEntry,
  EtymologyEntry
} from '../core'

// Config
import { languageMap, posMap } from '../config'

// Utils
import { 
  log, 
  logError, 
  logConversion, 
  logDebug,
  ensureDirExists
} from '../utils'

/**
 * Extract parts of speech from a line - direct port from text-to-json.ts
 */
function extractPartOfSpeech(line: string): string[] | undefined {
  // Match pattern like "(v)" or "(f n)" or "(adv, adj)" at the end of the line
  const match = line.match(/\(([\w\s,]+)\)$/)
  
  if (!match) return undefined
  
  // Get the part of speech text and split by comma
  const posText = match[1]
  const posParts = posText.split(',').map(part => part.trim())
  
  // Convert each part to its full form if available
  return posParts.map(part => posMap[part] || part)
}

/**
 * Extract a word name from the first line of text - direct port from text-to-json.ts
 */
function extractNameFromFirstLine(firstLine: string): string {
  const wordMatch = firstLine.match(/^([a-zA-Z]+)/)
  return wordMatch ? wordMatch[1] : ""
}

/**
 * Direct port of parseTextToJson from text-to-json.ts
 * This ensures exact compatibility with the original behavior
 */
function parseTextToJson(textContent: string, fileName: string): WordEntry[] {
  // Strip file extension to get the base name - this will be the fallback name
  const fallbackName = fileName.replace('.txt', '')
  
  // Normalize line endings to \n (in case file has Windows line endings)
  textContent = textContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  // Split the content by double newline to separate word entries
  const entries = textContent.split('\n\n').filter(entry => entry.trim())
  
  // Process each entry
  return entries.map((entry, index) => {
    // Split entry into lines
    const lines = entry.split('\n').filter(line => line.trim())
    
    // Separate etymology lines from source URLs
    const etymologyLines: string[] = []
    const sourceUrls: string[] = []
    
    for (const line of lines) {
      if (line.startsWith('http')) {
        sourceUrls.push(line)
      } else {
        etymologyLines.push(line)
      }
    }
    
    // Find the Modern English entry if it exists
    const meLineIndex = etymologyLines.findIndex(line => {
      const brackets = line.match(/\[(.*?)\]/)
      return brackets && brackets[1] === 'ME'
    })
    
    // Determine the name based on whether we found an ME entry
    const name = (meLineIndex !== -1)
      ? etymologyLines[meLineIndex].replace(/\[ME\]/, '').trim()
      : (index > 0 && lines.length > 0)
        ? extractNameFromFirstLine(lines[0])
        : fallbackName
    
    // Process etymology lines
    const etymology: EtymologyEntry[] = etymologyLines.map(line => {
      const brackets = line.match(/\[(.*?)\]/)
      const origin = (brackets && brackets[1] && languageMap[brackets[1]])
        ? languageMap[brackets[1]].name
        : 'Inglish'
      
      // Remove the origin part from the name
      const nameWithoutOrigin = line.replace(/\[.*?\]/, '').trim()
      
      // Create the base etymology entry
      const etymologyEntry: EtymologyEntry = {
        name: nameWithoutOrigin,
        origin: origin
      }
      
      // If this is an Inglish origin, check for part of speech
      if (origin === 'Inglish') {
        const partOfSpeech = extractPartOfSpeech(nameWithoutOrigin)
        if (partOfSpeech) {
          // Remove the part of speech from the name
          etymologyEntry.name = nameWithoutOrigin.replace(/\s*\([\w\s,]+\)$/, '').trim()
          etymologyEntry["part-of-speech"] = partOfSpeech
        }
      }
      
      return etymologyEntry
    })
    
    return {
      name,
      etymology,
      sources: sourceUrls
    }
  })
}

/**
 * Make convertText use the exact logic from text-to-json.ts for standard pipeline
 * For other pipelines, returns empty array (they would need separate implementation)
 */
export function convertText<TEntry = any, TCustom = any>(
  pipeline: TextProcessingPipeline<TEntry, TCustom>
) {
  return function processText(textContent: string, fileName: string): Array<any> {
    // For standard pipeline (no custom transformers), use text-to-json.ts logic
    if (Object.keys(pipeline.customTransformers).length === 0) {
      // Step 1: Apply character transformations (this is still needed)
      const transformedText = pipeline.textTransform(textContent)
      
      // Step 2: Use the exact parsing logic from text-to-json.ts
      const result = parseTextToJson(transformedText, fileName)
      
      return result
    }
    
    // For other pipelines with custom transformers
    // You would need to implement these separately if needed
    logDebug(`Custom pipeline not yet supported for text-to-json.ts compatibility`)
    return []
  }
}

export function processFile<TEntry = any, TCustom = any>(
  targetBase: string, 
  converter: (textContent: string, fileName: string) => Array<TEntry | Record<string, TCustom>>
) {
  return function processFileWithConverter(filePath: string, relPath: string): void {
    const fileName = path.basename(filePath)
    
    if (!fileName.endsWith('.txt')) {
      return
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Convert using the typed converter function
      const jsonData = converter(content, fileName)
      
      // Determine target path
      const targetFilePath = path.join(
        targetBase,
        relPath.replace('.txt', '.json')
      )
      const targetDir = path.dirname(targetFilePath)
      
      // Ensure directory exists
      ensureDirExists(targetDir)
      
      // Write JSON file with typed data
      fs.writeFileSync(
        targetFilePath,
        JSON.stringify(jsonData, null, 2),
        'utf8'
      )
      
      logConversion(filePath, targetFilePath)
    } catch (error) {
      logError(`Error processing file ${filePath}:`, error)
    }
  }
}