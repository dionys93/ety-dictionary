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
  console.log(`Loaded ${contents.length} items from data-text\n`)
  
  // Apply transformations to the loaded content
  
  const fileNamesResult = await getFileNames(contents)
  if (isSuccess(fileNamesResult)) {
    console.log('Files:', fileNamesResult.value)
  }
  
  const subdirsResult = await getSubdirectoryNames(contents)
  if (isSuccess(subdirsResult)) {
    console.log('Subdirectories:', subdirsResult.value)
  }
  
  const textAnalysis = await analyzeTextFiles(contents)
  if (isSuccess(textAnalysis)) {
    const { count, totalSize, averageSize } = textAnalysis.value
    console.log(`\nText files: ${count} files`)
    console.log(`Total size: ${(totalSize / 1024).toFixed(2)} KB`)
    console.log(`Average size: ${(averageSize / 1024).toFixed(2)} KB`)
  }
  
  const statsResult = await getFileStatsByExtension(contents)
  if (isSuccess(statsResult)) {
    console.log('\nFile statistics by extension:')
    statsResult.value.forEach((stats, ext) => {
      console.log(`  ${ext}: ${stats.count} files, ${(stats.totalSize / 1024).toFixed(2)} KB`)
    })
  }
}

if (require.main === module) {
  runPipeline().catch(console.error)
}

export { runPipeline }