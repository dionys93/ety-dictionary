#!/bin/bash

# --- 1. BOOTSTRAP CONFIG ---
# This ensures the library knows where the project is
export ETYM_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ETYM_LIB_DIR/config/env.sh"

# --- 2. THE FUNCTIONS (Your Toolbelt) ---

# Replaces your old 'concat' and 'parseStanzas'
etym-cat() {
    local WORD=$1
    if [ -z "$WORD" ]; then
        echo "Usage: etym-cat <word>"
        return 1
    fi

    local FIRST_LETTER=$(echo "${WORD:0:1}" | tr '[:upper:]' '[:lower:]')
    local FILE_PATH="$DICT_DIR/$FIRST_LETTER/$WORD.txt"

    if [ -f "$FILE_PATH" ]; then
        # -v RS="" treats double-newlines as stanza separators
        awk -v RS="" '{ print "Stanza " NR ":\n" $0 "\n" }' "$FILE_PATH"
    else
        echo "Error: '$WORD' not found."
        return 1
    fi
}

# Replaces your old 'list' and directory crawling
etym-find() {
    local QUERY=$1
    if [ -z "$QUERY" ]; then
        echo "Usage: etym-find <query_or_lang_tag>"
        return 1
    fi
    # Search recursively for the tag (e.g., [OE]) or word
    grep -r "$QUERY" "$DICT_DIR"
}

# New utility: Show full language and POS for a word
etym-info() {
    local WORD=$1
    local CONTENT=$(etym-cat "$WORD" 2>/dev/null)
    
    if [ -z "$CONTENT" ]; then return 1; fi

    # Extract tags using the regex from env.sh
    local LANG_CODE=$(echo "$CONTENT" | grep -oP "\[\K[A-Z]+(?=\])" | head -1)
    local POS_CODE=$(echo "$CONTENT" | grep -oP "\(\K[^)]+(?=\))" | head -1)

    echo "Word: $WORD"
    echo "Origin: $(get_lang_name $LANG_CODE) ($LANG_CODE)"
    echo "Part of Speech: $(get_pos_full "$POS_CODE") ($POS_CODE)"
}