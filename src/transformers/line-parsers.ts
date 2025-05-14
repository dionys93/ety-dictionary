// src/transformers/line-parsers.ts
import { ParsedLine, RawLine } from '../types/pipeline-types';
import { languageMap } from '../config/language-map';
import { posMap } from '../config/pos-map';

export const parseLanguageOrigin = (line: RawLine): ParsedLine => {
  const brackets = line.content.match(/\[(.*?)\]/);
  const language = brackets?.[1];
  const origin = (language && languageMap[language])
    ? languageMap[language].name
    : 'Inglish';
  
  const textWithoutBrackets = line.content.replace(/\[.*?\]/, '').trim();
  
  return {
    text: textWithoutBrackets,
    origin,
    language,
    isUrl: line.content.startsWith('http')
  };
};

export const parsePartOfSpeech = (line: RawLine): ParsedLine => {
  const baseResult = parseLanguageOrigin(line);
  
  // Only parse part of speech for Inglish lines
  if (baseResult.origin === 'Inglish') {
    const match = baseResult.text.match(/\(([\w\s,]+)\)$/);
    
    if (match) {
      const posText = match[1];
      const posParts = posText.split(',').map(part => part.trim());
      
      baseResult.partOfSpeech = posParts.map(part => posMap[part] || part);
      baseResult.text = baseResult.text.replace(/\s*\([\w\s,]+\)$/, '').trim();
    }
  }
  
  return baseResult;
};