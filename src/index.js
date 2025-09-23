import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'

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

async function logDirectoryContents(directory) {
  const contents = await getDirectoryInfo(directory)
  console.log(contents.map(item => item.name))
}

// Main execution
const config = await getConfig()
logDirectoryContents(config.location).catch(console.error)
logDirectoryContents(`${config.location}/histories`).catch(console.error)