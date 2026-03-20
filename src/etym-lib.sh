#!/bin/bash

# --- 1. BOOTSTRAP CONFIG ---
# This ensures the library knows where the project is
export ETYM_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ETYM_LIB_DIR/config/env.sh"

# --- 2. THE FUNCTIONS (Your Toolbelt) ---

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


etym-find() {
    local QUERY=$1
    if [ -z "$QUERY" ]; then
        echo "Usage: etym-find <query_or_lang_tag>"
        return 1
    fi
    # Search recursively for the tag (e.g., [OE]) or word
    grep -r "$QUERY" "$DICT_DIR"
}


etym-info() {
    local WORD=$1
    local FIRST_LETTER=$(echo "${WORD:0:1}" | tr '[:upper:]' '[:lower:]')
    local FILE_PATH="$DICT_DIR/$FIRST_LETTER/$WORD.txt"

    if [ ! -f "$FILE_PATH" ]; then
        echo "Error: Word '$WORD' not found."
        return 1
    fi

    echo "--- Primary Definitions for: $WORD ---"
    printf "%-20s | %-15s | %s\n" "INGLISCE" "POS" "ORIGIN"
    echo "------------------------------------------------------------"

    # Split by blank lines (stanzas)
    awk -v RS="" '{print $0 "\n@END@"}' "$FILE_PATH" | while read -r -d '@END@' STANZA; do
        [[ -z "${STANZA//[[:space:]]/}" ]] && continue

        # 1. Locate the Reformed Line (the line before the first URL)
        local REFORMED_LINE=$(echo "$STANZA" | grep -B 1 "http" | head -1)
        
        # 2. Locate the Reference Line (the line before the Reformed Line)
        # We search the stanza for the line that appears just before the Reformed Line
        local REF_LINE=$(echo "$STANZA" | grep -B 1 "$REFORMED_LINE" | head -1)

        # 3. Clean the Reference Word (Strip 'to ' and [TAGS])
        local CLEAN_REF=$(echo "$REF_LINE" | sed -E 's/^to //; s/\[[^]]+\]//g' | xargs)

        # 4. STRICT FILTER: Does the reference match our search word?
        if [[ "$CLEAN_REF" != "$WORD" ]]; then
            continue
        fi

        # 5. Extraction & Formatting
        local INGLISCE=$(echo "$REFORMED_LINE" | sed -E 's/\([^)]+\)//g; s/ -[a-z].*$//g' | xargs)
        local LANG_CODE=$(echo "$STANZA" | grep -oP "\[\K[A-Z]+(?=\])" | head -1)
        local POS_CODE=$(echo "$REFORMED_LINE" | grep -oP "\(\K[^)]+(?=\))" | tail -1)
        
        local POS_FULL=$(get_pos_full "$POS_CODE")
        local LANG_FULL=$(get_lang_name "$LANG_CODE")

        printf "%-20s | %-15s | %s (%s)\n" "$INGLISCE" "$POS_FULL" "${LANG_FULL:-???}" "${LANG_CODE:-?}"
    done
}

etym-summarize() {
    local INPUT=$1
    local TARGET_DIR=""

    # 1. Resolve Path (Handles 'a' or '/full/path')
    if [ -z "$INPUT" ]; then
        TARGET_DIR="$DICT_DIR"
    elif [ -d "$DICT_DIR/$INPUT" ]; then
        TARGET_DIR="$DICT_DIR/$INPUT"
    else
        TARGET_DIR="$INPUT"
    fi

    if [ ! -d "$TARGET_DIR" ]; then
        echo "Error: Directory $TARGET_DIR not found."
        return 1
    fi

    echo "Summarizing Parts of Speech in: $TARGET_DIR"
    echo "------------------------------------------"

    # 2. Extraction Pipeline
    # Regex: Look for parentheses containing 1-5 lowercase chars/spaces
    # This captures (v), (f n), (adj) but ignores (s altred...)
    grep -rhPo "\(([a-z ]{1,5})\)" "$TARGET_DIR" | \
        tr -d '()' | \
        awk -F',' '{for(i=1;i<=NF;i++) {gsub(/^[ \t]+|[ \t]+$/, "", $i); print $i}}' | \
        sort | uniq -c | sort -rn | \
        while read -r count tag; do
            # 3. Lookup full name from your parts-of-speech.tsv
            local full_name=$(grep -i "^$tag[[:space:]]" "$CONFIG_DIR/parts-of-speech.tsv" | sed "s/^$tag[[:space:]]*//" | xargs)
            
            # 4. Only display if it's a valid recognized tag
            if [ -n "$full_name" ]; then
                printf "%7s | %-25s (%s)\n" "$count" "$full_name" "$tag"
            fi
        done
}