// /src/types/part-of-speech-types.ts

export interface VerbConjugations {
  thirdPerson?: string
  pastTense?: string
  progressive?: string
}

export interface AdjectiveDegrees {
  positive?: string
  comparative?: string
  superlative?: string
}

export interface NounGenderInfo {
  gender?: 'masculine' | 'feminine' | 'neuter'
  number?: 'singular' | 'plural'
}

export interface EnhancedEtymologyEntry {
  name: string
  origin: string
  "part-of-speech"?: string[]
  conjugations?: VerbConjugations
  gender?: 'masculine' | 'feminine' | 'neuter'
  number?: 'singular' | 'plural'
  degrees?: AdjectiveDegrees
}