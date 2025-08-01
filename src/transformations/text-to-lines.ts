// src/transformations/text-to-lines.ts
// Pure transformation functions for generic text processing

import { Result, ok, err } from '../monads'
import { TextLine, TextBlock } from '../types/text'

export const textToLines = (text: string): Result<readonly TextLine[]> => {
  try {
    const lines = text
      .split('\n')
      .map((content, index) => ({
        content,
        lineNumber: index + 1,
        isEmpty: content.trim().length === 0
      }))
    
    return ok(lines)
  } catch (error) {
    return err(new Error(`Failed to parse text lines: ${error}`))
  }
}

export const groupIntoBlocks = (lines: readonly TextLine[]): Result<readonly TextBlock[]> => {
  try {
    const blocks: TextBlock[] = []
    let currentBlock: TextLine[] = []
    let startLine = 0
    
    lines.forEach((line, index) => {
      if (line.isEmpty && currentBlock.length > 0) {
        blocks.push({
          lines: [...currentBlock],
          startLine,
          endLine: index
        })
        currentBlock = []
        startLine = index + 1
      } else if (!line.isEmpty) {
        if (currentBlock.length === 0) startLine = index
        currentBlock.push(line)
      }
    })
    
    // Don't forget the last block
    if (currentBlock.length > 0) {
      blocks.push({
        lines: currentBlock,
        startLine,
        endLine: lines.length - 1
      })
    }
    
    return ok(blocks)
  } catch (error) {
    return err(new Error(`Failed to group lines into blocks: ${error}`))
  }
}

// Helper to convert TextLine to the format expected by existing parsers
export const toRawLine = (line: TextLine) => ({
  content: line.content,
  lineNumber: line.lineNumber
})