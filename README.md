# Etymology of Inglish and Other Alternative Orthographies

A modular, functional text processing pipeline for transforming etymology data from text to structured JSON, with comprehensive analysis tools.

## Overview

This project provides both text and JSON data types for etymology processing, built using functional programming principles with monadic error handling for robust file operations.

## Prerequisites

```bash
npm i -g tsx
```

## Core Features

- **Modular Pipeline Architecture**: Composable functions for text processing
- **Multiple Output Formats**: Standard, stanza, compact, and multi-format pipelines
- **Safe Error Handling**: Result monads for robust file operations
- **Analysis Tools**: Part-of-speech and root word analysis capabilities
- **Dry Run Mode**: Preview processing without creating files

## Usage

### Main Text Processing

Process etymology text files and convert them to structured JSON:

```bash
# Basic usage - process all files in a language directory
tsx main.ts [language]

# Use specific pipeline
tsx main.ts [language] [pipeline-type]

# Available pipeline types: standard, stanza, compact, multi, lowercase
tsx main.ts inglish compact
```

#### Pipeline Options

- **standard**: Full etymology with sources and part-of-speech
- **stanza**: Simple modern/inglish word pairs
- **compact**: Condensed format with language counts
- **multi**: Combines multiple formats in one output
- **lowercase**: Standard format with lowercase transformations

#### Advanced Options

```bash
# Dry run - see what would be processed without creating files
tsx main.ts [language] --dry-run
tsx main.ts [language] -d

# Dry run with preview of output
tsx main.ts [language] --dry-run --preview
tsx main.ts [language] -d -p

# Process specific number of sample files
tsx main.ts [language] --dry-run --sample 3
tsx main.ts [language] -d -s 3

# Process a specific file
tsx main.ts [language] --dry-run --file path/to/file.txt
tsx main.ts [language] -d -f path/to/file.txt

# Combine options
tsx main.ts inglish compact --dry-run --preview
tsx main.ts inglish -d -p -s 5
```

#### Examples

```bash
# Process all Inglish files with standard pipeline
tsx main.ts inglish

# Process with compact format
tsx main.ts inglish compact

# Preview what would be processed
tsx main.ts inglish compact --dry-run

# Test specific file with preview
tsx main.ts inglish --dry-run --preview --file early.txt

# Process 3 sample files in dry run mode
tsx main.ts inglish compact -d -s 3
```

### Text Analysis

Analyze your text files for part-of-speech patterns and root word distributions:

```bash
# Analyze both POS and root words (default)
tsx summarize.ts

# Analyze only part-of-speech data
tsx summarize.ts --mode pos
tsx summarize.ts -m pos

# Analyze only root words
tsx summarize.ts --mode roots
tsx summarize.ts -m roots

# Verbose output with detailed information
tsx summarize.ts --verbose
tsx summarize.ts -v

# Combine options
tsx summarize.ts -m pos -v
```

#### Analysis Output

The analysis generates:
- **pos-summary.json**: Part-of-speech statistics and distributions
- **root-words.json**: Root word analysis by language
- Console output with summaries and examples

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

Example:
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

## Project Structure

```
├── main.ts              # Main processing script (uses centralized paths)
├── summarize.ts          # Analysis script (uses centralized paths)
├── src/
│   ├── monads/          # Functional programming utilities (Result, Maybe)
│   ├── config/          # Configuration modules
│   │   ├── paths.ts     # ⭐ Centralized path configuration
│   │   ├── language-map.ts # Language code mappings
│   │   └── pos-map.ts   # Part-of-speech mappings
│   ├── pipeline/        # Pipeline composition and builders
│   ├── processors/      # I/O and file processing
│   ├── transformers/    # Core transformation functions
│   ├── custom/          # Custom transformers
│   ├── types/           # TypeScript definitions
│   └── utils/           # Helper utilities
├── data-text/           # Input text files (configurable)
├── data-json/           # Output JSON files (configurable)
└── analysis/            # Analysis results (configurable)
```

## Architecture Features

- **Centralized Path Management**: All file paths configured in `src/config/paths.ts`
- **Functional Programming**: Uses Result monads for safe error handling
- **Function Declarations**: All code uses hoisted function declarations (no arrow functions)
- **Modular Design**: Each module has a single, well-defined responsibility
- **Type Safety**: Full TypeScript support with branded types available

## Error Handling

The project uses Result monads for safe error handling:

- **Graceful Failures**: Individual file errors don't stop processing
- **Detailed Error Messages**: Clear indication of what went wrong
- **Partial Success Reporting**: Shows both successful and failed operations
- **Safe File Operations**: No crashes from permission or I/O errors

## Language Support

Currently configured for:
- Old English (OE)
- Middle English (MI) 
- Modern English (ME)
- Latin (L)
- Old French (OF)
- And many more (see `src/config/language-map.ts`)

## Contributing

The modular architecture makes it easy to:
- Add new pipeline types
- Create custom transformers
- Extend language support
- Add new analysis modes

See the example `createCustomPipeline()` function in `main.ts` for guidance on extending functionality.