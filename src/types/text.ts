// src/types/text.ts
// Pure data types for text processing - no logic, just types

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