import { isSuccess } from './core'
import {
  loadDataText,
  getFileNames,
  getSubdirectoryNames,
  analyzeTextFiles,
  getFileStatsByExtension
} from './transformations'

async function runPipeline() {
  // Load data-text once - single source of truth
  const result = await loadDataText('../../data-text')
  
  if (!isSuccess(result)) {
    console.error('Failed to load data-text:', result.error.message)
    return
  }
  
  const contents = result.value
  
  // Apply transformations to the loaded content
  
  const subdirsResult = await getSubdirectoryNames(contents)
  if (isSuccess(subdirsResult)) {
    console.log('Subdirectories:', subdirsResult.value)
  }
}

if (require.main === module) {
  runPipeline().catch(console.error)
}

export { runPipeline }