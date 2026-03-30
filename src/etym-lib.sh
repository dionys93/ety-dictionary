#!/bin/bash

# --- 1. BOOTSTRAP CONFIG etym-lib.sh---
# This ensures the library knows where the project is
export ETYM_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ETYM_LIB_DIR/config/env.sh"
echo "etym-lib has been sourced"

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
    
    # 1. SMART FILE LOOKUP
    # Check if word.txt exists; if not, check if it lives inside the first_letter directory
    local FILE_PATH="$DICT_DIR/$FIRST_LETTER/$WORD.txt"
    
    if [ ! -f "$FILE_PATH" ]; then
        # Fallback: Search all files in that letter's folder for the word
        FILE_PATH=$(grep -rlF "$WORD" "$DICT_DIR/$FIRST_LETTER/" | head -n 1)
    fi

    if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
        echo "Error: Word '$WORD' not found in /$FIRST_LETTER/."
        return 1
    fi

    echo "--- Primary Definitions for: $WORD ---"
    printf "%-20s | %-15s | %s\n" "INGLISCE" "POS" "ORIGIN"
    echo "------------------------------------------------------------"

    # Split by blank lines (stanzas)
    awk -v RS="" '{print $0 "\n@END@"}' "$FILE_PATH" | while read -r -d '@END@' STANZA; do
        [[ -z "${STANZA//[[:space:]]/}" ]] && continue

        mapfile -t LINES <<< "$STANZA"

        # 2. Find the Reformed Line (line before first http)
        local REFORMED_IDX=-1
        for i in "${!LINES[@]}"; do
            if [[ "${LINES[$i]}" == http* ]]; then
                REFORMED_IDX=$((i - 1))
                break
            fi
        done
        [[ $REFORMED_IDX -lt 0 ]] && continue
        local REFORMED_LINE="${LINES[$REFORMED_IDX]}"

        # 3. Find the Reference Line (line before Reformed)
        local REF_LINE=""
        if [[ $REFORMED_IDX -gt 0 ]]; then
            REF_LINE="${LINES[$((REFORMED_IDX - 1))]}"
        fi

        # 4. Clean both for matching
        local CLEAN_REFORMED=$(echo "$REFORMED_LINE" | sed -E 's/^to //; s/\[[^]]+\]//g; s/\([^)]+\)//g; s/ -[a-z]+//g' | xargs)
        local CLEAN_REF=$(echo "$REF_LINE" | sed -E 's/^to //; s/\[[^]]+\]//g; s/\([^)]+\)//g; s/ -[a-z]+//g' | xargs)

        # 5. DUAL-CHECK FILTER
        if [[ "$CLEAN_REF" != "$WORD" && "$CLEAN_REFORMED" != "$WORD" ]]; then
            continue
        fi

        # 6. Extraction for Display
        # Added 's/^to //' here so the table looks uniform
        local INGLISCE=$(echo "$REFORMED_LINE" | sed -E 's/^to //; s/\([^)]+\)//g; s/ -[a-z].*$//g; s/\[[^]]+\]//g' | xargs)
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
    local TOTAL_ENTRIES=0

    # 1. Resolve Path
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

    echo "Summarizing Entries in: $TARGET_DIR"
    echo "------------------------------------------"

    # 2. Extraction Pipeline
    # NEW LOGIC: We do NOT split by commas here. 
    # One (...) block = One entry count.
    local STATS=$(grep -rhPo "\(([a-z ]{1,5}(, [a-z ]{1,5})*)\)" "$TARGET_DIR" | \
        tr -d '()' | \
        sort | uniq -c | sort -rn)

    # 3. Display and Calculate Total
    while read -r count tag; do
        # We still look up the full name, even for combined tags like "adj, m n"
        local full_name=$(get_pos_full "$tag")
        
        printf "%7s | %-25s (%s)\n" "$count" "$full_name" "$tag"
        
        # Increment the total by the count of this specific tag group
        TOTAL_ENTRIES=$((TOTAL_ENTRIES + count))
    done <<< "$STATS"

    # 4. Footer
    echo "------------------------------------------"
    printf "%7s | %-25s\n" "$TOTAL_ENTRIES" "TOTAL STANZAS"
}