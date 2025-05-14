// src/processors/file-processor.ts
import * as fs from 'fs';
import * as path from 'path';
import { RawLine, TextProcessingPipeline } from '../types/pipeline-types';
import { processGroup } from '../transformers/entry-groupers';
import { ensureDirExists } from '../utils/file-utils';

export const convertText = (pipeline: TextProcessingPipeline) => 
  (textContent: string, fileName: string): any[] => {
    // Step 1: Apply character transformations
    const transformedText = pipeline.textTransform(textContent);
    
    // Step 2: Find potential entry boundaries
    // We'll use a regex to find sections that represent full entries
    const entries: string[] = [];
    const sections = transformedText.split(/\n\s*\n/);
    
    let currentEntry = '';
    let lastSectionHadLanguageTag = false;
    
    for (const section of sections) {
      if (!section.trim()) continue;
      
      // Check if this section has any language tag [XX]
      const hasLanguageTag = /\[([A-Z]+)\]/.test(section);
      
      // If the previous section had a language tag and this one does too,
      // it likely indicates a new entry
      if (hasLanguageTag && lastSectionHadLanguageTag && currentEntry) {
        entries.push(currentEntry.trim());
        currentEntry = section;
      } else {
        // Otherwise add to the current entry
        if (currentEntry) {
          currentEntry += '\n\n' + section;
        } else {
          currentEntry = section;
        }
      }
      
      lastSectionHadLanguageTag = hasLanguageTag;
    }
    
    // Add the last entry if we have one
    if (currentEntry) {
      entries.push(currentEntry.trim());
    }
    
    // Step 3: Process each entry independently
    return entries.map((entryContent) => {
      // Convert entry text to raw lines
      const rawLines: RawLine[] = entryContent
        .split('\n')
        .map((content, index) => ({ content, lineNumber: index + 1 }))
        .filter(line => line.content.trim() !== '');
      
      // Find the last language tag in this entry
      const lastLanguageTag = rawLines
        .map(line => {
          const match = line.content.match(/\[([A-Z]+)\]/);
          return match ? { line, tag: match[1] } : null;
        })
        .filter(result => result !== null)
        .pop();
      
      // Process according to pipeline
      const group = processGroup(pipeline.lineParser)(rawLines);
      const fallbackName = fileName.replace('.txt', '');
      
      // Use last language tag line as the name, or fallback
      let wordName = fallbackName;
      if (lastLanguageTag) {
        const parsedLine = pipeline.lineParser(lastLanguageTag.line);
        wordName = parsedLine.text;
      } else {
        wordName = pipeline.wordNameExtractor(group, fallbackName);
      }
      
      // Apply transformers
      if (Object.keys(pipeline.customTransformers).length > 0) {
        const result: any = {};
        for (const [key, transformer] of Object.entries(pipeline.customTransformers)) {
          result[key] = transformer(group);
        }
        return result;
      }
      
      // Use standard transformer
      return pipeline.entryTransformer(group, wordName);
    });
  };

export const processFile = 
  (targetBase: string, converter: (textContent: string, fileName: string) => any[]) => 
  (filePath: string, relPath: string): void => {
    const fileName = path.basename(filePath);
    
    // Skip non-text files
    if (!fileName.endsWith('.txt')) {
      return;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Convert using the converter function
      const jsonData = converter(content, fileName);
      
      // Determine target path
      const targetFilePath = path.join(
        targetBase,
        relPath.replace('.txt', '.json')
      );
      const targetDir = path.dirname(targetFilePath);
      
      // Ensure directory exists
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
  };