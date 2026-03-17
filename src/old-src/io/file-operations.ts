// src/io/file-operations.ts - Pure I/O functions
// 
// This module provides pure functional wrappers around Node.js file system operations.
// All functions return Result types for safe error handling and are designed to be
// easily testable and composable.

import * as fs from 'fs'
import * as path from 'path'
import { Result, ok, err } from '../core'

/**
 * Type definitions for I/O operations
 */
export type FileReader = (path: string) => Result<string>
export type FileWriter = (path: string, content: string) => Result<void>
export type JsonWriter = (path: string, data: any) => Result<void>
export type DirectoryReader = (path: string) => Result<fs.Dirent[]>
export type PathChecker = (path: string) => Result<boolean>
export type DirectoryCreator = (path: string) => Result<void>

/**
 * Create a file reader function
 * Reads file content as UTF-8 text
 */
export const createFileReader = (): FileReader => 
  (filePath: string): Result<string> => {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      return ok(content)
    } catch (error) {
      return err(new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Create a file writer function
 * Writes text content to a file
 */
export const createFileWriter = (): FileWriter =>
  (filePath: string, content: string): Result<void> => {
    try {
      fs.writeFileSync(filePath, content, 'utf8')
      return ok(undefined)
    } catch (error) {
      return err(new Error(`Failed to write file ${filePath}: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Create a JSON writer function
 * Serializes data to JSON and writes to file
 */
export const createJsonWriter = (): JsonWriter =>
  (filePath: string, data: any): Result<void> => {
    try {
      const json = JSON.stringify(data, null, 2)
      fs.writeFileSync(filePath, json, 'utf8')
      return ok(undefined)
    } catch (error) {
      return err(new Error(`Failed to write JSON to ${filePath}: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Create a directory reader function
 * Returns directory entries with file type information
 */
export const createDirectoryReader = (): DirectoryReader =>
  (dirPath: string): Result<fs.Dirent[]> => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      return ok(entries)
    } catch (error) {
      return err(new Error(`Failed to read directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Create a path checker function
 * Checks if a path exists and is accessible
 */
export const createPathChecker = (): PathChecker =>
  (targetPath: string): Result<boolean> => {
    try {
      return ok(fs.existsSync(targetPath))
    } catch (error) {
      return err(new Error(`Failed to check path ${targetPath}: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Create a directory creator function
 * Creates directory recursively if it doesn't exist
 */
export const createDirectoryCreator = (): DirectoryCreator =>
  (dirPath: string): Result<void> => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
      return ok(undefined)
    } catch (error) {
      return err(new Error(`Failed to create directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

/**
 * Higher-order function to create a filtered file reader
 * Only reads files with specific extensions
 */
export const createFilteredFileReader = (allowedExtensions: string[]): FileReader => {
  const baseReader = createFileReader()
  
  return (filePath: string): Result<string> => {
    const ext = path.extname(filePath)
    
    if (!allowedExtensions.includes(ext)) {
      return err(new Error(`File type not allowed: ${ext}. Expected one of: ${allowedExtensions.join(', ')}`))
    }
    
    return baseReader(filePath)
  }
}

/**
 * Create a safe file writer that ensures directory exists
 */
export const createSafeFileWriter = (): FileWriter => {
  const writer = createFileWriter()
  const createDir = createDirectoryCreator()
  
  return (filePath: string, content: string): Result<void> => {
    const dir = path.dirname(filePath)
    
    // First ensure directory exists
    const dirResult = createDir(dir)
    if (!dirResult.isSuccess) {
      return dirResult
    }
    
    // Then write the file
    return writer(filePath, content)
  }
}

/**
 * Create a safe JSON writer that ensures directory exists
 */
export const createSafeJsonWriter = (): JsonWriter => {
  const writer = createJsonWriter()
  const createDir = createDirectoryCreator()
  
  return (filePath: string, data: any): Result<void> => {
    const dir = path.dirname(filePath)
    
    // First ensure directory exists
    const dirResult = createDir(dir)
    if (!dirResult.isSuccess) {
      return dirResult
    }
    
    // Then write the JSON file
    return writer(filePath, data)
  }
}

/**
 * Utility function to find all files with a specific extension in a directory
 * Returns a function that recursively searches for files
 */
export const createFileFinder = (extension: string) => {
  const readDir = createDirectoryReader()
  
  const findFiles = (dirPath: string): Result<string[]> => {
    const results: string[] = []
    
    const searchRecursive = (currentDir: string): Result<void> => {
      const entriesResult = readDir(currentDir)
      
      if (!entriesResult.isSuccess) {
        return err(entriesResult.error!)
      }
      
      for (const entry of entriesResult.value!) {
        const fullPath = path.join(currentDir, entry.name)
        
        if (entry.isDirectory()) {
          const subResult = searchRecursive(fullPath)
          if (!subResult.isSuccess) {
            return subResult
          }
        } else if (entry.name.endsWith(extension)) {
          results.push(fullPath)
        }
      }
      
      return ok(undefined)
    }
    
    const searchResult = searchRecursive(dirPath)
    
    if (!searchResult.isSuccess) {
      return err(searchResult.error!)
    }
    
    return ok(results)
  }
  
  return findFiles
}

/**
 * Create a batch file processor
 * Processes multiple files and collects results
 */
export const createBatchProcessor = <T>(
  processor: (filePath: string) => Result<T>
) => (filePaths: string[]): Result<{ successes: T[], failures: Array<{ path: string, error: Error }> }> => {
  const successes: T[] = []
  const failures: Array<{ path: string, error: Error }> = []
  
  for (const filePath of filePaths) {
    const result = processor(filePath)
    
    if (result.isSuccess) {
      successes.push(result.value!)
    } else {
      failures.push({ path: filePath, error: result.error! })
    }
  }
  
  return ok({ successes, failures })
}

/**
 * Default instances for common use cases
 * These can be imported directly without calling create functions
 */
export const defaultFileReader = createFileReader()
export const defaultFileWriter = createSafeFileWriter()
export const defaultJsonWriter = createSafeJsonWriter()
export const defaultDirectoryReader = createDirectoryReader()
export const defaultPathChecker = createPathChecker()
export const defaultDirectoryCreator = createDirectoryCreator()
export const findTextFiles = createFileFinder('.txt')
export const findJsonFiles = createFileFinder('.json')