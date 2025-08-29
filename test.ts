import {
  validateDataTextDirectory,
  readDataTextDirectory,
  isSuccess,
  success,
  flatMapAsync,
  filterFiles,
  filterByExtension,
  type Result,
  type DataContent,
  type ValidatedFile
} from './newArch/filesystem-module'

// Simple async pipeline for Result types - left to right execution
function composeAsync<T>(...fns: Array<(arg: any) => Promise<Result<any, Error>>>): (value: T) => Promise<Result<any, Error>> {
  return async function(value: T) {
    let result: Result<any, Error> = success(value)
    
    for (const fn of fns) {
      result = await flatMapAsync(result, fn)
    }
    
    return result
  }
}

// Fixed getDirNames to work with compose
async function getDirNames(contents: DataContent[]): Promise<Result<string[], Error>> {
  const names = contents.map(item => item.name)
  return success(names)
}

// ============================================
// Single composed pipeline that runs all tests
// ============================================

const runAllTests = composeAsync<string>(
  // Step 1: Validate the directory
  validateDataTextDirectory,
  
  // Step 2: Read the directory
  readDataTextDirectory,

  // Step 3: Get all item names
  getDirNames
)

// ============================================
// Run the composed pipeline
// ============================================
async function run() {
  const result = await runAllTests('./data-text')
  
  if (isSuccess(result)) {
    console.log(result.value)
  } else {
    console.log('Error:', result.error.message)
  }
}

run()