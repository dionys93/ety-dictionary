// src/custom/custom-transformers.ts
import { EntryGroup } from '../types/pipeline-types';

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

export const compactTransformer = (group: EntryGroup) => ({
  word: group.etymologyLines[0]?.text,
  languages: group.etymologyLines.map(l => l.origin),
  sources: group.sourceLines.length
});