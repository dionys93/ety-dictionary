// src/commands/parser.ts
import { join } from 'path'
import { readdir } from 'fs/promises'
import type { Result, DataContent } from '../types'
import { success, failure, isSuccess } from '../core'
import { 
  validateDataTextDirectory, 
  readDataTextDirectory,
  validateFileSystemEntity 
} from '../filesystem'
import { filterDirectories, filterFiles, traverse } from '../utils'

// ============================================================================
// Command Types
// ============================================================================

type ListDirsCommand = {
  readonly type: 'list-dirs'
  readonly target: string
}

type ListFilesCommand = {
  readonly type: 'list-files'
  readonly target: string
}

type GetStatsCommand = {
  readonly type: 'get-stats'
  readonly target: string
}

type Command = ListDirsCommand | ListFilesCommand | GetStatsCommand

// ============================================================================
// Core Functions
// ============================================================================

export function parseCommand(input: string): Result<Command> {
  const parts = input.trim().split(/\s+/)
  
  if (parts.length === 0) {
    return failure(new Error('Empty command'))
  }
  
  const [cmd, ...args] = parts
  
  switch (cmd) {
    case 'list-dirs':
      if (args.length !== 1) {
        return failure(new Error('list-dirs requires exactly one argument: directory name'))
      }
      return success({ type: 'list-dirs', target: args[0] })
      
    case 'list-files':
      if (args.length !== 1) {
        return failure(new Error('list-files requires exactly one argument: directory name'))
      }
      return success({ type: 'list-files', target: args[0] })
      
    case 'get-stats':
      if (args.length !== 1) {
        return failure(new Error('get-stats requires exactly one argument: directory name'))
      }
      return success({ type: 'get-stats', target: args[0] })
      
    default:
      return failure(new Error(`Unknown command: ${cmd}`))
  }
}

// Use traverse to read subdirectory contents
export async function readSubdirectory(
  dataTextPath: string,
  subdirName: string
): Promise<Result<DataContent[]>> {
  // Validate data-text directory
  const dataTextResult = await validateDataTextDirectory(dataTextPath)
  if (!isSuccess(dataTextResult)) {
    return dataTextResult
  }
  
  // Read data-text contents
  const contentsResult = await readDataTextDirectory(dataTextResult.value)
  if (!isSuccess(contentsResult)) {
    return contentsResult
  }
  
  // Find target subdirectory
  const dirs = filterDirectories(contentsResult.value)
  const targetDir = dirs.find(d => d.name === subdirName)
  
  if (!targetDir) {
    return failure(new Error(`Directory '${subdirName}' not found in data-text`))
  }
  
  try {
    // Read entries from target directory
    const entries = await readdir(targetDir.path)
    
    // Use traverse to validate all entries
    const validateEntry = async (entry: string): Promise<Result<DataContent>> => {
      const fullPath = join(targetDir.path, entry)
      return validateFileSystemEntity(fullPath)
    }
    
    return traverse(entries, validateEntry)
    
  } catch (error) {
    return failure(
      error instanceof Error 
        ? error 
        : new Error(`Failed to read directory: ${String(error)}`)
    )
  }
}

// ============================================================================
// Command Executors
// ============================================================================

async function executeListDirs(
  dataTextPath: string,
  target: string
): Promise<Result<string[]>> {
  const contentsResult = await readSubdirectory(dataTextPath, target)
  
  if (!isSuccess(contentsResult)) {
    return contentsResult
  }
  
  const dirs = filterDirectories(contentsResult.value)
  const names = dirs.map(d => d.name).sort()
  return success(names)
}

async function executeListFiles(
  dataTextPath: string,
  target: string
): Promise<Result<string[]>> {
  const contentsResult = await readSubdirectory(dataTextPath, target)
  
  if (!isSuccess(contentsResult)) {
    return contentsResult
  }
  
  const files = filterFiles(contentsResult.value)
  const names = files.map(f => f.name).sort()
  return success(names)
}

async function executeGetStats(
  dataTextPath: string,
  target: string
): Promise<Result<{
  directories: number
  files: number
  totalSize: number
  filesByExtension: Map<string, number>
}>> {
  const contentsResult = await readSubdirectory(dataTextPath, target)
  
  if (!isSuccess(contentsResult)) {
    return contentsResult
  }
  
  const dirs = filterDirectories(contentsResult.value)
  const files = filterFiles(contentsResult.value)
  
  const filesByExtension = new Map<string, number>()
  let totalSize = 0
  
  for (const file of files) {
    totalSize += file.stats.size
    const ext = file.extension.toLowerCase() || '(no extension)'
    filesByExtension.set(ext, (filesByExtension.get(ext) || 0) + 1)
  }
  
  return success({
    directories: dirs.length,
    files: files.length,
    totalSize,
    filesByExtension
  })
}

export async function executeCommand(
  dataTextPath: string,
  command: Command
): Promise<Result<any>> {
  switch (command.type) {
    case 'list-dirs':
      return executeListDirs(dataTextPath, command.target)
      
    case 'list-files':
      return executeListFiles(dataTextPath, command.target)
      
    case 'get-stats':
      return executeGetStats(dataTextPath, command.target)
      
    default:
      const _exhaustive: never = command
      return failure(new Error('Unknown command type'))
  }
}

export function processCommand(dataTextPath: string) {
  return async function(input: string): Promise<Result<any>> {
    const parseResult = parseCommand(input)
    
    if (!isSuccess(parseResult)) {
      return parseResult
    }
    
    return executeCommand(dataTextPath, parseResult.value)
  }
}