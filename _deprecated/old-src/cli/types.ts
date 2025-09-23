// src/cli/types.ts
import { Result } from '../core'

export interface Command {
  description: string
  execute: (args: string[]) => Result<void>
  printHelp: () => void
}

export interface ProcessArgs {
  language: string
  pipeline: string
  dryRun: boolean
  sample: number
  file: string
  preview: boolean
}

export interface AnalyzeArgs {
  language: string
  mode: 'pos' | 'roots' | 'both'
  verbose: boolean
}