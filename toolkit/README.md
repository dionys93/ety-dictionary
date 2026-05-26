# Etym-Toolkit: Inglisce Dictionary CLI

A specialized Bash and Node.js toolkit for managing, auditing, and exporting the **Inglisce Etymological Dictionary**. The library is built around a single canonical parser (`etym-parse`) that every other function consumes, ensuring consistent data across all lookup, analysis, and build operations.

Presentation is handled entirely by Astro.js, which serves markdown and text files through its own components. The toolkit's job stops at producing clean, structured data — it has no frontend responsibilities.

---

## 📁 Repository Structure

* **`data-text/inglisce/dictionary/`** — Core data organized by alphabetical subdirectories (e.g., `a/animate.txt`).
* **`toolkit/etym-lib.sh`** — The core Bash toolbelt for word lookup, validation, and JSON/CSV compilation.
* **`toolkit/config/`** — Central configuration for paths and lookup tables (`languages.tsv`, `parts-of-speech.tsv`).
* **`toolkit/scripts/`** — Node.js scripts in three domains: data compilation (`build-dictionary.js`), English NLP analysis (`debug-nlp.js`), and Inglisce translation logic (`translator.js`, `inglisce-orthography.js`).
* **`toolkit/dist/`** — Automated build output: master JSONL dataset and translation brain.
* **`toolkit/tests/`** — Vitest test suite covering the Bash pipeline, NLP engine, and translation layer.

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

### 3. Running Tests
```bash
npm run test
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

The two-stem class encodes verbs whose infinitive and present stems differ (e.g. `þonder` / `þondre`). All forms in this class are fully resolved words — no suffix tokens. The `present` field in the conjugation object is only populated for this class.

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

`me_word` resolution priority: `[ME]` > `[MI]` > last etymology entry. This means Latin-only or Old French-only stanzas will resolve to their oldest known ancestor.

### `_etym_resolve_file <word>`
Resolves a word to its `.txt` file path. First attempts a direct filename match (`word.txt`), then falls back to a whole-word content search within the letter directory. This means related words stored in the same file (e.g. `anime` inside `animate.txt`) are correctly reachable. Prints the resolved path to stdout or returns 1 with an error on stderr.

### `_etym_stream [path]`
Streams all JSONL from every `.txt` file under a given path, defaulting to `$DICT_DIR`. Used internally by `etym-summarize`, `etym-affix`, `etym-build-dataset`, and `etym-graph` to avoid redundant filesystem crawls.

---

## 🛠 Lookup & Extraction

### `etym-info <word>`
Displays a formatted table of all definitions for a word. Filters to stanzas matching the requested word by `me_word` or `inglisce_word`, so words that share a file with etymological relatives are correctly isolated.

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
Searches the entire dictionary for all Inglisce words whose ancestry contains the given root or phrase. Unlike other lookup functions, this intentionally searches across all files rather than filtering to an exact word match — its purpose is to surface the full cognate family of a historical root.

### `etym-cat <word>`
Prints the raw content of a word's `.txt` file broken into numbered stanzas. Useful for manual auditing and verifying stanza structure before running lint.

### `etym-find <query>`
Recursive grep across the entire dictionary. Accepts words, phrases, or language tags like `[OE]`.

---

## 📊 Data & Build Pipeline

### `etym-build-dataset [output_file]`
The primary build command. Crawls `$DICT_DIR` and writes `dist/master_dataset.jsonl` — one JSONL record per stanza, consumed directly by `build-dictionary.js`.

```bash
etym-build-dataset
# → dist/master_dataset.jsonl
```

### `etym-flatten [path] [options]`
General-purpose export command. Delegates to `etym-build-dataset` for JSONL; also supports CSV for data analysis workflows.

* `--jsonl` — *(default)* JSON Lines output, one record per stanza
* `--csv` — CSV with columns: `me_word`, `inglisce_word`, `pos`, `conjugations`
* `-o, --out <file>` — specify output path

### `etym-summarize [path] [options]`
Statistical audit of Parts of Speech and Language Origins across a directory. Runs a single `jq` pass over the full stream and generates ranked frequency tables and a cross-tabulation matrix. POS tags are split on commas so compound tags like `(adj, m n)` contribute to both `adj` and `m n` counts independently.

* `--json` — emit results as structured JSON instead of formatted text
* `-o, --out <file>` — write output to file

### `etym-affix [path] [options]`
Morphological frequency analysis of prefixes or suffixes across the dictionary.

* `--prefix` / `--suffix` — which end to analyse (default: suffix)
* `-n <len>` — affix length in characters (default: 3)
* `-p <pos>` — filter by part of speech
* `-l <lang>` — filter by language origin tag

---

## 🤖 NLP Translation Pipeline

A linear pipeline that transforms the raw dictionary into a contextual NLP translation engine using `compromise.js`. Two transcription modes are available depending on the use case.

### Step 1: Build the master dataset
```bash
etym-build-dataset
# → dist/master_dataset.jsonl
```

### Step 2: Compile the translation brain
Ingests the JSONL dataset, resolves all morphological forms using named conjugation slots, and builds an optimized lookup map keyed by English surface form. Special handling is built in for `be`, `do`, `have`, modals, and the two-stem `-er/-ir` verb class.

```bash
node scripts/build-dictionary.js
# → dist/translationBrain.json
```

### Step 3a: NLP-backed transcription (recommended for prose)
Uses `compromise.js` POS tagging to disambiguate homographs before substitution. Handles contraction splitting, placeholder protection, and two-pass multi-word phrase matching. Best used for bulk library transcription where accuracy outweighs speed.

```bash
node scripts/inglisce-orthography.js
```

### Step 3b: Brute-force transcription (fast, punctuation-safe)
Regex tokenization with direct dictionary lookup. No NLP overhead — trades homograph intelligence for guaranteed punctuation integrity. Suitable for targeted transcription or environments where `compromise.js` behaviour is unpredictable.

```bash
node scripts/translator.js <input.txt> [output.txt]
```

In both modes, unmapped words are wrapped in `[brackets]` and reported to the console for auditing.

---

## 🧹 Maintenance

### `etym-lint [path] [--strict]`
Validates `.txt` file formatting. Issues are reported by severity:

* `[FATAL]` — file is empty
* `[ERROR]` — missing or malformed POS tag `()`, missing language tag `[]`, or both tags on the same line
* `[WARN]` — trailing whitespace, or one or more stanzas with no resolvable language origin

The lint report also includes a **verb conjugation coverage** summary: how many verb stanzas use standard `-s -d/-ed -ing` vs non-standard forms, with a full listing of non-standard entries for auditing.

Returns exit code 1 if any fatal errors or standard errors are found.

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

> **Note:** requires jq 1.6+.

### `etym-visualize [graph_file]`
Converts `etym_graph.json` into a `.md` file containing a Mermaid.js diagram block. Renders natively in VS Code (`Cmd+K V`), GitHub, and Mermaid Live.
