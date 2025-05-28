// src/types/branded-types.ts

/**
 * Brand symbol for creating unique types
 */
declare const __brand: unique symbol

/**
 * Brand utility type - creates a unique type from a base type
 */
type Brand<T, B> = T & { readonly [__brand]: B }

/**
 * Branded string types for different contexts
 */
export type FilePath = Brand<string, 'FilePath'>
export type LanguageCode = Brand<string, 'LanguageCode'>
export type EtymologyText = Brand<string, 'EtymologyText'>
export type WordName = Brand<string, 'WordName'>
export type SourceUrl = Brand<string, 'SourceUrl'>
export type PartOfSpeech = Brand<string, 'PartOfSpeech'>
export type LanguageName = Brand<string, 'LanguageName'>
export type PipelineName = Brand<string, 'PipelineName'>

/**
 * Smart constructors for creating branded types with validation
 */
export const createFilePath = (path: string): FilePath => {
  if (!path || path.trim().length === 0) {
    throw new Error('FilePath cannot be empty')
  }
  return path.trim() as FilePath
}

export const createLanguageCode = (code: string): LanguageCode => {
  if (!code || !/^[A-Z]{1,4}$/.test(code)) {
    throw new Error(`Invalid language code: ${code}. Must be 1-4 uppercase letters.`)
  }
  return code as LanguageCode
}

export const createEtymologyText = (text: string): EtymologyText => {
  if (!text || text.trim().length === 0) {
    throw new Error('Etymology text cannot be empty')
  }
  return text.trim() as EtymologyText
}

export const createWordName = (name: string): WordName => {
  if (!name || name.trim().length === 0) {
    throw new Error('Word name cannot be empty')
  }
  return name.trim() as WordName
}

export const createSourceUrl = (url: string): SourceUrl => {
  if (!url || !url.startsWith('http')) {
    throw new Error(`Invalid URL: ${url}. Must start with http`)
  }
  return url as SourceUrl
}

export const createPartOfSpeech = (pos: string): PartOfSpeech => {
  if (!pos || pos.trim().length === 0) {
    throw new Error('Part of speech cannot be empty')
  }
  return pos.trim() as PartOfSpeech
}

export const createLanguageName = (name: string): LanguageName => {
  if (!name || name.trim().length === 0) {
    throw new Error('Language name cannot be empty')
  }
  return name.trim() as LanguageName
}

export const createPipelineName = (name: string): PipelineName => {
  if (!name || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error(`Invalid pipeline name: ${name}. Must start with letter and contain only alphanumeric, underscore, or dash.`)
  }
  return name as PipelineName
}

/**
 * Safe constructors that return Result types instead of throwing
 */
import { Result, ok, err } from '../monads'

export const safeCreateFilePath = (path: string): Result<FilePath> => {
  try {
    return ok(createFilePath(path))
  } catch (error) {
    return err(new Error(`Invalid file path: ${error instanceof Error ? error.message : String(error)}`))
  }
}

export const safeCreateLanguageCode = (code: string): Result<LanguageCode> => {
  try {
    return ok(createLanguageCode(code))
  } catch (error) {
    return err(new Error(`Invalid language code: ${error instanceof Error ? error.message : String(error)}`))
  }
}

export const safeCreateEtymologyText = (text: string): Result<EtymologyText> => {
  try {
    return ok(createEtymologyText(text))
  } catch (error) {
    return err(new Error(`Invalid etymology text: ${error instanceof Error ? error.message : String(error)}`))
  }
}

export const safeCreateWordName = (name: string): Result<WordName> => {
  try {
    return ok(createWordName(name))
  } catch (error) {
    return err(new Error(`Invalid word name: ${error instanceof Error ? error.message : String(error)}`))
  }
}

export const safeCreateSourceUrl = (url: string): Result<SourceUrl> => {
  try {
    return ok(createSourceUrl(url))
  } catch (error) {
    return err(new Error(`Invalid source URL: ${error instanceof Error ? error.message : String(error)}`))
  }
}

export const safeCreatePipelineName = (name: string): Result<PipelineName> => {
  try {
    return ok(createPipelineName(name))
  } catch (error) {
    return err(new Error(`Invalid pipeline name: ${error instanceof Error ? error.message : String(error)}`))
  }
}

/**
 * Utility functions for working with branded types
 */
export const unwrapFilePath = (path: FilePath): string => path as string
export const unwrapLanguageCode = (code: LanguageCode): string => code as string
export const unwrapEtymologyText = (text: EtymologyText): string => text as string
export const unwrapWordName = (name: WordName): string => name as string
export const unwrapSourceUrl = (url: SourceUrl): string => url as string
export const unwrapPartOfSpeech = (pos: PartOfSpeech): string => pos as string
export const unwrapLanguageName = (name: LanguageName): string => name as string
export const unwrapPipelineName = (name: PipelineName): string => name as string

/**
 * Type guards for checking branded types at runtime
 */
export const isFilePath = (value: unknown): value is FilePath => {
  return typeof value === 'string' && value.trim().length > 0
}

export const isLanguageCode = (value: unknown): value is LanguageCode => {
  return typeof value === 'string' && /^[A-Z]{1,4}$/.test(value)
}

export const isSourceUrl = (value: unknown): value is SourceUrl => {
  return typeof value === 'string' && value.startsWith('http')
}

export const isEtymologyText = (value: unknown): value is EtymologyText => {
  return typeof value === 'string' && value.trim().length > 0
}

export const isWordName = (value: unknown): value is WordName => {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Enhanced types using branded strings
 */
export interface EnhancedRawLine {
  readonly content: string
  readonly lineNumber: number
  readonly filePath?: FilePath
}

export interface EnhancedParsedLine {
  readonly text: EtymologyText
  readonly origin?: LanguageName
  readonly language?: LanguageCode
  readonly partOfSpeech?: readonly PartOfSpeech[]
  readonly isUrl?: boolean
}

export interface EnhancedEntryGroup {
  readonly etymologyLines: readonly EnhancedParsedLine[]
  readonly sourceLines: readonly EnhancedParsedLine[]
  readonly wordName?: WordName
}

export interface EnhancedEtymologyEntry {
  readonly name: EtymologyText
  readonly origin: LanguageName
  readonly partOfSpeech?: readonly PartOfSpeech[]
}

export interface EnhancedWordEntry {
  readonly name: WordName
  readonly etymology: readonly EnhancedEtymologyEntry[]
  readonly sources: readonly SourceUrl[]
}

/**
 * Configuration types with branded strings
 */
export interface LanguageMapping {
  readonly code: LanguageCode
  readonly name: LanguageName
}

export interface PartOfSpeechMapping {
  readonly abbreviation: PartOfSpeech
  readonly fullName: string
}

/**
 * Safe conversion functions between old and new types
 */
export const convertToEnhancedParsedLine = (line: import('../types/pipeline-types').ParsedLine): Result<EnhancedParsedLine> => {
  const textResult = safeCreateEtymologyText(line.text)
  if (!textResult.isSuccess) {
    return err(textResult.error!)
  }
  
  const languageResult = line.language 
    ? safeCreateLanguageCode(line.language) 
    : ok(undefined as LanguageCode | undefined)
  if (!languageResult.isSuccess) {
    return err(languageResult.error!)
  }
  
  const originResult = line.origin 
    ? ok(line.origin as LanguageName) 
    : ok(undefined as LanguageName | undefined)
  
  return ok({
    text: textResult.value!,
    origin: originResult.value,
    language: languageResult.value,
    partOfSpeech: line.partOfSpeech?.map(pos => pos as PartOfSpeech),
    isUrl: line.isUrl
  })
}

export const convertToEnhancedEntryGroup = (group: import('../types/pipeline-types').EntryGroup): Result<EnhancedEntryGroup> => {
  const etymologyResults = group.etymologyLines.map(convertToEnhancedParsedLine)
  const sourceResults = group.sourceLines.map(convertToEnhancedParsedLine)
  
  // Check if any conversions failed
  const etymologyErrors = etymologyResults.filter(r => !r.isSuccess)
  const sourceErrors = sourceResults.filter(r => !r.isSuccess)
  
  if (etymologyErrors.length > 0) {
    return err(etymologyErrors[0].error!)
  }
  
  if (sourceErrors.length > 0) {
    return err(sourceErrors[0].error!)
  }
  
  const wordNameResult = group.wordName 
    ? safeCreateWordName(group.wordName) 
    : ok(undefined as WordName | undefined)
  if (!wordNameResult.isSuccess) {
    return err(wordNameResult.error!)
  }
  
  return ok({
    etymologyLines: etymologyResults.map(r => r.value!),
    sourceLines: sourceResults.map(r => r.value!),
    wordName: wordNameResult.value
  })
}

export const convertToEnhancedWordEntry = (entry: import('../types/pipeline-types').WordEntry): Result<EnhancedWordEntry> => {
  const nameResult = safeCreateWordName(entry.name)
  if (!nameResult.isSuccess) {
    return err(nameResult.error!)
  }
  
  // Convert each etymology entry properly
  const etymologyResults: Result<EnhancedEtymologyEntry>[] = entry.etymology.map(etym => {
    const nameResult = safeCreateEtymologyText(etym.name)
    if (!nameResult.isSuccess) {
      return err(nameResult.error!)
    }
    
    return ok({
      name: nameResult.value!,
      origin: etym.origin as LanguageName,
      partOfSpeech: etym['part-of-speech']?.map(pos => pos as PartOfSpeech)
    })
  })
  
  // Check for etymology conversion errors
  const etymologyErrors = etymologyResults.filter(r => !r.isSuccess)
  if (etymologyErrors.length > 0) {
    return err(etymologyErrors[0].error!)
  }
  
  // Convert sources
  const sourcesResults = entry.sources.map(safeCreateSourceUrl)
  const sourceErrors = sourcesResults.filter(r => !r.isSuccess)
  if (sourceErrors.length > 0) {
    return err(sourceErrors[0].error!)
  }
  
  return ok({
    name: nameResult.value!,
    etymology: etymologyResults.map(r => r.value!),
    sources: sourcesResults.map(r => r.value!)
  })
}

/**
 * Batch conversion functions for working with arrays
 */
export const convertMultipleParsedLines = (lines: import('../types/pipeline-types').ParsedLine[]): { successes: EnhancedParsedLine[], errors: Error[] } => {
  const results = lines.map(convertToEnhancedParsedLine)
  const successes: EnhancedParsedLine[] = []
  const errors: Error[] = []
  
  for (const result of results) {
    if (result.isSuccess) {
      successes.push(result.value!)
    } else {
      errors.push(result.error!)
    }
  }
  
  return { successes, errors }
}

export const convertMultipleEntryGroups = (groups: import('../types/pipeline-types').EntryGroup[]): { successes: EnhancedEntryGroup[], errors: Error[] } => {
  const results = groups.map(convertToEnhancedEntryGroup)
  const successes: EnhancedEntryGroup[] = []
  const errors: Error[] = []
  
  for (const result of results) {
    if (result.isSuccess) {
      successes.push(result.value!)
    } else {
      errors.push(result.error!)
    }
  }
  
  return { successes, errors }
}