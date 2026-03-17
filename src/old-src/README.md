# Text Pipeline Functors

A modular, functional text processing pipeline for transforming etymology data from text to structured JSON.

## Overview

This library provides a highly composable set of functions for processing etymology text files. It follows a functional programming approach where each component is a small, focused function that can be combined with others to create various text processing pipelines.

## Directory Structure

```
src/
├── config/              # Configuration data
│   ├── language-map.ts  # Maps language codes to full names
│   └── pos-map.ts       # Maps part of speech abbreviations
├── custom/              # Custom transformers
│   └── custom-transformers.ts
├── pipeline/            # Pipeline composition
│   └── pipeline-factory.ts
├── processors/          # I/O and processing
│   ├── directory-processor.ts
│   └── file-processor.ts
├── transformers/        # Core transformation functions
│   ├── entry-groupers.ts
│   ├── entry-transformers.ts
│   ├── line-parsers.ts
│   ├── name-extractors.ts
│   └── text-transformers.ts
├── types/               # Type definitions
│   └── pipeline-types.ts
├── utils/               # Utility functions
│   └── file-utils.ts
└── index.ts             # Main exports
```

## Core Concepts

### Pipeline Components

Each pipeline is built from these components:

1. **Text Transformers**: Process text at the character level (e.g., replacing special characters)
2. **Line Parsers**: Parse individual lines into structured data
3. **Entry Groupers**: Group lines into logical entries
4. **Name Extractors**: Extract word names from entries
5. **Entry Transformers**: Convert entry groups to final output format
6. **Custom Transformers**: Special output formats for specific use cases

### Data Flow

The data flows through the pipeline in this sequence:

```
Raw Text → Transformed Text → Raw Lines → Parsed Lines → Entry Groups → Output JSON
```

## Usage Examples

### Basic Usage

```typescript
import { pipelines, convertText, processDirectory } from './src';

// Process all files in a directory using the standard pipeline
const converter = convertText(pipelines.standard);
processDirectory('data-json', converter)('data-text');
```

### Custom Pipeline

```typescript
import { createPipeline, convertText } from './src';

// Create a custom pipeline
const customPipeline = createPipeline({
  textTransform: (text) => text.toLowerCase(),
  customTransformers: {
    myFormat: (group) => ({
      word: group.etymologyLines[0]?.text,
      sources: group.sourceLines.length
    })
  }
});

// Process text using the custom pipeline
const converter = convertText(customPipeline);
const result = converter(myText, 'example.txt');
```

### Example: Custom Verb Conjugation Transformer

This example shows how to create a custom transformer that extracts verb conjugation patterns:

```typescript
import { createPipeline, EntryGroup } from './src';

// Custom transformer for verb conjugation patterns
const verbConjugationTransformer = (group: EntryGroup) => {
  const modernLine = group.etymologyLines.find(line => line.language === 'ME');
  const ingLine = group.etymologyLines.find(line => 
    line.text && line.text.includes('-ing'));
  
  // Extract verb conjugation pattern
  const conjugationPattern = ingLine ? 
    ingLine.text.match(/(\w+)\s+(-s\s+\w+\s+\w+\s+-ing)/) : null;
  
  return {
    verb: modernLine?.text || null,
    conjugation: conjugationPattern ? conjugationPattern[2] : null
  };
};

// Create a pipeline using the custom transformer
const verbPipeline = createPipeline({
  customTransformers: {
    verbConjugation: verbConjugationTransformer
  }
});

// Usage:
// For input:
// to abandon [ME]
// ta abàndone -s -d -ing (v)
//
// Output:
// {
//   "verbConjugation": {
//     "verb": "to abandon",
//     "conjugation": "-s -d -ing"
//   }
// }
```

## Input File Format

The library expects etymology files with this structure:

```
rootWord1 [LANG1]
rootWord2 [LANG2]
...
wordInModernEnglish [ME]
conjugation/declension form (part of speech)
https://source-url-1
https://source-url-2
```

## Output Formats

The library produces structured JSON. The format depends on the pipeline:

### Standard Format
```json
{
  "name": "to abandon",
  "etymology": [
    { "name": "ad + bannum", "origin": "Latin" },
    { "name": "à bandon, abandoner", "origin": "Old French" },
    { "name": "to abandon", "origin": "Modern English" },
    { 
      "name": "ta abàndone -s -d -ing", 
      "origin": "Inglish",
      "part-of-speech": ["verb"]
    }
  ],
  "sources": [
    "https://www.etymonline.com/word/abandon#etymonline_v_14",
    "https://www.oed.com/dictionary/abandon_v?tab=factsheet#4432701"
  ]
}
```

### Stanza Format
```json
{
  "stanza": {
    "modern": "to abandon",
    "ing": "ta abàndone -s -d -ing"
  }
}
```

### Compact Format
```json
{
  "compact": {
    "word": "to abandon",
    "languages": ["Latin", "Old French", "Modern English", "Inglish"],
    "sources": 5
  }
}
```

## CLI Usage

Run from the command line using `tsx`:

```bash
# Process a specific language directory with the standard pipeline
tsx main.ts [language]

# Process a language directory with a specific pipeline
tsx main.ts [language] stanza

# Process a language with the compact pipeline
tsx main.ts [language] compact

# Dry run - see what would be processed without creating files
tsx main.ts [language] --dry-run

# Dry run with preview - see sample output for the first file
tsx main.ts [language] --dry-run --preview

# Preview a specific file
tsx main.ts [language] --dry-run --preview --file path/to/file.txt
# Or with the shorthand version
tsx main.ts [language] -d -p -f path/to/file.txt

# Process a specific number of sample files in dry run mode
tsx main.ts [language] --dry-run --sample 3

# Process a specific file instead of all files
tsx main.ts [language] --file path/to/file.txt
# Or with the shorthand version
tsx main.ts [language] -f path/to/file.txt
```

**Note**: The command line parser ensures that arguments are interpreted correctly,
but it's good practice to use the full option format for clarity:
```bash
tsx main.ts [language] [pipeline] --option1 value1 --option2 value2
```