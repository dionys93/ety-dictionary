#!/bin/bash

# --- PATH CONFIGURATION ---
# Automatically detects the project root based on this file's location
export CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT="$(cd "$CONFIG_DIR/../.." && pwd)"

# Data Directories
export DICT_DIR="$PROJECT_ROOT/data-text/inglisce/dictionary"
export ANALYSIS_DIR="$PROJECT_ROOT/analysis"

# --- REGEX PATTERNS ---
export RE_WORD='^([\w\x80-\xff]+)'        # Matches letters and extended Latin
export RE_LANG_TAG='\[[A-Z]+\]'           # Matches [OE], [ME], etc.
export RE_POS='\(([^)]+)\)\s*$'           # Matches POS at end of line like (v)
export RE_INFINITIVE='^to\s+'             # Matches leading "to "

# --- UTILITIES ---

strip_ext() {
    echo "${1%.*}"
}

swap_ext() {
    local filename=$1
    local new_ext=$2
    echo "${filename%.*}.${new_ext#.}"
}

# --- LOOKUP FUNCTIONS ---

get_lang_name() {
    grep "^$1	" "$CONFIG_DIR/languages.tsv" | cut -f2
}

get_pos_full() {
    grep "^$1	" "$CONFIG_DIR/pos.tsv" | cut -f2
}

# --- INITIALIZATION ---
# Ensures required directories exist
setup_project() {
    mkdir -p "$DICT_DIR"
    mkdir -p "$ANALYSIS_DIR"
    echo "Environment initialized at $PROJECT_ROOT"
}