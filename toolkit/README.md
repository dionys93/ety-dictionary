# Etym-Toolkit: Inglisce Dictionary CLI

A specialized Bash and Node.js toolkit for managing, auditing, and exporting the **Inglisce Etymological Dictionary**. This library provides high-level functions to parse multi-layered stanzas, resolve grammatical derivatives, trace linguistic evolution, compile presentation APIs, and run Natural Language Processing (NLP) translations.

---

## 📁 Repository Structure

* **`data-text/inglisce/dictionary/`**: Core data organized by alphabetical subdirectories (e.g., `a/animate.txt`).
* **`toolkit/etym-lib.sh`**: The core Bash "Toolbelt" for word extraction, display, validation, and JSON/CSV compilation.
* **`toolkit/config/`**: Central configuration for paths, shared Regex patterns, and lookup tables (`languages.tsv`, `parts-of-speech.tsv`).
* **`toolkit/scripts/`**: Node.js scripts divided into three domains: Data compilation (`build-dictionary.js`), English NLP analysis (`debug-nlp.js`), and Inglisce spelling/translation logic (`translator.js`, `inglisce-orthography.js`).
* **`toolkit/dist/`**: The automated build directory containing the Master JSONL Dataset, Translation Brain, and the chunked JSON API for the frontend.

---

## 🚀 Installation & Setup

### 1. The Bash Environment
To activate the CLI tools in your current terminal session, source the library from within the `toolkit/` directory:

```bash
source etym-lib.sh
```

**Dependencies:** The toolkit includes a boot-time check for `jq`. It is strictly required for compiling JSON objects. If missing, the script will prompt you to install it automatically via `apt` (Linux) or `brew` (macOS).

### 2. The Node.js NLP Environment
To use the translation and compilation scripts, ensure you have installed the Node dependencies (specifically the `compromise` NLP library) by running this inside the `toolkit/` folder:

```bash
npm install
```

---

## 🛠 Command Reference: Lookup & Extraction

### `etym-info <word>`
The primary lookup tool. It isolates Primary Definitions from complex dictionary files using a robust dual-check system.

* **Smart File Lookup:** If `<word>.txt` does not exist, the tool recursively searches its parent letter directory to find if the word exists as a derivative.
* **Dual-Check Logic:** Maps stanzas into memory and checks both the Reference Line (source word) and the Reformed Line (new spelling).
* **Normalization:** Automatically strips infinitives (`to `), grammatical tags `[ME]`, and suffixes during comparison for high-accuracy matching.

### `etym-chain <word>`
Visualizes the evolutionary path of a single word in the terminal.

* **Usage:** `etym-chain speak`
* **Result:** Isolates the specific stanza for the query and prints a clean, line-by-line descent from its oldest origin down to its modern Inglisce form, mapping language tags to their full names along the way.

### `etym-cognates <query>`
Searches the entire dictionary for modern descendants of a historical root.

### `etym-cat <word>`
A debugging tool that breaks a dictionary file into numbered stanzas for manual auditing.

### `etym-find <query>`
A recursive search tool used to find every instance of a language tag (e.g., `[OE]`) or phonetic string across the entire dictionary.

---

## 📊 Command Reference: Data & ML Pipelines

### `etym-flatten [target] [options]`
The "Master Artifact" generator. Pivots the multi-stanza directory into 2D datasets optimized for downstream tools, LLM training, and data science.

* **Features:** Extracts `File_Name`, `Modern_English`, `Reformed_Word`, `Conjugations`, and automatically translates the tag into a verbose `Part_of_Speech`.
* **Options:**
  * `--jsonl`: *(Recommended)* Exports to JSON Lines (`dist/master_dataset.jsonl`), the standard format for machine ingestion and LLM fine-tuning.
  * `--csv`: Exports a CSV spreadsheet.
  * `-o, --out <file>`: Specify output filename for tabular data.
  * `--include-origin`: Toggles the inclusion of the `Language_Origin` column.

### `etym-summarize [target] [options]`
A statistical auditor for your linguistic data. Generates ranked frequency reports of Parts of Speech and Language Origins, plus a Cross-Tabulation Matrix comparing density. (Supports `--json` export).

### `etym-export <word>`
Parses a word's evolutionary stanza and compiles it into a highly structured JSON array, calculating base forms and mapping detailed Noun/Verb/Adjective morphology.

---

## 🧹 Command Reference: Maintenance & Presentation

### `etym-lint [target] [options]`
A strict validation tool to keep your dictionary files healthy. Scans files and flags issues by severity: empty files `[FATAL]`, missing POS or Language tags `[ERROR]`, trailing whitespace `[WARN]`, and orphaned parentheses `[WARN]`.

### `etym-trim`
Automatically strips trailing whitespace from all text files in the dictionary, instantly resolving common linting warnings.

### `etym-publish`
Compiles the raw text dictionary into a lightweight, production-ready JSON API. Generates individual alphabetical chunks (e.g., `a.json`) and a `navigation.json` index, saving them to `dist/api/` for immediate consumption by the React/Astro frontend.

---

## 🤖 The NLP Translation Pipeline

The toolkit features a strictly linear pipeline that transforms your raw text dictionary into a contextual Natural Language Processing (NLP) translation engine. It uses `compromise.js` to analyze English grammar and applies strict Inglisce orthographic rules via `scripts/utils.js`.

### Step 1: Extract the Master Dataset
The pipeline requires a flat, 2D representation of the dictionary. Run the Bash tool to extract the data:
\`\`\`bash
etym-flatten --jsonl
\`\`\`
*(Outputs: `dist/master_dataset.jsonl`)*

### Step 2: Compile the Translation Brain
The compiler ingests the JSONL dataset, resolves all morphological suffixes, calculates grammatical conjugations, and builds an optimized lookup map.
\`\`\`bash
node scripts/build-dictionary.js
\`\`\`
*(Outputs: `dist/translationBrain.json`)*

### Step 3: Run the Contextual Translator
The translator is the final consumer. It reads standard English text, analyzes the grammatical context of homographs (e.g., distinguishing the noun vs. verb form of "record"), and maps them to the compiled Brain. Unmapped words are safely wrapped in `[brackets]` for auditing.
\`\`\`bash
node scripts/translator.js <input_file.txt> [output_file.txt]
\`\`\`

---

## 🕸 Command Reference: Graphing & Visualization

### `etym-graph [target] [options]`
Calculates the evolutionary relationships of your dictionary and exports them as a Directed Acyclic Graph (DAG) to `etym_graph.json`. Binds matching historical roots together to form massive etymological clusters.

### `etym-visualize [json_file]`
Transforms the JSON graph output into a `.md` file containing a Mermaid.js syntax block, allowing you to instantly render the etymological family tree natively in VS Code, GitHub, or Mermaid Live.

---

## ⚙️ Data Architecture: The "Stanza"

The toolkit parses stanzas by identifying the first URL as an anchor point:

* **Origin Line:** Contains bracketed language tags like `[L]` or `[ML]`.
* **Reference Line:** The source word/phrase (e.g., `to animate [ME]`). Located at `URL_INDEX - 2`.
* **Reformed Line:** The target spelling, POS, and derivative metadata (e.g., `animait (v) -s, -ed, -ing`). Located at `URL_INDEX - 1`.
* **URLs:** One or more links starting with `http`, marking the end of the metadata.