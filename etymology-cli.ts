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
  ensurePathStructure,
  posMap
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

interface AnalyzeArgs {
  language: string
  mode: 'pos' | 'roots' | 'both'
  verbose: boolean
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

// Handle dry run mode
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

function parseAnalyzeArgs(args: string[]): AnalyzeArgs {
  const parsed: AnalyzeArgs = {
    language: 'inglish',
    mode: 'both',
    verbose: false
  }
  
  // Extract non-option arguments
  const nonOptionArgs = args.filter(arg => !arg.startsWith('-'))
  if (nonOptionArgs.length > 0) {
    parsed.language = nonOptionArgs[0]
  }
  
  // Process options
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--mode' || arg === '-m') {
      if (i + 1 < args.length) {
        const mode = args[i + 1]
        if (['pos', 'roots', 'both'].includes(mode)) {
          parsed.mode = mode as 'pos' | 'roots' | 'both'
        }
      }
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true
    }
  }
  
  return parsed
}

// Safe extraction functions (from summarize.ts)
function extractPartOfSpeech(line: string): string[] {
  try {
    const posRegex = /\(([\w\s,]+)\)$/
    const match = line.trim().match(posRegex)
    
    if (!match) return []
    
    return match[1].split(',').map(p => p.trim())
  } catch {
    return []
  }
}

function extractRootWord(content: string): string | null {
  try {
    const lines = content.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        const langMatch = trimmed.match(/^(.+?)\s*\[[\w]+\]/)
        if (langMatch) {
          return langMatch[1].trim()
        }
        return trimmed
      }
    }
    
    return null
  } catch {
    return null
  }
}

function extractRootLanguage(content: string): string | null {
  try {
    const lines = content.split('\n')
    
    for (const line of lines) {
      const langMatch = line.match(/\[([\w]+)\]/)
      if (langMatch) {
        return langMatch[1]
      }
    }
    
    return null
  } catch {
    return null
  }
}

function extractModernEnglishWords(content: string): string[] {
  try {
    const lines = content.split('\n')
    const meWords: string[] = []
    
    for (const line of lines) {
      if (line.includes('[ME]')) {
        const wordMatch = line.match(/^(.+?)\s*\[ME\]/)
        if (wordMatch) {
          meWords.push(wordMatch[1].trim())
        }
      }
    }
    
    return meWords
  } catch {
    return []
  }
}

// Process file for POS analysis
function processFileForPos(content: string, fileName: string) {
  const lines = content.split('\n')
  const posTagsInFile = new Set<string>()
  let hasPosTag = false
  let entriesWithMultiplePos = 0
  
  for (const line of lines) {
    if (line.includes('(') && line.includes(')')) {
      const posTags = extractPartOfSpeech(line)
      
      if (posTags.length > 0) {
        hasPosTag = true
        
        for (const posTag of posTags) {
          posTagsInFile.add(posTag)
        }
        
        if (posTags.length > 1) {
          entriesWithMultiplePos++
        }
      }
    }
  }
  
  return {
    fileName,
    hasPosTag,
    posTagsInFile,
    entriesWithMultiplePos
  }
}

// Process file for roots analysis
function processFileForRoots(content: string, fileName: string) {
  const rootWord = extractRootWord(content)
  const rootLang = extractRootLanguage(content)
  const meWords = extractModernEnglishWords(content)
  
  return {
    fileName,
    rootWord,
    rootLang,
    meWords
  }
}

// Main analysis functions
function analyzePosData(files: Array<{path: string, content: string}>, verbose: boolean) {
  log("Analyzing part of speech data...")
  
  const posCounts: Record<string, number> = {}
  const filesByPos: Record<string, string[]> = {}
  const filesWithoutPos: string[] = []
  let totalPosEntries = 0
  let totalEntriesWithMultiplePos = 0
  
  for (const file of files) {
    const result = processFileForPos(file.content, path.basename(file.path))
    
    if (result.hasPosTag) {
      totalPosEntries++
      totalEntriesWithMultiplePos += result.entriesWithMultiplePos
      
      for (const posTag of result.posTagsInFile) {
        if (!posCounts[posTag]) {
          posCounts[posTag] = 0
          filesByPos[posTag] = []
        }
        
        posCounts[posTag]++
        
        if (!filesByPos[posTag].includes(result.fileName)) {
          filesByPos[posTag].push(result.fileName)
        }
      }
    } else {
      filesWithoutPos.push(result.fileName)
    }
  }
  
  // Calculate percentages
  const posDistribution: Record<string, number> = {}
  for (const [pos, count] of Object.entries(posCounts)) {
    posDistribution[pos] = parseFloat(((count / Math.max(totalPosEntries, 1)) * 100).toFixed(1))
  }
  
  // Add mappings
  const posFullNames: Record<string, string> = {}
  for (const [shortPos, fullName] of Object.entries(posMap)) {
    posFullNames[shortPos] = fullName
  }
  
  const summary = {
    totalFiles: files.length,
    processedFiles: files.length,
    failedFiles: 0,
    totalEntriesWithPos: totalPosEntries,
    entriesWithMultiplePos: totalEntriesWithMultiplePos,
    uniquePartsOfSpeech: Object.keys(posCounts),
    posCounts,
    posDistribution,
    posFullNames,
    examples: Object.fromEntries(
      Object.entries(filesByPos).map(([pos, files]) => [
        pos, 
        files.slice(0, 5).map(f => f.replace('.txt', ''))
      ])
    ),
    filesWithoutPos
  }
  
  // Save to file
  const outputPath = path.join(DEFAULT_PATHS.base.analysis, 'pos-summary.json')
  io.writer(outputPath, summary)
  
  log(`Part of speech summary saved to ${outputPath}`)
  
  // Log results
  if (verbose || true) { // Always show summary
    logPosResults(summary)
  }
  
  return summary
}

function analyzeRootWords(files: Array<{path: string, content: string}>, verbose: boolean) {
  log("Analyzing root words...")
  
  const rootWords: Record<string, any> = {}
  const rootLangCount: Record<string, number> = {}
  const missingRoots: string[] = []
  
  for (const file of files) {
    const result = processFileForRoots(file.content, path.basename(file.path))
    
    if (result.rootWord && result.rootLang) {
      if (!rootLangCount[result.rootLang]) {
        rootLangCount[result.rootLang] = 0
      }
      rootLangCount[result.rootLang]++
      
      if (!rootWords[result.rootWord]) {
        rootWords[result.rootWord] = {
          root: result.rootWord,
          language: result.rootLang,
          files: [],
          modernWords: []
        }
      }
      
      rootWords[result.rootWord].files.push(result.fileName)
      for (const meWord of result.meWords) {
        if (!rootWords[result.rootWord].modernWords.includes(meWord)) {
          rootWords[result.rootWord].modernWords.push(meWord)
        }
      }
    } else {
      missingRoots.push(result.fileName)
    }
  }
  
  const summary = {
    totalFiles: files.length,
    processedFiles: files.length,
    failedFiles: 0,
    uniqueRoots: Object.keys(rootWords).length,
    rootsByLanguage: rootLangCount,
    missingRoots: missingRoots.length,
    roots: Object.values(rootWords)
  }
  
  // Save to file
  const outputPath = path.join(DEFAULT_PATHS.base.analysis, 'root-words.json')
  io.writer(outputPath, summary)
  
  log(`Root words summary saved to ${outputPath}`)
  
  // Log results
  if (verbose || true) { // Always show summary
    logRootResults(summary, rootWords, rootLangCount)
  }
  
  return summary
}

// Logging functions
function logPosResults(summary: any): void {
  log("\n=== Parts of Speech Summary ===")
  log(`Total files analyzed: ${summary.totalFiles}`)
  log(`Files with part of speech tags: ${summary.totalEntriesWithPos}`)
  log(`Files without part of speech tags: ${summary.filesWithoutPos.length}`)
  log(`Entries with multiple parts of speech: ${summary.entriesWithMultiplePos}`)
  
  log("\nDistribution:")
  const sortedPos = Object.keys(summary.posCounts).sort((a, b) => summary.posCounts[b] - summary.posCounts[a])
  for (const pos of sortedPos) {
    const count = summary.posCounts[pos]
    const percentage = summary.posDistribution[pos]
    const fullName = posMap[pos] || pos
    log(`- ${pos}: ${count} entries (${percentage}%) - ${fullName}`)
  }
  
  if (summary.filesWithoutPos.length > 0) {
    log(`\nFiles without POS tags: ${summary.filesWithoutPos.length}`)
    if (summary.filesWithoutPos.length <= 10) {
      summary.filesWithoutPos.forEach((file: string) => {
        log(`- ${file}`)
      })
    } else {
      summary.filesWithoutPos.slice(0, 10).forEach((file: string) => {
        log(`- ${file}`)
      })
      log(`...and ${summary.filesWithoutPos.length - 10} more`)
    }
  }
}

function logRootResults(summary: any, rootWords: Record<string, any>, rootLangCount: Record<string, number>): void {
  log("\n=== Root Words Summary ===")
  log(`Total files analyzed: ${summary.totalFiles}`)
  log(`Unique root words: ${Object.keys(rootWords).length}`)
  log(`Files missing root words: ${summary.missingRoots}`)
  
  log("\nDistribution by language:")
  const sortedLangs = Object.keys(rootLangCount).sort(
    (a, b) => rootLangCount[b] - rootLangCount[a]
  )
  for (const lang of sortedLangs) {
    const count = rootLangCount[lang]
    const percentage = ((count / summary.totalFiles) * 100).toFixed(1)
    log(`- ${lang}: ${count} roots (${percentage}%)`)
  }
  
  log("\nSample root words:")
  const sampleRoots = Object.values(rootWords).slice(0, 5)
  for (const root of sampleRoots) {
    log(`- ${root.root} [${root.language}] → ${root.modernWords.join(', ')}`)
  }
}

// Create analyze command
function createAnalyzeCommand(): Command {
  return {
    description: 'Analyze etymology data for statistics',
    
    execute(args: string[]): Result<void> {
      const parsedArgs = parseAnalyzeArgs(args)
      
      // Get language paths
      const languagePathsResult = mapLanguageToPath(parsedArgs.language)
      
      return fold(
        (error: Error) => err(error),
        (paths: { source: string, target: string }) => {
          const { source: sourceDir } = paths
          
          log(`Starting analysis for ${sourceDir} in ${parsedArgs.mode} mode...`)
          
          // Ensure analysis directory exists
          io.dirCreator(DEFAULT_PATHS.base.analysis)
          
          // Find all text files
          const filesResult = findTextFiles(sourceDir)
          
          return fold(
            (error: Error) => err(error),
            (filePaths: string[]) => {
              if (filePaths.length === 0) {
                return err(new Error(`No text files found in ${sourceDir}`))
              }
              
              log(`Found ${filePaths.length} text files to analyze.`)
              
              // Read all files
              const files: Array<{path: string, content: string}> = []
              for (const filePath of filePaths) {
                const readResult = io.reader(filePath)
                fold(
                  (error: Error) => log(`Failed to read ${filePath}: ${error.message}`),
                  (content: string) => files.push({ path: filePath, content })
                )(readResult)
              }
              
              // Run analysis based on mode
              if (parsedArgs.mode === 'pos' || parsedArgs.mode === 'both') {
                analyzePosData(files, parsedArgs.verbose)
              }
              
              if (parsedArgs.mode === 'roots' || parsedArgs.mode === 'both') {
                analyzeRootWords(files, parsedArgs.verbose)
              }
              
              log(`\nAnalysis completed successfully!`)
              log(`Output files in: ${DEFAULT_PATHS.base.analysis}`)
              
              return ok(undefined)
            }
          )(filesResult)
        }
      )(languagePathsResult)
    },
    
    printHelp() {
      log(`Usage: etymology analyze [language] [options]`)
      log(``)
      log(`Analyze etymology files for statistics and patterns`)
      log(``)
      log(`Arguments:`)
      log(`  language    Language directory to analyze (default: inglish)`)
      log(``)
      log(`Options:`)
      log(`  --mode, -m <mode>     Analysis mode: pos, roots, or both (default: both)`)
      log(`  --verbose, -v         Show detailed logging`)
      log(``)
      log(`Examples:`)
      log(`  etymology analyze                    Analyze inglish with both modes`)
      log(`  etymology analyze --mode pos         Analyze parts of speech only`)
      log(`  etymology analyze --mode roots       Analyze root words only`)
      log(`  etymology analyze inglish -m both -v Verbose analysis of inglish`)
    }
  }
}

// Create command registry
const commands: Record<string, Command> = {
  process: createProcessCommand(),
  analyze: createAnalyzeCommand()
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