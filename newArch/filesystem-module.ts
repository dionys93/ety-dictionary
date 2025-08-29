import { readdir, stat } from 'fs/promises'
import { join, extname } from 'path'

// Branded types for filesystem entities - these are compile-time hints, not runtime guarantees
type FilePath = string & { readonly __brand: 'FilePath' }
type DirectoryPath = string & { readonly __brand: 'DirectoryPath' }
type DataTextDir = DirectoryPath & { readonly __constraint: 'data-text' }

// Since we can't know at compile time what's actually on the filesystem,
// we need runtime validation that returns properly typed results
type FileSystemEntity = {
  readonly path: string
  readonly name: string
  readonly stats: {
    readonly size: number
    readonly modifiedTime: Date
    readonly createdTime: Date
  }
}

type ValidatedFile = FileSystemEntity & {
  readonly type: 'file'
  readonly extension: string
  readonly path: FilePath  // Branded after validation
}

type ValidatedDirectory = FileSystemEntity & {
  readonly type: 'directory'
  readonly path: DirectoryPath  // Branded after validation
}

type DataContent = ValidatedFile | ValidatedDirectory

// Result monad for handling validation and IO errors
type Success<T> = {
  readonly kind: 'success'
  readonly value: T
}

type Failure<E> = {
  readonly kind: 'failure'
  readonly error: E
}

type Result<T, E = Error> = Success<T> | Failure<E>

// PURE: Result constructors - deterministic, no side effects
function success<T>(value: T): Success<T> {
  return { kind: 'success', value }
}

function failure<E>(error: E): Failure<E> {
  return { kind: 'failure', error }
}

// PURE: Type guards - deterministic predicates
function isSuccess<T, E>(result: Result<T, E>): result is Success<T> {
  return result.kind === 'success'
}

function isFailure<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.kind === 'failure'
}

// PURE: Monad operations - referentially transparent
function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return isSuccess(result) ? success(fn(result.value)) : result
}

function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isSuccess(result) ? fn(result.value) : result
}

// PURE (structurally): Preserves purity of the passed function
async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  return isSuccess(result) ? fn(result.value) : result
}

// IMPURE: Runtime I/O - reads filesystem state
async function validateFileSystemEntity(
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
async function validateDataTextDirectory(
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

// IMPURE: Performs filesystem I/O operations (readdir, stat)
async function readDataTextDirectory(
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
async function getDirectoryContents(
  path: string
): Promise<Result<DataContent[]>> {
  // First validate it's actually a 'data-text' directory on the filesystem
  const dirValidation = await validateDataTextDirectory(path)  // I/O operation
  
  // Then read its contents
  return flatMapAsync(dirValidation, readDataTextDirectory)  // More I/O
}

// PURE: Type predicates - no side effects, deterministic
function isValidatedFile(entity: DataContent): entity is ValidatedFile {
  return entity.type === 'file'
}

function isValidatedDirectory(entity: DataContent): entity is ValidatedDirectory {
  return entity.type === 'directory'
}

// PURE: Filter functions - create new arrays, no mutations
function filterFiles(contents: DataContent[]): ValidatedFile[] {
  return contents.filter(isValidatedFile)
}

function filterDirectories(contents: DataContent[]): ValidatedDirectory[] {
  return contents.filter(isValidatedDirectory)
}

// PURE: Creates new filtered array without mutations
function filterByExtension(
  files: ValidatedFile[],
  extension: string
): ValidatedFile[] {
  return files.filter(function(file) {
    return file.extension === extension
  })
}

// PURE (structurally): Higher-order function that preserves purity of the passed function
// If fn is pure, traverse is pure; if fn has side effects, traverse propagates them
async function traverse<T, U, E>(
  items: T[],
  fn: (item: T) => Promise<Result<U, E>>
): Promise<Result<U[], E>> {
  const results: U[] = []
  
  for (const item of items) {
    const result = await fn(item)
    if (isFailure(result)) {
      return result
    }
    results.push(result.value)
  }
  
  return success(results)
}



// Export types and functions
export type {
  DataTextDir,
  DataContent,
  ValidatedFile,
  ValidatedDirectory,
  FilePath,
  DirectoryPath,
  Result,
  Success,
  Failure
}

export {
  validateDataTextDirectory,
  validateFileSystemEntity,
  readDataTextDirectory,
  getDirectoryContents,
  success,
  failure,
  isSuccess,
  isFailure,
  map,
  flatMap,
  flatMapAsync,
  traverse,
  filterFiles,
  filterDirectories,
  filterByExtension,
  isValidatedFile,
  isValidatedDirectory
}