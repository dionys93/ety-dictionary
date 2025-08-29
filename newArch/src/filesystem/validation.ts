import { stat } from 'fs/promises'
import { extname } from 'path'
import type { 
  DataTextDir, 
  ValidatedFile, 
  ValidatedDirectory,
  FilePath,
  DirectoryPath 
} from '../types/filesystem'
import type { Result } from '../types/result'
import { success, failure, flatMap } from '../core/result'

// IMPURE: Runtime I/O - reads filesystem state
export async function validateFileSystemEntity(
  path: string
): Promise<Result<ValidatedFile | ValidatedDirectory>> {
  try {
    const stats = await stat(path)  // Side effect: filesystem I/O
    const name = path.split(/[/\\]/).pop() || ''
    
    const baseEntity = {
      path,
      name,
      stats: {
        size: stats.size,
        modifiedTime: stats.mtime,  // Note: Date objects from filesystem
        createdTime: stats.birthtime  // These are external system state
      }
    }
    
    // This is where we actually determine what the filesystem says this is
    if (stats.isDirectory()) {
      const validatedDir: ValidatedDirectory = {
        ...baseEntity,
        type: 'directory',
        path: path as DirectoryPath  // Brand it after validation
      }
      return success(validatedDir)
    }
    
    if (stats.isFile()) {
      const validatedFile: ValidatedFile = {
        ...baseEntity,
        type: 'file',
        extension: extname(name),
        path: path as FilePath  // Brand it after validation
      }
      return success(validatedFile)
    }
    
    // Handle special files (symlinks, devices, etc.)
    return failure(new Error(`Path is neither file nor directory: ${path}`))
    
  } catch (error) {
    return failure(
      error instanceof Error 
        ? error 
        : new Error(`Failed to validate: ${String(error)}`)
    )
  }
}

// IMPURE: Calls validateFileSystemEntity which performs I/O
export async function validateDataTextDirectory(
  path: string
): Promise<Result<DataTextDir>> {
  const validationResult = await validateFileSystemEntity(path)  // I/O operation
  
  return flatMap(validationResult, function(entity) {
    // Check if it's actually a directory according to the filesystem
    if (entity.type !== 'directory') {
      return failure(new Error(`Path is not a directory: ${path}`))
    }
    
    // Check if it's named 'data-text'
    const segments = path.split(/[/\\]/)
    const lastSegment = segments[segments.length - 1]
    
    if (lastSegment !== 'data-text') {
      return failure(
        new Error(`Directory must be named 'data-text', got: ${lastSegment}`)
      )
    }
    
    // Only after both validations pass do we brand it as DataTextDir
    return success(entity.path as DataTextDir)
  })
}