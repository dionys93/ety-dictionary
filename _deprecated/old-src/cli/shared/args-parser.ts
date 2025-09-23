// src/cli/shared/args-parser.ts
export interface BaseArgs {
  help: boolean
  verbose: boolean
  dryRun: boolean
}

export function parseBaseArgs(args: string[]): BaseArgs {
  return {
    help: args.includes('--help') || args.includes('-h'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    dryRun: args.includes('--dry-run') || args.includes('-d')
  }
}

export function findArgValue(args: string[], ...flags: string[]): string | undefined {
  for (const flag of flags) {
    const index = args.indexOf(flag)
    if (index !== -1 && index + 1 < args.length) {
      return args[index + 1]
    }
  }
  return undefined
}