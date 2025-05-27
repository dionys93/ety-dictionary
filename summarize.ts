// summarize.ts
import * as fs from 'fs';
import * as path from 'path';
import { posMap, ok, err, map, flatMap, fold, safe, Result, filterSuccesses } from './src';

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
  mode: 'both' as 'pos' | 'roots' | 'both',
};

/**
 * Safe file operations using Result monad
 */
const safeReadFile = (filePath: string): Result<string> => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return ok(content);
  } catch (error) {
    return err(new Error(`Failed to read ${filePath}: ${error}`));
  }
};

const safeWriteFile = (filePath: string, content: string): Result<string> => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return ok(`Successfully wrote ${filePath}`);
  } catch (error) {
    return err(new Error(`Failed to write ${filePath}: ${error}`));
  }
};

const safeReadDir = (dirPath: string): Result<fs.Dirent[]> => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return ok(entries);
  } catch (error) {
    return err(new Error(`Failed to read directory ${dirPath}: ${error}`));
  }
};

const safeEnsureDir = (dirPath: string): Result<string> => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return ok(`Directory ${dirPath} ready`);
  } catch (error) {
    return err(new Error(`Failed to create directory ${dirPath}: ${error}`));
  }
};

/**
 * Process command line arguments
 */
function processArguments(): void {
  const args = process.argv.slice(2);
  for (const i of Array(args.length).keys()) {
    const arg = args[i];
    
    if (arg === '--mode' || arg === '-m') {
      if (i + 1 < args.length) {
        const mode = args[i + 1];
        if (['pos', 'roots', 'both'].includes(mode)) {
          config.mode = mode as 'pos' | 'roots' | 'both';
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
function printHelp(): void {
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
 * Safely find all text files in a directory recursively
 */
function findTextFiles(dir: string): Result<string[]> {
  const results: string[] = [];
  
  const searchRecursive = (currentDir: string): Result<void> => {
    return flatMap((entries: fs.Dirent[]) => {
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          const subResult = searchRecursive(fullPath);
          if (!subResult.isSuccess) {
            return err(subResult.error!);
          }
        } else if (entry.isFile() && entry.name.endsWith('.txt')) {
          results.push(fullPath);
        }
      }
      return ok(undefined);
    })(safeReadDir(currentDir));
  };
  
  return map(() => results)(searchRecursive(dir));
}

/**
 * Safe text extraction functions using Result monad
 */
const safeExtractPosFromText = safe((text: string): string[] => {
  // Trim whitespace to handle trailing spaces
  const trimmedText = text.trim();
  const posRegex = /\(([\w\s,]+)\)$/;
  const match = trimmedText.match(posRegex);
  
  if (!match) return [];
  
  // Split by comma for multiple parts of speech
  return match[1].split(',').map(p => p.trim());
});

const safeExtractRootWord = safe((content: string): string | null => {
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
});

const safeExtractRootLanguage = safe((content: string): string | null => {
  const lines = content.split('\n');
  
  // Find the first line with a language tag
  for (const line of lines) {
    const langMatch = line.match(/\[([\w]+)\]/);
    if (langMatch) {
      return langMatch[1];
    }
  }
  
  return null;
});

const safeExtractModernEnglishWords = safe((content: string): string[] => {
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
});

/**
 * Process a single file for POS analysis
 */
function processFileForPos(filePath: string): Result<{
  fileName: string;
  hasPosTag: boolean;
  posTagsInFile: Set<string>;
  entriesWithMultiplePos: number;
}> {
  return flatMap((content: string) => {
    const lines = content.split('\n');
    const fileName = path.basename(filePath);
    
    const posTagsInFile = new Set<string>();
    let hasPosTag = false;
    let entriesWithMultiplePos = 0;
    
    // Process each line safely
    for (const line of lines) {
      if (line.includes('(') && line.includes(')')) {
        const posResult = safeExtractPosFromText(line);
        
        fold(
          (error: Error) => {
            if (config.logVerbose) {
              console.error(`Error extracting POS from line in ${fileName}: ${error.message}`);
            }
          },
          (posTagsInLine: string[]) => {
            if (posTagsInLine.length > 0) {
              hasPosTag = true;
              
              for (const posTag of posTagsInLine) {
                posTagsInFile.add(posTag);
                
                if (config.logVerbose) {
                  console.log(`Found part of speech in ${fileName}: ${posTag} (${posMap[posTag] || posTag})`);
                }
              }
              
              if (posTagsInLine.length > 1) {
                entriesWithMultiplePos++;
              }
            }
          }
        )(posResult);
      }
    }
    
    return ok({
      fileName,
      hasPosTag,
      posTagsInFile,
      entriesWithMultiplePos
    });
  })(safeReadFile(filePath));
}

/**
 * Process a single file for root word analysis
 */
function processFileForRoots(filePath: string): Result<{
  fileName: string;
  rootWord: string | null;
  rootLang: string | null;
  meWords: string[];
}> {
  return flatMap((content: string) => {
    const fileName = path.basename(filePath);
    
    // Extract data safely using composed operations
    const rootWordResult = safeExtractRootWord(content);
    const rootLangResult = safeExtractRootLanguage(content);
    const meWordsResult = safeExtractModernEnglishWords(content);
    
    // Combine results - if any fail, we still want partial data
    const rootWord = fold(() => null, (word: string | null) => word)(rootWordResult);
    const rootLang = fold(() => null, (lang: string | null) => lang)(rootLangResult);
    const meWords = fold(() => [] as string[], (words: string[]) => words)(meWordsResult);
    
    return ok({
      fileName,
      rootWord,
      rootLang,
      meWords
    });
  })(safeReadFile(filePath));
}

/**
 * Analyze part of speech data using Result monad
 */
async function analyzePosData(filePaths: string[]): Promise<Result<string>> {
  console.log("Analyzing part of speech data...");
  
  // Process all files and collect results
  const fileResults = filePaths.map(processFileForPos);
  const { successes, errors } = filterSuccesses(fileResults);
  
  // Log errors if any
  if (errors.length > 0) {
    console.error(`Failed to process ${errors.length} files:`);
    errors.forEach(error => console.error(`- ${error.message}`));
  }
  
  // Initialize counters
  const posCounts: Record<string, number> = {};
  const filesByPos: Record<string, string[]> = {};
  const filesWithoutPos: string[] = [];
  let totalPosEntries = 0;
  let totalEntriesWithMultiplePos = 0;
  
  // Aggregate results
  for (const result of successes) {
    if (result.hasPosTag) {
      totalPosEntries++;
      totalEntriesWithMultiplePos += result.entriesWithMultiplePos;
      
      for (const posTag of result.posTagsInFile) {
        if (!posCounts[posTag]) {
          posCounts[posTag] = 0;
          filesByPos[posTag] = [];
        }
        
        posCounts[posTag]++;
        
        if (!filesByPos[posTag].includes(result.fileName)) {
          filesByPos[posTag].push(result.fileName);
        }
      }
    } else {
      filesWithoutPos.push(result.fileName);
    }
  }
  
  // Calculate percentages
  const posDistribution: Record<string, number> = {};
  for (const [pos, count] of Object.entries(posCounts)) {
    posDistribution[pos] = parseFloat(((count / Math.max(totalPosEntries, 1)) * 100).toFixed(1));
  }
  
  // Add mappings from posMap
  const posFullNames: Record<string, string> = {};
  for (const [shortPos, fullName] of Object.entries(posMap)) {
    posFullNames[shortPos] = fullName;
  }
  
  // Prepare the summary
  const summary = {
    totalFiles: filePaths.length,
    processedFiles: successes.length,
    failedFiles: errors.length,
    totalEntriesWithPos: totalPosEntries,
    entriesWithMultiplePos: totalEntriesWithMultiplePos,
    uniquePartsOfSpeech: Object.keys(posCounts),
    posCounts,
    posDistribution,
    posFullNames,
    examples: Object.fromEntries(
      Object.entries(filesByPos).map(([pos, files]) => [
        pos, 
        files.slice(0, 5).map(f => f.replace('.txt', ''))
      ])
    ),
    filesWithoutPos
  };
  
  // Save to file safely
  const outputPath = path.join(config.outputDir, config.outputFile);
  const saveResult = safeWriteFile(outputPath, JSON.stringify(summary, null, 2));
  
  return fold(
    (error: Error) => err(error),
    () => {
      console.log(`Part of speech summary saved to ${outputPath}`);
      
      // Log to console if requested
      if (config.logToConsole) {
        logPosResults(summary);
      }
      
      return ok(`POS analysis completed successfully`);
    }
  )(saveResult);
}

/**
 * Analyze root words using Result monad
 */
async function analyzeRootWords(filePaths: string[]): Promise<Result<string>> {
  console.log("Analyzing root words...");
  
  // Process all files and collect results
  const fileResults = filePaths.map(processFileForRoots);
  const { successes, errors } = filterSuccesses(fileResults);
  
  // Log errors if any
  if (errors.length > 0) {
    console.error(`Failed to process ${errors.length} files:`);
    errors.forEach(error => console.error(`- ${error.message}`));
  }
  
  // Initialize data structures
  const rootWords: Record<string, any> = {};
  const rootLangCount: Record<string, number> = {};
  const missingRoots: string[] = [];
  
  // Process results
  for (const result of successes) {
    if (result.rootWord && result.rootLang) {
      // Initialize language counter if needed
      if (!rootLangCount[result.rootLang]) {
        rootLangCount[result.rootLang] = 0;
      }
      rootLangCount[result.rootLang]++;
      
      // Store root word information
      if (!rootWords[result.rootWord]) {
        rootWords[result.rootWord] = {
          root: result.rootWord,
          language: result.rootLang,
          files: [],
          modernWords: []
        };
      }
      
      // Add file and ME words
      rootWords[result.rootWord].files.push(result.fileName);
      for (const meWord of result.meWords) {
        if (!rootWords[result.rootWord].modernWords.includes(meWord)) {
          rootWords[result.rootWord].modernWords.push(meWord);
        }
      }
    } else {
      missingRoots.push(result.fileName);
    }
  }
  
  // Prepare the summary
  const summary = {
    totalFiles: filePaths.length,
    processedFiles: successes.length,
    failedFiles: errors.length,
    uniqueRoots: Object.keys(rootWords).length,
    rootsByLanguage: rootLangCount,
    missingRoots: missingRoots.length,
    roots: Object.values(rootWords)
  };
  
  // Save to file safely
  const outputPath = path.join(config.outputDir, config.rootsFile);
  const saveResult = safeWriteFile(outputPath, JSON.stringify(summary, null, 2));
  
  return fold(
    (error: Error) => err(error),
    () => {
      console.log(`Root words summary saved to ${outputPath}`);
      
      // Log to console if requested
      if (config.logToConsole) {
        logRootResults(summary, rootWords, rootLangCount);
      }
      
      return ok(`Root analysis completed successfully`);
    }
  )(saveResult);
}

/**
 * Log POS analysis results to console
 */
function logPosResults(summary: any): void {
  console.log("\n=== Parts of Speech Summary ===");
  console.log(`Total files analyzed: ${summary.totalFiles}`);
  console.log(`Successfully processed: ${summary.processedFiles}`);
  if (summary.failedFiles > 0) {
    console.log(`Failed to process: ${summary.failedFiles}`);
  }
  console.log(`Files with part of speech tags: ${summary.totalEntriesWithPos}`);
  console.log(`Files without part of speech tags: ${summary.filesWithoutPos.length}`);
  console.log(`Entries with multiple parts of speech: ${summary.entriesWithMultiplePos}`);
  
  console.log("\nDistribution:");
  // Sort by frequency
  const sortedPos = Object.keys(summary.posCounts).sort((a, b) => summary.posCounts[b] - summary.posCounts[a]);
  for (const pos of sortedPos) {
    const count = summary.posCounts[pos];
    const percentage = summary.posDistribution[pos];
    const fullName = posMap[pos] || pos;
    console.log(`- ${pos}: ${count} entries (${percentage}%) - ${fullName}`);
  }
  
  // Show files without POS tags
  if (config.logVerbose) {
    console.log("\nFiles without POS tags:");
    summary.filesWithoutPos.forEach((file: string) => {
      console.log(`- ${file}`);
    });
  } else {
    console.log(`\nFiles without POS tags: ${summary.filesWithoutPos.length}`);
    if (summary.filesWithoutPos.length > 0) {
      console.log("Examples:");
      summary.filesWithoutPos.slice(0, 10).forEach((file: string) => {
        console.log(`- ${file}`);
      });
      
      if (summary.filesWithoutPos.length > 10) {
        console.log(`...and ${summary.filesWithoutPos.length - 10} more`);
      }
    }
  }
}

/**
 * Log root analysis results to console
 */
function logRootResults(summary: any, rootWords: Record<string, any>, rootLangCount: Record<string, number>): void {
  console.log("\n=== Root Words Summary ===");
  console.log(`Total files analyzed: ${summary.totalFiles}`);
  console.log(`Successfully processed: ${summary.processedFiles}`);
  if (summary.failedFiles > 0) {
    console.log(`Failed to process: ${summary.failedFiles}`);
  }
  console.log(`Unique root words: ${Object.keys(rootWords).length}`);
  console.log(`Files missing root words: ${summary.missingRoots}`);
  
  console.log("\nDistribution by language:");
  const sortedLangs = Object.keys(rootLangCount).sort(
    (a, b) => rootLangCount[b] - rootLangCount[a]
  );
  for (const lang of sortedLangs) {
    const count = rootLangCount[lang];
    const percentage = ((count / summary.totalFiles) * 100).toFixed(1);
    console.log(`- ${lang}: ${count} roots (${percentage}%)`);
  }
  
  if (config.logVerbose) {
    console.log("\nAll root words by language:");
    for (const lang of sortedLangs) {
      console.log(`\n[${lang}]:`);
      const langRoots = Object.values(rootWords)
        .filter((root: any) => root.language === lang)
        .map((root: any) => root.root)
        .sort();
      
      for (const i of Array(Math.ceil(langRoots.length / 5)).keys()) {
        const chunk = langRoots.slice(i * 5, (i + 1) * 5);
        console.log(`  ${chunk.join(', ')}`);
      }
    }
  } else {
    console.log("\nSample root words:");
    const sampleRoots = Object.values(rootWords).slice(0, 5);
    for (const root of sampleRoots) {
      console.log(`- ${root.root} [${root.language}] → ${root.modernWords.join(', ')}`);
    }
  }
}

/**
 * Main function to run the analysis
 */
async function main(): Promise<void> {
  // Process command line arguments
  processArguments();
  
  console.log(`Starting analysis for ${config.sourceDir} in ${config.mode} mode...`);
  
  // Create output directory safely
  const dirResult = safeEnsureDir(config.outputDir);
  fold(
    (error: Error) => {
      console.error(`Failed to create output directory: ${error.message}`);
      process.exit(1);
    },
    (message: string) => console.log(message)
  )(dirResult);
  
  // Find all text files safely
  const filesResult = findTextFiles(config.sourceDir);
  const filePaths = fold(
    (error: Error) => {
      console.error(`Failed to find text files: ${error.message}`);
      process.exit(1);
    },
    (files: string[]) => {
      console.log(`Found ${files.length} text files to analyze.`);
      return files;
    }
  )(filesResult);
  
  // Run analysis based on mode
  const results: Result<string>[] = [];
  
  if (config.mode === 'pos' || config.mode === 'both') {
    const posResult = await analyzePosData(filePaths);
    results.push(posResult);
  }
  
  if (config.mode === 'roots' || config.mode === 'both') {
    const rootsResult = await analyzeRootWords(filePaths);
    results.push(rootsResult);
  }
  
  // Report final results
  const successful = results.filter(r => r.isSuccess).length;
  const failed = results.filter(r => !r.isSuccess).length;
  
  if (failed > 0) {
    console.error(`\nAnalysis completed with ${failed} failures:`);
    results.filter(r => !r.isSuccess).forEach(r => 
      console.error(`- ${r.error!.message}`)
    );
    process.exit(1);
  } else {
    console.log(`\nAnalysis completed successfully! (${successful} operations)`);
  }
}

// Run the main function with safe error handling
main().catch(error => {
  console.error("Unexpected error during analysis:", error);
  process.exit(1);
});