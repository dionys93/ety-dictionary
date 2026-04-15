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
    local FILE_PATH="$DICT_DIR/$FIRST_LETTER/$WORD.txt"
    if [ ! -f "$FILE_PATH" ]; then
        FILE_PATH=$(grep -rlF "$WORD" "$DICT_DIR/$FIRST_LETTER/" | head -n 1)
    fi

    if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
        echo "Error: Word '$WORD' not found in /$FIRST_LETTER/."
        return 1
    fi

    echo "--- Primary Definitions for: $WORD ---"
    # Widened the POS column to handle long compound tags like 'adjective, masculine noun'
    printf "%-20s | %-30s | %s\n" "INGLISCE" "PART OF SPEECH" "ORIGIN"
    echo "---------------------------------------------------------------------------------"

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

        # 4. Strict Isolation of the Core Word (Strips 'to ', tags, and takes only the first word)
        local CLEAN_REFORMED=$(echo "$REFORMED_LINE" | sed -E 's/\[[^]]+\]//g; s/\([^)]+\)//g' | xargs | sed -E 's/^to //' | cut -d' ' -f1 | tr -d ',')
        local CLEAN_REF=$(echo "$REF_LINE" | sed -E 's/\[[^]]+\]//g; s/\([^)]+\)//g' | xargs | sed -E 's/^to //' | cut -d' ' -f1 | tr -d ',')

        # 5. DUAL-CHECK FILTER
        if [[ "$CLEAN_REF" != "$WORD" && "$CLEAN_REFORMED" != "$WORD" ]]; then
            continue
        fi

        # 6. Extraction for Display
        local INGLISCE="$CLEAN_REFORMED"
        local LANG_CODE=$(echo "$STANZA" | grep -oP "\[\K[A-Z]+(?=\])" | head -1)
        
        # Strict POS Regex: Only grabs standard tags, ignores malformed conjugation lists inside parens
        local POS_CODE=$(echo "$REFORMED_LINE" | grep -oP "\(\K[a-z ]{1,5}(, [a-z ]{1,5})*(?=\))" | tail -1)
        
        local POS_FULL=""
        if [[ -n "$POS_CODE" ]]; then
            POS_FULL=$(get_pos_full "$POS_CODE")
            # Add a visual space after commas for readability (e.g., "adjective, masculine noun")
            POS_FULL=$(echo "$POS_FULL" | sed 's/,/, /g')
        else
            POS_FULL="Unknown/Malformed"
        fi
        
        local LANG_FULL=$(get_lang_name "$LANG_CODE")

        printf "%-20s | %-30s | %s (%s)\n" "$INGLISCE" "$POS_FULL" "${LANG_FULL:-???}" "${LANG_CODE:-?}"
    done
}


etym-summarize() {
    local FORMAT="text"
    local OUT_FILE=""
    local TARGET_INPUT=""

    # 1. Parse Arguments (--json, -o/--out)
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --json) FORMAT="json"; shift ;;
            -o|--out) OUT_FILE="$2"; shift 2 ;;
            *) 
                if [[ -z "$TARGET_INPUT" ]]; then
                    TARGET_INPUT="$1"
                fi
                shift 
                ;;
        esac
    done

    # 2. Resolve Path
    local TARGET_DIR=""
    if [ -z "$TARGET_INPUT" ]; then
        TARGET_DIR="$DICT_DIR"
    elif [ -d "$DICT_DIR/$TARGET_INPUT" ]; then
        TARGET_DIR="$DICT_DIR/$TARGET_INPUT"
    else
        TARGET_DIR="$TARGET_INPUT"
    fi

    if [ ! -d "$TARGET_DIR" ]; then
        echo "Error: Directory $TARGET_DIR not found."
        return 1
    fi

    # 3. Data Extraction Pipeline
    local POS_STATS=$(grep -rhv "http" "$TARGET_DIR" | \
        grep -Po "\(([a-z ]{1,5}(, [a-z ]{1,5})*)\)" | \
        tr -d '()' | \
        awk -F',' '{print $1}' | \
        sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | \
        sort | uniq -c | sort -rn)

    local LANG_STATS=$(grep -rhv "http" "$TARGET_DIR" | \
        grep -Po "\[[A-Z]+\]" | \
        tr -d '[]' | \
        sort | uniq -c | sort -rn)

    # Cross-Tabulation Pipeline: Links POS and LANG on a per-file basis
    local CROSS_DATA=$(find "$TARGET_DIR" -type f -exec awk '
        FNR==1 {
            if (pos != "" && lang != "") print pos "|" lang
            pos = ""; lang = ""
        }
        !/http/ {
            if (pos == "" && match($0, /\(([a-z ]{1,5}(, [a-z ]{1,5})*)\)/)) {
                pos = substr($0, RSTART+1, RLENGTH-2)
                sub(/,.*/, "", pos)
                sub(/^[ \t]+/, "", pos)
                sub(/[ \t]+$/, "", pos)
            }
            if (lang == "" && match($0, /\[[A-Z]+\]/)) {
                lang = substr($0, RSTART+1, RLENGTH-2)
            }
        }
        END {
            if (pos != "" && lang != "") print pos "|" lang
        }
    ' {} + 2>/dev/null | sort | uniq -c | sort -rn)

    # 4. Format Output
    local OUTPUT=""

    if [[ "$FORMAT" == "json" ]]; then
        local POS_JSON=$(echo "$POS_STATS" | while read -r count tag; do
            [[ -z "$count" ]] && continue
            local full_name=$(grep -i "^$tag[[:space:]]" "$CONFIG_DIR/parts-of-speech.tsv" 2>/dev/null | sed "s/^$tag[[:space:]]*//" | xargs)
            printf '{"tag": "%s", "name": "%s", "count": %d}\n' "$tag" "${full_name:-Unknown}" "$count"
        done | jq -s '.')

        local LANG_JSON=$(echo "$LANG_STATS" | while read -r count tag; do
            [[ -z "$count" ]] && continue
            local full_name=$(get_lang_name "$tag")
            printf '{"tag": "%s", "name": "%s", "count": %d}\n' "$tag" "${full_name:-Unknown}" "$count"
        done | jq -s '.')

        local CROSS_JSON=$(echo "$CROSS_DATA" | while read -r count pos_lang; do
            [[ -z "$count" ]] && continue
            local pos="${pos_lang%|*}"
            local lang="${pos_lang#*|}"
            printf '{"pos": "%s", "lang": "%s", "count": %d}\n' "$pos" "$lang" "$count"
        done | jq -s '.')

        OUTPUT=$(jq -n \
            --arg dir "$TARGET_DIR" \
            --argjson pos "${POS_JSON:-[]}" \
            --argjson lang "${LANG_JSON:-[]}" \
            --argjson cross "${CROSS_JSON:-[]}" \
            '{directory: $dir, parts_of_speech: $pos, languages: $lang, cross_tabulation: $cross}')
    else
        OUTPUT+="Summarizing Data in: $TARGET_DIR\n"
        OUTPUT+="=================================================================\n"
        
        # --- Print Parts of Speech ---
        OUTPUT+="PARTS OF SPEECH\n"
        OUTPUT+="-----------------------------------------------------------------\n"
        local TOTAL_POS=0
        while read -r count tag; do
            [[ -z "$count" ]] && continue
            local full_name=$(grep -i "^$tag[[:space:]]" "$CONFIG_DIR/parts-of-speech.tsv" 2>/dev/null | sed "s/^$tag[[:space:]]*//" | xargs)
            
            local line=$(printf "%7s | %-25s (%s)" "$count" "${full_name:-Unknown}" "$tag")
            OUTPUT+="$line\n"
            TOTAL_POS=$((TOTAL_POS + count))
        done <<< "$POS_STATS"
        OUTPUT+="-----------------------------------------------------------------\n"
        OUTPUT+=$(printf "%7s | %-25s\n\n" "$TOTAL_POS" "TOTAL POS TAGS")

        # --- Print Languages ---
        OUTPUT+="LANGUAGE ORIGINS\n"
        OUTPUT+="-----------------------------------------------------------------\n"
        local TOTAL_LANG=0
        while read -r count tag; do
            [[ -z "$count" ]] && continue
            local full_name=$(get_lang_name "$tag")
            
            local line=$(printf "%7s | %-25s [%s]" "$count" "${full_name:-Unknown}" "$tag")
            OUTPUT+="$line\n"
            TOTAL_LANG=$((TOTAL_LANG + count))
        done <<< "$LANG_STATS"
        OUTPUT+="-----------------------------------------------------------------\n"
        OUTPUT+=$(printf "%7s | %-25s\n\n" "$TOTAL_LANG" "TOTAL LANG TAGS")

        # --- Print Cross-Tabulation Matrix ---
        OUTPUT+="CROSS-TABULATION (Top 5 POS x Top 5 LANG)\n"
        OUTPUT+="-----------------------------------------------------------------\n"
        
        # Extract Top 5 arrays safely
        local TOP_LANGS=($(echo "$LANG_STATS" | head -n 5 | awk '{print $2}'))
        local TOP_POS=()
        while read -r count pos; do
            [[ -z "$count" ]] && continue
            TOP_POS+=("$pos")
            [[ ${#TOP_POS[@]} -ge 5 ]] && break
        done <<< "$POS_STATS"

        # Build Matrix Header
        local header=$(printf "%-18s" "POS \ LANG")
        for lang in "${TOP_LANGS[@]}"; do
            header+=$(printf "| %-7s " "$lang")
        done
        OUTPUT+="$header\n"
        OUTPUT+="-----------------------------------------------------------------\n"

        # Build Matrix Rows
        for pos in "${TOP_POS[@]}"; do
            local row=$(printf "%-18s" "$pos")
            for lang in "${TOP_LANGS[@]}"; do
                # Exact string matching against the format " [count] [pos]|[lang]$"
                local val=$(echo "$CROSS_DATA" | awk -v p="$pos" -v l="$lang" '
                    $0 ~ ("[[:space:]]" p "\\|" l "$") { print $1 }
                ')
                row+=$(printf "| %-7s " "${val:-0}")
            done
            OUTPUT+="$row\n"
        done
        OUTPUT+="-----------------------------------------------------------------\n"
    fi

    # 5. Output Routing
    if [[ -n "$OUT_FILE" ]]; then
        echo -e "$OUTPUT" > "$OUT_FILE"
        echo "✅ Summary successfully written to $OUT_FILE"
    else
        echo -e "$OUTPUT"
    fi
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

    # Dynamically extract the reform name from the directory chain (e.g., .../inglisce/dictionary -> Inglisce)
    local REFORM_DIR=$(basename "$(dirname "$DICT_DIR")")
    local REFORM_NAME="$(tr '[:lower:]' '[:upper:]' <<< ${REFORM_DIR:0:1})${REFORM_DIR:1}"
    
    # Use DICT_PROJECT_NAME if set in env.sh, otherwise fallback to the capitalized directory name
    local FINAL_REFORM_NAME="${DICT_PROJECT_NAME:-$REFORM_NAME}"

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
            
            # Swap out 'Unknown' for the dynamically extracted reform name
            printf " ↳ %-30s | %s\n" "$CLEAN_TEXT" "${LANG_FULL:-$FINAL_REFORM_NAME}"
        done
        echo "------------------------------------------------------------"
    done
}


etym-cognates() {
    local QUERY=$1
    if [ -z "$QUERY" ]; then
        echo "Usage: etym-cognates <root_word_or_phrase>"
        return 1
    fi

    echo "--- Modern Cognates for: $QUERY ---"

    # Stream the entire dictionary through awk
    find "$DICT_DIR" -type f -name "*.txt" -print0 | xargs -0 awk -v query="$QUERY" -v dict_dir="$DICT_DIR/" '
        BEGIN { 
            RS=""         # Paragraph mode (stanzas)
            FS="\n"       # Line separation within stanzas
            IGNORECASE=1  # Case-insensitive search
        }
        
        # Trigger ONLY if the stanza contains the search query
        $0 ~ query {
            reformed_idx = 0
            
            # Find the Reformed Line (the line right before the first URL)
            for (i=1; i<=NF; i++) {
                if ($i ~ /^http/) { 
                    reformed_idx = i - 1; 
                    break; 
                }
            }
            
            if (reformed_idx > 0) {
                ref_line = $reformed_idx
                
                # Extract POS tag exactly as written (e.g., "(v)" or "(m n)")
                pos_tag = ""
                if (match(ref_line, /\(([a-z ]+(, [a-z ]+)*)\)/)) {
                    pos_tag = substr(ref_line, RSTART, RLENGTH)
                }
                
                # Clean the line to isolate the modern Inglisce word
                temp_line = ref_line
                gsub(/\[[^\]]+\]/, "", temp_line)       # Strip language tags [LANG]
                gsub(/\([^)]+\)/, "", temp_line)        # Strip POS tags (pos)
                sub(/^[ \t]+|[ \t]+$/, "", temp_line)   # Trim whitespace
                sub(/^[tT][oO][ \t]+/, "", temp_line)   # Strip infinitive "to "
                
                # Grab the first word, stripping out commas and conjugations
                split(temp_line, words, " ")
                target = words[1]
                gsub(/,$/, "", target) 
                
                if (target != "") {
                    # Strip the absolute path to make the output clean (e.g., "a/animate.txt")
                    rel_file = FILENAME
                    sub(dict_dir, "", rel_file)
                    
                    # Print formatted output
                    printf "  ↳ %-25s %-12s [from %s]\n", target, pos_tag, rel_file
                }
            }
        }
    ' | sort -u # Sort alphabetically and remove any duplicate hits
    
    echo "------------------------------------------------------------"
}


etym-affix() {
    local AFFIX_TYPE="suffix"
    local AFFIX_LEN=3
    local FILTER_POS=""
    local FILTER_LANG=""
    local TARGET_INPUT=""

    # 1. Parse Arguments
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --prefix) AFFIX_TYPE="prefix"; shift ;;
            --suffix) AFFIX_TYPE="suffix"; shift ;;
            -n|--length) AFFIX_LEN="$2"; shift 2 ;;
            -p|--pos) FILTER_POS=$(echo "$2" | tr '[:upper:]' '[:lower:]'); shift 2 ;;
            -l|--lang) FILTER_LANG=$(echo "$2" | tr '[:lower:]' '[:upper:]'); shift 2 ;;
            *) 
                if [[ -z "$TARGET_INPUT" ]]; then
                    TARGET_INPUT="$1"
                fi
                shift 
                ;;
        esac
    done

    # 2. Resolve Path
    local TARGET_PATH=""
    if [ -z "$TARGET_INPUT" ]; then
        TARGET_PATH="$DICT_DIR"
    elif [ -e "$DICT_DIR/$TARGET_INPUT" ]; then
        TARGET_PATH="$DICT_DIR/$TARGET_INPUT"
    elif [ -e "$TARGET_INPUT" ]; then
        TARGET_PATH="$TARGET_INPUT"
    else
        echo "Error: Target path '$TARGET_INPUT' not found."
        return 1
    fi

    echo "Morphological Analysis: $AFFIX_TYPE ($AFFIX_LEN letters)"
    [[ -n "$FILTER_POS" ]] && echo "Filter POS:  $FILTER_POS"
    [[ -n "$FILTER_LANG" ]] && echo "Filter LANG: $FILTER_LANG"
    echo "================================================================="

    # 3. Stream data into Awk for Analysis
    find "$TARGET_PATH" -type f -name "*.txt" -print0 | xargs -0 cat | awk -v a_type="$AFFIX_TYPE" -v a_len="$AFFIX_LEN" -v f_pos="$FILTER_POS" -v f_lang="$FILTER_LANG" '
        BEGIN { 
            RS=""       
            FS="\n"     
            
            # POS Dictionary for accurate filtering
            pos_map["m n"]="masculine noun"; pos_map["f n"]="feminine noun";
            pos_map["n"]="noun"; pos_map["v"]="verb";
            pos_map["intr v"]="intransitive verb"; pos_map["tr v"]="transitive verb";
            pos_map["conj"]="conjunction"; pos_map["adj"]="adjective";
            pos_map["prep"]="preposition"; pos_map["pron"]="pronoun";
            pos_map["adv"]="adverb"; pos_map["suff"]="suffix";
            pos_map["pref"]="prefix"; pos_map["interj"]="interjection";
            pos_map["obs"]="obsolete";
            
            total_words = 0
        }
        
        {
            pos = ""; verbose_pos = ""; lang = ""; target = "";

            # Extract Primary Language tag [LANG]
            for (i=1; i<=NF; i++) {
                if ($i !~ /http/ && match($i, /\[[A-Z]+\]/)) {
                    lang = substr($i, RSTART+1, RLENGTH-2)
                    break
                }
            }

            # Extract POS and Target Word
            for (i=1; i<=NF; i++) {
                if ($i !~ /http/ && match($i, /\(([a-z ]+(, [a-z ]+)*)\)/)) {
                    
                    pos = substr($i, RSTART+1, RLENGTH-2)
                    sub(/,.*/, "", pos) 
                    
                    if (pos in pos_map) {
                        verbose_pos = pos_map[pos]
                    } else {
                        verbose_pos = pos 
                    }
                    
                    temp_line = $i
                    sub(/^[ \t]+/, "", temp_line)  
                    sub(/^to[ \t]+/, "", temp_line) 
                    sub(/\(([a-z ]+(, [a-z ]+)*)\)/, "", temp_line) 
                    
                    split(temp_line, words, " ")   
                    target = words[1]              
                    gsub(/,$/, "", target)
                    break
                }
            }

            # Filters
            if (target == "") next;
            if (f_pos != "" && index(verbose_pos, f_pos) == 0) next;
            if (f_lang != "" && lang != f_lang) next;

            # Affix Isolation
            if (length(target) >= a_len) {
                target_lower = tolower(target)
                if (a_type == "prefix") {
                    affix = substr(target_lower, 1, a_len) "-"
                } else {
                    affix = "-" substr(target_lower, length(target_lower) - a_len + 1)
                }
                
                freq[affix]++
                total_words++
            }
        }
        
        END {
            if (total_words == 0) {
                print "No words matched the criteria."
                exit
            }
            
            printf "%-15s | %-10s | %s\n", "AFFIX", "COUNT", "PERCENTAGE"
            print "-----------------------------------------------------------------"
            
            # Sort array by frequency (requires GNU awk extension or piping to sort)
            # To ensure macOS/Linux compatibility, we dump to stdout and let Bash sort it
            for (a in freq) {
                pct = (freq[a] / total_words) * 100
                printf "%-15s | %-10d | %0.2f%%\n", a, freq[a], pct
            }
        }
    ' | sed -n '1,2p; 3,$p' | awk 'NR<=2 {print; next} {print | "sort -k3 -nr"}' | head -n 22

    # Output Summary
    # (Extract total words by summing the count column of the raw awk output, 
    # but since we already printed the table, we just let the table speak for itself.)
    echo "================================================================="
}


etym-export() {
    if ! command -v jq &> /dev/null; then echo "Error: 'jq' not installed."; return 1; fi

    # Helper function to dynamically build words from suffixes or pass full forms
    _resolve_form() {
        local form="$1" base="$2" ing_base="$3" is_ing="$4"
        if [[ "$form" == -* ]]; then
            if [[ "$is_ing" == "1" ]]; then
                echo "${ing_base}${form#-}"
            else
                echo "${base}${form#-}"
            fi
        else
            echo "$form" | tr -d '('
        fi
    }

    local WORD=$1
    local FIRST_LETTER=$(echo "${WORD:0:1}" | tr '[:upper:]' '[:lower:]')
    local FILE_PATH="$DICT_DIR/$FIRST_LETTER/$WORD.txt"

    if [ ! -f "$FILE_PATH" ]; then
        FILE_PATH=$(grep -rlF "$WORD" "$DICT_DIR/$FIRST_LETTER/" | head -n 1)
    fi

    if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then echo "[]"; return 1; fi

    local FINAL_ARRAY_JSON="[]"

    while read -r -d '@END@' STANZA; do
        [[ -z "${STANZA//[[:space:]]/}" ]] && continue
        mapfile -t LINES <<< "$STANZA"

        local IS_MATCH=0
        for line in "${LINES[@]}"; do
            if [[ "$line" == http* ]]; then break; fi
            local TEMP_LINE=$(echo "$line" | sed -E 's/\[[^]]+\]//g; s/\([^()]*\)\s*$//g' | xargs)
            local CORE_WORD=""
            if [[ "$TEMP_LINE" == to\ * ]]; then
                CORE_WORD=$(echo "$TEMP_LINE" | cut -d' ' -f2 | sed 's/,.*//')
            else
                CORE_WORD=$(echo "$TEMP_LINE" | cut -d' ' -f1 | sed 's/,.*//')
            fi
            if [[ "$CORE_WORD" == "$WORD" ]]; then IS_MATCH=1; break; fi
        done
        [[ $IS_MATCH -eq 0 ]] && continue

        local ETYM_JSON="[]"
        local SOURCES_JSON="[]"

        for line in "${LINES[@]}"; do
            if [[ "$line" == http* ]]; then
                SOURCES_JSON=$(echo "$SOURCES_JSON" | jq --arg url "$line" '. + [$url]')
            else
                local LANG_TAG=$(echo "$line" | grep -oP '\[\K[^\]]+(?=\])')
                local POS_TAG=$(echo "$line" | grep -oP '\(\K[^()]+(?=\)\s*$)')
                
                local LANG_FULL=$(get_lang_name "$LANG_TAG")
                local ORIGIN_NAME="${LANG_FULL:-$DICT_PROJECT_NAME}"
                local POS_FULL=""
                [[ -n "$POS_TAG" ]] && POS_FULL=$(get_pos_full "$POS_TAG")

                local CONTENT=$(echo "$line" | sed -E 's/\[[^]]+\]//g; s/\([^()]*\)\s*$//g' | xargs)

                local DISPLAY_NAME=""
                local METADATA=""
                local CONJ_OBJ="null"
                local DECL_OBJ="null"
                local DERIV_OBJ="null"

                if [[ -n "$POS_TAG" ]]; then
                    # Split Name and Metadata, stripping trailing commas from the Name
                    if [[ "$CONTENT" == to\ * ]]; then
                        DISPLAY_NAME=$(echo "$CONTENT" | cut -d' ' -f1,2 | tr -d ',')
                        METADATA=$(echo "$CONTENT" | cut -d' ' -f3-)
                    else
                        DISPLAY_NAME=$(echo "$CONTENT" | cut -d' ' -f1 | tr -d ',')
                        METADATA=$(echo "$CONTENT" | cut -d' ' -f2-)
                    fi

                    read -a PARTS <<< "$METADATA"

                    # --- VERB CONJUGATIONS ---
                    if [[ "$POS_FULL" == *"verb"* && ${#PARTS[@]} -ge 3 ]]; then
                        local BASE=$(echo "$DISPLAY_NAME" | sed 's/^to //' | xargs)
                        local ING_BASE="$BASE"; [[ "$BASE" == *e ]] && ING_BASE="${BASE%e}"
                        
                        local CLEAN_PARTS=()
                        
                        # 1. Resolve Present Tense (Index 0)
                        if [[ "${PARTS[0]}" == *'('* ]]; then
                            # Safely extract using cut to avoid Bash globbing quirks
                            local P1=$(echo "${PARTS[0]}" | cut -d'(' -f1)
                            local P3_SUF=$(echo "${PARTS[0]}" | cut -d'(' -f2 | tr -d ')')
                            CLEAN_PARTS+=("$P1" "${P1}${P3_SUF}")
                        else
                            # Standard -s suffix logic
                            CLEAN_PARTS+=("$BASE")
                            CLEAN_PARTS+=($(_resolve_form "${PARTS[0]}" "$BASE" "$ING_BASE" 0))
                        fi

                        # 2. Resolve Remaining Parts (Past, Participle, Gerund)
                        for (( i=1; i<${#PARTS[@]}; i++ )); do
                            local IS_GERUND=0
                            # If it's the very last part of the metadata, treat as gerund (-ing)
                            [[ $i -eq $((${#PARTS[@]} - 1)) ]] && IS_GERUND=1
                            CLEAN_PARTS+=($(_resolve_form "${PARTS[$i]}" "$BASE" "$ING_BASE" "$IS_GERUND"))
                        done

                        # 3. Map CLEAN_PARTS to JSON based on count
                        local P1="${CLEAN_PARTS[0]}"
                        local P3="${CLEAN_PARTS[1]}"
                        local DST="${CLEAN_PARTS[2]}"
                        
                        if [[ ${#CLEAN_PARTS[@]} -eq 5 ]]; then
                            local PPT="${CLEAN_PARTS[3]}"
                            local GER="${CLEAN_PARTS[4]}"
                            CONJ_OBJ=$(jq -n --arg p1 "$P1" --arg p3 "$P3" --arg d "$DST" --arg pp "$PPT" --arg ing "$GER" \
                                '{present_first_second_singular: $p1, present_third_singular: $p3, past: $d, past_participle: $pp, present_participle: $ing}')
                        else
                            local GER="${CLEAN_PARTS[3]}"
                            CONJ_OBJ=$(jq -n --arg p1 "$P1" --arg p3 "$P3" --arg d "$DST" --arg ing "$GER" \
                                '{present_first_second_singular: $p1, present_third_singular: $p3, past: $d, present_participle: $ing}')
                        fi
                    fi
                    
                    # --- NOUN DECLENSIONS (PLURALS) ---
                    if [[ "$POS_FULL" == *"noun"* && ${#PARTS[@]} -ge 1 ]]; then
                        local PLURAL_RAW=$(echo "${PARTS[0]}" | tr -d ',')
                        if [[ -n "$PLURAL_RAW" ]]; then
                            local PLURAL_BASE="$DISPLAY_NAME"
                            
                            # Smart-strip trailing vowels if suffix starts with a vowel
                            if [[ "$PLURAL_RAW" == -* ]]; then
                                local SUFFIX="${PLURAL_RAW#-}"
                                if [[ "$DISPLAY_NAME" == *ie && "$SUFFIX" == i* ]]; then
                                    PLURAL_BASE="${DISPLAY_NAME%ie}"
                                elif [[ "$DISPLAY_NAME" == *e && "$SUFFIX" == [aeiou]* ]]; then
                                    PLURAL_BASE="${DISPLAY_NAME%e}"
                                fi
                            fi
                            
                            local PLURAL_FORM=$(_resolve_form "$PLURAL_RAW" "$PLURAL_BASE" "$PLURAL_BASE" 0)
                            DECL_OBJ=$(jq -n --arg p "$PLURAL_FORM" '{plural: $p}')
                        fi
                    fi

                    # --- ADJECTIVE DERIVATIONS ---
                    if [[ "$POS_FULL" == *"adjective"* && ${#PARTS[@]} -ge 1 ]]; then
                        local ADV_FORM=""
                        local NOUN_FORM=""
                        
                        for part in "${PARTS[@]}"; do
                            local RAW_SUF=$(echo "$part" | tr -d ',')
                            [[ -z "$RAW_SUF" ]] && continue
                            
                            local ADJ_BASE="$DISPLAY_NAME"
                            
                            # Smart-strip for adjective to adverb (e.g. horrible + -y -> horribly)
                            if [[ "$RAW_SUF" == -* ]]; then
                                local SUFFIX="${RAW_SUF#-}"
                                if [[ "$DISPLAY_NAME" == *le && "$SUFFIX" == "y" ]]; then
                                    ADJ_BASE="${DISPLAY_NAME%e}"
                                fi
                            fi
                            
                            local DERIVED_FORM=$(_resolve_form "$RAW_SUF" "$ADJ_BASE" "$ADJ_BASE" 0)
                            
                            # Sort into adverb or noun based on the suffix
                            if [[ "$RAW_SUF" == "-ly" || "$RAW_SUF" == "-y" || "$DERIVED_FORM" == *ly || "$DERIVED_FORM" == *y ]]; then
                                ADV_FORM="$DERIVED_FORM"
                            elif [[ "$RAW_SUF" == "-ness" || "$DERIVED_FORM" == *ness ]]; then
                                NOUN_FORM="$DERIVED_FORM"
                            fi
                        done
                        
                        if [[ -n "$ADV_FORM" || -n "$NOUN_FORM" ]]; then
                            DERIV_OBJ="{}"
                            [[ -n "$ADV_FORM" ]] && DERIV_OBJ=$(echo "$DERIV_OBJ" | jq --arg a "$ADV_FORM" '. + {adverb: $a}')
                            [[ -n "$NOUN_FORM" ]] && DERIV_OBJ=$(echo "$DERIV_OBJ" | jq --arg n "$NOUN_FORM" '. + {noun: $n}')
                            [[ "$DERIV_OBJ" == "{}" ]] && DERIV_OBJ="null"
                        fi
                    fi
                else
                    DISPLAY_NAME="$CONTENT"
                fi

                local LINE_OBJ=$(jq -n \
                    --arg name "$DISPLAY_NAME" \
                    --arg origin "$ORIGIN_NAME" \
                    --arg pos "$POS_FULL" \
                    --argjson conj "$CONJ_OBJ" \
                    --argjson decl "$DECL_OBJ" \
                    --argjson deriv "$DERIV_OBJ" \
                    '{name: $name, origin: $origin} 
                     | if ($pos != "") then . + {"part-of-speech": ($pos | split(", "))} else . end
                     | if ($conj != null) then . + {conjugations: $conj} else . end
                     | if ($decl != null) then . + {declensions: $decl} else . end
                     | if ($deriv != null) then . + {derivations: $deriv} else . end')
                    
                ETYM_JSON=$(echo "$ETYM_JSON" | jq --argjson obj "$LINE_OBJ" '. + [$obj]')
            fi
        done

        local ENTRY_OBJ=$(jq -n --arg name "$WORD" --argjson ety "$ETYM_JSON" --argjson src "$SOURCES_JSON" \
            '{name: $name, etymology: $ety, sources: $src}')
        FINAL_ARRAY_JSON=$(echo "$FINAL_ARRAY_JSON" | jq --argjson obj "$ENTRY_OBJ" '. + [$obj]')
    done < <(awk -v RS="" '{print $0 "\n@END@"}' "$FILE_PATH")

    echo "$FINAL_ARRAY_JSON" | jq '.'
}


etym-create-histories() {
    local DRY_RUN=0
    local VERBOSE=0
    local DIRS=""
    
    # Assuming these match your environment variables
    local SOURCE_DIR="$DICT_DIR"  
    local OUTPUT_DIR="$HISTORIES_DIR"

    # 1. Parse Arguments
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            -d|--dry-run) DRY_RUN=1; shift ;;
            -v|--verbose) VERBOSE=1; shift ;;
            --dirs) 
                DIRS="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: etym-create-histories [options]"
                echo "Extract POS-tagged stanzas to create individual history files."
                echo "Options:"
                echo "  -d, --dry-run      Preview what would be extracted"
                echo "  -v, --verbose      Show detailed processing information"
                echo "  --dirs <a,b,c>     Only process specific directories"
                return 0
                ;;
            *) 
                echo "Unknown parameter passed: $1"
                return 1
                ;;
        esac
    done

    # Convert comma-separated dirs into an array, or default to all a-z dirs
    local TARGET_DIRS=()
    if [[ -n "$DIRS" ]]; then
        IFS=',' read -ra TARGET_DIRS <<< "$DIRS"
    else
        for d in "$SOURCE_DIR"/?/; do
            [[ -d "$d" ]] && TARGET_DIRS+=("$(basename "$d")")
        done
    fi

    echo "Creating histories from $SOURCE_DIR to $OUTPUT_DIR"
    [[ $DRY_RUN -eq 1 ]] && echo "⚠️ DRY RUN MODE: No files will be written."

    # Define the core text-processing engine
    local AWK_SCRIPT='
    BEGIN {
        RS = "";       # Paragraph mode (stanzas separated by blank lines)
        FS = "\n";     # Field separator is a newline
        
        # POS mapping dictionary
        pos_map["(m n)"]="n"; pos_map["(f n)"]="n"; pos_map["(n)"]="n";
        pos_map["(v)"]="v"; pos_map["(intr v)"]="v"; pos_map["(tr v)"]="v";
        pos_map["(conj)"]="conj"; pos_map["(adj)"]="adj"; pos_map["(prep)"]="prep";
        pos_map["(pron)"]="pron"; pos_map["(adv)"]="adv"; pos_map["(suff)"]="suff";
        pos_map["(pref)"]="pref"; pos_map["(interj)"]="interj"; pos_map["(obs)"]="obs";
    }

    # Helper function to extract modern word 
    function extract_word(line,    stripped, comma_parts, n_comma, final_part, words) {
        stripped = line
        gsub(/\[[A-Z]+\]/, "", stripped)       # Remove tags like [ME], [MI], [FR]
        
        # Split by comma to handle variants, taking the last one
        n_comma = split(stripped, comma_parts, ",")
        final_part = comma_parts[n_comma]
        
        gsub(/^[ \t]+|[ \t]+$/, "", final_part)  # Trim whitespace
        sub(/^[tT][oO][ \t]+/, "", final_part)   # Strip "to " for infinitives
        
        split(final_part, words, "[ \t]+")       # Take first word of that final part
        return words[1]
    }

    # Process each stanza
    {
        pos_tag = ""; pos_val = ""; pos_line_idx = 0; 
        inline_pos = 0; modern_word = "";
        
        # Step 1: Find POS indicator
        for(i=1; i<=NF; i++) {
            for (tag in pos_map) {
                if (index($i, tag) > 0) {
                    pos_tag = tag;
                    pos_val = pos_map[tag];
                    pos_line_idx = i;
                    break;
                }
            }
            if (pos_tag != "") break;
        }
        
        # Skip if no POS found
        if (pos_tag == "") next; 

        # Step 2: Find Modern Word (Priority matching)
        
        # Priority 0: Inline POS (e.g. word [ME] (v) ...)
        if (match($pos_line_idx, /\[[A-Z]+\]/)) {
            inline_pos = 1;
            modern_word = extract_word($pos_line_idx);
        }
        
        # Priority 1: [ME]
        if (modern_word == "") {
            for(i=1; i<=NF; i++) {
                if (index($i, "[ME]") > 0) { modern_word = extract_word($i); break; }
            }
        }
        
        # Priority 2: [MI]
        if (modern_word == "") {
            for(i=1; i<=NF; i++) {
                if (index($i, "[MI]") > 0) { modern_word = extract_word($i); break; }
            }
        }
        
        # Priority 3: Fallback to line before POS
        if (modern_word == "" && pos_line_idx > 1) {
            modern_word = extract_word($(pos_line_idx - 1));
        }

        # Handle tracking output to Bash
        if (modern_word == "") {
            print "SKIP" > "/dev/stderr"
            next;
        }

        # Step 3: Write Output
        out_file = target_dir "/" modern_word "_" pos_val ".txt"
        print "EXTRACT|" out_file > "/dev/stderr"
        
        if (dry_run == 0) {
            for (i=1; i<=NF; i++) {
                if (i == pos_line_idx) {
                    if (inline_pos) {
                        # Remove POS tag but keep the line
                        cleaned = $i;
                        sub(pos_tag, "", cleaned);
                        # Clean up double spaces left behind
                        gsub(/[ \t]+/, " ", cleaned);
                        print cleaned > out_file;
                    }
                    # If not inline, we skip printing this line entirely
                } else {
                    print $i > out_file;
                }
            }
            # Crucial: Close file to prevent "too many open files" error
            close(out_file)
        }
    }
    '

    # Global Stats
    local TOTAL_EXTRACTED=0
    local TOTAL_SKIPPED=0

    # 2. Main Processing Loop
    for dir in "${TARGET_DIRS[@]}"; do
        dir=$(echo "$dir" | xargs)
        local current_src="$SOURCE_DIR/$dir"
        local target_dir="$OUTPUT_DIR/$dir"
        
        if [[ ! -d "$current_src" ]]; then
            [[ $VERBOSE -eq 1 ]] && echo "Skipping $dir/ (Not a directory)"
            continue
        fi

        [[ $DRY_RUN -eq 0 ]] && mkdir -p "$target_dir"
        [[ $VERBOSE -eq 1 ]] && echo -e "\nProcessing directory: $dir/"

        # Track directory specific stats
        local dir_extracted=0

        while read -r file; do
            # Run the awk script. It outputs tracking data to stderr, which we capture.
            # Using stderr allows awk to write to actual files freely without mixing streams.
            local awk_out
            awk_out=$(awk -v target_dir="$target_dir" -v dry_run="$DRY_RUN" "$AWK_SCRIPT" "$file" 2>&1 >/dev/null)
            
            # Parse awk tracking output
            while IFS= read -r line; do
                if [[ "$line" == "SKIP" ]]; then
                    ((TOTAL_SKIPPED++))
                elif [[ "$line" == EXTRACT\|* ]]; then
                    ((dir_extracted++))
                    ((TOTAL_EXTRACTED++))
                    if [[ $VERBOSE -eq 1 ]]; then
                        local extracted_path="${line#EXTRACT|}"
                        echo "  -> Created: $(basename "$extracted_path")"
                    fi
                fi
            done <<< "$awk_out"

        done < <(find "$current_src" -name "*.txt")

        if [[ $dir_extracted -gt 0 && $VERBOSE -eq 0 ]]; then
            echo "Extracted: $dir/ ($dir_extracted files)"
        fi
    done

    # 3. Final Summary
    echo -e "\n------------------------------------------"
    echo "Processing complete!"
    echo "Extracted $TOTAL_EXTRACTED stanzas with part-of-speech indicators."
    if [[ $TOTAL_SKIPPED -gt 0 ]]; then
        echo "Note: Skipped $TOTAL_SKIPPED stanzas that had POS but no extractable word."
    fi
}


etym-lint() {
    local TARGET_INPUT=""
    local STRICT_MODE=0

    # 1. Parse Arguments
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --strict) STRICT_MODE=1; shift ;;
            *) 
                if [[ -z "$TARGET_INPUT" ]]; then
                    TARGET_INPUT="$1"
                fi
                shift 
                ;;
        esac
    done

    # 2. Resolve Path
    local TARGET_DIR=""
    if [ -z "$TARGET_INPUT" ]; then
        TARGET_DIR="$DICT_DIR"
    elif [ -e "$DICT_DIR/$TARGET_INPUT" ]; then
        TARGET_DIR="$DICT_DIR/$TARGET_INPUT"
    else
        TARGET_DIR="$TARGET_INPUT"
    fi

    if [ ! -e "$TARGET_DIR" ]; then
        echo "Error: Target $TARGET_DIR not found."
        return 1
    fi

    echo -e "Linting Data in: $TARGET_DIR"
    echo -e "=================================================================\n"

    local TOTAL_FILES=0
    local FATAL_COUNT=0
    local ERROR_COUNT=0
    local WARN_COUNT=0

    # 3. Linter Execution
    # Use process substitution or a temporary file approach to preserve counters
    while IFS= read -r -d '' file; do
        TOTAL_FILES=$((TOTAL_FILES + 1))
        local file_issues=()

        # Rule 1: Empty file check [FATAL]
        if [ ! -s "$file" ]; then
            file_issues+=("\e[31m[FATAL]\e[0m File is completely empty.")
            FATAL_COUNT=$((FATAL_COUNT + 1))
        else
            # Strip URLs for tag analysis to prevent false positives
            local content_no_urls=$(grep -rhv "http" "$file")

            # Rule 2: Missing POS tag [ERROR]
            if ! echo "$content_no_urls" | grep -Poq "\([a-z ]{1,5}(, [a-z ]{1,5})*\)"; then
                file_issues+=("\e[31m[ERROR]\e[0m Missing or malformed Part of Speech tag '()'")
                ERROR_COUNT=$((ERROR_COUNT + 1))
            fi

            # Rule 3: Missing Language tag [ERROR]
            if ! echo "$content_no_urls" | grep -Poq "\[[A-Z]+\]"; then
                file_issues+=("\e[31m[ERROR]\e[0m Missing or malformed Language Origin tag '[]'")
                ERROR_COUNT=$((ERROR_COUNT + 1))
            fi

            # Rule 4: Trailing Whitespace [WARN]
            if grep -q "[[:space:]]$" "$file"; then
                file_issues+=("\e[33m[WARN]\e[0m  Line(s) contain trailing whitespace.")
                WARN_COUNT=$((WARN_COUNT + 1))
            fi
            
            # Rule 5: Unclosed Brackets/Parentheses on non-URL lines [WARN]
            local unclosed_paren=$(echo "$content_no_urls" | grep -E "\([^)]*$|^[^(]*\)")
            local unclosed_bracket=$(echo "$content_no_urls" | grep -E "\[[^]]*$|^[^[]*\]")
            
            if [[ -n "$unclosed_paren" && "$unclosed_paren" != "$content_no_urls" ]]; then
                 file_issues+=("\e[33m[WARN]\e[0m  Potentially unclosed or orphaned parentheses.")
                 WARN_COUNT=$((WARN_COUNT + 1))
            fi
        fi

        # Output issues if any were found
        if [ ${#file_issues[@]} -gt 0 ]; then
            local relative_path="${file#$DICT_DIR/}"
            echo -e "📝 \e[1m$relative_path\e[0m"
            for issue in "${file_issues[@]}"; do
                echo -e "   $issue"
            done
            echo ""
        fi

    done < <(find "$TARGET_DIR" -type f -print0)

    # 4. Summary Output
    echo "-----------------------------------------------------------------"
    echo "LINTING COMPLETE"
    echo "-----------------------------------------------------------------"
    printf "Files Scanned: %d\n" "$TOTAL_FILES"
    printf "Fatal Errors:  \e[31m%d\e[0m\n" "$FATAL_COUNT"
    printf "Standard Errs: \e[31m%d\e[0m\n" "$ERROR_COUNT"
    printf "Warnings:      \e[33m%d\e[0m\n" "$WARN_COUNT"
    echo "================================================================="

    # Return error code if failures exist (useful for CI/CD or pre-commit hooks)
    if [ "$FATAL_COUNT" -gt 0 ] || [ "$ERROR_COUNT" -gt 0 ]; then
        return 1
    fi
    return 0
}


etym-flatten() {
    local FORMAT="tsv"
    local OUT_FILE="flattened_dictionary.tsv"
    local TARGET_INPUT=""
    local INCLUDE_ORIGIN=0

    # 1. Parse Arguments (--csv, -o/--out, --include-origin)
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --csv) FORMAT="csv"; OUT_FILE="flattened_dictionary.csv"; shift ;;
            -o|--out) OUT_FILE="$2"; shift 2 ;;
            --include-origin) INCLUDE_ORIGIN=1; shift ;;
            *) 
                if [[ -z "$TARGET_INPUT" ]]; then
                    TARGET_INPUT="$1"
                fi
                shift 
                ;;
        esac
    done

    # 2. Resolve Path
    local TARGET_DIR=""
    if [ -z "$TARGET_INPUT" ]; then
        TARGET_DIR="$DICT_DIR"
    elif [ -d "$DICT_DIR/$TARGET_INPUT" ]; then
        TARGET_DIR="$DICT_DIR/$TARGET_INPUT"
    else
        TARGET_DIR="$TARGET_INPUT"
    fi

    if [ ! -d "$TARGET_DIR" ]; then
        echo "Error: Directory $TARGET_DIR not found."
        return 1
    fi

    echo "Flattening multi-stanza data from $TARGET_DIR..."
    echo "================================================================="

    # 3. Write Headers
    if [[ "$FORMAT" == "csv" ]]; then
        if [[ $INCLUDE_ORIGIN -eq 1 ]]; then
            echo "File_Name,Modern_English,Reformed_Word,Conjugations,Part_of_Speech,Language_Origin" > "$OUT_FILE"
        else
            echo "File_Name,Modern_English,Reformed_Word,Conjugations,Part_of_Speech" > "$OUT_FILE"
        fi
    else
        if [[ $INCLUDE_ORIGIN -eq 1 ]]; then
            echo -e "File_Name\tModern_English\tReformed_Word\tConjugations\tPart_of_Speech\tLanguage_Origin" > "$OUT_FILE"
        else
            echo -e "File_Name\tModern_English\tReformed_Word\tConjugations\tPart_of_Speech" > "$OUT_FILE"
        fi
    fi

    # 4. Data Extraction Loop using Awk in Paragraph Mode
    local FILE_COUNT=0
    
    while IFS= read -r -d '' file; do
        FILE_COUNT=$((FILE_COUNT + 1))
        local filename=$(basename "$file" .txt)
        
        # Pass the INCLUDE_ORIGIN flag into awk as a variable
        awk -v fname="$filename" -v fmt="$FORMAT" -v inc_org="$INCLUDE_ORIGIN" '
            BEGIN { 
                RS=""       # Treat blank lines as record separators
                FS="\n"     # Treat newlines as field separators
                
                # In-memory dictionary for rapid Part of Speech translation
                pos_map["m n"]="masculine noun"; pos_map["f n"]="feminine noun";
                pos_map["n"]="noun"; pos_map["v"]="verb";
                pos_map["intr v"]="intransitive verb"; pos_map["tr v"]="transitive verb";
                pos_map["conj"]="conjunction"; pos_map["adj"]="adjective";
                pos_map["prep"]="preposition"; pos_map["pron"]="pronoun";
                pos_map["adv"]="adverb"; pos_map["suff"]="suffix";
                pos_map["pref"]="prefix"; pos_map["interj"]="interjection";
                pos_map["obs"]="obsolete";
            }
            
            # Helper function to extract the core word (stripping tags and commas)
            function extract_core(line,   stripped, comma_parts, n_comma, final_part, words) {
                stripped = line
                gsub(/\[[A-Z]+\]/, "", stripped)       
                n_comma = split(stripped, comma_parts, ",")
                final_part = comma_parts[n_comma]
                gsub(/^[ \t]+|[ \t]+$/, "", final_part)
                sub(/^[tT][oO][ \t]+/, "", final_part)
                split(final_part, words, "[ \t]+")
                return words[1]
            }

            {
                pos = ""; verbose_pos = ""; lang = ""; target = ""; conj = ""; 
                me_word = ""; pos_line_idx = 0;

                # 1. Find the Primary Language tag [LANG] (Used for validation even if hidden)
                for (i=1; i<=NF; i++) {
                    if ($i !~ /http/ && match($i, /\[[A-Z]+\]/)) {
                        lang = substr($i, RSTART+1, RLENGTH-2)
                        break
                    }
                }

                # 2. Find the POS tag (pos), Target Word, and Conjugations
                for (i=1; i<=NF; i++) {
                    if ($i !~ /http/ && match($i, /\(([a-z ]+(, [a-z ]+)*)\)/)) {
                        pos_line_idx = i
                        
                        # Clean POS tag and translate to full name
                        pos = substr($i, RSTART+1, RLENGTH-2)
                        sub(/,.*/, "", pos) 
                        
                        if (pos in pos_map) {
                            verbose_pos = pos_map[pos]
                        } else {
                            verbose_pos = pos 
                        }
                        
                        # Extract target word and conjugations
                        temp_line = $i
                        sub(/^[ \t]+/, "", temp_line)  
                        sub(/^to[ \t]+/, "", temp_line) 
                        sub(/\(([a-z ]+(, [a-z ]+)*)\)/, "", temp_line) 
                        
                        n_words = split(temp_line, words, " ")   
                        target = words[1]              
                        
                        # Anything left over is a conjugation
                        for(j=2; j<=n_words; j++) {
                            if (words[j] != "") {
                                conj = (conj == "" ? words[j] : conj " " words[j])
                            }
                        }
                        break
                    }
                }

                # 3. Find Modern English Bridge (Priority System)
                for(i=1; i<=NF; i++) {
                    if ($i ~ /\[ME\]/) { me_word = extract_core($i); break; }
                }
                if (me_word == "") {
                    for(i=1; i<=NF; i++) {
                        if ($i ~ /\[MI\]/) { me_word = extract_core($i); break; }
                    }
                }
                if (me_word == "" && pos_line_idx > 1) {
                    me_word = extract_core($(pos_line_idx - 1))
                }

                # 4. Print the row using the expanded POS name and conditional Origin
                if (verbose_pos != "" && lang != "" && target != "") {
                    if (fmt == "csv") {
                        if (inc_org == 1) {
                            printf "\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"\n", fname, me_word, target, conj, verbose_pos, lang
                        } else {
                            printf "\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"\n", fname, me_word, target, conj, verbose_pos
                        }
                    } else {
                        if (inc_org == 1) {
                            printf "%s\t%s\t%s\t%s\t%s\t%s\n", fname, me_word, target, conj, verbose_pos, lang
                        } else {
                            printf "%s\t%s\t%s\t%s\t%s\n", fname, me_word, target, conj, verbose_pos
                        }
                    }
                }
            }
        ' "$file" >> "$OUT_FILE"

    done < <(find "$TARGET_DIR" -type f -name "*.txt" -print0)

    # 5. Output Summary
    local ROW_COUNT=$(($(wc -l < "$OUT_FILE" | xargs) - 1))
    
    echo "✅ Flattening complete!"
    printf "Scanned \e[1m%d\e[0m files.\n" "$FILE_COUNT"
    printf "Extracted \e[1m%d\e[0m data rows to \e[32m%s\e[0m\n" "$ROW_COUNT" "$OUT_FILE"
    echo "================================================================="
}


etym-graph() {
    local OUT_FILE="etym_graph.json"
    local TARGET_INPUT=""

    # 1. Parse Arguments (-o/--out)
    while [[ "$#" -gt 0 ]]; do
        case $1 in
            -o|--out) OUT_FILE="$2"; shift 2 ;;
            *) 
                if [[ -z "$TARGET_INPUT" ]]; then
                    TARGET_INPUT="$1"
                fi
                shift 
                ;;
        esac
    done

    # 2. Resolve Path
    local TARGET_PATH=""
    if [ -z "$TARGET_INPUT" ]; then
        TARGET_PATH="$DICT_DIR"
    elif [ -e "$DICT_DIR/$TARGET_INPUT" ]; then
        TARGET_PATH="$DICT_DIR/$TARGET_INPUT"
    elif [ -e "$TARGET_INPUT" ]; then
        TARGET_PATH="$TARGET_INPUT"
    else
        echo "Error: Target path '$TARGET_INPUT' not found."
        return 1
    fi

    if ! command -v jq &> /dev/null; then 
        echo "Error: 'jq' is required to format the graph JSON."
        return 1
    fi

    echo "Building Etymological Graph from $TARGET_PATH..."
    echo "================================================================="

    local TARGET_LANG="${DICT_PROJECT_NAME:-Inglisce}"

    # 3. Stream data into Awk
    find "$TARGET_PATH" -type f -name "*.txt" -print0 | xargs -0 cat | awk -v tgt_lang="$TARGET_LANG" '
        BEGIN { 
            RS=""       
            FS="\n"     
            node_counter = 0  # Initialize safe ID counter
        }
        
        {
            line_count = 0
            delete layers
            
            for (i=1; i<=NF; i++) {
                if ($i ~ /^http/) break; 
                
                lang = tgt_lang
                pos = ""
                
                if (match($i, /\[[A-Z]+\]/)) {
                    lang = substr($i, RSTART+1, RLENGTH-2)
                }
                
                if (match($i, /\(([a-z ]+(, [a-z ]+)*)\)/)) {
                    pos = substr($i, RSTART+1, RLENGTH-2)
                    sub(/,.*/, "", pos)
                }
                
                temp_line = $i
                gsub(/\[[A-Z]+\]/, "", temp_line)
                gsub(/\([^)]+\)/, "", temp_line)
                
                n_words = split(temp_line, w_arr, ",")
                layer_nodes = ""
                
                for (j=1; j<=n_words; j++) {
                    cw = w_arr[j]
                    gsub(/^[ \t]+|[ \t]+$/, "", cw)    
                    sub(/^[tT][oO][ \t]+/, "", cw)     
                    gsub(/ -[a-z]+/, "", cw)           
                    
                    split(cw, cw_tokens, "[ \t]+")
                    final_w = cw_tokens[1]
                    
                    if (final_w != "") {
                        gsub(/"/, "\\\"", final_w)
                        
                        # The Safe-ID Generator
                        raw_id = final_w "_" lang
                        if (!(raw_id in id_map)) {
                            node_counter++
                            id_map[raw_id] = "node_" node_counter
                        }
                        safe_id = id_map[raw_id]
                        
                        # Register Node using safe_id
                        if (!(safe_id in nodes)) {
                            nodes[safe_id] = sprintf("{\"id\": \"%s\", \"label\": \"%s\", \"lang\": \"%s\", \"pos\": \"%s\"}", safe_id, final_w, lang, pos)
                        } else if (pos != "") {
                            nodes[safe_id] = sprintf("{\"id\": \"%s\", \"label\": \"%s\", \"lang\": \"%s\", \"pos\": \"%s\"}", safe_id, final_w, lang, pos)
                        }
                        
                        layer_nodes = (layer_nodes == "" ? safe_id : layer_nodes "|" safe_id)
                    }
                }
                
                if (layer_nodes != "") {
                    line_count++
                    layers[line_count] = layer_nodes
                }
            }
            
            for (l=1; l<line_count; l++) {
                n_src = split(layers[l], srcs, "|")
                n_tgt = split(layers[l+1], tgts, "|")
                
                for (s=1; s<=n_src; s++) {
                    for (t=1; t<=n_tgt; t++) {
                        edge_id = srcs[s] "->" tgts[t]
                        if (!(edge_id in edges)) {
                            edges[edge_id] = sprintf("{\"source\": \"%s\", \"target\": \"%s\"}", srcs[s], tgts[t])
                        }
                    }
                }
            }
        }
        
        END {
            print "{"
            print "  \"nodes\": ["
            first = 1
            for (n in nodes) {
                if (!first) print ","
                printf "    %s", nodes[n]
                first = 0
            }
            print "\n  ],"
            print "  \"edges\": ["
            first = 1
            for (e in edges) {
                if (!first) print ","
                printf "    %s", edges[e]
                first = 0
            }
            print "\n  ]"
            print "}"
        }
    ' | jq '.' > "$OUT_FILE"

    if [[ $? -eq 0 ]]; then
        local NODE_COUNT=$(jq '.nodes | length' "$OUT_FILE")
        local EDGE_COUNT=$(jq '.edges | length' "$OUT_FILE")
        echo "✅ Graph generation complete!"
        printf "Exported \e[1m%d\e[0m Nodes and \e[1m%d\e[0m Edges to \e[32m%s\e[0m\n" "$NODE_COUNT" "$EDGE_COUNT" "$OUT_FILE"
    else
        echo "❌ Error generating graph. Check stanza formatting."
    fi
    echo "================================================================="
}


etym-visualize() {
    local GRAPH_FILE="etym_graph.json"
    local OUT_FILE="etym_graph.md"
    
    # Allow user to pass a specific json file, default to etym_graph.json
    [[ -n "$1" ]] && GRAPH_FILE="$1"

    if [[ ! -f "$GRAPH_FILE" ]]; then
        echo "Error: Graph file '$GRAPH_FILE' not found."
        echo "Run 'etym-graph' first to generate the data."
        return 1
    fi

    echo "Converting $GRAPH_FILE to Mermaid Markdown..."
    echo "================================================================="

    # Create the markdown file with the Mermaid code block wrapper
    echo '```mermaid' > "$OUT_FILE"
    echo 'graph LR' >> "$OUT_FILE" # LR = Left to Right layout

    # Translate JSON to Mermaid syntax using jq
    # Nodes: id["Label<br>[Lang]"]
    # Edges: source --> target
    jq -r '
      (.nodes[] | "  \(.id)[\"\(.label)<br><b>[\(.lang)]</b>\"]"),
      (.edges[] | "  \(.source) --> \(.target)")
    ' "$GRAPH_FILE" >> "$OUT_FILE"

    echo '```' >> "$OUT_FILE"
    
    echo "✅ Successfully generated: $OUT_FILE"
    echo "💡 HOW TO VIEW:"
    echo "   1. Open $OUT_FILE in your Codespace editor."
    echo "   2. Right-click the file tab and select 'Open Preview' (or press Cmd+K V / Ctrl+K V)."
    echo "================================================================="
}


etym-publish() {
    local TARGET_DIR="${1:-$DICT_DIR}"
    local OUT_DIR="./dist/api" # Where React will look for the data
    
    if [ ! -d "$TARGET_DIR" ]; then
        echo "Error: Directory $TARGET_DIR not found."
        return 1
    fi

    echo "Publishing Dictionary API to $OUT_DIR..."
    echo "================================================================="

    # 1. Clean and prep output directory
    rm -rf "$OUT_DIR"
    mkdir -p "$OUT_DIR/letters"

    local NAV_JSON="[]"
    local TOTAL_WORDS=0

    # 2. Crawl the alphabetical directories (a, b, c...)
    for letter_dir in "$TARGET_DIR"/*/; do
        # Skip if not a directory (e.g., if the folder is empty)
        [ -d "${letter_dir}" ] || continue 
        
        local letter=$(basename "$letter_dir" | tr '[:lower:]' '[:upper:]')
        local letter_lower=$(basename "$letter_dir")
        
        local LETTER_WORDS_JSON="[]"
        local word_count=0

        # 3. Read every word file in that letter directory
        while IFS= read -r file; do
            local word=$(basename "$file" .txt)
            
            # (Optional) You could call etym-export here to get the FULL JSON for the word
            # For navigation, we just need the word name and the URL path.
            
            local WORD_OBJ=$(jq -n --arg w "$word" --arg url "/dictionary/$letter_lower/$word" \
                '{word: $w, url: $url}')
                
            LETTER_WORDS_JSON=$(echo "$LETTER_WORDS_JSON" | jq --argjson obj "$WORD_OBJ" '. + [$obj]')
            word_count=$((word_count + 1))
            TOTAL_WORDS=$((TOTAL_WORDS + 1))
            
        done < <(find "$letter_dir" -maxdepth 1 -type f -name "*.txt" | sort)

        # 4. Save the chunked file (e.g., dist/api/letters/a.json)
        echo "$LETTER_WORDS_JSON" > "$OUT_DIR/letters/$letter_lower.json"

        # 5. Add this letter to the Master Navigation array
        local NAV_OBJ=$(jq -n \
            --arg letter "$letter" \
            --arg url "/dictionary/$letter_lower" \
            --arg count "$word_count" \
            '{letter: $letter, url: $url, count: ($count|tonumber)}')
            
        NAV_JSON=$(echo "$NAV_JSON" | jq --argjson obj "$NAV_OBJ" '. + [$obj]')
        
        echo "✅ Processed [$letter]: $word_count words"
    done

    # 6. Save the Master Navigation file
    echo "$NAV_JSON" > "$OUT_DIR/navigation.json"

    echo "================================================================="
    echo "🎉 Publish Complete! Compiled $TOTAL_WORDS total words."
    echo "Data ready for React in: $OUT_DIR"
}