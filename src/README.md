# Etym-Toolkit: Inglisce Dictionary CLI

A specialized Bash-based toolkit for managing and auditing the **Inglisce Etymological Dictionary**. This library provides high-level functions to parse multi-layered stanzas, resolve derivatives, and perform targeted linguistic searches.

---

## 📁 Repository Structure

* **`data-text/inglisce/dictionary/`**: Core data organized by alphabetical subdirectories (e.g., `a/animate.txt`).
* **`src/etym-lib.sh`**: The "Toolbelt" containing core logic for word extraction and display.
* **`src/config/env.sh`**: Central configuration for paths, shared Regex patterns, and utility functions.
* **`src/config/*.tsv`**: Lookup tables for mapping codes to full names (Languages and POS).

---

## 🚀 Installation & Setup

To activate the toolkit in your current terminal session, source the library:

source src/etym-lib.sh

---

## 🛠 Command Reference

### `etym-info <word>`
The primary lookup tool. It isolates **Primary Definitions** from complex dictionary files using a robust dual-check system.

* **Smart File Lookup:** If `<word>.txt` does not exist, the tool recursively searches its parent letter directory to find if the word exists as a derivative within a different headword file (e.g., finding `animation` inside `animal.txt`).
* **Dual-Check Logic:** It maps stanzas into memory and checks both the **Reference Line** (source word) and the **Reformed Line** (new spelling). If either matches the search term, the entry is displayed.
* **Normalization:** Automatically strips infinitives (`to `), grammatical tags `[ME]`, and suffixes (`-s`, `-ly`) during comparison to ensure high-accuracy matching.

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

The toolkit parses stanzas by identifying the **first URL** as an anchor point:

1.  **Origin Line:** Contains bracketed language tags like `[L]` or `[ML]`.
2.  **Reference Line:** The source word/phrase (e.g., `to animate [ME]`). Located at `URL_INDEX - 2`.
3.  **Reformed Line:** The target spelling and Part of Speech (e.g., `animait (v)`). Located at `URL_INDEX - 1`.
4.  **URLs:** One or more links starting with `http`, marking the end of the metadata.

### Shared Regex (`env.sh`)
* **RE_LANG_TAG:** `\[[A-Z]+\]` (Matches `[OE]`, `[L]`, etc.)
* **RE_POS:** `\(([^)]+)\)\s*$` (Matches POS at the end of a line)
* **RE_INFINITIVE:** `^to\s+` (Used to normalize verbs)

---

## 📝 Configuration & Tables

Edit these files in `src/config/` to expand metadata:
* **`languages.tsv`**: Map codes (`L`, `ME`) to full names (`Latin`, `Middle English`).
* **`parts-of-speech.tsv`**: Map tags (`v`, `m n`) to full descriptions (`verb`, `masculine noun`).