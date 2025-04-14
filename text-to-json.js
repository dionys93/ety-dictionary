// text-to-json.js
const fs = require('fs');
const path = require('path');

// Base directories
const SOURCE_BASE = 'data-text';
const TARGET_BASE = 'data-json';

// Get language directory from command line arguments, or use all if not specified
const langDir = process.argv[2];
const SOURCE_DIR = langDir ? path.join(SOURCE_BASE, langDir) : SOURCE_BASE;
const TARGET_DIR = langDir ? path.join(TARGET_BASE, langDir) : TARGET_BASE;

// Language map for translating language codes to full names
const languageMap = {
  'OE': { name: 'Old English' },
  'ME': { name: 'Modern English' },
  'MI': { name: 'Middle English' },
  'L': { name: 'Latin' },
  'OF': { name: 'Old French' },
  'FR': { name: 'French' },
  'SK': { name: 'Sanskrit' },
  'AR': { name: 'Arabic' },
  'ML': { name: 'Medieval Latin' },
  'IT': { name: 'Italian' },
  'ON': { name: 'Old Norse' },
  'PG': { name: 'Proto-Germanic' },
  'PIE': { name: 'Proto-Indo-European' },
  'VL': { name: 'Vulgar Latin' }
};

/**
 * Replaces all instances of the special character ꬻ with "ng"
 * @param {string} text - The text to process
 * @returns {string} - Text with replacements made
 */
function replaceSpecialCharacter(text) {
  return text.replace(/ꬻ/g, "ng");
}

/**
 * Parses text content into JSON format according to the specified structure
 * @param {string} textContent - The content of the text file
 * @param {string} fileName - The name of the file (used for word identification)
 * @returns {Array} - Array of parsed word objects
 */
function parseTextToJson(textContent, fileName) {
  // Replace special character ꬻ with "ng" throughout
  textContent = replaceSpecialCharacter(textContent);
  
  // Strip file extension to get the base name - this will be the fallback name
  const fallbackName = fileName.replace('.txt', '');
  
  // Split the content by double newline to separate word entries
  const entries = textContent.split('\n\n').filter(entry => entry.trim());
  
  // Process each entry
  return entries.map((entry, index) => {
    // Split entry into lines
    const lines = entry.split('\n').filter(line => line.trim());
    
    // Separate etymology lines from source URLs
    const etymologyLines = [];
    const sourceUrls = [];
    
    for (const line of lines) {
      if (line.startsWith('http')) {
        sourceUrls.push(line);
      } else {
        etymologyLines.push(line);
      }
    }
    
    // Find the Modern English entry if it exists
    const meLineIndex = etymologyLines.findIndex(line => {
      const brackets = line.match(/\[(.*?)\]/);
      return brackets && brackets[1] === 'ME';
    });
    
    // Determine the name based on whether we found an ME entry
    const name = (meLineIndex !== -1) 
      ? etymologyLines[meLineIndex].replace(/\[ME\]/, '').trim()
      : (index > 0 && lines.length > 0)
        ? extractNameFromFirstLine(lines[0])
        : fallbackName;
    
    // Process etymology lines
    const etymology = etymologyLines.map(line => {
      const brackets = line.match(/\[(.*?)\]/);
      const origin = (brackets && brackets[1] && languageMap[brackets[1]])
        ? languageMap[brackets[1]].name
        : 'Inglish';
      
      // Remove the origin part from the name
      const nameWithoutOrigin = line.replace(/\[.*?\]/, '').trim();
      
      return {
        name: nameWithoutOrigin,
        origin: origin
      };
    });
    
    return {
      name,
      etymology,
      sources: sourceUrls
    };
  });
}

/**
 * Extracts a word name from the first line of text 
 * @param {string} firstLine - First line of an entry
 * @returns {string} - Extracted word
 */
function extractNameFromFirstLine(firstLine) {
  const wordMatch = firstLine.match(/^([a-zA-Z]+)/);
  return wordMatch ? wordMatch[1] : "";
}

/**
 * Creates directory recursively if it doesn't exist
 * @param {string} dirPath - Path to create
 */
function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Processes a single text file and converts it to JSON
 * @param {string} filePath - Path to the text file
 * @param {string} relPath - Relative path from source directory
 */
function processFile(filePath, relPath) {
  const fileName = path.basename(filePath);
  
  // Skip non-text files
  if (!fileName.endsWith('.txt')) {
    return;
  }
  
  // Read file content
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Parse text to JSON
    const jsonData = parseTextToJson(content, fileName);
    
    // Determine relative path from SOURCE_BASE if a language dir was specified
    let targetRelPath = relPath;
    if (langDir) {
      // If processing a specific language dir, ensure we maintain the proper structure
      const langDirPos = filePath.indexOf(langDir);
      if (langDirPos !== -1) {
        // Extract the part after the language directory
        targetRelPath = filePath.substring(langDirPos);
      }
    }
    
    // Create target directory if doesn't exist
    const targetFilePath = path.join(
      TARGET_BASE, 
      targetRelPath.replace('.txt', '.json')
    );
    const targetDir = path.dirname(targetFilePath);
    ensureDirExists(targetDir);
    
    // Write JSON file
    fs.writeFileSync(
      targetFilePath, 
      JSON.stringify(jsonData, null, 2), 
      'utf8'
    );
    
    console.log(`Converted: ${filePath} -> ${targetFilePath}`);
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

/**
 * Recursively processes directories
 * @param {string} dirPath - Current directory path
 * @param {string} relPath - Relative path from source directory
 */
function processDirectory(dirPath, relPath = '') {
  // Read directory contents
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  // Process each entry
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const entryRelPath = path.join(relPath, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively process subdirectory
      processDirectory(fullPath, entryRelPath);
    } else {
      // Process file
      processFile(fullPath, entryRelPath);
    }
  }
}

/**
 * Main function to start processing
 */
function main() {
  // Validate source directory exists
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Error: Source directory '${SOURCE_DIR}' does not exist.`);
    console.log(`Usage: node script.js [language-directory]`);
    console.log(`Example: node script.js english`);
    process.exit(1);
  }
  
  console.log(`Starting conversion from ${SOURCE_DIR} to ${TARGET_DIR}...`);
  
  // Create target directory if it doesn't exist
  ensureDirExists(TARGET_DIR);
  
  // Start processing from the source directory
  processDirectory(SOURCE_DIR);
  
  console.log('Conversion completed!');
}

// Execute main function
main();