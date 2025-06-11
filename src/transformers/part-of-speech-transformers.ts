// src/transformers/part-of-speech-transformers.ts
import { 
  EntryGroup, 
  ParsedLine, 
  WordEntry, 
  EtymologyEntry,
  EntryTransformer,
  WordNameExtractor,
  VerbConjugations,
  AdjectiveDegrees,
  NounGenderInfo,
  EnhancedEtymologyEntry
} from '../'

/**
 * Part of speech types for detection and processing
 */
export type PartOfSpeechType = 
  | 'noun' 
  | 'verb' 
  | 'adjective' 
  | 'adverb' 
  | 'preposition' 
  | 'conjunction' 
  | 'pronoun' 
  | 'interjection'
  | 'unknown'

/**
 * Detect the primary part of speech for an entry group
 * Looks at the Inglish line (last line with language info) to determine POS
 */
function detectPrimaryPartOfSpeech(group: EntryGroup): PartOfSpeechType {
  const inglishLine = group.etymologyLines.find(line => 
    line.origin === 'Inglish' && line.partOfSpeech && line.partOfSpeech.length > 0
  )
  
  if (!inglishLine || !inglishLine.partOfSpeech) {
    return 'unknown'
  }
  
  const primaryPos = inglishLine.partOfSpeech[0].toLowerCase()
  
  if (primaryPos.includes('verb')) return 'verb'
  if (primaryPos.includes('noun')) return 'noun'  
  if (primaryPos.includes('adjective')) return 'adjective'
  if (primaryPos.includes('adverb')) return 'adverb'
  if (primaryPos.includes('preposition')) return 'preposition'
  if (primaryPos.includes('conjunction')) return 'conjunction'
  if (primaryPos.includes('pronoun')) return 'pronoun'
  if (primaryPos.includes('interjection')) return 'interjection'
  
  return 'unknown'
}

/**
 * Extract base form and conjugation patterns from Inglish verb line
 * Example: "ta abàndone -s -d -ing" -> { base: "abàndone", suffixes: ["-s", "-d", "-ing"] }
 */
function extractVerbConjugations(text: string): { base: string, conjugations: VerbConjugations } {
  // Pattern: "base -suffix1 -suffix2 -suffix3"
  const match = text.match(/^(.+?)\s+(-\w+)(?:\s+(-\w+))?(?:\s+(-\w+))?/)
  
  if (!match) {
    return { base: text, conjugations: {} }
  }
  
  const base = match[1]
  const suffixes = [match[2], match[3], match[4]].filter(s => s)
  
  // Generate full conjugated forms
  const conjugations: any = {}
  
  if (suffixes[0]) {
    // Third person: base + s (remove the -)
    const suffix = suffixes[0].replace('-', '')
    conjugations.thirdPerson = base + suffix
  }
  
  if (suffixes[1]) {
    // Past tense: base + d/ed 
    const suffix = suffixes[1].replace('-', '')
    conjugations.pastTense = base + suffix
  }
  
  if (suffixes[2]) {
    // Progressive: base + ing (drop 'e' if base ends in 'e' and suffix is 'ing')
    const suffix = suffixes[2].replace('-', '')
    if (suffix === 'ing' && base.endsWith('e')) {
      // Drop the 'e' before adding 'ing'
      conjugations.progressive = base.slice(0, -1) + suffix
    } else {
      conjugations.progressive = base + suffix
    }
  }
  
  return { base, conjugations }
}

/**
 * Extract gender and number information from noun POS
 */
function extractNounInfo(partOfSpeech: string[]): NounGenderInfo {
  const posString = partOfSpeech.join(' ').toLowerCase()
  
  let gender: 'masculine' | 'feminine' | 'neuter' | undefined = undefined
  let number: 'singular' | 'plural' | undefined = undefined
  
  if (posString.includes('masculine')) gender = 'masculine'
  else if (posString.includes('feminine')) gender = 'feminine'  
  else if (posString.includes('neuter')) gender = 'neuter'
  
  if (posString.includes('plural')) number = 'plural'
  else number = 'singular'
  
  return { gender, number }
}

/**
 * Extract adjective degree patterns from Inglish line
 * Example: "quick -er -est" -> { positive: "quick", comparative: "er", superlative: "est" }
 */
function extractAdjectiveDegrees(text: string): { base: string, degrees: AdjectiveDegrees } {
  const match = text.match(/^(\w+)\s+(-\w+)(?:\s+(-\w+))?/)
  
  if (!match) {
    return { base: text, degrees: {} }
  }
  
  const base = match[1]
  const degrees: any = {
    positive: base
  }
  
  if (match[2]) {
    degrees.comparative = match[2].replace('-', '')
  }
  
  if (match[3]) {
    degrees.superlative = match[3].replace('-', '')
  }
  
  return { base, degrees }
}

/**
 * POS-SPECIFIC NAME EXTRACTORS
 * Creates appropriate names based on part of speech
 */
export function createPosNameExtractor(): WordNameExtractor {
  return function posNameExtractor(group: EntryGroup, fallbackName: string): string {
    const pos = detectPrimaryPartOfSpeech(group)
    const meLine = group.etymologyLines.find(line => line.language === 'ME')
    
    if (meLine) {
      const text = meLine.text.trim()
      
      switch (pos) {
        case 'verb':
          // For verbs, ensure infinitive form
          if (text.startsWith('to ')) return text
          if (!text.includes(' ') && !text.includes('-')) return `to ${text}`
          return text
          
        case 'noun':
          // Remove gender markers like (m), (f), (n)
          return text.replace(/\s*\([mfn]\)\s*$/, '')
          
        case 'adjective':
          // Extract base form from "quick -er -est" pattern
          const { base } = extractAdjectiveDegrees(text)
          return base
          
        default:
          return text
      }
    }
    
    // Fallback
    const lastLanguageLine = group.etymologyLines.filter(line => line.language).pop()
    return lastLanguageLine?.text.trim() || fallbackName
  }
}

/**
 * POS-SPECIFIC ENTRY TRANSFORMERS
 * Creates the preferred output structure with embedded POS information
 */
export function createPosEntryTransformer(): EntryTransformer {
  return function posEntryTransformer(group: EntryGroup, wordName: string): any {
    const pos = detectPrimaryPartOfSpeech(group)
    const inglishLine = group.etymologyLines.find(line => line.origin === 'Inglish')
    
    // Build etymology with enhanced Inglish line
    const etymology: any[] = group.etymologyLines.map(line => {
      const entry: any = {
        name: line.text,
        origin: line.origin || 'Inglish'
      }
      
      // If this is the Inglish line, add POS-specific enhancements
      if (line.origin === 'Inglish' && line.partOfSpeech) {
        entry["part-of-speech"] = line.partOfSpeech
        
        if (pos === 'verb') {
          // Add conjugations to the Inglish etymology entry
          const { base, conjugations } = extractVerbConjugations(line.text)
          if (Object.keys(conjugations).length > 0) {
            entry.conjugations = conjugations
          }
        } else if (pos === 'noun') {
          // Add gender and number to the Inglish etymology entry
          const { gender, number } = extractNounInfo(line.partOfSpeech)
          if (gender) entry.gender = gender
          if (number) entry.number = number
        } else if (pos === 'adjective') {
          // Add degree information to the Inglish etymology entry
          const { base, degrees } = extractAdjectiveDegrees(line.text)
          if (Object.keys(degrees).length > 1) { // More than just positive
            entry.degrees = degrees
          }
        }
      } else if (line.partOfSpeech && line.partOfSpeech.length > 0) {
        // Add part-of-speech to non-Inglish lines if present
        entry["part-of-speech"] = line.partOfSpeech
      }
      
      return entry
    })
    
    const sources = group.sourceLines.map(line => line.text)
    
    // Create the result with POS-specific top-level structure
    if (pos === 'verb') {
      return {
        infinitive: wordName,
        etymology,
        sources
      }
    } else {
      return {
        name: wordName,
        etymology,
        sources
      }
    }
  }
}

/**
 * UTILITY FUNCTIONS
 */
export function getDetectedPartOfSpeech(group: EntryGroup): PartOfSpeechType {
  return detectPrimaryPartOfSpeech(group)
}

export function isVerb(group: EntryGroup): boolean {
  return detectPrimaryPartOfSpeech(group) === 'verb'
}

export function isNoun(group: EntryGroup): boolean {
  return detectPrimaryPartOfSpeech(group) === 'noun'
}

export function isAdjective(group: EntryGroup): boolean {
  return detectPrimaryPartOfSpeech(group) === 'adjective'
}

/**
 * COMBINED TRANSFORMER
 * Applies both POS-specific name extraction and entry transformation
 */
export function createPosAwareTransformer() {
  const nameExtractor = createPosNameExtractor()
  const entryTransformer = createPosEntryTransformer()
  
  return function posAwareTransformer(group: EntryGroup, fallbackName: string) {
    const wordName = nameExtractor(group, fallbackName)
    return entryTransformer(group, wordName)
  }
}

/**
 * Custom transformer wrapper for use in pipelines (matches CustomTransformer signature)
 */
export function posAwareCustomTransformer(group: EntryGroup) {
  const transformer = createPosAwareTransformer()
  return transformer(group, 'unknown')
}

/**
 * Legacy function aliases for backward compatibility with existing pipeline factory
 */
export const createPosSpecificNameExtractor = createPosNameExtractor
export const createPosSpecificEntryTransformer = createPosEntryTransformer