#!/bin/bash

# --- PATH CONFIGURATION env.sh---
# Automatically detects the project root based on this file's location
export CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_ROOT="$(cd "$CONFIG_DIR/../.." && pwd)"

# Data Directories
# toolkit/config/env.sh

# --- DATA DIRECTORIES ---
export DICT_DIR="${DICT_DIR:-/workspaces/ety-dictionary/data-text/inglisce/dictionary}"
export ETYM_LIB_DIR="${ETYM_LIB_DIR:-/workspaces/ety-dictionary/toolkit}"
export HISTORIES_DIR="$PROJECT_ROOT/data-text/histories"
export ANALYSIS_DIR="$PROJECT_ROOT/analysis"
# export COMPARISONS_DIR="$PROJECT_ROOT/data-text/inglisce/etymology/comparisons"

# >>> NEW PIPELINE PATHS <<<
export BOOKS_RAW_DIR="$PROJECT_ROOT/data-text/books"
export BOOKS_AST_DIR="$PROJECT_ROOT/toolkit/.cache/ast-books"        # Intermediate JSON storage
export BOOKS_TRANS_DIR="$PROJECT_ROOT/data-text/inglisce/books"

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

# --- PART-OF-SPEECH REGISTER ---
# config/parts-of-speech.tsv is hand-edited, so its format is forgiving:
#
#     m n     - masculine noun
#     v - verb
#     # comments and blank lines are ignored
#
# Delimiter precedence: a tab if the line has one, otherwise the first "-";
# a leading "-" is then stripped from the description, so "m n<TAB>- noun"
# and "m n - noun" and "m n<TAB>noun" all parse alike. Tags may contain
# spaces ("m n", "def v") but never a hyphen, which is what makes the dash
# an unambiguous boundary.
#
# EVERY consumer reads the file through _pos_rows / get_pos_desc. Nothing
# greps it directly. Three places used to hold their own copy of the parsing
# rule and one of them disagreed with the others, which is exactly how the
# five-character POS lint bug survived.

_pos_rows() {
    [[ -f "$CONFIG_DIR/parts-of-speech.tsv" ]] || return 0
    sed -e 's/\r$//' "$CONFIG_DIR/parts-of-speech.tsv" \
        | grep -v '^[[:space:]]*#' \
        | grep -v '^[[:space:]]*$'
}

# get_pos_desc <tag>
# Prints the description (possibly empty) and returns 0 if the tag is in the
# register; returns 1 if it is absent. Membership and description are kept
# apart deliberately: a tag written with no description after the dash is
# still a declared tag, and reporting it as unknown would contradict the
# file the user is looking at.
get_pos_desc() {
    local out status
    out=$(_pos_rows | awk -v want="$1" '
        function trim(x) { gsub(/^[ \t]+|[ \t]+$/, "", x); return x }
        BEGIN { found = 0 }
        {
            t = index($0, "\t")
            if (t > 0)      { tag = substr($0, 1, t - 1); desc = substr($0, t + 1) }
            else if (index($0, "-") > 0) {
                d = index($0, "-")
                tag = substr($0, 1, d - 1); desc = substr($0, d + 1)
            }
            else            { tag = $0; desc = "" }
            desc = trim(desc)
            sub(/^-[ \t]*/, "", desc)
            if (tolower(trim(tag)) == tolower(want)) { print trim(desc); found = 1; exit }
        }
        END { if (!found) exit 1 }')
    status=$?
    [[ -n "$out" ]] && printf '%s\n' "$out"
    return $status
}

# pos_is_registered <tag> -> status only.
pos_is_registered() {
    get_pos_desc "$1" >/dev/null 2>&1
}

get_pos_full() {
    local INPUT=$1
    # Strip parentheses and normalize: "(adj, m n)" -> "adj, m n"
    local CLEAN_INPUT
    CLEAN_INPUT=$(echo "$INPUT" | tr -d '()')

    local RESULTS=() tag trimmed match
    IFS=',' read -ra TAGS <<< "$CLEAN_INPUT"
    for tag in "${TAGS[@]}"; do
        trimmed=$(echo "$tag" | xargs)
        [[ -z "$trimmed" ]] && continue
        # Fall back to the tag itself when it is unregistered OR registered
        # without a description.
        match=$(get_pos_desc "$trimmed")
        [[ -z "$match" ]] && match="$trimmed"
        RESULTS+=("$match")
    done

    # Join with ", ". ${RESULTS[*]} uses only the FIRST character of IFS, so
    # IFS=", " joined with a bare comma; build the string explicitly instead.
    local out="" r
    for r in "${RESULTS[@]}"; do
        [[ -n "$out" ]] && out+=", "
        out+="$r"
    done
    printf '%s\n' "$out"
}