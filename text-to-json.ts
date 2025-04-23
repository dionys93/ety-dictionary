// text-to-json.ts
import * as fs from 'fs';
import * as path from 'path';

// Base directories
const SOURCE_BASE = 'data-text';
const TARGET_BASE = 'data-json';

// Get language directory from command line arguments, or use all if not specified
const langDir = process.argv[2];
const SOURCE_DIR = langDir ? path.join(SOURCE_BASE, langDir) : SOURCE_BASE;
const TARGET_DIR = langDir ? path.join(TARGET_BASE, langDir) : TARGET_BASE;

// Language map for translating language codes to full names
const languageMap: Record<string, { name: string }> = {
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

interface EtymologyEntry {
  name: string;
  origin: string;
  "part-of-speech"?: string[];
}

interface WordEntry {
  name: string;
  etymology: EtymologyEntry[];
  sources: string[];
}

/**
 * Replaces all instances of the special character ꬻ with "ng"
 * @param text - The text to process
 * @returns Text with replacements made
 */
function replaceSpecialCharacter(text: string): string {
  return text.replace(/ꬻ/g, "ng");
}

/**
 * Extracts parts of speech from a line of text
 * @param line - Line containing potential part of speech info
 * @returns Array of part of speech strings or undefined
 */
function extractPartOfSpeech(line: string): string[] | undefined {
  // Match pattern like "(v)" or "(f n)" or "(adv, adj)" at the end of the line
  const match = line.match(/\(([\w\s,]+)\)$/);

  if (!match) return undefined;

  // Get the part of speech text and split by comma
  const posText = match[1];
  const posParts = posText.split(',').map(part => part.trim());

  // Map abbreviations to full forms
  const posMap: Record<string, string> = {
    "m n": "masculine noun",
    "f n": "feminine noun",
    "v": "verb",
    "intr v": "intransitive verb",
    "conj": "conjunction",
    "adj": "adjective",
    "prep": "preposition",
    "pron": "pronoun",
    "adv": "adverb"
  };

  // Convert each part to its full form if available
  return posParts.map(part => posMap[part] || part);
}

/**
 * Parses text content into JSON format according to the specified structure
 * @param textContent - The content of the text file
 * @param fileName - The name of the file (used for word identification)
 * @returns Array of parsed word objects
 */
function parseTextToJson(textContent: string, fileName: string): WordEntry[] {
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
    const etymologyLines: string[] = [];
    const sourceUrls: string[] = [];

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
    const etymology: EtymologyEntry[] = etymologyLines.map(line => {
      const brackets = line.match(/\[(.*?)\]/);
      const origin = (brackets && brackets[1] && languageMap[brackets[1]])
        ? languageMap[brackets[1]].name
        : 'Inglish';

      // Remove the origin part from the name
      const nameWithoutOrigin = line.replace(/\[.*?\]/, '').trim();

      // Create the base etymology entry
      const etymologyEntry: EtymologyEntry = {
        name: nameWithoutOrigin,
        origin: origin
      };

      // If this is an Inglish origin, check for part of speech
      if (origin === 'Inglish') {
        const partOfSpeech = extractPartOfSpeech(nameWithoutOrigin);
        if (partOfSpeech) {
          // Remove the part of speech from the name - this will work for all formats
          etymologyEntry.name = nameWithoutOrigin.replace(/\s*\([\w\s,]+\)$/, '').trim();
          etymologyEntry["part-of-speech"] = partOfSpeech;
        }
      }

      return etymologyEntry;
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
 * @param firstLine - First line of an entry
 * @returns Extracted word
 */
function extractNameFromFirstLine(firstLine: string): string {
  const wordMatch = firstLine.match(/^([a-zA-Z]+)/);
  return wordMatch ? wordMatch[1] : "";
}

/**
 * Creates directory recursively if it doesn't exist
 * @param dirPath - Path to create
 */
function ensureDirExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Processes a single text file and converts it to JSON
 * @param filePath - Path to the text file
 * @param relPath - Relative path from source directory
 */
function processFile(filePath: string, relPath: string): void {
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
 * @param dirPath - Current directory path
 * @param relPath - Relative path from source directory
 */
function processDirectory(dirPath: string, relPath = ''): void {
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
function main(): void {
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