// src/config/file-extensions.ts
// Common file extensions and checkers

/**
 * Common file extensions used in the project
 */
export const FILE_EXTENSIONS = {
  TEXT: '.txt',
  JSON: '.json',
  TYPESCRIPT: '.ts',
  JAVASCRIPT: '.js'
} as const

/**
 * Check if a filename has a text extension
 */
export function isTextFile(filename: string): boolean {
  return filename.endsWith(FILE_EXTENSIONS.TEXT)
}

/**
 * Check if a filename has a JSON extension
 */
export function isJsonFile(filename: string): boolean {
  return filename.endsWith(FILE_EXTENSIONS.JSON)
}

/**
 * Check if a filename has a TypeScript extension
 */
export function isTypeScriptFile(filename: string): boolean {
  return filename.endsWith(FILE_EXTENSIONS.TYPESCRIPT)
}

/**
 * Replace file extension
 */
export function replaceExtension(filename: string, oldExt: string, newExt: string): string {
  if (filename.endsWith(oldExt)) {
    return filename.slice(0, -oldExt.length) + newExt
  }
  return filename
}

/**
 * Get filename without extension
 */
export function removeExtension(filename: string, ext: string = FILE_EXTENSIONS.TEXT): string {
  if (filename.endsWith(ext)) {
    return filename.slice(0, -ext.length)
  }
  return filename
}