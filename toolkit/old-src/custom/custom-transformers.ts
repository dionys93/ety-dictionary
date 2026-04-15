// src/custom/custom-transformers.ts
import { EntryGroup } from '../types/pipeline-types';
import { extractFromLastLanguageTag } from '../transformers/name-extractors';

export const stanzaTransformer = (group: EntryGroup) => {
  const modernLine = group.etymologyLines.find(line => line.language === 'ME');
  const modernIndex = group.etymologyLines.findIndex(line => line.language === 'ME');
  
  // Get the line below [ME] if it exists
  const ingLine = (modernIndex !== -1 && modernIndex < group.etymologyLines.length - 1)
    ? group.etymologyLines[modernIndex + 1]
    : undefined;
  
  return {
    modern: modernLine?.text || null,
    ing: ingLine?.text || null
  };
};

export const compactTransformer = (group: EntryGroup) => {
  // Use the existing word name extractor for consistency
  const wordName = extractFromLastLanguageTag(group, group.etymologyLines[0]?.text || '');
    
  return {
    word: wordName,
    languages: group.etymologyLines.map(l => l.origin),
    sources: group.sourceLines.length
  };
};