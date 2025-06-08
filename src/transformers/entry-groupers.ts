// src/transformers/entry-groupers.ts
import { EntryGroup, LineParser, ParsedLine, TextLine } from '../'

export const processGroup = (lineParser: LineParser) => 
  (lines: TextLine[]): EntryGroup => {
    const etymologyLines: ParsedLine[] = [];
    const sourceLines: ParsedLine[] = [];
    
    for (const line of lines) {
      const parsed = lineParser(line);
      
      if (parsed.isUrl) {
        sourceLines.push(parsed);
      } else {
        etymologyLines.push(parsed);
      }
    }
    
    return { etymologyLines, sourceLines };
};

export const groupByDoubleNewline = (lineParser: LineParser) => 
  (lines: TextLine[]): EntryGroup[] => {
    const groups: EntryGroup[] = [];
    let currentGroup: TextLine[] = [];
    
    for (const line of lines) {
      if (line.isEmpty) {
        if (currentGroup.length > 0) {
          groups.push(processGroup(lineParser)(currentGroup));
          currentGroup = [];
        }
      } else {
        currentGroup.push(line);
      }
    }
    
    // Don't forget the last group
    if (currentGroup.length > 0) {
      groups.push(processGroup(lineParser)(currentGroup));
    }
    
    return groups;
};

export const groupByEntryPatterns = (lineParser: LineParser) => 
  (lines: TextLine[]): EntryGroup[] => {
    const groups: EntryGroup[] = [];
    const allParsedLines = lines.map(line => lineParser(line));
    
    // Find indices where ME (Modern English) tags appear
    const meIndices = allParsedLines
      .map((line, index) => line.language === 'ME' ? index : -1)
      .filter(index => index !== -1);
    
    // If we have ME markers, use them to split the entries
    if (meIndices.length > 0) {
      // Create ranges from ME indices (start index to next ME index - 1)
      for (let i = 0; i < meIndices.length; i++) {
        const startIdx = meIndices[i];
        const endIdx = (i < meIndices.length - 1) ? meIndices[i + 1] - 1 : lines.length - 1;
        
        // Get the range of lines for this entry
        const entryLines = lines.slice(startIdx - 2 >= 0 ? startIdx - 2 : 0, endIdx + 1);
        
        // Process group
        const group = processGroup(lineParser)(entryLines);
        groups.push(group);
      }
    } else {
      // Fall back to using double newlines if no ME markers found
      return groupByDoubleNewline(lineParser)(lines);
    }
    
    return groups;
};