// src/processors/directory-processor.ts
import * as fs from 'fs';
import * as path from 'path';
import { processFile } from './file-processor';

export const processDirectory = 
  (targetBase: string, converter: (textContent: string, fileName: string) => any[]) => 
  (dirPath: string, relPath: string = ''): void => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const fileProcessor = processFile(targetBase, converter);
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryRelPath = path.join(relPath, entry.name);
      
      if (entry.isDirectory()) {
        processDirectory(targetBase, converter)(fullPath, entryRelPath);
      } else {
        fileProcessor(fullPath, entryRelPath);
      }
    }
};