// src/cli/commands/create-histories.ts
// User-facing command that extracts POS-tagged stanzas from inglish to histories

import { Result, ok } from '../../core'
import { log } from '../../utils'
import { getHistoriesPaths, DEFAULT_PATHS } from '../../config'
import { Command } from '../types'
import { extractPosCore } from '../../transformers/extract-pos'

/**
 * Parse command line arguments for create-histories
 * Simplified since both input and output are fixed
 */
interface CreateHistoriesArgs {
  dryRun: boolean
  verbose: boolean
  dirs?: string[]
}

function parseCreateHistoriesArgs(args: string[]): CreateHistoriesArgs {
  const parsed: CreateHistoriesArgs = {
    dryRun: false,
    verbose: false
  }
  
  // Process options
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    switch (arg) {
      case '--dry-run':
      case '-d':
        parsed.dryRun = true
        break
        
      case '--verbose':
      case '-v':
        parsed.verbose = true
        break
        
      case '--dirs':
        if (i + 1 < args.length) {
          parsed.dirs = args[i + 1].split(',').map(d => d.trim())
        }
        break
    }
  }
  
  return parsed
}

/**
 * Create the create-histories command
 * Always processes from data-text/inglish to data-text/histories
 */
export function createHistoriesCommand(): Command {
  const historiesPaths = getHistoriesPaths()
  const sourceDir = DEFAULT_PATHS.languages.inglish
  const outputDir = historiesPaths.directory
  
  return {
    description: 'Create history files from Inglish POS-tagged stanzas',
    
    execute(args: string[]): Result<void> {
      const parsedArgs = parseCreateHistoriesArgs(args)
      
      log(`Creating histories from ${sourceDir} to ${outputDir}`)
      log(`Note: Only processing single-character directories (a-z, A-Z)`)
      
      // Use the core extraction functionality
      return extractPosCore({
        sourceDir,
        outputDir,
        dryRun: parsedArgs.dryRun,
        verbose: parsedArgs.verbose,
        dirs: parsedArgs.dirs
      })
    },
    
    printHelp() {
      log(`Usage: etymology create-histories [options]`)
      log(``)
      log(`Extract POS-tagged stanzas from Inglish etymology files to create`)
      log(`individual history files for each word+POS combination.`)
      log(``)
      log(`Fixed paths:`)
      log(`  Source: ${sourceDir}`)
      log(`  Output: ${outputDir}`)
      log(``)
      log(`Options:`)
      log(`  --dry-run, -d        Preview what would be extracted`)
      log(`  --verbose, -v        Show detailed processing information`)
      log(`  --dirs <a,b,c>      Only process specific directories`)
      log(``)
      log(`Examples:`)
      log(`  etymology create-histories              Process all directories`)
      log(`  etymology create-histories --dirs a,b   Only process a/ and b/`)
      log(`  etymology create-histories -d -v        Dry run with verbose output`)
      log(``)
      log(`Output format:`)
      log(`  Files are named: <word>_<pos>.txt`)
      log(`  Example: abandon_v.txt, butter_n.txt, quick_adj.txt`)
      log(``)
      log(`Note: The line containing the part-of-speech indicator is removed.`)
      log(`      If [ME]/[MI] and (pos) are on the same line, only (pos) is removed.`)
    }
  }
}