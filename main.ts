// main.ts - Refactored with Orchestrator Pattern
import * as path from 'path'

// Core types and monads
import { Result, ok, err, fold } from './src/core'

// Pipeline construction
import { pipelines } from './src/pipeline'

// I/O operations
import {
  createFileReader,
  createJsonWriter,
  createDirectoryReader,
  createDirectoryCreator,
  createPathChecker,
  findTextFiles
} from './src/io/file-operations'

// Orchestrators
import {
  createFileProcessor,
  createDirectoryProcessor,
  createStreamingFileProcessor,
  createConditionalProcessor,
  ProcessingSummary
} from './src/orchestrators/file-processing'

// Utils
import { log, logError, logStart, logCompletion } from './src/utils'

// Configuration
import {
  DEFAULT_PATHS,
  mapLanguageToPath,
  ensurePathStructure
} from './src/config'

/**
 * Command line arguments interface
 */
interface CommandLineArgs {
  dir: string
  pipeline: string
  dryRun: boolean
  sample: number
  file: string
  preview: boolean
}

/**
 * Create I/O operation instances
 * These are created once and reused throughout the application
 */
const io = {
  reader: createFileReader(),
  writer: createJsonWriter(),
  dirReader: createDirectoryReader(),
  dirCreator: createDirectoryCreator(),
  pathChecker: createPathChecker()
}

/**
 * Parse command line arguments
 */
function parseCommandLineArgs(): CommandLineArgs {
  const args: CommandLineArgs = {
    dir: '',
    pipeline: 'standard',
    dryRun: false,
    sample: 0,
    file: '',
    preview: false
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
 * Create a dry run processor that logs output instead of writing files
 */
function createDryRunProcessor(pipeline: any) {
  const processor = createStreamingFileProcessor(
    io.reader,
    pipeline,
    // Dummy writer that logs instead of writing
    (_path: string, content: string) => {
      log(content)
      return ok(undefined)
    }
  )
  
  return processor
}

/**
 * Handle dry run mode with the orchestrator pattern
 */
function handleDryRun(args: CommandLineArgs, sourceDir: string, selectedPipeline: any): void {
  const dryRunProcessor = createDryRunProcessor(selectedPipeline)
  
  // Determine which files to process
  const filesToProcessResult = args.file
    ? handleSpecificFile(args.file, sourceDir)
    : args.sample > 0
    ? findSampleFiles(sourceDir, args.sample)
    : findTextFiles(sourceDir)
  
  fold(
    (error: Error) => {
      logError(`Error finding files: ${error.message}`)
      process.exit(1)
    },
    (filesToProcess: string[]) => {
      if (filesToProcess.length === 0) {
        log(`No text files found in ${sourceDir}`)
        return
      }
      
      log(`DRY RUN: Processing ${filesToProcess.length} file(s)`)
      
      if (args.preview || filesToProcess.length <= 3) {
        // Process and show results
        processFilesInDryRun(filesToProcess, sourceDir, dryRunProcessor)
      } else {
        // Just show what would be processed
        log(`Would process:`)
        filesToProcess.slice(0, 3).forEach(file => 
          log(` - ${path.relative(sourceDir, file)}`)
        )
        log(`  ... and ${filesToProcess.length - 3} more files`)
      }
    }
  )(filesToProcessResult)
}

/**
 * Process files in dry run mode and show results
 */
function processFilesInDryRun(
  files: string[],
  sourceDir: string,
  processor: ReturnType<typeof createDryRunProcessor>
): void {
  const results: Array<{ file: string; success: boolean; error?: Error }> = []
  
  files.forEach((file, index) => {
    log(`\nFile: ${path.relative(sourceDir, file)}`)
    
    // Process with custom entry handler for dry run
    const processResult = processor(
      file,
      'dry-run-output.json',
      (entry, entryIndex) => {
        log(JSON.stringify(entry, null, 2))
      }
    )
    
    fold(
      (error: Error) => {
        logError(`Error: ${error.message}`)
        results.push({ file, success: false, error })
      },
      () => {
        results.push({ file, success: true })
      }
    )(processResult)
  })
  
  // Summary
  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  log(`\nDry run completed: ${successful} successful, ${failed} failed`)
}

/**
 * Handle specific file processing
 */
function handleSpecificFile(file: string, sourceDir: string): Result<string[]> {
  const specificFilePath = path.isAbsolute(file) 
    ? file 
    : path.join(sourceDir, file)
  
  return fold(
    () => err(new Error(`File not found: ${specificFilePath}`)),
    (exists: boolean) => exists 
      ? ok([specificFilePath])
      : err(new Error(`File not found: ${specificFilePath}`))
  )(io.pathChecker(specificFilePath))
}

/**
 * Find sample files for dry run
 */
function findSampleFiles(sourceDir: string, sampleCount: number): Result<string[]> {
  return fold(
    (error: Error) => err(error),
    (files: string[]) => ok(files.slice(0, sampleCount))
  )(findTextFiles(sourceDir))
}

/**
 * Process files in normal mode using the orchestrator
 */
function processNormalMode(
  sourceDir: string,
  targetDir: string,
  selectedPipeline: any,
  pipelineName: string
): void {
  logStart(sourceDir, targetDir, pipelineName)
  
  // Create the directory processor orchestrator
  const processor = createDirectoryProcessor(
    io.reader,
    selectedPipeline,
    io.writer,
    io.dirReader,
    io.dirCreator,
    io.pathChecker
  )
  
  // Process the directory
  const result = processor(sourceDir, targetDir)
  
  fold(
    (error: Error) => {
      logError(`Processing failed: ${error.message}`)
      process.exit(1)
    },
    (summary: ProcessingSummary) => {
      logCompletion()
      log(`Processed ${summary.successfulFiles}/${summary.totalFiles} files successfully`)
      if (summary.failedFiles > 0) {
        log(`Failed files:`)
        summary.errors.forEach(({ file, error }) => 
          log(`  - ${file}: ${error.message}`)
        )
      }
      log(`Total processing time: ${summary.processingTime}ms`)
    }
  )(result)
}

/**
 * Main function using the orchestrator pattern
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
 * Setup and run the application
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