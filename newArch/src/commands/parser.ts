// src/commands/parser.ts
import { join } from 'path'
import { readdir } from 'fs/promises'
import type { Result, DataContent, ValidatedDirectory } from '../types'
import { success, failure, flatMapAsync, isSuccess } from '../core'
import { 
  validateDataTextDirectory, 
  readDataTextDirectory,
  validateFileSystemEntity 
} from '../filesystem'
import { filterDirectories, filterFiles } from '../utils'

// ============================================================================
// Command Types
// ============================================================================

type ListDirsCommand = {
  readonly type: 'list-dirs'
  readonly target: string  // Directory name within data-text
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

// PURE: Parse command string into Command object
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

// IMPURE: Read a subdirectory within data-text
export async function readSubdirectory(
  dataTextPath: string,
  subdirName: string
): Promise<Result<DataContent[]>> {
  try {
    // First, load and validate data-text
    const dataTextResult = await validateDataTextDirectory(dataTextPath)
    if (!isSuccess(dataTextResult)) {
      return dataTextResult
    }
    
    // Read data-text contents to find the target subdirectory
    const contentsResult = await readDataTextDirectory(dataTextResult.value)
    if (!isSuccess(contentsResult)) {
      return contentsResult
    }
    
    // Find the target subdirectory
    const dirs = filterDirectories(contentsResult.value)
    const targetDir = dirs.find(d => d.name === subdirName)
    
    if (!targetDir) {
      return failure(new Error(`Directory '${subdirName}' not found in data-text`))
    }
    
    // Read the subdirectory's contents
    const entries = await readdir(targetDir.path)
    
    // Validate each entry
    const validationPromises = entries.map(async (entry) => {
      const fullPath = join(targetDir.path, entry)
      return validateFileSystemEntity(fullPath)
    })
    
    const validationResults = await Promise.all(validationPromises)
    
    const successes: DataContent[] = []
    const failures: Error[] = []
    
    for (const result of validationResults) {
      if (isSuccess(result)) {
        successes.push(result.value)
      } else {
        failures.push(result.error)
      }
    }
    
    if (failures.length > 0) {
      return failure(
        new Error(`Failed to validate ${failures.length} entries in ${subdirName}`)
      )
    }
    
    return success(successes)
    
  } catch (error) {
    return failure(
      error instanceof Error 
        ? error 
        : new Error(`Failed to read subdirectory: ${String(error)}`)
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
  
  return flatMapAsync(contentsResult, async (contents) => {
    const dirs = filterDirectories(contents)
    const names = dirs.map(d => d.name).sort()
    return success(names)
  })
}

async function executeListFiles(
  dataTextPath: string,
  target: string
): Promise<Result<string[]>> {
  const contentsResult = await readSubdirectory(dataTextPath, target)
  
  return flatMapAsync(contentsResult, async (contents) => {
    const files = filterFiles(contents)
    const names = files.map(f => f.name).sort()
    return success(names)
  })
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
  
  return flatMapAsync(contentsResult, async (contents) => {
    const dirs = filterDirectories(contents)
    const files = filterFiles(contents)
    
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
  })
}

// Main command executor
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
      // TypeScript exhaustiveness check
      const _exhaustive: never = command
      return failure(new Error('Unknown command type'))
  }
}

// Convenience function that combines parsing and execution
export const processCommand = (dataTextPath: string) => 
  async (input: string): Promise<Result<any>> => {
    const parseResult = parseCommand(input)
    
    if (!isSuccess(parseResult)) {
      return parseResult
    }
    
    return executeCommand(dataTextPath, parseResult.value)
  }

// ============================================================================
// Interactive REPL Interface
// ============================================================================

export async function runCommandInterface(dataTextPath: string) {
  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'data-text> '
  })
  
  console.log('Data-Text Command Interface')
  console.log('Commands:')
  console.log('  list-dirs <directory>   - List subdirectories in the specified directory')
  console.log('  list-files <directory>  - List files in the specified directory')
  console.log('  get-stats <directory>   - Get statistics for the specified directory')
  console.log('  exit                    - Exit the interface')
  console.log('')
  
  rl.prompt()
  
  rl.on('line', async (line: string) => {
    const trimmed = line.trim()
    
    if (trimmed === 'exit' || trimmed === 'quit') {
      rl.close()
      return
    }
    
    if (trimmed === '') {
      rl.prompt()
      return
    }
    
    const result = await processCommand(dataTextPath)(trimmed)
    
    if (isSuccess(result)) {
      console.log('Success:')
      
      // Format output based on result type
      if (Array.isArray(result.value)) {
        if (result.value.length === 0) {
          console.log('  (empty)')
        } else {
          result.value.forEach(item => console.log(`  - ${item}`))
        }
      } else if (result.value.filesByExtension) {
        // Stats output
        console.log(`  Directories: ${result.value.directories}`)
        console.log(`  Files: ${result.value.files}`)
        console.log(`  Total size: ${(result.value.totalSize / 1024).toFixed(2)} KB`)
        console.log('  Files by extension:')
        result.value.filesByExtension.forEach((count: number, ext: string) => {
          console.log(`    ${ext}: ${count} files`)
        })
      } else {
        console.log(result.value)
      }
    } else {
      console.error('Error:', result.error.message)
    }
    
    console.log('')
    rl.prompt()
  })
  
  rl.on('close', () => {
    console.log('\nGoodbye!')
    process.exit(0)
  })
}