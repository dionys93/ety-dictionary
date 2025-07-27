// etymology-cli.ts

import * as path from 'path'
import { Result, ok, err, fold } from './src/core'
import { log, logError, logStart, logCompletion } from './src/utils'
import { pipelines } from './src/pipeline'
import {
  createFileReader,
  createJsonWriter,
  createDirectoryReader,
  createDirectoryCreator,
  createPathChecker,
  findTextFiles
} from './src/io/file-operations'
import {
  createFileProcessor,
  createStreamingFileProcessor,
  createAlphabeticalDirectoryProcessor,
  ProcessingSummary
} from './src/orchestrators/file-processing'
import {
  DEFAULT_PATHS,
  mapLanguageToPath,
  ensurePathStructure
} from './src/config'

interface Command {
  description: string
  execute: (args: string[]) => Result<void>
  printHelp: () => void
}

// Create I/O instances once (like main.ts does)
const io = {
  reader: createFileReader(),
  writer: createJsonWriter(),
  dirReader: createDirectoryReader(),
  dirCreator: createDirectoryCreator(),
  pathChecker: createPathChecker()
}

// Parse process command arguments (adapted from main.ts parseCommandLineArgs)
interface ProcessArgs {
  language: string
  pipeline: string
  dryRun: boolean
  sample: number
  file: string
  preview: boolean
}

function parseProcessArgs(args: string[]): ProcessArgs {
  const parsed: ProcessArgs = {
    language: 'inglish',
    pipeline: 'standard',
    dryRun: false,
    sample: 0,
    file: '',
    preview: false
  }
  
  // Extract non-option arguments
  const nonOptionArgs = args.filter(arg => !arg.startsWith('-'))
  if (nonOptionArgs.length > 0) {
    parsed.language = nonOptionArgs[0]
    
    if (nonOptionArgs.length > 1) {
      const potentialPipeline = nonOptionArgs[1]
      if (pipelines[potentialPipeline as keyof typeof pipelines]) {
        parsed.pipeline = potentialPipeline
      }
    }
  }
  
  // Process options
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('-')) continue
    
    switch (arg) {
      case '--dry-run':
      case '-d':
        parsed.dryRun = true
        break
        
      case '--preview':
      case '-p':
        parsed.preview = true
        break
        
      case '--sample':
      case '-s':
        if (i + 1 < args.length && !args[i+1].startsWith('-')) {
          parsed.sample = parseInt(args[i+1], 10) || 1
        } else {
          parsed.sample = 1
        }
        break
        
      case '--file':
      case '-f':
        if (i + 1 < args.length) {
          parsed.file = args[i+1]
        }
        break
    }
  }
  
  return parsed
}

// Create dry run processor (from main.ts)
function createDryRunProcessor(pipeline: any) {
  const processor = createStreamingFileProcessor(
    io.reader,
    pipeline,
    (_path: string, content: string) => {
      log(content)
      return ok(undefined)
    }
  )
  
  return processor
}

// Handle specific file (from main.ts)
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

// Find sample files (from main.ts)
function findSampleFiles(sourceDir: string, sampleCount: number): Result<string[]> {
  return fold(
    (error: Error) => err(error),
    (files: string[]) => ok(files.slice(0, sampleCount))
  )(findTextFiles(sourceDir))
}

// Process files in dry run mode (from main.ts)
function processFilesInDryRun(
  files: string[],
  sourceDir: string,
  processor: ReturnType<typeof createDryRunProcessor>
): void {
  const results: Array<{ file: string; success: boolean; error?: Error }> = []
  
  files.forEach((file) => {
    log(`\nFile: ${path.relative(sourceDir, file)}`)
    
    const processResult = processor(
      file,
      'dry-run-output.json',
      (entry) => {
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
  
  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  log(`\nDry run completed: ${successful} successful, ${failed} failed`)
}

// Handle dry run mode (from main.ts)
function handleDryRun(args: ProcessArgs, sourceDir: string, selectedPipeline: any): void {
  const dryRunProcessor = createDryRunProcessor(selectedPipeline)
  
  const filesToProcessResult = args.file
    ? handleSpecificFile(args.file, sourceDir)
    : args.sample > 0
    ? findSampleFiles(sourceDir, args.sample)
    : findTextFiles(sourceDir)
  
  fold(
    (error: Error) => {
      logError(`Error finding files: ${error.message}`)
    },
    (filesToProcess: string[]) => {
      if (filesToProcess.length === 0) {
        log(`No text files found in ${sourceDir}`)
        return
      }
      
      log(`DRY RUN: Processing ${filesToProcess.length} file(s)`)
      
      if (args.preview || filesToProcess.length <= 3) {
        processFilesInDryRun(filesToProcess, sourceDir, dryRunProcessor)
      } else {
        log(`Would process:`)
        filesToProcess.slice(0, 3).forEach(file => 
          log(` - ${path.relative(sourceDir, file)}`)
        )
        log(`  ... and ${filesToProcess.length - 3} more files`)
      }
    }
  )(filesToProcessResult)
}

// Process normal mode (from main.ts)
function processNormalMode(
  sourceDir: string,
  targetDir: string,
  selectedPipeline: any,
  pipelineName: string
): Result<void> {
  logStart(sourceDir, targetDir, pipelineName)
  
  const processor = createAlphabeticalDirectoryProcessor(
    io.reader,
    selectedPipeline,
    io.writer,
    io.dirReader,
    io.dirCreator,
    io.pathChecker
  )
  
  const result = processor(sourceDir, targetDir)
  
  return fold(
    (error: Error) => err(error),
    (summary: ProcessingSummary) => {
      logCompletion()
      log(`Processed ${summary.successfulFiles}/${summary.totalFiles} files successfully`)
      log(`Note: Only single-character directories (a-z, A-Z) were processed`)
      if (summary.failedFiles > 0) {
        log(`Failed files:`)
        summary.errors.forEach(({ file, error }) => 
          log(`  - ${file}: ${error.message}`)
        )
      }
      log(`Total processing time: ${summary.processingTime}ms`)
      return ok(undefined)
    }
  )(result)
}

// Create process command
function createProcessCommand(): Command {
  return {
    description: 'Convert etymology text files to JSON',
    
    execute(args: string[]): Result<void> {
      const parsedArgs = parseProcessArgs(args)
      
      // Validate pipeline
      if (!pipelines[parsedArgs.pipeline as keyof typeof pipelines]) {
        return err(new Error(`Unknown pipeline: ${parsedArgs.pipeline}. Available: ${Object.keys(pipelines).join(', ')}`))
      }
      
      const languagePathsResult = mapLanguageToPath(parsedArgs.language)
      
      return fold(
        (error: Error) => err(error),
        (paths: { source: string, target: string }) => {
          const { source: sourceDir, target: targetDir } = paths
          const selectedPipeline = pipelines[parsedArgs.pipeline as keyof typeof pipelines]
          
          if (parsedArgs.dryRun) {
            handleDryRun(parsedArgs, sourceDir, selectedPipeline)
            return ok(undefined)
          } else {
            return processNormalMode(sourceDir, targetDir, selectedPipeline, parsedArgs.pipeline)
          }
        }
      )(languagePathsResult)
    },
    
    printHelp() {
      log(`Usage: etymology process <language> [pipeline] [options]`)
      log(`Options:`)
      log(`  --dry-run, -d                 Run without creating files`)
      log(`  --sample N, -s N              Process N sample files in dry run mode`)
      log(`  --file PATH, -f PATH          Process a specific file`)
      log(`  --preview, -p                 Show a preview of the output`)
      log(`Examples:`)
      log(`  etymology process inglish                       Process all files with standard pipeline`)
      log(`  etymology process inglish compact               Process all files with compact pipeline`)
      log(`  etymology process inglish --dry-run --sample 3  Dry run with 3 sample files`)
      log(`  etymology process inglish -d -p -f test.txt     Preview specific file`)
      log(`Available pipeline types: ${Object.keys(pipelines).join(', ')}`)
      log(`\nConfigured paths:`)
      log(`  Source base: ${DEFAULT_PATHS.base.dataText}`)
      log(`  Output base: ${DEFAULT_PATHS.base.dataJson}`)
    }
  }
}

// Create command registry
const commands: Record<string, Command> = {
  process: createProcessCommand()
}

function printMainHelp() {
  log(`Etymology Processing Toolkit`)
  log(`Usage: etymology <command> [options]`)
  log(``)
  log(`Commands:`)
  Object.entries(commands).forEach(([name, cmd]) => {
    log(`  ${name.padEnd(15)} ${cmd.description}`)
  })
  log(``)
  log(`Run 'etymology <command> --help' for command-specific help`)
}

function main() {
  console.log('main() called with args:', process.argv)
  const args = process.argv.slice(2)
  const command = args[0]
  
  if (!command || command === '--help' || command === '-h') {
    printMainHelp()
    process.exit(0)
  }
  
  if (!commands[command]) {
    logError(`Unknown command: ${command}`)
    printMainHelp()
    process.exit(1)
  }
  
  const commandArgs = args.slice(1)
  
  if (commandArgs.includes('--help') || commandArgs.includes('-h')) {
    commands[command].printHelp()
    process.exit(0)
  }
  
  // Setup directory structure first (like main.ts setupAndRun)
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
      
      // Execute command
      const result = commands[command].execute(commandArgs)
      
      fold(
        (error: Error) => {
          logError(`Command failed: ${error.message}`)
          process.exit(1)
        },
        () => {
          process.exit(0)
        }
      )(result)
    }
  )(setupResult)
}

// Run if called directly
if (require.main === module) {
  main()
}

export default main