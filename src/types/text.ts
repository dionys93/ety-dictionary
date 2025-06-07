// src/core/types/text.ts
// Pure data types for text processing - no logic, just types

export interface RawText {
  readonly content: string
  readonly source: string // file path or URL
  readonly encoding: string
}

export interface TextLine {
  readonly content: string
  readonly lineNumber: number
  readonly isEmpty: boolean
}

export interface TextBlock {
  readonly lines: readonly TextLine[]
  readonly startLine: number
  readonly endLine: number
}

// Branded type for validated text
export type ValidatedText = Brand<string, 'ValidatedText'>