// text-to-json-functional.ts
import * as fs from 'fs';
import * as path from 'path';

// ===== CORE TYPES =====

/** Raw line in the source text */
interface RawLine {
  content: string;
  lineNumber: number;
}

/** Parsed line with extracted metadata */
interface ParsedLine {
  text: string;
  origin?: string;
  language?: string;
  partOfSpeech?: string[];
  isUrl?: boolean;
}

/** Grouped entry from text */
interface EntryGroup {
  etymologyLines: ParsedLine[];
  sourceLines: ParsedLine[];
  wordName?: string;
}

/** Final JSON output structure */
interface EtymologyEntry {
  name: string;
  origin: string;
  "part-of-speech"?: string[];
}

interface WordEntry {
  name: string;
  etymology: EtymologyEntry[];
  sources: string[];
}

/** Pipeline configuration type */
interface TextProcessingPipeline {
  textTransform: (text: string) => string;
  lineParser: (line: RawLine) => ParsedLine;
  entryGrouper: (lines: RawLine[]) => EntryGroup[];
  wordNameExtractor: (group: EntryGroup, fallbackName: string) => string;
  entryTransformer: (group: EntryGroup, wordName: string) => WordEntry;
  customTransformers: Record<string, (group: EntryGroup) => any>;
}

// ===== CONFIGURATION =====

const languageMap: Record<string, { name: string }> = {
  'AB': { name: 'Aborigine' },
  'AG': { name: 'Ancient Greek' },
  'EG': { name: 'Ecclesiastical Greek' },
  'EGY': { name: 'Egyptian' },
  'PS': { name: 'Persian' },
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
const replaceSpecialCharacters = (text: string): string => {
  return text.replace(/ꬻ/g, "ng");
};

// ===== LINE PARSERS =====

/**
 * Parses language and origin from a line
 */
const parseLanguageOrigin = (line: RawLine): ParsedLine => {
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
const parsePartOfSpeech = (line: RawLine): ParsedLine => {
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
const processGroup = (lineParser: (line: RawLine) => ParsedLine) => 
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
 * Groups lines by double newline
 */
const groupByDoubleNewline = (lineParser: (line: RawLine) => ParsedLine) => 
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
  };

// ===== WORD NAME EXTRACTORS =====

/**
 * Extracts word name from Modern English line or fallback
 */
const extractFromModernEnglish = (group: EntryGroup, fallbackName: string): string => {
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
const transformToWordEntry = (group: EntryGroup, wordName: string): WordEntry => {
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
  
  const sources = group.sourceLines.map(line => line.content);
  
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
const stanzaTransformer = (group: EntryGroup) => {
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
const compactTransformer = (group: EntryGroup) => ({
  word: group.etymologyLines[0]?.text,
  languages: group.etymologyLines.map(l => l.origin),
  sources: group.sourceLines.length
});

// ===== PIPELINE COMPOSITION =====

/**
 * Creates a default pipeline configuration
 */
const createDefaultPipeline = (): TextProcessingPipeline => ({
  textTransform: replaceSpecialCharacters,
  lineParser: parsePartOfSpeech,
  entryGrouper: groupByDoubleNewline(parsePartOfSpeech),
  wordNameExtractor: extractFromModernEnglish,
  entryTransformer: transformToWordEntry,
  customTransformers: {}
});

/**
 * Applies partial pipeline overrides to the default pipeline
 */
const createPipeline = (overrides: Partial<TextProcessingPipeline>): TextProcessingPipeline => {
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
const convertText = (pipeline: TextProcessingPipeline) => 
  (textContent: string, fileName: string): WordEntry[] | any[] => {
    // Step 1: Apply character transformations
    const transformedText = pipeline.textTransform(textContent);
    
    // Step 2: Split into lines
    const rawLines: RawLine[] = transformedText
      .split('\n')
      .map((content, index) => ({ content, lineNumber: index + 1 }))
      .filter(line => line.content.trim() !== '');
    
    // Step 3: Group lines
    const entryGroups = pipeline.entryGrouper(rawLines);
    
    // Step 4: Convert each group
    const fallbackName = fileName.replace('.txt', '');
    
    return entryGroups.map((group, index) => {
      const wordName = pipeline.wordNameExtractor(group, fallbackName);
      
      // If there are custom transformers, apply them
      if (Object.keys(pipeline.customTransformers).length > 0) {
        const result: any = {};
        
        for (const [key, transformer] of Object.entries(pipeline.customTransformers)) {
          result[key] = transformer(group);
        }
        
        return result;
      }
      
      // Otherwise, use the standard transformer
      return pipeline.entryTransformer(group, wordName);
    });
  };

// ===== FILE PROCESSING =====

/**
 * Ensures directory exists (creates if necessary)
 */
const ensureDirExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Process a single file
 */
const processFile = 
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
const processDirectory = 
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
const pipelines = {
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

// ===== MAIN FUNCTION =====

function main(): void {
  const langDir = process.argv[2];
  const pipelineName = process.argv[3] || 'standard';
  const sourceBase = 'data-text';
  const targetBase = 'data-json';
  
  const sourceDir = langDir ? path.join(sourceBase, langDir) : sourceBase;
  const targetDir = langDir ? path.join(targetBase, langDir) : targetBase;
  
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: Source directory '${sourceDir}' does not exist.`);
    console.log(`Usage: node script.js [language-directory] [pipeline-name]`);
    console.log(`Available pipelines: ${Object.keys(pipelines).join(', ')}`);
    process.exit(1);
  }
  
  // Get the specified pipeline
  const pipeline = pipelines[pipelineName as keyof typeof pipelines] || pipelines.standard;
  
  console.log(`Starting conversion from ${sourceDir} to ${targetDir}...`);
  console.log(`Using pipeline: ${pipelineName}`);
  
  // Create the converter function
  const converter = convertText(pipeline);
  
  // Process files
  processDirectory(targetBase, converter)(sourceDir);
  
  console.log('Conversion completed!');
}

// Execute main function
main();

// ===== USAGE EXAMPLES =====

/*
// Example 1: Use a predefined pipeline
const standardConverter = convertText(pipelines.standard);
const result1 = standardConverter(textContent, fileName);

// Example 2: Create a custom pipeline
const customPipeline = createPipeline({
  textTransform: (text) => text.replace(/old/g, 'new'),
  customTransformers: {
    myFormat: (group) => ({
      // Your custom format
    })
  }
});

const customConverter = convertText(customPipeline);
const result2 = customConverter(textContent, fileName);

// Example 3: Compose functions for specific use case
const processStanzaFormat = pipe(
  replaceSpecialCharacters,
  (text) => text.split('\n').map((content, i) => ({ content, lineNumber: i + 1 })),
  groupByDoubleNewline(parsePartOfSpeech),
  (groups) => groups.map(stanzaTransformer)
);
*/
