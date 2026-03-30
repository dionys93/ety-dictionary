#!/bin/bash

# --- 1. BOOTSTRAP CONFIG etym-lib.sh---
# This ensures the library knows where the project is
export ETYM_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ETYM_LIB_DIR/config/env.sh"
echo "etym-lib has been sourced"

# --- 2 DEPENDENCY CHECK ---
if ! command -v jq &> /dev/null; then
    echo "⚠️  Dependency Missing: 'jq' is required for JSON export functions."
    read -p "Would you like to install it now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo apt update && sudo apt install -y jq
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            brew install jq
        else
            echo "Unsupported OS. Please install 'jq' manually."
        fi
    else
        echo "Proceeding without 'jq'. Some functions (etym-export) will be disabled."
    fi
fi

# --- 3. THE FUNCTIONS (Your Toolbelt) ---

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
    local TOTAL_STANZAS=0

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

    echo "Summarizing Parts of Speech in: $TARGET_DIR"
    echo "------------------------------------------"

    # 2. Extraction Pipeline
    # Step A: Find all (...) blocks
    # Step B: Take only the FIRST tag if multiple exist (e.g., "adj, m n" -> "adj")
    # Step C: Count frequencies
    local STATS=$(grep -rhPo "\(([a-z ]{1,5}(, [a-z ]{1,5})*)\)" "$TARGET_DIR" | \
        tr -d '()' | \
        awk -F',' '{print $1}' | \
        sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | \
        sort | uniq -c | sort -rn)

    # 3. Display and Calculate Total
    while read -r count tag; do
        # Lookup full name for the primary tag
        local full_name=$(grep -i "^$tag[[:space:]]" "$CONFIG_DIR/parts-of-speech.tsv" | sed "s/^$tag[[:space:]]*//" | xargs)
        
        if [ -n "$full_name" ]; then
            printf "%7s | %-25s (%s)\n" "$count" "$full_name" "$tag"
            TOTAL_STANZAS=$((TOTAL_STANZAS + count))
        fi
    done <<< "$STATS"

    # 4. Footer
    echo "------------------------------------------"
    printf "%7s | %-25s\n" "$TOTAL_STANZAS" "TOTAL STANZAS"
}


etym-chain() {
    local WORD=$1
    local FIRST_LETTER=$(echo "${WORD:0:1}" | tr '[:upper:]' '[:lower:]')
    local FILE_PATH="$DICT_DIR/$FIRST_LETTER/$WORD.txt"

    if [ ! -f "$FILE_PATH" ]; then
        FILE_PATH=$(grep -rlF "$WORD" "$DICT_DIR/$FIRST_LETTER/" | head -n 1)
    fi

    if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
        echo "Error: Word '$WORD' not found."
        return 1
    fi

    echo "--- Evolutionary Chain for: $WORD ---"

    awk -v RS="" '{print $0 "\n@END@"}' "$FILE_PATH" | while read -r -d '@END@' STANZA; do
        [[ -z "${STANZA//[[:space:]]/}" ]] && continue

        mapfile -t LINES <<< "$STANZA"

        # Check if this stanza belongs to the requested word
        local IS_MATCH=0
        for line in "${LINES[@]}"; do
            if [[ "$line" == http* ]]; then break; fi
            local CLEAN_LINE=$(echo "$line" | sed -E 's/^to //; s/\[[^]]+\]//g; s/\([^)]+\)//g; s/ -[a-z]+//g; s/,.*//g' | xargs)
            if [[ "$CLEAN_LINE" == "$WORD" ]]; then
                IS_MATCH=1
                break
            fi
        done

        [[ $IS_MATCH -eq 0 ]] && continue

        # Print the chain
        for line in "${LINES[@]}"; do
            if [[ "$line" == http* ]]; then break; fi
            
            local LANG_TAG=$(echo "$line" | grep -oP '\[\K[A-Z]+(?=\])')
            local LANG_FULL=$(get_lang_name "$LANG_TAG")
            local CLEAN_TEXT=$(echo "$line" | sed -E 's/\[[^]]+\]//g' | xargs)
            
            printf " ↳ %-30s | %s\n" "$CLEAN_TEXT" "${LANG_FULL:-Unknown}"
        done
        echo "------------------------------------------------------------"
    done
}


etym-export() {
    local WORD=$1
    local FIRST_LETTER=$(echo "${WORD:0:1}" | tr '[:upper:]' '[:lower:]')
    local FILE_PATH="$DICT_DIR/$FIRST_LETTER/$WORD.txt"

    if [ ! -f "$FILE_PATH" ]; then
        FILE_PATH=$(grep -rlF "$WORD" "$DICT_DIR/$FIRST_LETTER/" | head -n 1)
    fi

    if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
        # Return empty JSON on fail
        echo "{}" 
        return 1
    fi

    awk -v RS="" '{print $0 "\n@END@"}' "$FILE_PATH" | while read -r -d '@END@' STANZA; do
        [[ -z "${STANZA//[[:space:]]/}" ]] && continue
        mapfile -t LINES <<< "$STANZA"

        # Validate Match
        local IS_MATCH=0
        for line in "${LINES[@]}"; do
            if [[ "$line" == http* ]]; then break; fi
            local CLEAN_LINE=$(echo "$line" | sed -E 's/^to //; s/\[[^]]+\]//g; s/\([^)]+\)//g; s/ -[a-z]+//g; s/,.*//g' | xargs)
            if [[ "$CLEAN_LINE" == "$WORD" ]]; then IS_MATCH=1; break; fi
        done

        [[ $IS_MATCH -eq 0 ]] && continue

        # Initialize JSON arrays
        local ETYM_JSON="[]"
        local SOURCES_JSON="[]"

        # Process Stanza
        for line in "${LINES[@]}"; do
            if [[ "$line" == http* ]]; then
                # Append to Sources Array
                SOURCES_JSON=$(echo "$SOURCES_JSON" | jq --arg url "$line" '. + [$url]')
            else
                # Extract Metadata
                local LANG_TAG=$(echo "$line" | grep -oP '\[\K[A-Z]+(?=\])')
                local LANG_FULL=$(get_lang_name "$LANG_TAG")
                local POS_TAG=$(echo "$line" | grep -oP '\(\K[^)]+(?=\))')
                local POS_FULL=$(get_pos_full "$POS_TAG")
                
                # Clean text of tags
                local CLEAN_TEXT=$(echo "$line" | sed -E 's/\[[^]]+\]//g; s/\([^)]+\)//g' | xargs)
                
                # Build Line Object
                # If POS exists, split it by commas into a JSON array, otherwise omit it.
                local LINE_OBJ=$(jq -n \
                    --arg name "$CLEAN_TEXT" \
                    --arg origin "${LANG_FULL:-Unknown}" \
                    --arg pos "$POS_FULL" \
                    '{
                        name: $name, 
                        origin: $origin
                    } + if ($pos | length > 0) then {"part-of-speech": ($pos | split(", "))} else {} end')
                    
                ETYM_JSON=$(echo "$ETYM_JSON" | jq --argjson obj "$LINE_OBJ" '. + [$obj]')
            fi
        done

        # Construct Final JSON object and pretty-print it
        jq -n \
            --arg name "$WORD" \
            --argjson etymology "$ETYM_JSON" \
            --argjson sources "$SOURCES_JSON" \
            '{name: $name, etymology: $etymology, sources: $sources}'
            
        # Break after finding the first valid matching stanza 
        # (Remove this break if a word has multiple distinct dictionary entries you want to export together)
        break 
    done
}