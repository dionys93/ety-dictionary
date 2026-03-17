// src/cli/commands/process.ts
import * as path from 'path'
import { Result, ok, err, fold } from '../../core'
import { log, logError, logStart, logCompletion } from '../../utils'
import { pipelines } from '../../pipeline'
import { 
  findTextFilesInAlphabeticalDirs, 
  findSampleFilesInAlphabeticalDirs 
} from '../../io/alpha-file-finder'
import {
  createFileProcessor,
  createAlphabeticalDirectoryProcessor,
  ProcessingSummary
} from '../../orchestrators/file-processing'
import { DEFAULT_PATHS, mapLanguageToPath } from '../../config'
import { Command, ProcessArgs } from '../types'
import { io } from '../shared/io-instances'
import { convertText } from '../../processors/file-processor'

/**
 * Parse command line arguments for the process command
 */
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
  for (const i of Array(args.length).keys()) {
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

/**
 * Create a processor for dry run mode that outputs to console
 * Uses the convertText function directly to ensure proper entry splitting
 */
function createDryRunProcessor(pipeline: any) {
  const converter = convertText(pipeline)
  
  return function processDryRun(filePath: string): Result<void> {
    const fileName = path.basename(filePath)
    
    // Read file
    const readResult = io.reader(filePath)
    
    return fold(
      (error: Error) => err(error),
      (content: string) => {
        // Convert using the same logic as normal mode
        const jsonData = converter(content, fileName)
        
        // Output to console
        log(JSON.stringify(jsonData, null, 2))
        
        return ok(undefined)
      }
    )(readResult)
  }
}

/**
 * Handle processing a specific file
 * Note: This will warn if the file is not in an alphabetical directory
 */
function handleSpecificFile(file: string, sourceDir: string): Result<string[]> {
  const specificFilePath = path.isAbsolute(file) 
    ? file 
    : path.join(sourceDir, file)
  
  return fold(
    () => err(new Error(`File not found: ${specificFilePath}`)),
    (exists: boolean) => {
      if (!exists) {
        return err(new Error(`File not found: ${specificFilePath}`))
      }
      
      // Check if the file is within an alphabetical directory structure
      const relativePath = path.relative(sourceDir, specificFilePath)
      const firstDir = relativePath.split(path.sep)[0]
      
      // Warn if not in alphabetical directory but still process it (user explicitly requested this file)
      if (firstDir && firstDir.length !== 1 || !/^[a-zA-Z]$/.test(firstDir)) {
        log(`Warning: File is not in an alphabetical directory. Processing anyway since explicitly requested.`)
      }
      
      return ok([specificFilePath])
    }
  )(io.pathChecker(specificFilePath))
}

/**
 * Process files in dry run mode with console output
 */
function processFilesInDryRun(
  files: string[],
  sourceDir: string,
  processor: ReturnType<typeof createDryRunProcessor>
): void {
  const results: Array<{ file: string; success: boolean; error?: Error }> = []
  
  files.forEach((file) => {
    log(`\nFile: ${path.relative(sourceDir, file)}`)
    
    const processResult = processor(file)
    
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

/**
 * Handle dry run mode execution
 * Now uses alphabetical directory filtering
 */
function handleDryRun(args: ProcessArgs, sourceDir: string, selectedPipeline: any): void {
  const dryRunProcessor = createDryRunProcessor(selectedPipeline)
  
  const filesToProcessResult = args.file
    ? handleSpecificFile(args.file, sourceDir)
    : args.sample > 0
    ? findSampleFilesInAlphabeticalDirs(sourceDir, args.sample)
    : findTextFilesInAlphabeticalDirs(sourceDir)
  
  fold(
    (error: Error) => {
      logError(`Error finding files: ${error.message}`)
    },
    (filesToProcess: string[]) => {
      if (filesToProcess.length === 0) {
        log(`No text files found in alphabetical directories under ${sourceDir}`)
        return
      }
      
      log(`DRY RUN: Processing ${filesToProcess.length} file(s) from alphabetical directories`)
      
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

/**
 * Process files in normal mode (create JSON output files)
 */
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

/**
 * Create the process command
 */
export function createProcessCommand(): Command {
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
      log(``)
      log(`Convert etymology text files to JSON. Only processes files within`)
      log(`single-character alphabetical directories (a-z, A-Z) at the root level.`)
      log(``)
      log(`Options:`)
      log(`  --dry-run, -d                 Run without creating files`)
      log(`  --sample N, -s N              Process N sample files in dry run mode`)
      log(`  --file PATH, -f PATH          Process a specific file`)
      log(`  --preview, -p                 Show a preview of the output`)
      log(``)
      log(`Examples:`)
      log(`  etymology process inglish                       Process all files with standard pipeline`)
      log(`  etymology process inglish compact               Process all files with compact pipeline`)
      log(`  etymology process inglish --dry-run --sample 3  Dry run with 3 sample files`)
      log(`  etymology process inglish -d -p -f a/test.txt   Preview specific file`)
      log(``)
      log(`Available pipeline types: ${Object.keys(pipelines).join(', ')}`)
      log(``)
      log(`Note: Special directories like 'grammar', 'pronouns' etc. are automatically`)
      log(`      skipped. Only /a/, /b/, /c/ ... /z/ directories are processed.`)
      log(``)
      log(`Configured paths:`)
      log(`  Source base: ${DEFAULT_PATHS.base.dataText}`)
      log(`  Output base: ${DEFAULT_PATHS.base.dataJson}`)
    }
  }
}