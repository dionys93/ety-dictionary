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
  
  // Whether to log results to the console
  logToConsole: true,
  
  // Turn off noisy logging of every file part of speech
  logEachPoS: false,
};

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
 * Main function to run the analysis
 */
async function main() {
  try {
    console.log(`Starting part of speech analysis for ${config.sourceDir}...`);
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }
    
    // Find all text files
    const filePaths = findTextFiles(config.sourceDir);
    console.log(`Found ${filePaths.length} text files to analyze.`);
    
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
    
    // Calculate percentages
    const posDistribution: Record<string, number> = {};
    for (const [pos, count] of Object.entries(posCounts)) {
      posDistribution[pos] = parseFloat(((count / totalPosEntries) * 100).toFixed(1));
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
    console.log(`Summary saved to ${outputPath}`);
    
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
    
  } catch (error) {
    console.error("An error occurred during analysis:", error);
  }
}

// Run the main function
main().catch(console.error);