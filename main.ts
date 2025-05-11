// main.ts
import * as fs from 'fs';
import * as path from 'path';
import {
  // Core pipeline components
  createPipeline,
  convertText,
  processDirectory,
  ensureDirExists,
  
  // Pipeline configurations
  pipelines,
  
  // Custom transformers if needed
  stanzaTransformer,
  compactTransformer
} from './text-pipeline-functors';

/**
 * Main function to start the text-to-JSON processing
 */
function main(): void {
  // Base directories
  const SOURCE_BASE = 'data-text';
  const TARGET_BASE = 'data-json';

  // Get language directory and pipeline type from command line arguments
  const langDir = process.argv[2];
  const pipelineType = process.argv[3] || 'standard';
  
  // Set source and target directories
  const sourceDir = langDir ? path.join(SOURCE_BASE, langDir) : SOURCE_BASE;
  const targetDir = langDir ? path.join(TARGET_BASE, langDir) : TARGET_BASE;

  // Validate source directory exists
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Source directory '${sourceDir}' does not exist.`);
    console.log(`Usage: tsx main.ts [language-directory] [pipeline-type]`);
    console.log(`Available pipeline types: ${Object.keys(pipelines).join(', ')}`);
    process.exit(1);
  }

  // Select the appropriate pipeline
  if (!pipelines[pipelineType as keyof typeof pipelines]) {
    console.error(`Error: Pipeline type '${pipelineType}' not found.`);
    console.log(`Available pipeline types: ${Object.keys(pipelines).join(', ')}`);
    process.exit(1);
  }

  const selectedPipeline = pipelines[pipelineType as keyof typeof pipelines];
  
  console.log(`Starting conversion from ${sourceDir} to ${targetDir}...`);
  console.log(`Using pipeline: ${pipelineType}`);

  // Create target directory if it doesn't exist
  ensureDirExists(targetDir);

  // Create converter from the selected pipeline
  const converter = convertText(selectedPipeline);
  
  // Start processing from the source directory
  processDirectory(targetDir, converter)(sourceDir);

  console.log('Conversion completed!');
}

// Execute main function
main();

// Example of creating a custom pipeline for a specific use case
// This shows how you can extend functionality in main.ts without modifying functors
function createCustomPipeline() {
  // Custom transformer for a unique format
  const verbConjugationTransformer = (group: any) => {
    const modernLine = group.etymologyLines.find((line: any) => line.language === 'ME');
    const ingLine = group.etymologyLines.find((line: any) => 
      line.text && line.text.includes('-ing'));
    
    // Extract verb conjugation pattern
    const conjugationPattern = ingLine ? 
      ingLine.text.match(/(\w+)\s+(-s\s+\w+\s+\w+\s+-ing)/) : null;
    
    return {
      verb: modernLine?.text || null,
      conjugation: conjugationPattern ? conjugationPattern[2] : null
    };
  };

  // Create a custom pipeline for verb conjugations
  return createPipeline({
    customTransformers: {
      verbConjugation: verbConjugationTransformer
    }
  });
}

// Example usage of the custom pipeline
/*
function processVerbConjugations() {
  const verbPipeline = createCustomPipeline();
  const converter = convertText(verbPipeline);
  
  // Process only the verbs directory
  processDirectory('data-json/verbs', converter)('data-text/verbs');
}
*/
