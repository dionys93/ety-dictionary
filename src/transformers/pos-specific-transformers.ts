// src/transformers/pos-specific-transformers-simple.ts
// Alternative version that doesn't use extended interfaces

import { 
  EntryGroup, 
  ParsedLine, 
  WordEntry, 
  EtymologyEntry,
  WordNameExtractor,
  EntryTransformer 
} from '../types/pipeline-types'

/**
 * POS detection without extended interfaces
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
 * POS-SPECIFIC NAME EXTRACTOR
 */
export function createPosSpecificNameExtractor(): WordNameExtractor {
  return function posSpecificNameExtractor(group: EntryGroup, fallbackName: string): string {
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
          const baseFormMatch = text.match(/^(\w+)\s+(-\w+\s*)*/)
          return baseFormMatch ? baseFormMatch[1] : text
          
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
 * POS-SPECIFIC ENTRY TRANSFORMER
 * Returns standard WordEntry but with additional fields based on POS
 */
export function createPosSpecificEntryTransformer(): EntryTransformer {
  return function posSpecificEntryTransformer(group: EntryGroup, wordName: string): WordEntry {
    const pos = detectPrimaryPartOfSpeech(group)
    
    // Build standard etymology
    const etymology: EtymologyEntry[] = group.etymologyLines.map(line => {
      const entry: EtymologyEntry = {
        name: line.text,
        origin: line.origin || 'Inglish'
      }
      
      if (line.partOfSpeech && line.partOfSpeech.length > 0) {
        entry["part-of-speech"] = line.partOfSpeech
      }
      
      return entry
    })
    
    const sources = group.sourceLines.map(line => line.text)
    
    // Create base word entry
    const wordEntry: WordEntry = {
      name: wordName,
      etymology,
      sources
    }
    
    // Add POS-specific data as additional properties
    const inglishLine = group.etymologyLines.find(line => line.origin === 'Inglish')
    
    if (inglishLine) {
      switch (pos) {
        case 'verb':
          // Extract conjugation patterns
          const conjugationMatch = inglishLine.text.match(/(\w+)\s+(-\w+)(?:\s+(-\w+))?(?:\s+(-\w+))?/)
          if (conjugationMatch) {
            (wordEntry as any).conjugations = {
              thirdPerson: conjugationMatch[2]?.replace('-', '') || undefined,
              pastTense: conjugationMatch[3]?.replace('-', '') || undefined,
              progressive: conjugationMatch[4]?.replace('-', '') || undefined
            }
          }
          break
          
        case 'noun':
          // Extract gender and number
          if (inglishLine.partOfSpeech) {
            const posString = inglishLine.partOfSpeech.join(' ').toLowerCase()
            
            if (posString.includes('masculine')) (wordEntry as any).gender = 'masculine'
            else if (posString.includes('feminine')) (wordEntry as any).gender = 'feminine'
            else if (posString.includes('neuter')) (wordEntry as any).gender = 'neuter'
            
            if (inglishLine.text.endsWith('s') && !inglishLine.text.endsWith('ss')) {
              (wordEntry as any).number = 'plural'
            } else {
              (wordEntry as any).number = 'singular'
            }
          }
          break
          
        case 'adjective':
          // Extract degree patterns
          const degreeMatch = inglishLine.text.match(/(\w+)\s+(-\w+)(?:\s+(-\w+))?/)
          if (degreeMatch) {
            (wordEntry as any).degrees = {
              positive: degreeMatch[1],
              comparative: degreeMatch[2]?.replace('-', '') || undefined,
              superlative: degreeMatch[3]?.replace('-', '') || undefined
            }
          }
          break
      }
    }
    
    return wordEntry
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
 */
export function createPosAwareTransformer() {
  const nameExtractor = createPosSpecificNameExtractor()
  const entryTransformer = createPosSpecificEntryTransformer()
  
  return function posAwareTransformer(group: EntryGroup, fallbackName: string) {
    const wordName = nameExtractor(group, fallbackName)
    return entryTransformer(group, wordName)
  }
}