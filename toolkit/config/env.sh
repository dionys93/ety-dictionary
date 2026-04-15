#!/bin/bash

# --- PATH CONFIGURATION env.sh---
# Automatically detects the project root based on this file's location
export CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT="$(cd "$CONFIG_DIR/../.." && pwd)"

# Data Directories
export DICT_DIR="$PROJECT_ROOT/data-text/inglisce/dictionary"
export HISTORIES_DIR="$PROJECT_ROOT/data-text/histories"
export ANALYSIS_DIR="$PROJECT_ROOT/analysis"

# Language identity for untagged/reformed entries
export DICT_PROJECT_NAME="Inglisce"

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
    # This searches for the code at the start of the line, 
    # followed by any whitespace, then grabs everything after that whitespace.
    grep -i "^$1[[:space:]]" "$CONFIG_DIR/languages.tsv" | sed "s/^$1[[:space:]]*//"
}

get_pos_full() {
    local INPUT=$1
    # Strip parentheses and normalize: "(adj, m n)" -> "adj, m n"
    local CLEAN_INPUT=$(echo "$INPUT" | tr -d '()')
    
    # Split by comma into an array
    IFS=',' read -ra TAGS <<< "$CLEAN_INPUT"
    
    local RESULTS=()
    for tag in "${TAGS[@]}"; do
        # Trim whitespace (the 'xargs' trick)
        local trimmed=$(echo "$tag" | xargs)
        
        # Search for the exact code at the start of the line in parts-of-speech.tsv
        # We use [[:space:]] to ensure 'v' doesn't match 'verb' or 'adv'
        local match=$(grep -i "^$trimmed[[:space:]]" "$CONFIG_DIR/parts-of-speech.tsv" | sed "s/^$trimmed[[:space:]]*//")
        
        if [ -n "$match" ]; then
            RESULTS+=("$match")
        else
            # Fallback to the original tag if not found in TSV
            RESULTS+=("$trimmed")
        fi
    done

    # Join results with ", "
    (IFS=", "; echo "${RESULTS[*]}")
}
