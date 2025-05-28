// main.ts 

import * as fs from 'fs'
import * as path from 'path'
import {
  // Core pipeline components
  createPipeline,
  createDefaultPipeline,
  convertText,
  processDirectory,
  ensureDirExists,
  
  // Pipeline configurations
  pipelines,
  
  // Custom transformers if needed
  stanzaTransformer,
  compactTransformer,

  // Import console utils
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
  safe,
  Result,
  filterSuccesses
} from './src'

// Import centralized path configuration
import {
  DEFAULT_PATHS,
  getLanguagePaths,
  mapLanguageToPath,
  buildLanguagePath,
  buildLanguageOutputPath,
  safeResolvePath,
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
  return pathExists(filePath) // Use centralized path checking
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
 * Safe text processing using Result monad
 */
function createSafeConvertText(pipeline: any) {
  return function safeConvertText(content: string, fileName: string): Result<any[]> {
    try {
      const converter = convertText(pipeline)
      const result = converter(content, fileName)
      return ok(result)
    } catch (error) {
      return err(new Error(`Failed to convert ${fileName}: ${error}`))
    }
  }
}

/**
 * Parse command line arguments
 */
function parseCommandLineArgs() {
  const args = {
    dir: '',           // Directory to process - now uses path config
    pipeline: 'standard', // Pipeline to use
    dryRun: false,     // Whether to run in dry run mode
    sample: 0,         // Number of sample files to process in dry run mode
    file: '',          // Specific file to process in dry run mode
    preview: false     // Whether to show a preview of the output
  }
  
  const cmdArgs = [...process.argv.slice(2)] // Create a copy of arguments to process
  
  // First, extract the directory and pipeline (non-option arguments)
  const nonOptionArgs = cmdArgs.filter(arg => !arg.startsWith('-'))
  if (nonOptionArgs.length > 0) {
    args.dir = nonOptionArgs[0]
    
    // If there's a second non-option argument, it might be a pipeline
    if (nonOptionArgs.length > 1) {
      const potentialPipeline = nonOptionArgs[1]
      // Check if it's a valid pipeline
      if (pipelines[potentialPipeline as keyof typeof pipelines]) {
        args.pipeline = potentialPipeline
      }
    }
  }
  
  // Then process options
  for (const i of Array(cmdArgs.length).keys()) {
    const arg = cmdArgs[i]
    
    // Skip non-option arguments (already processed)
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
          args.sample = 1 // Default to 1 sample
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
        // Unknown option
        logError(`Unknown option: ${arg}`)
        printUsage()
        process.exit(1)
    }
  }
  
  // If we have -p but no explicit file argument, check for an extra argument
  // that might be a file path
  if (args.preview && !args.file) {
    const lastArg = cmdArgs[cmdArgs.length - 1]
    // If the last argument isn't an option and isn't the directory or pipeline
    if (lastArg && !lastArg.startsWith('-') && 
        lastArg !== args.dir && lastArg !== args.pipeline) {
      args.file = lastArg
    }
  }
  
  return args
}

/**
 * Print usage information - now shows available languages from path config
 */
function printUsage(): void {
  log(`Usage: tsx main.ts <language> [pipeline] [options]`)
  log(`Options:`)
  log(`  --dry-run, -d                 Run without creating files`)
  log(`  --sample N, -s N              Process N sample files in dry run mode`)
  log(`  --file PATH, -f PATH          Process a specific file in dry run mode`)
  log(`  --preview, -p                 Show a preview of the output in dry run mode`)
  log(`Examples:`)
  log(`  tsx main.ts [language]                    Process all files in language directory with standard pipeline`)
  log(`  tsx main.ts [language] compact            Process all files in language directory with compact pipeline`)
  log(`  tsx main.ts [language] compact --dry-run  Dry run - show what would be processed`)
  log(`  tsx main.ts [language] --dry-run --preview --file path/to/file.txt    Process a specific file`)
  log(`  tsx main.ts [language] compact -d -p      Dry run with output preview`)
  log(`  tsx main.ts [language] compact -d -s 3    Process 3 sample files in dry run mode`)
  log(`  tsx main.ts [language] -d -f path/to/file.txt    Process a specific file with standard pipeline`)
  log(`Available pipeline types: ${Object.keys(pipelines).join(', ')}`)
  
  // Show available languages from path configuration
  log(`\nConfigured paths:`)
  log(`  Source base: ${DEFAULT_PATHS.base.dataText}`)
  log(`  Output base: ${DEFAULT_PATHS.base.dataJson}`)
  log(`  Analysis: ${DEFAULT_PATHS.base.analysis}`)
}

/**
 * Safely find all text files in a directory
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
 * Process a file in dry run mode safely - converts and returns the result
 */
function processFileForDryRunSafe(filePath: string, pipeline: any): Result<any> {
  return flatMap((content: string) => {
    const fileName = path.basename(filePath)
    const safeConverter = createSafeConvertText(pipeline)
    return safeConverter(content, fileName)
  })(safeReadFile(filePath))
}

/**
 * Handle dry run mode with safe file operations
 */
function handleDryRun(args: any, sourceDir: string, selectedPipeline: any): void {
  // Determine which files to process for dry run
  let filesToProcessResult: Result<string[]>
  
  if (args.file) {
    // Process a specific file if provided
    const specificFilePath = path.join(sourceDir, args.file)
    filesToProcessResult = flatMap((exists: boolean) => {
      if (exists) {
        return ok([specificFilePath])
      } else {
        return err(new Error(`File not found: ${specificFilePath}`))
      }
    })(safeFileExists(specificFilePath))
  } else if (args.sample > 0) {
    // Find sample files if requested
    filesToProcessResult = map((files: string[]) => files.slice(0, args.sample))(
      safeFindAllTextFiles(sourceDir)
    )
  } else {
    // Default to all files but just show count
    filesToProcessResult = safeFindAllTextFiles(sourceDir)
  }
  
  // Process the result
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
      
      // Handle preview mode for large file sets
      if (!args.file && !args.sample && filesToProcess.length > 3) {
        const sampleFiles = filesToProcess.slice(0, 3)
        log(`DRY RUN: Would process ${filesToProcess.length} files from ${sourceDir} using '${args.pipeline}' pipeline.`)
        log(`Here are the first 3 files that would be processed:`)
        sampleFiles.forEach(file => log(` - ${path.relative(sourceDir, file)}`))
        
        if (args.preview) {
          log(`\nPreview output for ${path.relative(sourceDir, sampleFiles[0])}:`)
          processFileForDryRunSafe(sampleFiles[0], selectedPipeline)
        }
        process.exit(0)
      }
      
      // Process specified files safely
      log(`Processing ${filesToProcess.length} file(s) in dry run mode using '${args.pipeline}' pipeline:`)
      
      // Process all files and collect results
      const results = filesToProcess.map(file => ({
        file,
        result: processFileForDryRunSafe(file, selectedPipeline)
      }))
      
      // Show results
      for (const { file, result } of results) {
        log(`\nFile: ${path.relative(sourceDir, file)}`)
        
        fold(
          (error: Error) => logError(`Error: ${error.message}`),
          (data: any) => log(JSON.stringify(data, null, 2))
        )(result)
      }
      
      // Summary of processing
      const successful = results.filter(r => r.result.isSuccess).length
      const failed = results.filter(r => !r.result.isSuccess).length
      
      if (failed > 0) {
        logError(`\nDry run completed: ${successful} successful, ${failed} failed`)
      } else {
        log(`\nDry run completed successfully! Processed ${successful} files.`)
      }
    }
  )(filesToProcessResult)
}

/**
 * Process files in normal mode using path configuration
 */
function processNormalMode(sourceDir: string, targetDir: string, selectedPipeline: any, pipelineName: string): void {
  // Normal processing mode - create files
  logStart(sourceDir, targetDir, pipelineName)
  
  // Create target directory if it doesn't exist
  ensureDirExists(targetDir)
  
  // Create converter from the selected pipeline
  const converter = convertText(selectedPipeline)
  
  // Start processing from the source directory
  processDirectory(targetDir, converter)(sourceDir)
  
  logCompletion()
}

/**
 * Validate pipeline selection
 */
function validatePipeline(pipelineName: string): boolean {
  if (!pipelines[pipelineName as keyof typeof pipelines]) {
    logError(`Error: Pipeline type '${pipelineName}' not found.`)
    log(`Available pipeline types: ${Object.keys(pipelines).join(', ')}`)
    return false
  }
  return true
}

/**
 * Main function to start the text-to-JSON processing
 */
function main(): void {
  // Parse command line arguments
  const args = parseCommandLineArgs()
  
  // Use centralized path configuration instead of hardcoded paths
  const languagePathsResult = mapLanguageToPath(args.dir || 'inglish')
  
  fold(
    (error: Error) => {
      logError(`Path configuration error: ${error.message}`)
      printUsage()
      process.exit(1)
    },
    (paths: { source: string, target: string }) => {
      const { source: sourceDir, target: targetDir } = paths
      
      // Validate pipeline selection
      if (!validatePipeline(args.pipeline)) {
        process.exit(1)
      }

      const selectedPipeline = pipelines[args.pipeline as keyof typeof pipelines]
      
      if (args.dryRun) {
        // Handle dry run mode with safe operations
        handleDryRun(args, sourceDir, selectedPipeline)
      } else {
        // Handle normal processing mode
        processNormalMode(sourceDir, targetDir, selectedPipeline, args.pipeline)
      }
    }
  )(languagePathsResult)
}

/**
 * Setup application and run main function
 */
function setupAndRun(): void {
  // Execute main function with directory structure setup
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

/**
 * Legacy functions kept for backward compatibility but implemented safely
 */
function findSampleFiles(dirPath: string, limit: number): string[] {
  function safeFindSampleFiles(dirPath: string, limit: number): Result<string[]> {
    const results: string[] = []
    
    function searchRecursive(currentDir: string): Result<void> {
      if (results.length >= limit) return ok(undefined)
      
      return flatMap((entries: fs.Dirent[]) => {
        for (const entry of entries) {
          if (results.length >= limit) break
          
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
  
  return fold(
    () => [],
    (files: string[]) => files
  )(safeFindSampleFiles(dirPath, limit))
}

function findAllTextFiles(dirPath: string): string[] {
  return fold(
    () => [],
    (files: string[]) => files
  )(safeFindAllTextFiles(dirPath))
}

/**
 * Example of creating a custom pipeline for a specific use case
 * This shows how you can extend functionality in main.ts without modifying functors
 */
function createCustomPipeline() {
  // Custom transformer for a unique format
  function verbConjugationTransformer(group: any) {
    const modernLine = group.etymologyLines.find((line: any) => line.language === 'ME')
    const ingLine = group.etymologyLines.find((line: any) => 
      line.text && line.text.includes('-ing'))
    
    // Extract verb conjugation pattern
    const conjugationPattern = ingLine ? 
      ingLine.text.match(/(\w+)\s+(-s\s+\w+\s+\w+\s+-ing)/) : null
    
    return {
      verb: modernLine?.text || null,
      conjugation: conjugationPattern ? conjugationPattern[2] : null
    }
  }

  // Create a custom pipeline for verb conjugations
  return createPipeline({
    customTransformers: {
      verbConjugation: verbConjugationTransformer
    }
  })
}

// Execute the application
setupAndRun()