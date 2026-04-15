// src/transformers/entry-transformers.ts
import { EntryGroup, EtymologyEntry, WordEntry } from '../types/pipeline-types';

export const transformToWordEntry = (group: EntryGroup, wordName: string): WordEntry => {
  const etymology: EtymologyEntry[] = group.etymologyLines.map(line => {
    const entry: EtymologyEntry = {
      name: line.text,
      origin: line.origin || 'Inglish'
    };
    
    if (line.partOfSpeech && line.partOfSpeech.length > 0) {
      entry["part-of-speech"] = line.partOfSpeech;
    }
    
    return entry;
  });
  
  const sources = group.sourceLines.map(line => line.text);
  
  return {
    name: wordName,
    etymology,
    sources
  };
};