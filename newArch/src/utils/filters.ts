import type { DataContent, ValidatedFile, ValidatedDirectory } from '../types/filesystem'
import { isValidatedFile, isValidatedDirectory } from './guards'

// PURE: Filter functions
export function filterFiles(contents: DataContent[]): ValidatedFile[] {
  return contents.filter(isValidatedFile)
}

export function filterDirectories(contents: DataContent[]): ValidatedDirectory[] {
  return contents.filter(isValidatedDirectory)
}

export function filterByExtension(
  files: ValidatedFile[],
  extension: string
): ValidatedFile[] {
  return files.filter(function(file) {
    return file.extension === extension
  })
}