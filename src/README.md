# Etym-Toolkit: Inglisce Dictionary CLI

A specialized Bash-based toolkit for managing, auditing, and exporting the **Inglisce Etymological Dictionary**. This library provides high-level functions to parse multi-layered stanzas, resolve grammatical derivatives, trace linguistic evolution, and export structured data.

---

## 📁 Repository Structure

* **`data-text/inglisce/dictionary/`**: Core data organized by alphabetical subdirectories (e.g., `a/animate.txt`).
* **`src/etym-lib.sh`**: The "Toolbelt" containing core logic for word extraction, display, and JSON compilation.
* **`src/config/env.sh`**: Central configuration for paths, shared Regex patterns, and utility functions.
* **`src/config/*.tsv`**: Lookup tables for mapping codes to full names (Languages and POS).

---

## 🚀 Installation & Setup

To activate the toolkit in your current terminal session, source the library:

```bash
source src/etym-lib.sh
```

**Dependencies:** The toolkit includes a boot-time check for `jq`. It is strictly required for the `etym-export` function to compile JSON objects. If it is missing, the script will prompt you to install it automatically via `apt` (Linux) or `brew` (macOS).

---

## 🛠 Command Reference

### `etym-info <word>`
The primary lookup tool. It isolates **Primary Definitions** from complex dictionary files using a robust dual-check system.

* **Smart File Lookup:** If `<word>.txt` does not exist, the tool recursively searches its parent letter directory to find if the word exists as a derivative within a different headword file.
* **Dual-Check Logic:** It maps stanzas into memory and checks both the **Reference Line** (source word) and the **Reformed Line** (new spelling). If either matches the search term, the entry is displayed.
* **Normalization:** Automatically strips infinitives (`to `), grammatical tags `[ME]`, and suffixes (`-s`, `-ly`) during comparison to ensure high-accuracy matching.

### `etym-chain <word>`
Visualizes the evolutionary path of a word.

* **Usage:** `etym-chain speak`
* **Result:** Isolates the specific stanza for the query and prints a clean, line-by-line descent from its oldest origin down to its modern Inglisce form, mapping language tags to their full names along the way.

### `etym-export <word>`
A data-pipeline tool that parses a word's evolutionary stanza and compiles it into a highly structured JSON array.

* **Smart Resolution:** Automatically calculates base forms and resolves trailing suffixes (e.g., `-ed`, `-ing`, `-ly`) into full words.
* **Verb Conjugations:** Calculates present, past, past participle, and present participle forms. It handles complex parenthetical syntax like `spiec(s` flawlessly.
* **Noun Declensions:** Smart-strips vowels (handling `-ie` and `-e` endings) to generate accurate plural forms.
* **Adjective Derivations:** Automatically sorts suffixes into adverbs (`-ly`, `-y`) and nouns (`-ness`).
* **Output:** Returns a minified, syntax-validated JSON object containing the word's name, etymology array, and URL sources.

### `etym-summarize [folder/path]`
A statistical auditor for your linguistic data.

* **Usage:** `etym-summarize a` (folder-specific) or `etym-summarize` (full dictionary).
* **Result:** Displays a ranked list of Part of Speech frequency, mapped to their full names (e.g., `75 | verb (v)`).

### `etym-cat <word>`
A debugging tool that breaks a dictionary file into numbered stanzas for manual auditing.

### `etym-find <query>`
A recursive search tool used to find every instance of a language tag (e.g., `[OE]`) or phonetic string across the entire dictionary.

---

## ⚙️ Data Architecture: The "Stanza"
The toolkit parses stanzas by identifying the first URL as an anchor point:

1. **Origin Line:** Contains bracketed language tags like `[L]` or `[ML]`.
2. **Reference Line:** The source word/phrase (e.g., `to animate [ME]`). Located at `URL_INDEX - 2`.
3. **Reformed Line:** The target spelling, POS, and derivative metadata (e.g., `animait (v) -s, -ed, -ing`). Located at `URL_INDEX - 1`.
4. **URLs:** One or more links starting with `http`, marking the end of the metadata.

### Shared Regex (`env.sh`)
* **RE_LANG_TAG:** `\[[A-Z]+\]` (Matches `[OE]`, `[L]`, etc.)
* **RE_POS:** `\(([^)]+)\)\s*$` (Matches POS at the end of a line)
* **RE_INFINITIVE:** `^to\s+` (Used to normalize verbs)

---

## 📝 Configuration & Tables
Edit these files in `src/config/` to expand metadata:

* **`languages.tsv`**: Map codes (`L`, `ME`) to full names (`Latin`, `Middle English`).
* **`parts-of-speech.tsv`**: Map tags (`v`, `m n`) to full descriptions (`verb`, `masculine noun`).