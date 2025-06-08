// main.ts - Text Processing Pipeline with Centralized Path Configuration
//
// This is the main entry point for processing etymology text files into structured JSON.
// 
// Key architectural decisions:
// - Uses centralized path configuration from src/config/paths.ts
// - Safe error handling with Result monads throughout
// - Supports dry-run mode for testing without file creation
// - Modular design with single-responsibility functions 

import * as fs from 'fs'
import * as path from 'path'
import {
  // Core pipeline components
  createPipeline,
  convertText,
  processDirectory,
  ensureDirExists,
  pipelines,
  
  // Console utils
  log, 
  logError, 
  logStart, 
  logCompletion,
  
  // Monads for safe operations
  ok,
  err,
  map,
  flatMap,
  fold,
  Result,
} from './src'

// Import centralized path configuration
import {
  DEFAULT_PATHS,
  mapLanguageToPath,
  pathExists,
  ensurePathStructure
} from './src/config/paths'

/**
 * Safe file operations using Result monad
 */
function safeReadFile(filePath: string): Result<string> {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return ok(content)
  } catch (error) {
    return err(new Error(`Failed to read ${filePath}: ${error}`))
  }
}

function safeFileExists(filePath: string): Result<boolean> {
  return pathExists(filePath)
}

function safeReadDir(dirPath: string): Result<fs.Dirent[]> {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return ok(entries)
  } catch (error) {
    return err(new Error(`Failed to read directory ${dirPath}: ${error}`))
  }
}

/**
 * Parse command line arguments
 */
function parseCommandLineArgs() {
  const args = {
    dir: '',              // Directory to process
    pipeline: 'standard', // Pipeline to use
    dryRun: false,       // Whether to run in dry run mode
    sample: 0,           // Number of sample files to process in dry run mode
    file: '',            // Specific file to process
    preview: false       // Whether to show a preview of the output
  }
  
  const cmdArgs = [...process.argv.slice(2)]
  
  // Extract directory and pipeline (non-option arguments)
  const nonOptionArgs = cmdArgs.filter(arg => !arg.startsWith('-'))
  if (nonOptionArgs.length > 0) {
    args.dir = nonOptionArgs[0]
    
    if (nonOptionArgs.length > 1) {
      const potentialPipeline = nonOptionArgs[1]
      if (pipelines[potentialPipeline as keyof typeof pipelines]) {
        args.pipeline = potentialPipeline
      }
    }
  }
  
  // Process options
  for (const i of Array(cmdArgs.length).keys()) {
    const arg = cmdArgs[i]
    if (!arg.startsWith('-')) continue
    
    switch (arg) {
      case '--dry-run':
      case '-d':
        args.dryRun = true
        break
        
      case '--preview':
      case '-p':
        args.preview = true
        break
        
      case '--sample':
      case '-s':
        if (i + 1 < cmdArgs.length && !cmdArgs[i+1].startsWith('-')) {
          args.sample = parseInt(cmdArgs[i+1], 10) || 1
        } else {
          args.sample = 1
        }
        break
        
      case '--file':
      case '-f':
        if (i + 1 < cmdArgs.length) {
          args.file = cmdArgs[i+1]
        } else {
          logError('Error: --file/-f option requires a file path argument')
          printUsage()
          process.exit(1)
        }
        break
        
      default:
        logError(`Unknown option: ${arg}`)
        printUsage()
        process.exit(1)
    }
  }
  
  return args
}

/**
 * Print usage information
 */
function printUsage(): void {
  log(`Usage: tsx main.ts <language> [pipeline] [options]`)
  log(`Options:`)
  log(`  --dry-run, -d                 Run without creating files`)
  log(`  --sample N, -s N              Process N sample files in dry run mode`)
  log(`  --file PATH, -f PATH          Process a specific file`)
  log(`  --preview, -p                 Show a preview of the output`)
  log(`Examples:`)
  log(`  tsx main.ts inglish                       Process all files with standard pipeline`)
  log(`  tsx main.ts inglish compact               Process all files with compact pipeline`)
  log(`  tsx main.ts inglish --dry-run --sample 3  Dry run with 3 sample files`)
  log(`  tsx main.ts inglish -d -p -f test.txt     Preview specific file`)
  log(`Available pipeline types: ${Object.keys(pipelines).join(', ')}`)
  log(`\nConfigured paths:`)
  log(`  Source base: ${DEFAULT_PATHS.base.dataText}`)
  log(`  Output base: ${DEFAULT_PATHS.base.dataJson}`)
}

/**
 * Find all text files in a directory
 */
function safeFindAllTextFiles(dirPath: string): Result<string[]> {
  const results: string[] = []
  
  function searchRecursive(currentDir: string): Result<void> {
    return flatMap((entries: fs.Dirent[]) => {
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        
        if (entry.isDirectory()) {
          const subResult = searchRecursive(fullPath)
          if (!subResult.isSuccess) {
            return err(subResult.error!)
          }
        } else if (entry.name.endsWith('.txt')) {
          results.push(fullPath)
        }
      }
      return ok(undefined)
    })(safeReadDir(currentDir))
  }
  
  return map(() => results)(searchRecursive(dirPath))
}

/**
 * Process a file in dry run mode
 */
function processFileForDryRun(filePath: string, pipeline: any): Result<any> {
  return flatMap((content: string) => {
    const fileName = path.basename(filePath)
    const converter = convertText(pipeline)
    const result = converter(content, fileName)
    return ok(result)
  })(safeReadFile(filePath))
}

/**
 * Handle dry run mode
 */
function handleDryRun(args: any, sourceDir: string, selectedPipeline: any): void {
  let filesToProcessResult: Result<string[]>
  
  if (args.file) {
    // Process specific file
    const specificFilePath = path.isAbsolute(args.file) 
      ? args.file 
      : path.join(sourceDir, args.file)
      
    filesToProcessResult = flatMap((exists: boolean) => {
      if (exists) {
        return ok([specificFilePath])
      } else {
        return err(new Error(`File not found: ${specificFilePath}`))
      }
    })(safeFileExists(specificFilePath))
  } else if (args.sample > 0) {
    // Find sample files
    filesToProcessResult = map((files: string[]) => files.slice(0, args.sample))(
      safeFindAllTextFiles(sourceDir)
    )
  } else {
    // Find all files
    filesToProcessResult = safeFindAllTextFiles(sourceDir)
  }
  
  fold(
    (error: Error) => {
      logError(`Error finding files: ${error.message}`)
      process.exit(1)
    },
    (filesToProcess: string[]) => {
      if (filesToProcess.length === 0) {
        log(`No text files found in ${sourceDir}`)
        process.exit(0)
      }
      
      // Show what would be processed
      if (!args.file && !args.sample && filesToProcess.length > 3) {
        log(`DRY RUN: Would process ${filesToProcess.length} files from ${sourceDir}`)
        log(`First 3 files:`)
        filesToProcess.slice(0, 3).forEach(file => 
          log(` - ${path.relative(sourceDir, file)}`)
        )
        
        if (args.preview) {
          const result = processFileForDryRun(filesToProcess[0], selectedPipeline)
          fold(
            (error: Error) => logError(`Preview failed: ${error.message}`),
            (data: any) => {
              log(`\nPreview of ${path.relative(sourceDir, filesToProcess[0])}:`)
              log(JSON.stringify(data, null, 2))
            }
          )(result)
        }
        return
      }
      
      // Process files
      log(`Processing ${filesToProcess.length} file(s) in dry run mode:`)
      
      const results = filesToProcess.map(file => ({
        file,
        result: processFileForDryRun(file, selectedPipeline)
      }))
      
      // Show results
      for (const { file, result } of results) {
        log(`\nFile: ${path.relative(sourceDir, file)}`)
        
        fold(
          (error: Error) => logError(`Error: ${error.message}`),
          (data: any) => log(JSON.stringify(data, null, 2))
        )(result)
      }
      
      // Summary
      const successful = results.filter(r => r.result.isSuccess).length
      const failed = results.filter(r => !r.result.isSuccess).length
      
      log(`\nDry run completed: ${successful} successful, ${failed} failed`)
    }
  )(filesToProcessResult)
}

/**
 * Process files in normal mode
 */
function processNormalMode(
  sourceDir: string, 
  targetDir: string, 
  selectedPipeline: any, 
  pipelineName: string
): void {
  logStart(sourceDir, targetDir, pipelineName)
  
  ensureDirExists(targetDir)
  
  const converter = convertText(selectedPipeline)
  processDirectory(targetDir, converter)(sourceDir)
  
  logCompletion()
}

/**
 * Main function
 */
function main(): void {
  const args = parseCommandLineArgs()
  
  const languagePathsResult = mapLanguageToPath(args.dir || 'inglish')
  
  fold(
    (error: Error) => {
      logError(`Path configuration error: ${error.message}`)
      printUsage()
      process.exit(1)
    },
    (paths: { source: string, target: string }) => {
      const { source: sourceDir, target: targetDir } = paths
      
      // Validate pipeline
      if (!pipelines[args.pipeline as keyof typeof pipelines]) {
        logError(`Error: Pipeline type '${args.pipeline}' not found.`)
        log(`Available pipelines: ${Object.keys(pipelines).join(', ')}`)
        process.exit(1)
      }
      
      const selectedPipeline = pipelines[args.pipeline as keyof typeof pipelines]
      
      if (args.dryRun) {
        handleDryRun(args, sourceDir, selectedPipeline)
      } else {
        processNormalMode(sourceDir, targetDir, selectedPipeline, args.pipeline)
      }
    }
  )(languagePathsResult)
}

/**
 * Setup and run
 */
function setupAndRun(): void {
  const setupResult = ensurePathStructure()
  
  fold(
    (error: Error) => {
      logError(`Failed to setup directory structure: ${error.message}`)
      process.exit(1)
    },
    (createdPaths: string[]) => {
      if (createdPaths.length > 0) {
        log(`Ensured directory structure: ${createdPaths.join(', ')}`)
      }
      main()
    }
  )(setupResult)
}

// Execute the application
setupAndRun()