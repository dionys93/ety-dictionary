import {
  validateDataTextDirectory,
  readDataTextDirectory,
  isSuccess,
  success,
  failure,
  flatMapAsync,
  filterFiles,
  filterDirectories,
  filterByExtension,
  type Result,
  type DataContent,
  type ValidatedFile,
  type ValidatedDirectory,
  type DirectoryPath
} from './newArch/filesystem-module'

// Simple async pipeline for Result types - left to right execution
function composeAsync<T>(...fns: Array<(arg: any) => Promise<Result<any, Error>>>): (value: T) => Promise<Result<any, Error>> {
  return async function(value: T) {
    const runPipeline = async (
      result: Result<any, Error>, 
      remainingFns: Array<(arg: any) => Promise<Result<any, Error>>>
    ): Promise<Result<any, Error>> => {
      if (remainingFns.length === 0) return result
      const [nextFn, ...rest] = remainingFns
      const nextResult = await flatMapAsync(result, nextFn)
      return runPipeline(nextResult, rest)
    }
    
    return runPipeline(success(value), fns)
  }
}

// ============================================
// Single source of truth: data-text directory
// ============================================

// Read the data-text directory once
const loadDataText = composeAsync<string>(
  validateDataTextDirectory,
  readDataTextDirectory
)

// ============================================
// Transformations on the data-text contents
// ============================================

// Get all file names
async function getFileNames(contents: DataContent[]): Promise<Result<string[], Error>> {
  const files = filterFiles(contents)
  const names = files.map(f => f.name)
  return success(names)
}

// Get all subdirectory names
async function getSubdirectoryNames(contents: DataContent[]): Promise<Result<string[], Error>> {
  const dirs = filterDirectories(contents)
  const names = dirs.map(d => d.name)
  return success(names)
}

// Get text file contents (names for now, could read actual content later)
async function getTextFileInfo(contents: DataContent[]): Promise<Result<ValidatedFile[], Error>> {
  const files = filterFiles(contents)
  const textFiles = filterByExtension(files, '.txt')
  return success(textFiles)
}

// Process a specific subdirectory within data-text
async function processSubdirectory(contents: DataContent[]): Promise<Result<DataContent[] | null, Error>> {
  const dirs = filterDirectories(contents)
  const targetDir = dirs.find(d => d.name === 'output') // or whatever subdirectory
  
  if (!targetDir) {
    return success(null)
  }
  
  // Would need to read this subdirectory's contents
  // For now, just return a placeholder
  console.log(`Found subdirectory: ${targetDir.name} at ${targetDir.path}`)
  // In reality: return readDataTextDirectory(targetDir.path as DirectoryPath)
  return success(null)
}

// ============================================
// Composed pipelines for specific workflows
// ============================================

// Get all text files and their total size
const analyzeTextFiles = composeAsync<DataContent[]>(
  async function(contents: DataContent[]): Promise<Result<{files: ValidatedFile[], totalSize: number}, Error>> {
    const files = filterFiles(contents)
    const textFiles = filterByExtension(files, '.txt')
    const totalSize = textFiles.reduce((sum, f) => sum + f.stats.size, 0)
    
    return success({
      files: textFiles,
      totalSize
    })
  }
)

// ============================================
// Main execution - single read, multiple transforms
// ============================================

async function run() {
  // Load data-text once - this is our single source of truth
  const result = await loadDataText('./data-text')
  
  if (!isSuccess(result)) {
    console.log('Failed to load data-text:', result.error.message)
    return
  }
  
  const dataTextContents = result.value
  console.log(`Loaded data-text with ${dataTextContents.length} items\n`)
  
  // Now apply various transformations to the same source data
  
  // Transform 1: Get file names
  const fileNamesResult = await getFileNames(dataTextContents)
  if (isSuccess(fileNamesResult)) {
    console.log('Files:', fileNamesResult.value)
  }
  
  // Transform 2: Get subdirectories
  const subdirsResult = await getSubdirectoryNames(dataTextContents)
  if (isSuccess(subdirsResult)) {
    console.log('Subdirectories:', subdirsResult.value)
  }
  
  // Transform 3: Analyze text files
  const textAnalysis = await analyzeTextFiles(dataTextContents)
  if (isSuccess(textAnalysis)) {
    const { files, totalSize } = textAnalysis.value
    console.log(`\nText files: ${files.length} files, ${(totalSize / 1024).toFixed(2)} KB total`)
  }
  
  // Transform 4: Process subdirectory if needed
  const subdirResult = await processSubdirectory(dataTextContents)
  if (isSuccess(subdirResult) && subdirResult.value) {
    console.log('Subdirectory processed')
  }
}

run()