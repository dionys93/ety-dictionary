// src/processors/directory-processor.ts
import * as fs from 'fs';
import * as path from 'path';
import { processFile } from './file-processor';
import { logDebug, logError } from '../utils/console-utils';

export const processDirectory = 
  (targetBase: string, converter: (textContent: string, fileName: string) => any[]) => 
  (dirPath: string, relPath: string = ''): void => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const fileProcessor = processFile(targetBase, converter);
      
      logDebug(`Processing directory: ${dirPath}`);
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const entryRelPath = path.join(relPath, entry.name);
        
        if (entry.isDirectory()) {
          processDirectory(targetBase, converter)(fullPath, entryRelPath);
        } else {
          fileProcessor(fullPath, entryRelPath);
        }
      }
    } catch (error) {
      logError(`Error processing directory ${dirPath}:`, error);
    }
  };