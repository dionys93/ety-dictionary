# Etym-Toolkit: Inglisce Dictionary CLI

A specialized Bash and Node.js toolkit for managing, auditing, and exporting the **Inglisce Etymological Dictionary**. The library is built around a single canonical parser (`etym-parse`) that every other function consumes, ensuring consistent data across all lookup, analysis, and build operations.

---

## 📁 Repository Structure

* **`data-text/inglisce/dictionary/`** — Core data organized by alphabetical subdirectories (e.g., `a/animate.txt`).
* **`toolkit/etym-lib.sh`** — The core Bash toolbelt for word lookup, validation, and JSON/CSV compilation.
* **`toolkit/config/`** — Central configuration for paths and lookup tables (`languages.tsv`, `parts-of-speech.tsv`).
* **`toolkit/scripts/`** — Node.js scripts in three domains: data compilation (`build-dictionary.js`), English NLP analysis (`debug-nlp.js`), and Inglisce translation logic (`translator.js`, `inglisce-orthography.js`).
* **`toolkit/dist/`** — Automated build output: master JSONL dataset, translation brain, and chunked JSON API for the frontend.

---

## 🚀 Installation & Setup

### 1. The Bash Environment
Source the library from within the `toolkit/` directory to activate all CLI tools in your session:

```bash
source etym-lib.sh
```

**Dependencies:** `jq` is required for all JSON operations. If missing, the toolkit will prompt you to install it automatically via `apt` (Linux) or `brew` (macOS).

### 2. The Node.js Environment
Install Node dependencies from within the `toolkit/` folder:

```bash
npm install
```

---

## ⚙️ Data Architecture: The Stanza

Each `.txt` dictionary file contains one or more stanzas separated by blank lines. Every stanza has three line types, unambiguously identified by their content:

* **Etymology lines** — contain a bracketed language tag: `cerclen [MI]`, `circus [L]`
* **Reformed line** — contains a `(pos)` tag and no `[LANG]` tag: `to circle -s -d -ing (v)`
* **Source URLs** — lines beginning with `http`

The reformed line encodes the Inglisce spelling and all morphological data. The toolkit recognises five verb conjugation classes:

| Class | Pattern | Example |
|---|---|---|
| Standard | `root -s -d -ing` | `calculait -s -d -ing` |
| Irregular past | `root -s <past> -ing` | `criepe -s craipt -ing` |
| Full irregular | `root -s <past> <participle> -ing` | `c̃ouse -s c̃ose c̃osen -ing` |
| Two-stem (-er/-ir) | `root present(s past gerund` | `þonder þondre(s þondred þondering` |
| Two-stem full irreg | `root present(s past participle gerund` | five tokens after split |

---

## 🔧 Core Engine

These internal functions underpin everything else. They are not intended to be called directly.

### `etym-parse <file.txt>`
The canonical stanza parser. Takes a `.txt` dictionary file and emits one JSONL record per stanza to stdout. All other functions are consumers of this stream.

**Output schema:**
```json
{
  "me_word":       "circle",
  "inglisce_word": "circle",
  "pos":           "v",
  "conjugations": {
    "present":        "",
    "third_singular": "-s",
    "past":           "-d",
    "participle":     "-d",
    "gerund":         "-ing"
  },
  "etymology": [{ "form": "cerclen", "lang": "MI" }],
  "sources":   ["https://..."]
}
```

For non-verbs, `conjugations` is a raw array: `["-s"]` for nouns, `["-ly"]` for adjectives.

For two-stem verbs, `conjugations.present` is populated with the present stem (e.g. `"þondre"`) and all forms are fully resolved words — no suffix tokens.

### `_etym_resolve_file <word>`
Resolves a word to its `.txt` file path. First attempts a direct filename match, then falls back to a whole-word content search within the letter directory. Prints the path to stdout or returns 1 with an error on stderr.

---

## 🛠 Lookup & Extraction

### `etym-info <word>`
Displays a formatted table of all definitions for a word. Filters to stanzas matching the requested word by `me_word` or `inglisce_word`, so words that share a file with etymological relatives (e.g. `anime` inside `animate.txt`) are correctly isolated.

```
--- Primary Definitions for: animate ---
INGLISCE               | PART OF SPEECH               | ORIGIN | FORMS
--------------------------------------------------------------------------------
animait                | v                            | ME     | -s -ed -ing
animat                 | adj                          | ME     | -ly
```

### `etym-chain <word>`
Prints the full evolutionary ancestry chain for every matching stanza in a word's file.

```
--- Evolutionary Chain for: circle ---
 ↳ cerclen  [MI]
 ↳ circle   [ME]
 ↳ circle   [Inglisce]
```

### `etym-cognates <query>`
Searches the entire dictionary for all Inglisce words whose ancestry contains the given root or phrase. Unlike other lookup functions, this intentionally searches across all files rather than filtering to an exact word match.

### `etym-export <word>`
Emits the full parsed JSONL for a word as a JSON array, filtered to matching stanzas. Suitable for API consumption or piping into `jq`.

### `etym-cat <word>`
Prints the raw content of a word's `.txt` file broken into numbered stanzas. Useful for manual auditing.

### `etym-find <query>`
Recursive grep across the entire dictionary. Accepts words, phrases, or language tags like `[OE]`.

---

## 📊 Data & Build Pipeline

### `etym-build-dataset [output_file]`
Crawls `$DICT_DIR` and writes `dist/master_dataset.jsonl` — the primary input for the Node.js compilation pipeline. One JSONL record per stanza.

```bash
etym-build-dataset
# → dist/master_dataset.jsonl
```

### `etym-flatten [path] [options]`
Exports the dictionary to JSONL or CSV. Delegates to `etym-build-dataset` for JSONL.

* `--jsonl` — *(default)* JSON Lines output, one record per stanza
* `--csv` — CSV with columns: `me_word`, `inglisce_word`, `pos`, `conjugations`
* `-o, --out <file>` — specify output path

### `etym-summarize [path] [options]`
Statistical audit of Parts of Speech and Language Origins across a directory. Generates ranked frequency tables and a cross-tabulation matrix.

* `--json` — emit results as JSON instead of formatted text
* `-o, --out <file>` — write output to file

### `etym-affix [path] [options]`
Morphological frequency analysis of prefixes or suffixes across the dictionary.

* `--prefix` / `--suffix` — which end to analyse (default: suffix)
* `-n <len>` — affix length in characters (default: 3)
* `-p <pos>` — filter by part of speech
* `-l <lang>` — filter by language origin tag

---

## 🤖 NLP Translation Pipeline

A linear pipeline that transforms the raw dictionary into a contextual NLP translation engine using `compromise.js`.

### Step 1: Build the master dataset
```bash
etym-build-dataset
# → dist/master_dataset.jsonl
```

### Step 2: Compile the translation brain
Ingests the JSONL dataset, resolves all morphological forms using named conjugation slots, and builds an optimized lookup map keyed by English surface form.
```bash
node scripts/build-dictionary.js
# → dist/translationBrain.json
```

### Step 3: Run the translator
Reads standard English text, uses `compromise.js` POS tagging to disambiguate homographs, and maps words to the compiled brain. Unmapped words are wrapped in `[brackets]` for auditing.
```bash
node scripts/translator.js <input.txt> [output.txt]
```

---

## 🧹 Maintenance

### `etym-lint [path] [--strict]`
Validates `.txt` file formatting. Issues are reported by severity:

* `[FATAL]` — file is empty
* `[ERROR]` — missing or malformed POS tag `()`, missing language tag `[]`, or both tags on the same line
* `[WARN]` — trailing whitespace

The lint report also includes a **verb conjugation coverage** summary showing how many verb stanzas use standard `-s -d -ing` vs non-standard forms, with a full listing of non-standard entries for auditing.

Returns exit code 1 if any fatal errors or errors are found.

### `etym-trim [path]`
Strips trailing whitespace from all `.txt` files in a directory. Resolves all trailing whitespace lint warnings in one pass. macOS and Linux compatible.

### `etym-create-histories [-d] [-v] [--dirs <a,b,c>]`
Splits each multi-stanza `.txt` file into individual per-definition history files, one file per stanza, named `<word>_<pos>.txt`.

* `-d, --dry-run` — preview without writing files
* `-v, --verbose` — show each extracted file path
* `--dirs <a,b,c>` — process only specific letter directories

---

## 🕸 Graphing & Visualization

### `etym-graph [path] [-o <file>]`
Builds a `{nodes, edges}` JSON graph of all etymological relationships across the dictionary, suitable for force-directed graph renderers. Outputs to `etym_graph.json` by default.

### `etym-visualize [graph_file]`
Converts `etym_graph.json` into a `.md` file containing a Mermaid.js diagram block. Renders natively in VS Code (`Cmd+K V`), GitHub, and Mermaid Live.

### `etym-publish [path]`
Compiles the dictionary into a static JSON API for the React/Astro frontend. Generates per-letter word index files (e.g. `letters/a.json`) and a `navigation.json` index in `dist/api/`.