// summarize.ts
import * as fs from 'fs';
import * as path from 'path';
import { posMap } from './src/config/pos-map'; // Import posMap for consistency

/**
 * Configuration options for the summary
 */
const config = {
  // Base directory containing the text files
  sourceDir: 'data-text/inglish',
  
  // Target directory for the summary output
  outputDir: 'analysis',
  
  // File name for the summary output
  outputFile: 'pos-summary.json',
  
  // Root words file 
  rootsFile: 'root-words.json',
  
  // Whether to log results to the console
  logToConsole: true,
  
  // Whether to log detailed information
  logVerbose: false,
  
  // Analysis mode (pos, roots, both)
  mode: 'both',
};

/**
 * Process command line arguments
 */
function processArguments() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--mode' || arg === '-m') {
      if (i + 1 < args.length) {
        const mode = args[i + 1];
        if (['pos', 'roots', 'both'].includes(mode)) {
          config.mode = mode;
          i++; // Skip the next argument
        } else {
          console.error(`Invalid mode: ${mode}. Using default: ${config.mode}`);
        }
      }
    } else if (arg === '--verbose' || arg === '-v') {
      config.logVerbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
}

/**
 * Print help information
 */
function printHelp() {
  console.log(`
Usage: tsx summarize.ts [options]

Options:
  --mode, -m <mode>     Analysis mode: pos, roots, or both (default: both)
  --verbose, -v         Show detailed logging
  --help, -h            Show this help message

Examples:
  tsx summarize.ts --mode pos
  tsx summarize.ts --mode roots
  tsx summarize.ts -m both
`);
}

/**
 * Reads all text files in a directory and its subdirectories
 */
function findTextFiles(dir: string): string[] {
  const results: string[] = [];
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      results.push(...findTextFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.txt')) {
      results.push(fullPath);
    }
  }
  
  return results;
}

/**
 * Simple function to extract part of speech tags from text
 */
function extractPosFromText(text: string): string[] {
  const posRegex = /\(([\w\s,]+)\)$/;
  const match = text.match(posRegex);
  
  if (!match) return [];
  
  // Split by comma for multiple parts of speech
  return match[1].split(',').map(p => p.trim());
}

/**
 * Extract the root word from a file
 * The root word is the first line of the file
 */
function extractRootWord(content: string): string | null {
  const lines = content.split('\n');
  
  // Find the first non-empty line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      // Extract the root word - text before the language tag if present
      const langMatch = trimmed.match(/^(.+?)\s*\[[\w]+\]/);
      if (langMatch) {
        return langMatch[1].trim();
      }
      return trimmed;
    }
  }
  
  return null;
}

/**
 * Extract the root language from a file
 * Looks for the first language tag in square brackets
 */
function extractRootLanguage(content: string): string | null {
  const lines = content.split('\n');
  
  // Find the first line with a language tag
  for (const line of lines) {
    const langMatch = line.match(/\[([\w]+)\]/);
    if (langMatch) {
      return langMatch[1];
    }
  }
  
  return null;
}

/**
 * Find all modern English words in a file
 */
function extractModernEnglishWords(content: string): string[] {
  const lines = content.split('\n');
  const meWords: string[] = [];
  
  // Find lines with [ME] tag
  for (const line of lines) {
    if (line.includes('[ME]')) {
      // Extract the word part (before the tag)
      const wordMatch = line.match(/^(.+?)\s*\[ME\]/);
      if (wordMatch) {
        meWords.push(wordMatch[1].trim());
      }
    }
  }
  
  return meWords;
}

/**
 * Analyze part of speech data
 */
async function analyzePosData(filePaths: string[]) {
  console.log("Analyzing part of speech data...");
  
  // Initialize counters
  const posCounts: Record<string, number> = {};
  const totalFiles = filePaths.length;
  const filesByPos: Record<string, string[]> = {};
  let totalPosEntries = 0;
  let entriesWithMultiplePos = 0;
  
  // Process each file
  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const fileName = path.basename(filePath);
      
      // Look for POS tags in any line
      let hasPosTag = false;
      const posTagsInFile = new Set<string>();
      
      // For each file, check all lines for part of speech tags
      for (const line of lines) {
        if (line.includes('(') && line.includes(')')) {
          const posTagsInLine = extractPosFromText(line);
          
          if (posTagsInLine.length > 0) {
            hasPosTag = true;
            
            // Add all POS tags found in this line
            for (const posTag of posTagsInLine) {
              posTagsInFile.add(posTag);
              
              // Initialize if this is a new POS tag
              if (!posCounts[posTag]) {
                posCounts[posTag] = 0;
                filesByPos[posTag] = [];
              }
              
              // Increment count and add file to the list
              posCounts[posTag]++;
              
              if (!filesByPos[posTag].includes(fileName)) {
                filesByPos[posTag].push(fileName);
              }
              
              // Log detailed POS info if verbose mode is enabled
              if (config.logVerbose) {
                console.log(`Found part of speech in ${fileName}: ${posTag} (${posMap[posTag] || posTag})`);
              }
            }
            
            // Check for multiple POS tags
            if (posTagsInLine.length > 1) {
              entriesWithMultiplePos++;
            }
          }
        }
      }
      
      // If this file had POS tags, increment the counter
      if (hasPosTag) {
        totalPosEntries++;
      }
      
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }
  
  // Track files with no POS tags
  const filesWithoutPos: string[] = [];
  
  for (const filePath of filePaths) {
    const fileName = path.basename(filePath);
    // Check if this file is in any POS category
    const hasPos = Object.values(filesByPos).some(files => 
      files.includes(fileName)
    );
    
    if (!hasPos) {
      filesWithoutPos.push(fileName);
    }
  }
  
  // Calculate percentages
  const posDistribution: Record<string, number> = {};
  for (const [pos, count] of Object.entries(posCounts)) {
    posDistribution[pos] = parseFloat(((count / totalPosEntries) * 100).toFixed(1));
  }
  
  // Add mappings from posMap
  const posFullNames: Record<string, string> = {};
  for (const [shortPos, fullName] of Object.entries(posMap)) {
    posFullNames[shortPos] = fullName;
  }
  
  // Prepare the summary
  const summary = {
    totalFiles,
    totalEntriesWithPos: totalPosEntries,
    entriesWithMultiplePos,
    uniquePartsOfSpeech: Object.keys(posCounts),
    posCounts,
    posDistribution,
    posFullNames,
    // Include up to 5 example files for each POS
    examples: Object.fromEntries(
      Object.entries(filesByPos).map(([pos, files]) => [
        pos, 
        files.slice(0, 5).map(f => f.replace('.txt', ''))
      ])
    ),
    // Files without any POS tags
    filesWithoutPos
  };
  
  // Save to file
  const outputPath = path.join(config.outputDir, config.outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`Part of speech summary saved to ${outputPath}`);
  
  // Log to console if requested
  if (config.logToConsole) {
    console.log("\n=== Parts of Speech Summary ===");
    console.log(`Total files analyzed: ${totalFiles}`);
    console.log(`Files with part of speech tags: ${totalPosEntries}`);
    console.log(`Files without part of speech tags: ${filesWithoutPos.length}`);
    console.log(`Entries with multiple parts of speech: ${entriesWithMultiplePos}`);
    
    console.log("\nDistribution:");
    // Sort by frequency
    const sortedPos = Object.keys(posCounts).sort((a, b) => posCounts[b] - posCounts[a]);
    for (const pos of sortedPos) {
      const count = posCounts[pos];
      const percentage = posDistribution[pos];
      const fullName = posMap[pos] || pos; // Use posMap for full name
      console.log(`- ${pos}: ${count} entries (${percentage}%) - ${fullName}`);
    }
    
    // Show detailed information if in verbose mode
    if (config.logVerbose) {
      console.log("\nFiles without POS tags:");
      // Print all files without POS tags
      filesWithoutPos.forEach(file => {
        console.log(`- ${file}`);
      });
    } else {
      // Just show a sample in regular mode
      console.log(`\nFiles without POS tags: ${filesWithoutPos.length}`);
      // Print up to 10 examples of files without POS tags
      if (filesWithoutPos.length > 0) {
        console.log("Examples:");
        filesWithoutPos.slice(0, 10).forEach(file => {
          console.log(`- ${file}`);
        });
        
        if (filesWithoutPos.length > 10) {
          console.log(`...and ${filesWithoutPos.length - 10} more`);
        }
      }
    }
  }
}

/**
 * Analyze root words
 */
async function analyzeRootWords(filePaths: string[]) {
  console.log("Analyzing root words...");
  
  // Initialize data structures
  const rootWords: Record<string, any> = {};
  const rootLangCount: Record<string, number> = {};
  const missingRoots: string[] = [];
  
  // Process each file
  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      
      // Extract root word and language
      const rootWord = extractRootWord(content);
      const rootLang = extractRootLanguage(content);
      const meWords = extractModernEnglishWords(content);
      
      if (rootWord && rootLang) {
        // Initialize language counter if needed
        if (!rootLangCount[rootLang]) {
          rootLangCount[rootLang] = 0;
        }
        rootLangCount[rootLang]++;
        
        // Store root word information
        if (!rootWords[rootWord]) {
          rootWords[rootWord] = {
            root: rootWord,
            language: rootLang,
            files: [],
            modernWords: []
          };
        }
        
        // Add file and ME words
        rootWords[rootWord].files.push(fileName);
        for (const meWord of meWords) {
          if (!rootWords[rootWord].modernWords.includes(meWord)) {
            rootWords[rootWord].modernWords.push(meWord);
          }
        }
      } else {
        missingRoots.push(fileName);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }
  
  // Prepare the summary
  const summary = {
    totalFiles: filePaths.length,
    uniqueRoots: Object.keys(rootWords).length,
    rootsByLanguage: rootLangCount,
    missingRoots: missingRoots.length,
    // Convert to array for easier sorting/filtering
    roots: Object.values(rootWords)
  };
  
  // Save to file
  const outputPath = path.join(config.outputDir, config.rootsFile);
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
  console.log(`Root words summary saved to ${outputPath}`);
  
  // Log to console if requested
  if (config.logToConsole) {
    console.log("\n=== Root Words Summary ===");
    console.log(`Total files analyzed: ${filePaths.length}`);
    console.log(`Unique root words: ${Object.keys(rootWords).length}`);
    console.log(`Files missing root words: ${missingRoots.length}`);
    
    console.log("\nDistribution by language:");
    // Sort by frequency
    const sortedLangs = Object.keys(rootLangCount).sort(
      (a, b) => rootLangCount[b] - rootLangCount[a]
    );
    for (const lang of sortedLangs) {
      const count = rootLangCount[lang];
      const percentage = ((count / filePaths.length) * 100).toFixed(1);
      console.log(`- ${lang}: ${count} roots (${percentage}%)`);
    }
    
    // Show more examples in verbose mode
    if (config.logVerbose) {
      console.log("\nAll root words by language:");
      for (const lang of sortedLangs) {
        console.log(`\n[${lang}]:`);
        // Get all roots for this language and sort alphabetically
        const langRoots = Object.values(rootWords)
          .filter((root: any) => root.language === lang)
          .map((root: any) => root.root)
          .sort();
        
        // Print in a nice format with 5 roots per line
        for (let i = 0; i < langRoots.length; i += 5) {
          const chunk = langRoots.slice(i, i + 5);
          console.log(`  ${chunk.join(', ')}`);
        }
      }
    } else {
      // Show some example roots with their modern words
      console.log("\nSample root words:");
      const sampleRoots = Object.values(rootWords).slice(0, 5);
      for (const root of sampleRoots) {
        console.log(`- ${root.root} [${root.language}] → ${root.modernWords.join(', ')}`);
      }
    }
  }
}

/**
 * Main function to run the analysis
 */
async function main() {
  try {
    // Process command line arguments
    processArguments();
    
    console.log(`Starting analysis for ${config.sourceDir} in ${config.mode} mode...`);
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }
    
    // Find all text files
    const filePaths = findTextFiles(config.sourceDir);
    console.log(`Found ${filePaths.length} text files to analyze.`);
    
    // Run the appropriate analysis based on mode
    if (config.mode === 'pos' || config.mode === 'both') {
      await analyzePosData(filePaths);
    }
    
    if (config.mode === 'roots' || config.mode === 'both') {
      await analyzeRootWords(filePaths);
    }
    
  } catch (error) {
    console.error("An error occurred during analysis:", error);
  }
}

// Run the main function
main().catch(console.error);