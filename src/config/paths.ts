// src/config/paths.ts

import * as path from 'path'
import { Result, ok, err, flatMap } from '../monads'

/**
 * Central configuration for all file paths used throughout the application
 * This ensures consistency and makes path management easier
 */
export interface PathConfig {
  readonly base: {
    readonly dataText: string
    readonly dataJson: string
    readonly analysis: string
  }
  readonly languages: {
    readonly inglish: string
    readonly [key: string]: string // Allow dynamic language paths
  }
  readonly analysis: {
    readonly posSummary: string
    readonly rootWords: string
  }
  readonly test: {
    readonly output: string
    readonly sampleFiles: string
  }
}

/**
 * Default path configuration
 * All paths are relative to the project root
 */
export const DEFAULT_PATHS: PathConfig = {
  base: {
    dataText: 'data-text',
    dataJson: 'data-json', 
    analysis: 'analysis'
  },
  languages: {
    inglish: 'data-text/inglish'
  },
  analysis: {
    posSummary: 'analysis/pos-summary.json',
    rootWords: 'analysis/root-words.json'
  },
  test: {
    output: 'test-output',
    sampleFiles: 'data-text/inglish/e'
  }
}

/**
 * Path builder functions for constructing commonly used paths
 */
export const buildLanguagePath = (language: string): string =>
  path.join(DEFAULT_PATHS.base.dataText, language)

export const buildLanguageOutputPath = (language: string): string =>
  path.join(DEFAULT_PATHS.base.dataJson, language)

export const buildAnalysisPath = (filename: string): string =>
  path.join(DEFAULT_PATHS.base.analysis, filename)

export const buildTestPath = (filename: string): string =>
  path.join(DEFAULT_PATHS.test.output, filename)

/**
 * Safe path resolution that validates paths exist or can be created
 */
export const safeResolvePath = (relativePath: string): Result<string> => {
  try {
    const resolved = path.resolve(relativePath)
    return ok(resolved)
  } catch (error) {
    return err(new Error(`Failed to resolve path "${relativePath}": ${error}`))
  }
}

/**
 * Check if a path exists and is accessible
 */
export const pathExists = (targetPath: string): Result<boolean> => {
  try {
    const fs = require('fs')
    return ok(fs.existsSync(targetPath))
  } catch (error) {
    return err(new Error(`Failed to check path "${targetPath}": ${error}`))
  }
}

/**
 * Get language-specific paths for processing
 */
export const getLanguagePaths = (language: string) => ({
  source: buildLanguagePath(language),
  target: buildLanguageOutputPath(language),
  exists: () => pathExists(buildLanguagePath(language))
})

/**
 * Get analysis-related paths
 */
export const getAnalysisPaths = () => ({
  directory: DEFAULT_PATHS.base.analysis,
  posSummary: DEFAULT_PATHS.analysis.posSummary,
  rootWords: DEFAULT_PATHS.analysis.rootWords,
  buildCustom: (filename: string) => buildAnalysisPath(filename)
})

/**
 * Get test-related paths
 */
export const getTestPaths = () => ({
  output: DEFAULT_PATHS.test.output,
  sampleFiles: DEFAULT_PATHS.test.sampleFiles,
  buildTestFile: (filename: string) => buildTestPath(filename)
})

/**
 * Commonly used file patterns and extensions
 */
export const FILE_PATTERNS = {
  text: '**/*.txt',
  json: '**/*.json',
  typescript: '**/*.ts'
} as const

export const FILE_EXTENSIONS = {
  text: '.txt',
  json: '.json',
  typescript: '.ts'
} as const

/**
 * Command-line argument mappings to paths
 * Useful for main.ts argument processing
 */
export const mapLanguageToPath = (language: string): Result<{ source: string, target: string }> => {
  const languagePaths = getLanguagePaths(language)
  
  // Use functional flatMap instead of method chaining
  return flatMap((exists: boolean) => {
    if (!exists) {
      return err(new Error(`Language directory not found: ${languagePaths.source}`))
    }
    
    return ok({
      source: languagePaths.source,
      target: languagePaths.target
    })
  })(languagePaths.exists())
}

/**
 * Environment-specific path overrides
 * Useful for testing or different deployment environments
 */
export const createPathConfigForEnvironment = (env: 'development' | 'test' | 'production'): PathConfig => {
  const basePaths = { ...DEFAULT_PATHS }
  
  switch (env) {
    case 'test':
      return {
        ...basePaths,
        base: {
          ...basePaths.base,
          dataText: 'test-data/text',
          dataJson: 'test-data/json',
          analysis: 'test-data/analysis'
        }
      }
    case 'production':
      return {
        ...basePaths,
        base: {
          ...basePaths.base,
          analysis: 'dist/analysis'
        }
      }
    default:
      return basePaths
  }
}

/**
 * Utility function to get all configured language paths
 */
export const getAllLanguagePaths = (): string[] => 
  Object.values(DEFAULT_PATHS.languages)

/**
 * Create directory structure based on path config
 */
export const ensurePathStructure = (): Result<string[]> => {
  const { ensureDirExists } = require('../utils/file-utils')
  const createdPaths: string[] = []
  
  try {
    // Ensure base directories exist
    Object.values(DEFAULT_PATHS.base).forEach(dir => {
      ensureDirExists(dir)
      createdPaths.push(dir)
    })
    
    // Ensure test directory exists
    ensureDirExists(DEFAULT_PATHS.test.output)
    createdPaths.push(DEFAULT_PATHS.test.output)
    
    return ok(createdPaths)
  } catch (error) {
    return err(new Error(`Failed to create directory structure: ${error}`))
  }
}