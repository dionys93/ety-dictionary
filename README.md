# Etymology Text Processing Pipeline

A modular, functional text processing pipeline for transforming etymology data from text to structured JSON, built with TypeScript and functional programming principles.

## Overview

This project provides a highly composable set of functions for processing etymology text files using a functional programming approach with monadic error handling. Each component is a focused function that can be combined with others to create various text processing pipelines.

## Prerequisites

```bash
npm i -g tsx
```

## Core Architecture

### Functional Programming Principles
- **Pure Functions**: All transformers are pure functions with no side effects
- **Monadic Error Handling**: Result and Maybe monads for safe operations
- **Immutable Data**: All data structures are readonly and immutable

### Key Features
- **Modular Pipeline Architecture**: Composable functions for text processing
- **Multiple Output Formats**: Standard, stanza, compact, and multi-format pipelines
- **Safe Error Handling**: Result monads prevent crashes from file I/O errors
- **Centralized Path Configuration**: All file paths managed in `src/config/paths.ts`
- **Dry Run Mode**: Preview processing without creating files
- **Type Safety**: Comprehensive TypeScript with branded types available

## Directory Structure

```
src/
├── config/                    # Configuration modules
│   ├── language-map.ts        # Language code to name mappings
│   ├── pos-map.ts            # Part-of-speech abbreviation mappings
│   └── paths.ts              # ⭐ Centralized path configuration
├── custom/                    # Custom transformation functions
│   └── custom-transformers.ts
├── monads/                    # Functional programming utilities
│   ├── maybe.ts              # Maybe monad for nullable values
│   ├── result.ts             # Result monad for error handling
│   └── index.ts              # Consolidated exports
├── pipeline/                  # Pipeline composition and builders
│   ├── pipeline-factory.ts   # Pipeline creation and configuration
│   └── pipeline-visualizer.ts # Debug visualization tools
├── processors/                # I/O and file processing
│   ├── directory-processor.ts # Recursive directory processing
│   └── file-processor.ts     # Individual file processing
├── transformations/           # Generic text processing utilities
│   └── text-to-lines.ts      # Text parsing and line grouping
├── transformers/              # Core transformation functions
│   ├── entry-groupers.ts     # Group lines into logical entries
│   ├── entry-transformers.ts # Convert entries to final output
│   ├── line-parsers.ts       # Parse individual lines
│   ├── name-extractors.ts    # Extract word names from entries
│   ├── safe-transformers.ts  # Error-safe wrapper functions
│   └── text-transformers.ts  # Character-level transformations
├── types/                     # TypeScript definitions
│   ├── branded-types.ts      # Type-safe branded strings
│   ├── pipeline-types.ts     # Core pipeline type definitions
│   └── text.ts              # Pure text data types
├── utils/                     # Helper utilities
│   ├── console-utils.ts      # Logging and debug functions
│   └── file-utils.ts         # File system utilities
└── index.ts                  # Main exports
```

## Usage

### Basic Text Processing

Process etymology text files and convert them to structured JSON:

```bash
# Process all files in a language directory with standard pipeline
tsx main.ts [language]

# Use specific pipeline type
tsx main.ts [language] [pipeline-type]

# Available pipeline types: standard, stanza, compact, multi, lowercase
```

### Pipeline Options

- **standard**: Full etymology with sources and part-of-speech data
- **stanza**: Simple modern/inglish word pairs for poetry applications  
- **compact**: Condensed format with language counts and statistics
- **multi**: Combines multiple formats in one output file
- **lowercase**: Standard format with lowercase transformations

### Advanced Options

```bash
# Dry run - preview what would be processed without creating files
tsx main.ts inglish --dry-run
tsx main.ts inglish -d

# Dry run with output preview
tsx main.ts inglish --dry-run --preview  
tsx main.ts inglish -d -p

# Process specific number of sample files
tsx main.ts inglish --dry-run --sample 3
tsx main.ts inglish -d -s 3

# Process a specific file only
tsx main.ts inglish --file path/to/file.txt
tsx main.ts inglish -f path/to/file.txt

# Combine options for targeted testing
tsx main.ts inglish compact --dry-run --preview
tsx main.ts inglish -d -p -f early.txt
```

### Practical Examples

```bash
# Process all Inglish files with standard pipeline
tsx main.ts inglish

# Test compact format on 5 sample files
tsx main.ts inglish compact -d -s 5

# Preview specific file transformation
tsx main.ts inglish --dry-run --preview --file early.txt

# Quick test of multi-format pipeline
tsx main.ts inglish multi -d -p
```

## Input File Format

Etymology files should follow this structure:

```
rootWord1 [LANG1]
rootWord2 [LANG2]
...
wordInModernEnglish [ME]
conjugation/declension form (part of speech)
https://source-url-1
https://source-url-2
```

**Example:**
```
ærlice [OE]
erli [MI]  
early [ME]
êly -ier -iest (adj, adv)
https://www.etymonline.com/word/early
```

## Output Formats

### Standard Format
```json
{
  "name": "early",
  "etymology": [
    { "name": "ærlice", "origin": "Old English" },
    { "name": "erli", "origin": "Middle English" },
    { "name": "early", "origin": "Modern English" },
    { 
      "name": "êly -ier -iest", 
      "origin": "Inglish",
      "part-of-speech": ["adjective", "adverb"]
    }
  ],
  "sources": ["https://www.etymonline.com/word/early"]
}
```

### Stanza Format
```json
{
  "stanza": {
    "modern": "early",
    "ing": "êly -ier -iest"
  }
}
```

### Compact Format  
```json
{
  "compact": {
    "word": "early",
    "languages": ["Old English", "Middle English", "Modern English", "Inglish"],
    "sources": 1
  }
}
```

## Data Flow

The functional pipeline processes data through these stages:

```
Raw Text → Text Transform → Line Parser → Entry Grouper → Name Extractor → Entry Transformer → JSON Output
                                                                        ↘ Custom Transformers ↗
```

Each stage is a pure function that can be composed with others or replaced independently.

## Custom Pipeline Creation

Create specialized pipelines for your use cases:

```typescript
import { createPipeline, EntryGroup } from './src'

// Custom transformer for verb conjugation patterns
function verbConjugationTransformer(group: EntryGroup) {
  const modernLine = group.etymologyLines.find(line => line.language === 'ME')
  const ingLine = group.etymologyLines.find(line => 
    line.text && line.text.includes('-ing'))
  
  return {
    verb: modernLine?.text || null,
    hasConjugation: !!ingLine
  }
}

// Create pipeline with custom transformer
const verbPipeline = createPipeline({
  customTransformers: {
    verbConjugation: verbConjugationTransformer
  }
})
```

## Error Handling

The project uses Result monads for comprehensive error handling:

- **Graceful Degradation**: Individual file errors don't stop batch processing
- **Detailed Error Messages**: Clear indication of what went wrong and where
- **Partial Success Reporting**: Shows both successful and failed operations  
- **Safe File Operations**: No crashes from permission or I/O errors
- **Functional Error Propagation**: Errors flow through the pipeline safely

## Language Support

Currently configured for:
- Old English (OE), Middle English (MI), Modern English (ME)
- Latin (L), Old French (OF), French (FR)
- German (GR), Italian (IT), Portuguese (PR)
- Greek variants (AG, EG), Hebrew (HE), Arabic (AR)
- And many more (see `src/config/language-map.ts`)

## Path Configuration

All file paths are centrally managed in `src/config/paths.ts`:

```typescript
// Default configuration
const DEFAULT_PATHS = {
  base: {
    dataText: 'data-text',      // Input files
    dataJson: 'data-json',      // Output files  
    analysis: 'analysis'        // Analysis results
  },
  languages: {
    inglish: 'data-text/inglish'
  }
}
```

This enables:
- Environment-specific configurations (dev/test/prod)
- Easy path modifications without code changes
- Consistent path handling across all modules

## Contributing

The functional architecture makes it easy to:
- **Add New Pipelines**: Create new combinations of existing transformers
- **Create Custom Transformers**: Write focused functions for specific output formats
- **Extend Language Support**: Add mappings in `src/config/language-map.ts`
- **Add New Analysis**: Build on the Result monad foundation

### Development Guidelines
- Use function declarations, not arrow functions
- No semicolons after function definitions  
- Comment all non-trivial functionality
- Return Result types for operations that can fail
- Keep functions pure and focused on single responsibilities

## Architecture Benefits

- **Composability**: Mix and match transformers to create new pipelines
- **Testability**: Pure functions are easy to unit test
- **Reliability**: Monadic error handling prevents runtime crashes
- **Maintainability**: Single-responsibility modules with clear interfaces
- **Extensibility**: Add new features without modifying existing code