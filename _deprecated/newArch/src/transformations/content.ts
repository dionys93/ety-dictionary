import type { Result, DataContent, ValidatedFile, ValidatedDirectory } from '../types'
import { success } from '../core'
import { filterFiles, filterDirectories, filterByExtension } from '../utils'
import { pipeAsync } from '../core'
import { validateDataTextDirectory, readDataTextDirectory } from '../filesystem'

// IMPURE: Composed loader for the data-text directory
export const loadDataText = pipeAsync<string>(
  validateDataTextDirectory,
  readDataTextDirectory
)

// PURE: Extract file names from directory contents
export async function getFileNames(
  contents: DataContent[]
): Promise<Result<string[], Error>> {
  const files = filterFiles(contents)
  const names = files.map(f => f.name)
  return success(names)
}

// PURE: Extract subdirectory names
export async function getSubdirectoryNames(
  contents: DataContent[]
): Promise<Result<string[], Error>> {
  const dirs = filterDirectories(contents)
  const names = dirs.map(d => d.name)
  return success(names)
}

// PURE: Get text file information
export async function getTextFileInfo(
  contents: DataContent[]
): Promise<Result<ValidatedFile[], Error>> {
  const files = filterFiles(contents)
  const textFiles = filterByExtension(files, '.txt')
  return success(textFiles)
}

// PURE: Find a specific subdirectory
export async function findSubdirectory(
  name: string
): Promise<(contents: DataContent[]) => Promise<Result<ValidatedDirectory | null, Error>>> {
  return async function(contents: DataContent[]): Promise<Result<ValidatedDirectory | null, Error>> {
    const dirs = filterDirectories(contents)
    const targetDir = dirs.find(d => d.name === name)
    return success(targetDir || null)
  }
}

// PURE: Analyze text files
export const analyzeTextFiles = pipeAsync<DataContent[]>(
  async function(contents: DataContent[]): Promise<Result<{
    files: ValidatedFile[]
    totalSize: number
    count: number
    averageSize: number
  }, Error>> {
    const files = filterFiles(contents)
    const textFiles = filterByExtension(files, '.txt')
    const totalSize = textFiles.reduce((sum, f) => sum + f.stats.size, 0)
    
    return success({
      files: textFiles,
      totalSize,
      count: textFiles.length,
      averageSize: textFiles.length > 0 ? totalSize / textFiles.length : 0
    })
  }
)

// PURE: Get file statistics by extension
export async function getFileStatsByExtension(
  contents: DataContent[]
): Promise<Result<Map<string, { count: number; totalSize: number }>, Error>> {
  const files = filterFiles(contents)
  const stats = new Map<string, { count: number; totalSize: number }>()
  
  for (const file of files) {
    const ext = file.extension.toLowerCase()
    const current = stats.get(ext) || { count: 0, totalSize: 0 }
    stats.set(ext, {
      count: current.count + 1,
      totalSize: current.totalSize + file.stats.size
    })
  }
  
  return success(stats)
}