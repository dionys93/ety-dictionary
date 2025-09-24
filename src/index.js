import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'

const command = process.argv[2]
const args = process.argv.slice(3)

async function getConfig() {
  const content = await readFile('./config.json', 'utf-8')
  return JSON.parse(content)
}

async function getDirectoryInfo(location) {
  const entries = await readdir(location)
  
  const details = await Promise.all(
    entries.map(async (name) => {
      const path = join(location, name)
      const stats = await stat(path)
      return {
        name,
        isDirectory: stats.isDirectory(),
        size: stats.size
      }
    })
  )
  
  return details.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
}

async function parseStanzasAsLines(filepath) {
  const content = await readFile(filepath, 'utf-8')
  
  return content
    .split(/\n\s*\n/)
    .map(stanza => stanza.trim())
    .filter(stanza => stanza.length > 0)
    .map(stanza => stanza.split('\n'))
}

// Main execution
const config = await getConfig()

const commands = {
  list: async (...pathParts) => {
    const location = pathParts.length > 0
      ? join(config.location, ...pathParts)
      : config.location
    
    const info = await getDirectoryInfo(location)
    return info.map(item => item.name)
  },
  
  concat: async (dirPath, fileName) => {
    const firstLetter = fileName[0].toLowerCase()
    const filePath = join(config.location, dirPath, firstLetter, `${fileName}.txt`)
    const stanzas = await parseStanzasAsLines(filePath)
    return stanzas
  }
}

if (commands[command]) {
  const result = await commands[command](...args)
  console.log(result)
} else {
  console.log(`Unknown command: ${command}`)
  console.log(`Available commands: ${Object.keys(commands).join(', ')}`)
}