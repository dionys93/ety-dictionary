import { readdir } from 'fs/promises'
import { join } from 'path'
import type { DataTextDir, DataContent } from '../types/filesystem'
import type { Result } from '../types/result'
import { success, failure, flatMapAsync, isSuccess } from '../core/result'
import { validateFileSystemEntity, validateDataTextDirectory } from './validation'

// IMPURE: Performs filesystem I/O operations (readdir, stat)
export async function readDataTextDirectory(
  dirPath: DataTextDir
): Promise<Result<DataContent[]>> {
  try {
    const entries = await readdir(dirPath)  // Side effect: filesystem I/O
    
    // Explicitly type the validation promises to maintain type information
    const validationPromises: Promise<Result<DataContent>>[] = entries.map(
      async function(entry): Promise<Result<DataContent>> {
        const fullPath = join(dirPath, entry)
        return validateFileSystemEntity(fullPath)
      }
    )
    
    const validationResults = await Promise.all(validationPromises)
    
    // Collect all successes and failures
    const successes: DataContent[] = []
    const failures: Error[] = []
    
    for (const result of validationResults) {
      if (isSuccess(result)) {
        successes.push(result.value)
      } else {
        failures.push(result.error)
      }
    }
    
    // If any validations failed, return the first error
    if (failures.length > 0) {
      return failure(
        new Error(`Failed to validate ${failures.length} entries: ${failures[0].message}`)
      )
    }
    
    return success(successes)
    
  } catch (error) {
    return failure(
      error instanceof Error 
        ? error 
        : new Error(`Failed to read directory: ${String(error)}`)
    )
  }
}

// IMPURE: Orchestrates I/O operations through validation and reading
export async function getDirectoryContents(
  path: string
): Promise<Result<DataContent[]>> {
  // First validate it's actually a 'data-text' directory on the filesystem
  const dirValidation = await validateDataTextDirectory(path)  // I/O operation
  
  // Then read its contents
  return flatMapAsync(dirValidation, readDataTextDirectory)  // More I/O
}