// etymology-cli.ts
import { fold } from './src/core'
import { log, logError } from './src/utils'
import { ensurePathStructure } from './src/config'
import { Command } from './src/cli/types'
import { createProcessCommand } from './src/cli/commands/process'
import { createAnalyzeCommand } from './src/cli/commands/analyze'

// Create command registry
const commands: Record<string, Command> = {
  process: createProcessCommand(),
  analyze: createAnalyzeCommand()
}

/**
 * Print main help message showing all available commands
 */
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

/**
 * Main entry point for the CLI
 */
function main() {
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
  
  // Setup directory structure first
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