/**
 * Extracts word name from the last language-tagged line or fallback
 */
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
};/**
 * Groups lines by double newline
 */
export const groupByDoubleNewline = (lineParser: (line: RawLine) => ParsedLine) => 
  (lines: RawLine[]): EntryGroup[] => {
    const groups: EntryGroup[] = [];
    let currentGroup: RawLine[] = [];
    
    for (const line of lines) {
      if (line.content.trim() === '') {
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
  };// text-pipeline-functors.ts
import * as fs from 'fs';
import * as path from 'path';

// ===== CORE TYPES =====

/** Raw line in the source text */
export interface RawLine {
  content: string;
  lineNumber: number;
}

/** Parsed line with extracted metadata */
export interface ParsedLine {
  text: string;
  origin?: string;
  language?: string;
  partOfSpeech?: string[];
  isUrl?: boolean;
}

/** Grouped entry from text */
export interface EntryGroup {
  etymologyLines: ParsedLine[];
  sourceLines: ParsedLine[];
  wordName?: string;
}

/** Final JSON output structure */
export interface EtymologyEntry {
  name: string;
  origin: string;
  "part-of-speech"?: string[];
}

export interface WordEntry {
  name: string;
  etymology: EtymologyEntry[];
  sources: string[];
}

/** Pipeline configuration type */
export interface TextProcessingPipeline {
  textTransform: (text: string) => string;
  lineParser: (line: RawLine) => ParsedLine;
  entryGrouper: (lines: RawLine[]) => EntryGroup[];
  wordNameExtractor: (group: EntryGroup, fallbackName: string) => string;
  entryTransformer: (group: EntryGroup, wordName: string) => WordEntry;
  customTransformers: Record<string, (group: EntryGroup) => any>;
}

// ===== CONFIGURATION =====

export const languageMap: Record<string, { name: string }> = {
  'AB': { name: 'Aborigine' },
  'AG': { name: 'Ancient Greek' },
  'EG': { name: 'Ecclesiastical Greek' },
  'EGY': { name: 'Egyptian' },
  'PS': { name: 'Persian' },
  'PR' : { name: 'Portuguese' },
  'AR': { name: 'Arabic' },
  'JP': { name: 'Japanese' },
  'OE': { name: 'Old English' },
  'ME': { name: 'Modern English' },
  'MI': { name: 'Middle English' },
  'L': { name: 'Latin' },
  'OF': { name: 'Old French' },
  'FR': { name: 'French' },
  'SK': { name: 'Sanskrit' },
  'ML': { name: 'Medieval Latin' },
  'IT': { name: 'Italian' },
  'ON': { name: 'Old Norse' },
  'PG': { name: 'Proto-Germanic' },
  'PIE': { name: 'Proto-Indo-European' },
  'VL': { name: 'Vulgar Latin' }
};

// ===== BASIC TEXT TRANSFORMERS =====

/**
 * Character replacement transformer
 */
export const replaceSpecialCharacters = (text: string): string => {
  return text.replace(/ꬻ/g, "ng");
};

// ===== LINE PARSERS =====

/**
 * Parses language and origin from a line
 */
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

/**
 * Parses part of speech from a line
 */
export const parsePartOfSpeech = (line: RawLine): ParsedLine => {
  const baseResult = parseLanguageOrigin(line);
  
  // Only parse part of speech for Inglish lines
  if (baseResult.origin === 'Inglish') {
    const match = baseResult.text.match(/\(([\w\s,]+)\)$/);
    
    if (match) {
      const posText = match[1];
      const posParts = posText.split(',').map(part => part.trim());
      
      const posMap: Record<string, string> = {
        "m n": "masculine noun",
        "f n": "feminine noun",
        "v": "verb",
        "intr v": "intransitive verb",
        "conj": "conjunction",
        "adj": "adjective",
        "prep": "preposition",
        "pron": "pronoun",
        "adv": "adverb"
      };
      
      baseResult.partOfSpeech = posParts.map(part => posMap[part] || part);
      baseResult.text = baseResult.text.replace(/\s*\([\w\s,]+\)$/, '').trim();
    }
  }
  
  return baseResult;
};

// ===== ENTRY GROUPERS =====

/**
 * Helper to process a group of lines
 */
export const processGroup = (lineParser: (line: RawLine) => ParsedLine) => 
  (lines: RawLine[]): EntryGroup => {
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

/**
 * Groups entries by analyzing complete entry patterns rather than just double newlines
 */
export const groupByEntryPatterns = (lineParser: (line: RawLine) => ParsedLine) => 
  (lines: RawLine[]): EntryGroup[] => {
    const groups: EntryGroup[] = [];
    const allParsedLines = lines.map(line => lineParser(line));
    
    // Find indices where ME (Modern English) tags appear
    // These typically indicate the start of a new word/concept
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

// ===== WORD NAME EXTRACTORS =====

/**
 * Extracts word name from Modern English line or fallback
 */
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

// ===== ENTRY TRANSFORMERS =====

/**
 * Transforms an entry group into the final JSON structure
 */
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

// ===== CUSTOM TRANSFORMERS =====

/**
 * Stanza transformer - extracts modern and ing forms
 */
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

/**
 * Compact transformer - minimal output format
 */
export const compactTransformer = (group: EntryGroup) => ({
  word: group.etymologyLines[0]?.text,
  languages: group.etymologyLines.map(l => l.origin),
  sources: group.sourceLines.length
});

// ===== PIPELINE COMPOSITION =====

/**
 * Creates a default pipeline configuration
 */
export const createDefaultPipeline = (): TextProcessingPipeline => ({
  textTransform: replaceSpecialCharacters,
  lineParser: parsePartOfSpeech,
  entryGrouper: groupByEntryPatterns(parsePartOfSpeech),
  wordNameExtractor: extractFromLastLanguageTag,
  entryTransformer: transformToWordEntry,
  customTransformers: {}
});

/**
 * Applies partial pipeline overrides to the default pipeline
 */
export const createPipeline = (overrides: Partial<TextProcessingPipeline>): TextProcessingPipeline => {
  const defaultPipeline = createDefaultPipeline();
  
  // If lineParser is overridden, we need to update entryGrouper with the new parser
  const lineParser = overrides.lineParser || defaultPipeline.lineParser;
  const entryGrouper = overrides.entryGrouper || groupByDoubleNewline(lineParser);
  
  return {
    ...defaultPipeline,
    ...overrides,
    entryGrouper, // Ensure entryGrouper uses the correct lineParser
  };
};

/**
 * Converts text content through the pipeline
 */
export const convertText = (pipeline: TextProcessingPipeline) => 
  (textContent: string, fileName: string): WordEntry[] | any[] => {
    // Step 1: Apply character transformations
    const transformedText = pipeline.textTransform(textContent);
    
    // Step 2: Find potential entry boundaries
    // We'll use a regex to find sections that represent full entries
    const entries: string[] = [];
    const sections = transformedText.split(/\n\s*\n/);
    
    let currentEntry = '';
    let lastSectionHadLanguageTag = false;
    
    for (const section of sections) {
      if (!section.trim()) continue;
      
      // Check if this section has any language tag [XX]
      const hasLanguageTag = /\[([A-Z]+)\]/.test(section);
      
      // If the previous section had a language tag and this one does too,
      // it likely indicates a new entry
      if (hasLanguageTag && lastSectionHadLanguageTag && currentEntry) {
        entries.push(currentEntry.trim());
        currentEntry = section;
      } else {
        // Otherwise add to the current entry
        if (currentEntry) {
          currentEntry += '\n\n' + section;
        } else {
          currentEntry = section;
        }
      }
      
      lastSectionHadLanguageTag = hasLanguageTag;
    }
    
    // Add the last entry if we have one
    if (currentEntry) {
      entries.push(currentEntry.trim());
    }
    
    // Step 3: Process each entry independently
    return entries.map((entryContent) => {
      // Convert entry text to raw lines
      const rawLines: RawLine[] = entryContent
        .split('\n')
        .map((content, index) => ({ content, lineNumber: index + 1 }))
        .filter(line => line.content.trim() !== '');
      
      // Find the last language tag in this entry
      const lastLanguageTag = rawLines
        .map(line => {
          const match = line.content.match(/\[([A-Z]+)\]/);
          return match ? { line, tag: match[1] } : null;
        })
        .filter(result => result !== null)
        .pop();
      
      // Process according to pipeline
      const group = processGroup(pipeline.lineParser)(rawLines);
      const fallbackName = fileName.replace('.txt', '');
      
      // Use last language tag line as the name, or fallback
      let wordName = fallbackName;
      if (lastLanguageTag) {
        const parsedLine = pipeline.lineParser(lastLanguageTag.line);
        wordName = parsedLine.text;
      } else {
        wordName = pipeline.wordNameExtractor(group, fallbackName);
      }
      
      // Apply transformers
      if (Object.keys(pipeline.customTransformers).length > 0) {
        const result: any = {};
        for (const [key, transformer] of Object.entries(pipeline.customTransformers)) {
          result[key] = transformer(group);
        }
        return result;
      }
      
      // Use standard transformer
      return pipeline.entryTransformer(group, wordName);
    });
  };

// ===== FILE PROCESSING =====

/**
 * Ensures directory exists (creates if necessary)
 */
export const ensureDirExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Process a single file
 */
export const processFile = 
  (targetBase: string, converter: (textContent: string, fileName: string) => any[]) => 
  (filePath: string, relPath: string): void => {
    const fileName = path.basename(filePath);
    
    // Skip non-text files
    if (!fileName.endsWith('.txt')) {
      return;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Convert using the converter function
      const jsonData = converter(content, fileName);
      
      // Determine target path
      const targetFilePath = path.join(
        targetBase,
        relPath.replace('.txt', '.json')
      );
      const targetDir = path.dirname(targetFilePath);
      
      // Ensure directory exists
      ensureDirExists(targetDir);
      
      // Write JSON file
      fs.writeFileSync(
        targetFilePath,
        JSON.stringify(jsonData, null, 2),
        'utf8'
      );
      
      console.log(`Converted: ${filePath} -> ${targetFilePath}`);
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  };

/**
 * Process a directory recursively
 */
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

// ===== PIPELINE FACTORIES =====

/**
 * Create different pipeline configurations for different use cases
 */
export const pipelines = {
  standard: createPipeline({}),
  
  stanza: createPipeline({
    customTransformers: {
      stanza: stanzaTransformer
    }
  }),
  
  compact: createPipeline({
    customTransformers: {
      compact: compactTransformer
    }
  }),
  
  multi: createPipeline({
    customTransformers: {
      stanza: stanzaTransformer,
      compact: compactTransformer,
      standard: (group) => transformToWordEntry(group, 
        extractFromModernEnglish(group, 'unknown'))
    }
  }),
  
  // Example of a completely custom pipeline
  lowercase: createPipeline({
    textTransform: (text) => text.toLowerCase(),
    wordNameExtractor: (group, fallback) => 
      extractFromModernEnglish(group, fallback).toLowerCase()
  })
};
