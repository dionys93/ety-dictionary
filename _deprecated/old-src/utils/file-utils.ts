// src/utils/file-utils.ts
import * as fs from 'fs';
import * as path from 'path';

export const ensureDirExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};