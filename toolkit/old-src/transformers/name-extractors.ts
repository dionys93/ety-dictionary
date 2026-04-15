// src/transformers/name-extractors.ts
import { EntryGroup } from '../types/pipeline-types';

export const extractFromModernEnglish = (group: EntryGroup, fallbackName: string): string => {
  const meLine = group.etymologyLines.find(line => line.language === 'ME');
  
  if (meLine) {
    return meLine.text;
  }
  
  // Fallback to first line or provided fallback
  if (group.etymologyLines.length > 0) {
    const firstLine = group.etymologyLines[0];
    const wordMatch = firstLine.text.match(/^([a-zA-Z]+)/);
    return wordMatch ? wordMatch[1] : fallbackName;
  }
  
  return fallbackName;
};

export const extractFromLastLanguageTag = (group: EntryGroup, fallbackName: string): string => {
  // Find all lines with language tags in order
  const languageLines = group.etymologyLines.filter(line => line.language);
  
  // If we have any language-tagged lines, use the last one
  if (languageLines.length > 0) {
    return languageLines[languageLines.length - 1].text;
  }
  
  // Fallback to first line or provided fallback
  if (group.etymologyLines.length > 0) {
    const firstLine = group.etymologyLines[0];
    const wordMatch = firstLine.text.match(/^([a-zA-Z]+)/);
    return wordMatch ? wordMatch[1] : fallbackName;
  }
  
  return fallbackName;
};