// src/processors/file-processor.ts
import * as fs from 'fs'
import * as path from 'path'
import { 
  TextLine, 
  TextProcessingPipeline,
  processGroup,
  ensureDirExists,
  log, 
  logError, 
  logConversion, 
  logDebug,
  textToLines,
  fold,
  Result
} from '../'

// export const convertText = (pipeline: TextProcessingPipeline) => 
//   (textContent: string, fileName: string): any[] => {
//     // Step 1: Apply character transformations
//     const transformedText = pipeline.textTransform(textContent);
    
//     // Step 2: Convert to TextLine[] using the new transformation
//     const linesResult = textToLines(transformedText);
    
//     return fold(
//       (error: Error) => {
//         logError(`Failed to parse lines: ${error.message}`);
//         return [];
//       },
//       (lines: readonly TextLine[]) => {
//         // Step 3: Find potential entry boundaries
//         const entries: string[] = [];
//         const sections = transformedText.split(/\n\s*\n/);
        
//         let currentEntry = '';
//         let lastSectionHadLanguageTag = false;
        
//         for (const section of sections) {
//           if (!section.trim()) continue;
          
//           // Check if this section has any language tag [XX]
//           const hasLanguageTag = /\[([A-Z]+)\]/.test(section);
          
//           // If the previous section had a language tag and this one does too,
//           // it likely indicates a new entry
//           if (hasLanguageTag && lastSectionHadLanguageTag && currentEntry) {
//             entries.push(currentEntry.trim());
//             currentEntry = section;
//           } else {
//             // Otherwise add to the current entry
//             if (currentEntry) {
//               currentEntry += '\n\n' + section;
//             } else {
//               currentEntry = section;
//             }
//           }
          
//           lastSectionHadLanguageTag = hasLanguageTag;
//         }
        
//         // Add the last entry if we have one
//         if (currentEntry) {
//           entries.push(currentEntry.trim());
//         }
        
//         logDebug(`Detected ${entries.length} entries in ${fileName}`);
        
//         // Step 4: Process each entry independently
//         return entries.map((entryContent, index) => {
//           // Convert entry text to TextLine[]
//           const entryLinesResult = textToLines(entryContent);
          
//           return fold(
//             (error: Error) => {
//               logError(`Failed to parse entry ${index + 1}: ${error.message}`);
//               return null;
//             },
//             (entryLines: readonly TextLine[]) => {
//               // Filter out empty lines
//               const nonEmptyLines = entryLines.filter(line => !line.isEmpty);
              
//               // Find the last language tag in this entry
//               const lastLanguageTag = nonEmptyLines
//                 .map(line => {
//                   const match = line.content.match(/\[([A-Z]+)\]/);
//                   return match ? { line, tag: match[1] } : null;
//                 })
//                 .filter(result => result !== null)
//                 .pop();
              
//               // Process according to pipeline
//               const group = processGroup(pipeline.lineParser)(nonEmptyLines);
//               const fallbackName = fileName.replace('.txt', '');
              
//               // Use last language tag line as the name, or fallback
//               let wordName = fallbackName;
//               if (lastLanguageTag) {
//                 const parsedLine = pipeline.lineParser(lastLanguageTag.line);
//                 wordName = parsedLine.text;
//               } else {
//                 wordName = pipeline.wordNameExtractor(group, fallbackName);
//               }
              
//               logDebug(`Entry ${index + 1}: Word name = "${wordName}"`);
              
//               // Apply transformers
//               if (Object.keys(pipeline.customTransformers).length > 0) {
//                 const result: any = {};
//                 for (const [key, transformer] of Object.entries(pipeline.customTransformers)) {
//                   result[key] = transformer(group);
//                 }
//                 return result;
//               }
              
//               // Use standard transformer
//               return pipeline.entryTransformer(group, wordName);
//             }
//           )(entryLinesResult);
//         }).filter(result => result !== null);
//       }
//     )(linesResult);
//   };

// Make convertText generic to preserve pipeline output types
export function convertText<TEntry = any, TCustom = any>(
  pipeline: TextProcessingPipeline<TEntry, TCustom>
) {
  return function processText(textContent: string, fileName: string): Array<TEntry | Record<string, TCustom>> {
    // Apply character transformations
    const transformedText = pipeline.textTransform(textContent)
    
    // Convert to TextLine[] using the new transformation
    const linesResult = textToLines(transformedText)
    
    return fold(
      (error: Error) => {
        logError(`Failed to parse lines: ${error.message}`)
        return []
      },
      (lines: readonly TextLine[]) => {
        // Find potential entry boundaries
        const entries: string[] = []
        const sections = transformedText.split(/\n\s*\n/)
        
        let currentEntry = ''
        let lastSectionHadLanguageTag = false
        
        for (const section of sections) {
          if (!section.trim()) continue
          
          const hasLanguageTag = /\[([A-Z]+)\]/.test(section)
          
          if (hasLanguageTag && lastSectionHadLanguageTag && currentEntry) {
            entries.push(currentEntry.trim())
            currentEntry = section
          } else {
            if (currentEntry) {
              currentEntry += '\n\n' + section
            } else {
              currentEntry = section
            }
          }
          
          lastSectionHadLanguageTag = hasLanguageTag
        }
        
        if (currentEntry) {
          entries.push(currentEntry.trim())
        }
        
        logDebug(`Detected ${entries.length} entries in ${fileName}`)
        
        // Process each entry independently with proper typing
        return entries.map((entryContent, index) => {
          const entryLinesResult = textToLines(entryContent)
          
          return fold(
            (error: Error) => {
              logError(`Failed to parse entry ${index + 1}: ${error.message}`)
              return null
            },
            (entryLines: readonly TextLine[]) => {
              const nonEmptyLines = entryLines.filter(line => !line.isEmpty)
              
              const lastLanguageTag = nonEmptyLines
                .map(line => {
                  const match = line.content.match(/\[([A-Z]+)\]/)
                  return match ? { line, tag: match[1] } : null
                })
                .filter(result => result !== null)
                .pop()
              
              const group = processGroup(pipeline.lineParser)(nonEmptyLines)
              const fallbackName = fileName.replace('.txt', '')
              
              let wordName = fallbackName
              if (lastLanguageTag) {
                const parsedLine = pipeline.lineParser(lastLanguageTag.line)
                wordName = parsedLine.text
              } else {
                wordName = pipeline.wordNameExtractor(group, fallbackName)
              }
              
              logDebug(`Entry ${index + 1}: Word name = "${wordName}"`)
              
              // Apply transformers with proper typing
              if (Object.keys(pipeline.customTransformers).length > 0) {
                const result: Record<string, TCustom> = {}
                for (const [key, transformer] of Object.entries(pipeline.customTransformers)) {
                  result[key] = transformer(group)
                }
                return result
              }
              
              // Use standard transformer with proper type
              return pipeline.entryTransformer(group, wordName)
            }
          )(entryLinesResult)
        }).filter((result): result is TEntry | Record<string, TCustom> => result !== null)
      }
    )(linesResult)
  }
}

// export const processFile = 
//   (targetBase: string, converter: (textContent: string, fileName: string) => any[]) => 
//   (filePath: string, relPath: string): void => {
//     const fileName = path.basename(filePath);
    
//     // Skip non-text files
//     if (!fileName.endsWith('.txt')) {
//       return;
//     }
    
//     try {
//       const content = fs.readFileSync(filePath, 'utf8');
      
//       // Convert using the converter function
//       const jsonData = converter(content, fileName);
      
//       // Determine target path
//       const targetFilePath = path.join(
//         targetBase,
//         relPath.replace('.txt', '.json')
//       );
//       const targetDir = path.dirname(targetFilePath);
      
//       // Ensure directory exists
//       ensureDirExists(targetDir);
      
//       // Write JSON file
//       fs.writeFileSync(
//         targetFilePath,
//         JSON.stringify(jsonData, null, 2),
//         'utf8'
//       );
      
//       logConversion(filePath, targetFilePath);
//     } catch (error) {
//       logError(`Error processing file ${filePath}:`, error);
//     }
//   };

export function processFile<TEntry = any, TCustom = any>(
  targetBase: string, 
  converter: (textContent: string, fileName: string) => Array<TEntry | Record<string, TCustom>>
) {
  return function processFileWithConverter(filePath: string, relPath: string): void {
    const fileName = path.basename(filePath)
    
    if (!fileName.endsWith('.txt')) {
      return
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Convert using the typed converter function
      const jsonData = converter(content, fileName)
      
      // Determine target path
      const targetFilePath = path.join(
        targetBase,
        relPath.replace('.txt', '.json')
      )
      const targetDir = path.dirname(targetFilePath)
      
      // Ensure directory exists
      ensureDirExists(targetDir)
      
      // Write JSON file with typed data
      fs.writeFileSync(
        targetFilePath,
        JSON.stringify(jsonData, null, 2),
        'utf8'
      )
      
      logConversion(filePath, targetFilePath)
    } catch (error) {
      logError(`Error processing file ${filePath}:`, error)
    }
  }
}