// src/io/alpha-file-finder.ts
// File finder that only searches within single-character alphabetical directories

import * as path from 'path'
import * as fs from 'fs'
import { Result, ok, err, map } from '../core'
import { DirectoryReader, createDirectoryReader } from './file-operations'

/**
 * Type for single-character directory names (alphabetical organization)
 */
type AlphabeticalDir = string & { readonly __brand: 'AlphabeticalDir' }

/**
 * Check if a directory name is a valid single-character alphabetical directory
 * Used to filter out directories like 'grammar', 'pronouns', etc.
 */
function isAlphabeticalDir(dirName: string): dirName is AlphabeticalDir {
  return dirName.length === 1 && /^[a-zA-Z]$/.test(dirName)
}

/**
 * Create a file finder that only searches within alphabetical directories
 * Respects the single-character directory constraint at the root level
 * 
 * @param extension - File extension to search for (e.g., '.txt')
 * @returns Function that searches for files within alphabetical directories only
 */
export function createAlphabeticalFileFinder(extension: string) {
  const readDir = createDirectoryReader()
  
  return function findFilesInAlphabeticalDirs(dirPath: string): Result<string[]> {
    const results: string[] = []
    
    function searchRecursive(currentDir: string, depth: number = 0): Result<void> {
      const entriesResult = readDir(currentDir)
      
      if (!entriesResult.isSuccess) {
        return err(entriesResult.error!)
      }
      
      for (const entry of entriesResult.value!) {
        const fullPath = path.join(currentDir, entry.name)
        
        if (entry.isDirectory()) {
          // At root level (depth 0), only process single-character directories
          if (depth === 0 && !isAlphabeticalDir(entry.name)) {
            // Skip non-alphabetical directories at root level
            continue
          }
          
          // Recursively search subdirectories
          const subResult = searchRecursive(fullPath, depth + 1)
          if (!subResult.isSuccess) {
            return subResult
          }
        } else if (entry.name.endsWith(extension)) {
          // Add files with matching extension
          results.push(fullPath)
        }
      }
      
      return ok(undefined)
    }
    
    const searchResult = searchRecursive(dirPath, 0)
    
    if (!searchResult.isSuccess) {
      return err(searchResult.error!)
    }
    
    return ok(results)
  }
}

/**
 * Find text files only within alphabetical directories
 * This is the main function to use for etymology text processing
 */
export const findTextFilesInAlphabeticalDirs = createAlphabeticalFileFinder('.txt')

/**
 * Find JSON files only within alphabetical directories
 */
export const findJsonFilesInAlphabeticalDirs = createAlphabeticalFileFinder('.json')

/**
 * Create a sample file finder that respects alphabetical directory constraints
 * Returns up to N files from alphabetical directories
 */
export function findSampleFilesInAlphabeticalDirs(
  dirPath: string, 
  sampleCount: number
): Result<string[]> {
  const finder = findTextFilesInAlphabeticalDirs
  
  const filesResult = finder(dirPath)
  
  if (!filesResult.isSuccess) {
    return filesResult
  }
  
  return ok(filesResult.value!.slice(0, sampleCount))
}

/**
 * Create a file counter that respects alphabetical directory constraints
 * Useful for reporting how many files would be processed
 */
export function countFilesInAlphabeticalDirs(
  dirPath: string,
  extension: string = '.txt'
): Result<number> {
  const finder = createAlphabeticalFileFinder(extension)
  
  const filesResult = finder(dirPath)
  
  if (!filesResult.isSuccess) {
    return err(filesResult.error!)
  }
  
  return ok(filesResult.value!.length)
}