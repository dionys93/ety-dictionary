// src/utils/text-utils.ts
// Generic text processing utilities

import { TextLine } from '../types/text'
import { PATTERNS } from '../config/patterns'

/**
 * Convert a string to TextLine interface
 */
export function stringToTextLine(content: string, lineNumber: number = 1): TextLine {
  return {
    content,
    lineNumber,
    isEmpty: content.trim().length === 0
  }
}

/**
 * Convert an array of strings to TextLine array
 */
export function stringsToTextLines(lines: string[]): TextLine[] {
  return lines.map((content, index) => stringToTextLine(content, index + 1))
}

/**
 * Split text into stanzas (groups separated by empty lines)
 * Returns array of string arrays for simplicity
 */
export function splitIntoStanzas(text: string): string[][] {
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
 * Clean a line by removing language tags and infinitive "to"
 */
export function cleanLine(line: string): string {
  return line
    .replace(PATTERNS.LANGUAGE_TAG, '')
    .trim()
    .replace(PATTERNS.INFINITIVE, '')
}

/**
 * Extract the first word from a line (after cleaning)
 */
export function extractFirstWord(line: string, clean: boolean = true): string | null {
  const processedLine = clean ? cleanLine(line) : line
  const match = processedLine.match(PATTERNS.WORD)
  return match ? match[1] : null
}

/**
 * Remove POS indicator from a line while preserving other content
 */
export function removePOSFromLine(line: string): string {
  const posMatch = line.match(PATTERNS.POS_ANYWHERE)
  
  if (posMatch) {
    const posStartIndex = line.lastIndexOf(posMatch[0])
    return line.substring(0, posStartIndex).trimEnd()
  }
  
  return line
}

/**
 * Check if a line contains any language tag
 */
export function hasLanguageTag(line: string): boolean {
  return PATTERNS.LANGUAGE_TAG.test(line)
}

/**
 * Check if a line contains ME or MI tag
 */
export function hasMEorMITag(line: string): boolean {
  return PATTERNS.ME_MI.test(line)
}

/**
 * Extract language code from a line
 */
export function extractLanguageCode(line: string): string | null {
  const match = line.match(PATTERNS.SPECIFIC_LANGUAGE_TAG)
  return match ? match[1] : null
}