# Etymology Processing Toolkit

A modular, functional text processing toolkit for transforming etymology data from text to structured JSON, built with TypeScript and functional programming principles.

## Overview

This project provides a comprehensive suite of tools for processing etymology text files using a functional programming approach with monadic error handling. The architecture emphasizes composability, type safety, and pure functions throughout.

## Features

- **Monadic Error Handling**: Result and Maybe monads prevent runtime crashes
- **Composable Pipeline Architecture**: Mix and match transformers for different outputs
- **Type-Safe Processing**: Comprehensive TypeScript with branded types
- **Alphabetical Directory Support**: Automatically processes only `/a/`, `/b/`, etc. directories
- **Multiple Output Formats**: Standard, stanza, compact, and POS-aware pipelines
- **Streaming Support**: Handle large files without memory issues
- **CLI Interface**: Modular command structure for different operations

## Installation

```bash
# Install TypeScript runner globally
npm i -g tsx

# Clone and setup
git clone <repository>
cd etymology-toolkit
npm install
```

## Quick Start

```bash
# Process etymology files to JSON
etymology process inglish

# Analyze language data
etymology analyze inglish --mode both

# Get help
etymology --help
etymology <command> --help
```

## CLI Commands

### Current Commands

#### `process` - Transform text files to JSON
```bash
# Process all files with standard pipeline
etymology process inglish

# Use specific pipeline
etymology process inglish compact

# Dry run with preview
etymology process inglish --dry-run --preview

# Process specific file
etymology process inglish --file a/abandon.txt
```

#### `analyze` - Statistical analysis
```bash
# Analyze both POS and root words
etymology analyze inglish

# Only analyze parts of speech
etymology analyze inglish --mode pos

# Only analyze root words  
etymology analyze inglish --mode roots
```

### Planned Commands

#### `extract-pos` - Extract POS-tagged stanzas
```bash
# Extract stanzas with part-of-speech indicators
etymology extract-pos inglish output-dir

# Only process specific directories
etymology extract-pos inglish output-dir --dirs a,b,c
```

#### `validate` - Data quality validation
```bash
# Check for format errors and inconsistencies
etymology validate inglish

# Validate with specific rules
etymology validate inglish --strict

# Output validation report
etymology validate inglish --output report.json
```

#### `stats` - Quick statistics
```bash
# Get quick stats without full analysis
etymology stats inglish

# Stats for specific aspect
etymology stats inglish --type pos
etymology stats inglish --type languages
```

#### `convert` - Pipeline format conversion
```bash
# Convert between pipeline outputs
etymology convert data-json/inglish --from standard --to compact

# Batch convert multiple formats
etymology convert data-json/inglish --to stanza,compact
```

#### `diff` - Compare processed outputs
```bash
# Compare two JSON outputs
etymology diff old-output.json new-output.json

# Compare with specific focus
etymology diff old.json new.json --focus etymology
```

#### `cross-reference` - Find similar words across languages
```bash
# Find similar words between languages
etymology cross-reference inglish spanish

# Set similarity threshold
etymology cross-reference inglish german --threshold 0.8
```

## Architecture

### Core Principles

1. **Functional Programming**: Pure functions, immutable data, no side effects
2. **Monadic Composition**: Result<T> and Maybe<T> for safe error handling
3. **Type Safety**: Branded types, exhaustive type checking
4. **Separation of Concerns**: I/O operations isolated from business logic

### Data Flow

```
data-text/
     ↓
Language Directory
     ↓
Directory Classifier
     ↓
┌─────────────────────┬──────────────────┬─────────────────┐
│   Alphabetical      │     Grammar      │   Orthography   │
│   (/a/, /b/, ...)  │    (/grammar/)   │ (/orthography/) │
└──────────┬──────────┴────────┬─────────┴────────┬────────┘
           ↓                    ↓                   ↓
    Etymology Pipeline    Grammar Pipeline   Orthography Pipeline
           ↓                    ↓                   ↓
      WordEntry[]         GrammarRule[]    OrthographyPattern[]
           ↓                    ↓                   ↓
                    Structured JSON Output
```

### Directory Structure

```
src/
├── cli/                      # CLI command implementations
│   ├── commands/             # Individual command modules
│   ├── shared/               # Shared CLI utilities
│   └── types.ts              # CLI type definitions
├── config/                   # Configuration modules
│   ├── language-map.ts       # Language code mappings
│   ├── pos-map.ts           # Part-of-speech mappings
│   ├── paths.ts             # Centralized path configuration
│   └── patterns.ts          # Regex patterns
├── core/                     # Core business logic
│   ├── text-processing.ts   # Advanced text processors
│   └── index.ts             # Core exports
├── io/                       # I/O operations
│   ├── file-operations.ts   # Safe file I/O functions
│   └── alpha-file-finder.ts # Alphabetical directory filtering
├── monads/                   # Functional utilities
│   ├── result.ts            # Result monad for errors
│   ├── maybe.ts             # Maybe monad for nullables
│   └── index.ts             # Monad exports
├── orchestrators/            # I/O + pipeline composition
│   └── file-processing.ts   # File processing orchestration
├── pipeline/                 # Pipeline construction
│   └── pipeline-factory.ts  # Pipeline builders
├── transformers/             # Pure transformation functions
│   ├── entry-groupers.ts    # Group lines into entries
│   ├── entry-transformers.ts # Transform entries to output
│   ├── line-parsers.ts      # Parse individual lines
│   ├── name-extractors.ts   # Extract word names
│   └── part-of-speech-transformers.ts # POS-aware transforms
├── types/                    # TypeScript definitions
│   ├── pipeline-types.ts    # Core pipeline types
│   ├── branded-types.ts     # Type-safe branded strings
│   └── part-of-speech-types.ts # POS-specific types
└── utils/                    # Utility functions
    ├── console-utils.ts     # Logging utilities
    └── text-utils.ts        # Text processing helpers
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

### Example:
```
ad + bannum [L]
à bandon, abandoner [OF]
to abandon [ME]
ta abàndone -s -d -ing (v)
https://www.etymonline.com/word/abandon
```

## Output Formats

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
  "sources": ["https://www.etymonline.com/word/abandon"]
}
```

### POS-Aware Format (for verbs)
```json
{
  "infinitive": "to abandon",
  "etymology": [
    {
      "name": "ta abàndone -s -d -ing",
      "origin": "Inglish",
      "part-of-speech": ["verb"],
      "conjugations": {
        "thirdPerson": "abàndones",
        "pastTense": "abàndoned",
        "progressive": "abàndoning"
      }
    }
  ],
  "sources": ["https://www.etymonline.com/word/abandon"]
}
```

## Pipeline Types

- **standard**: Full etymology with sources and part-of-speech
- **stanza**: Modern/Inglish word pairs 
- **compact**: Condensed format with language statistics
- **multi**: Multiple formats in one output
- **lowercase**: Standard format with lowercase transformation
- **posAware**: Enhanced format with conjugations/declensions

## Creating Custom Pipelines

```typescript
import { createPipeline, EntryGroup } from './src'

// Custom transformer for specific needs
function myCustomTransformer(group: EntryGroup) {
  return {
    word: group.etymologyLines[0]?.text,
    languageCount: group.etymologyLines.length,
    hasModernEnglish: group.etymologyLines.some(l => l.language === 'ME')
  }
}

// Create pipeline with custom transformer
const myPipeline = createPipeline({
  customTransformers: {
    myFormat: myCustomTransformer
  }
})
```

## Monadic Error Handling

All I/O operations return `Result<T>` types:

```typescript
import { fold } from './src/core'

const result = processFile(filePath)

fold(
  (error: Error) => console.error(`Failed: ${error.message}`),
  (data: any) => console.log(`Success: ${data}`)
)(result)
```

## Language Support

Currently configured languages include:
- Germanic: Old English (OE), Middle English (MI), Modern English (ME)
- Romance: Latin (L), Old French (OF), French (FR), Italian (IT)
- Others: Greek (AG/EG), Hebrew (HE), Arabic (AR), German (GR)
- See `src/config/language-map.ts` for full list

### Adding New Features

1. **New Commands**: Add to `src/cli/commands/`
2. **New Transformers**: Add to `src/transformers/`
3. **New Pipelines**: Extend `pipeline-factory.ts`
4. **New Analysis**: Create in `src/analyzers/`

### Testing

```bash
# Run type checking
npm run type-check

# Test a specific command
etymology process inglish --dry-run --sample 5
```

## Roadmap

- [x] Core pipeline architecture
- [x] CLI framework
- [x] Basic commands (process, analyze)
- [ ] POS extraction command
- [ ] Validation suite
- [ ] Quick stats command
- [ ] Format conversion
- [ ] Diff comparison
- [ ] Cross-language analysis
- [ ] Etymology path visualization
- [ ] Language family analysis
