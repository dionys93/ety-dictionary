// src/custom/verb-transformers.ts

import { EntryGroup, ParsedLine } from '../types/pipeline-types'

/**
 * Verb-specific data structures
 */
interface VerbMorphology {
  conjugation_class: 'regular' | 'irregular'
  stem: string
  inflections: {
    infinitive: string
    third_person_singular: string
    past_tense: string
    past_participle: string
    present_participle: string
  }
  contractions?: {
    negative_forms: string[]  // Simple array of contractions as they appear
  }
}

interface VerbObject {
  word: string
  pos: 'verb'
  base_form: string
  etymology_chain: Array<{
    form: string
    language: string
    meaning?: string
  }>
  morphology: VerbMorphology
  sources: string[]
}

/**
 * Extract verb conjugation pattern from Inglish line
 * Only parses patterns that are explicitly present in the data
 */
function parseVerbPattern(inglishText: string): {
  infinitive: string
  thirdPerson: string
  pastTense: string
  pastParticiple?: string
  presentParticiple: string
  contractions?: string[]
  isIrregular: boolean
} | null {
  // Remove any part-of-speech markers first
  const cleanText = inglishText.replace(/\s*\([^)]*\)\s*$/, '').trim()
  
  // Pattern 1: Regular verbs - "ta abàndone -s -d -ing" or "to abàndone -s -d -ing"
  const regularMatch = cleanText.match(/^((?:ta|to)\s+\w+|\w+)\s+(-\w+)\s+(-\w+)\s+(-\w+)$/)
  if (regularMatch) {
    const [, infinitive, thirdPerson, pastTense, presentParticiple] = regularMatch
    return {
      infinitive: infinitive.trim(),
      thirdPerson: thirdPerson,
      pastTense: pastTense,
      presentParticiple: presentParticiple,
      isIrregular: false
    }
  }
  
  // Pattern 2: Standard irregular verbs - "gó -es went gón -ing"
  const irregularMatch = cleanText.match(/^((?:ta|to)\s+\w+|\w+)\s+(-\w+|\w+(?:\/\w+)*)\s+(\w+(?:\/\w+)*)\s+(\w+(?:\/\w+)*)\s+(-\w+)$/)
  if (irregularMatch) {
    const [, infinitive, thirdPerson, pastTense, pastParticiple, presentParticiple] = irregularMatch
    return {
      infinitive: infinitive.trim(),
      thirdPerson: thirdPerson,
      pastTense: pastTense,
      pastParticiple: pastParticiple,
      presentParticiple: presentParticiple,
      isIrregular: true
    }
  }
  
  // Pattern 3: Helping verbs with contractions - extract what's actually there
  // e.g., "ta have, has had having; haven't, hasn't, hadn't"
  const helpingVerbMatch = cleanText.match(/^(.+);\s*(.+)$/)
  if (helpingVerbMatch) {
    const [, mainPart, contractionsText] = helpingVerbMatch
    
    // Parse the main conjugation part (everything before the semicolon)
    const mainParts = mainPart.split(/[,\s]+/).filter(part => part.trim())
    
    // Extract contractions (everything after the semicolon)
    const contractions = contractionsText.split(',').map(c => c.trim())
    
    // Try to identify infinitive, third person, past, etc. from the main parts
    const infinitive = mainParts[0] // First part is usually infinitive
    const thirdPerson = mainParts[1] || '-s' // Second part or default
    const pastTense = mainParts[2] || '-d' // Third part or default
    const presentParticiple = mainParts[3] || '-ing' // Fourth part or default
    
    return {
      infinitive: infinitive.trim(),
      thirdPerson,
      pastTense,
      presentParticiple,
      contractions,
      isIrregular: true
    }
  }
  
  // Pattern 4: Simple infinitive only - "ta abàndone" or "to abàndone" (no conjugation info)
  const infinitiveMatch = cleanText.match(/^((?:ta|to)\s+\w+|\w+)$/)
  if (infinitiveMatch) {
    const infinitive = infinitiveMatch[1].trim()
    // Default to regular conjugation pattern
    return {
      infinitive,
      thirdPerson: '-s',
      pastTense: '-d',
      presentParticiple: '-ing',
      isIrregular: false
    }
  }
  
  return null
}

/**
 * Determine conjugation class based on verb pattern
 */
function determineConjugationClass(pattern: ReturnType<typeof parseVerbPattern>): 'regular' | 'irregular' {
  if (!pattern) {
    return 'regular'
  }
  return pattern.isIrregular ? 'irregular' : 'regular'
}

/**
 * Generate full verb paradigm from pattern
 * Simply stores the parsed forms without complex generation logic
 */
function generateVerbParadigm(pattern: ReturnType<typeof parseVerbPattern>): VerbMorphology['inflections'] {
  if (!pattern) {
    throw new Error('Cannot generate paradigm from null pattern')
  }
  
  const { infinitive, thirdPerson, pastTense, pastParticiple, presentParticiple } = pattern
  
  // Just store what we parsed - no complex generation
  const inflections: VerbMorphology['inflections'] = {
    infinitive,
    third_person_singular: thirdPerson,
    past_tense: pastTense,
    past_participle: pastParticiple || pastTense, // Use past tense as fallback
    present_participle: presentParticiple
  }
  
  return inflections
}

/**
 * Create verb-specific object from entry group
 */
function createVerbObject(group: EntryGroup, wordName: string): VerbObject {
  // Find the Inglish line (contains verb conjugation info)
  const inglishLine = group.etymologyLines.find(line => line.origin === 'Inglish')
  if (!inglishLine) {
    throw new Error(`No Inglish line found for verb: ${wordName}`)
  }
  
  // Parse verb pattern
  const pattern = parseVerbPattern(inglishLine.text)
  if (!pattern) {
    throw new Error(`Could not parse verb pattern from: ${inglishLine.text}`)
  }
  
  // Generate full paradigm
  const inflections = generateVerbParadigm(pattern)
  const conjugationClass = determineConjugationClass(pattern)
  const stem = pattern.infinitive.replace(/^(?:ta|to)\s+/, '')
  
  // Build etymology chain
  const etymologyChain = group.etymologyLines.map(line => ({
    form: line.text,
    language: line.origin || 'Unknown'
  }))
  
  // Extract sources
  const sources = group.sourceLines.map(line => line.text)
  
  // Build morphology object
  const morphology: VerbMorphology = {
    conjugation_class: conjugationClass,
    stem,
    inflections
  }
  
  // Only add contractions if they were explicitly present in the data
  if (pattern.contractions && pattern.contractions.length > 0) {
    morphology.contractions = {
      negative_forms: pattern.contractions
    }
  }
  
  return {
    word: wordName,
    pos: 'verb',
    base_form: pattern.infinitive,
    etymology_chain: etymologyChain,
    morphology,
    sources
  }
}

/**
 * Check if an entry group contains verb POS
 */
function hasVerbPOS(group: EntryGroup): boolean {
  const inglishLine = group.etymologyLines.find(line => line.origin === 'Inglish')
  return inglishLine?.partOfSpeech?.includes('verb') || 
         inglishLine?.partOfSpeech?.includes('v') ||
         inglishLine?.partOfSpeech?.includes('tr v') ||
         inglishLine?.partOfSpeech?.includes('intr v') ||
         false
}

/**
 * Main POS-specific transformer for verbs (initial implementation)
 * This will be expanded to handle multiple POS types later
 */
export function verbPOSTransformer(group: EntryGroup): VerbObject[] {
  const results: VerbObject[] = []
  
  // Extract word name from the group (use Modern English or fallback)
  const modernEnglishLine = group.etymologyLines.find(line => line.language === 'ME')
  const wordName = modernEnglishLine?.text || 'unknown'
  
  // Check if this entry contains verbs
  if (hasVerbPOS(group)) {
    try {
      const verbObject = createVerbObject(group, wordName)
      results.push(verbObject)
    } catch (error) {
      console.warn(`Failed to create verb object for ${wordName}: ${error}`)
      // For now, return empty array on error - could fallback to standard format
    }
  }
  
  return results
}

/**
 * Test function to validate verb pattern parsing
 * Only tests patterns that actually exist in the data
 */
export function testVerbPatterns(): void {
  const testCases = [
    // Regular verbs
    'ta abàndone -s -d -ing',
    'to abàndone -s -d -ing',
    
    // Standard irregular verbs
    'gó -es went gón -ing',
    
    // Helping verbs with contractions (actual patterns from your data)
    'can, coûd; can\'t, coûdn\'t',
    'ta have, has had having; haven\'t, hasn\'t, hadn\'t',
    'ta bie, am, is, are; ɯas, ɯere; bìn; bying; isn\'t, aren\'t; ɯasn\'t, ɯeren\'t',
    
    // Simple infinitives
    'ta walk',
    'to walk'
  ]
  
  console.log('Testing verb pattern parsing (data-driven):')
  testCases.forEach(pattern => {
    console.log(`\nInput: "${pattern}"`)
    const parsed = parseVerbPattern(pattern)
    if (parsed) {
      try {
        const paradigm = generateVerbParadigm(parsed)
        const conjugationClass = determineConjugationClass(parsed)
        console.log('✅ Parsed successfully:')
        console.log('  Infinitive:', parsed.infinitive)
        console.log('  Conjugation Class:', conjugationClass)
        if (parsed.contractions) {
          console.log('  Contractions:', parsed.contractions)
        }
        console.log('  Full paradigm:', paradigm)
      } catch (error) {
        console.log('⚠️  Parsed but failed to generate paradigm:', (error as Error).message)
      }
    } else {
      console.log('❌ Failed to parse')
    }
  })
}