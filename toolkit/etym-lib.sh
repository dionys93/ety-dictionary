#!/bin/bash

# --- 1. BOOTSTRAP CONFIG ---
export ETYM_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ETYM_LIB_DIR/config/env.sh"
echo "etym-lib has been sourced" >&2

# --- 2. DEPENDENCY CHECK ---
if ! command -v jq &> /dev/null; then
    echo "⚠️  Dependency Missing: 'jq' is required for most functions."
    read -p "Would you like to install it now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if   [[ "$OSTYPE" == "linux-gnu"* ]]; then sudo apt update && sudo apt install -y jq
        elif [[ "$OSTYPE" == "darwin"* ]];    then brew install jq
        else echo "Unsupported OS. Please install 'jq' manually."
        fi
    fi
fi

# =============================================================================
# CORE ENGINE
# These two functions are the foundation everything else is built on.
# =============================================================================

# _etym_resolve_file <word>
# Single source of truth for .txt file lookup.
# Prints the resolved path to stdout, or returns 1 with an error on stderr.
_etym_resolve_file() {
    local word="$1"
    local dir="$DICT_DIR/${word:0:1}"
    local file

    # Direct match first
    file=$(find "$dir" -maxdepth 1 -iname "${word}.txt" 2>/dev/null | head -1)

    # Fallback: whole-word content search on reformed lines only
    [[ -z "$file" ]] && file=$(grep -rlP "(?<![a-zA-Z])${word}(?![a-zA-Z])" "$dir" 2>/dev/null | head -1)

    if [[ -z "$file" ]]; then
        echo "Error: '$word' not found in $dir" >&2
        return 1
    fi
    echo "$file"
}

# _etym_stream [path]
# Streams all JSONL from every .txt file under a given path.
# Defaults to $DICT_DIR. The output is suitable for piping into jq.
_etym_stream() {
    local path="${1:-$DICT_DIR}"
    find "$path" -type f -name "*.txt" | while IFS= read -r f; do
        etym-parse "$f"
    done
}

# etym-parse <file.txt>
# ─────────────────────────────────────────────────────────────────────────────
# THE CANONICAL STANZA PARSER. Single source of truth for reading .txt entries.
# Emits one JSONL record per stanza to stdout.
#
# Output schema:
#   {
#     "me_word":       string,
#     "inglisce_word": string,
#     "pos":           string,
#
#     "conjugations":
#       VERBS — named object:
#         {
#           "present":        string,   # present stem (-er/-ir class only, e.g. "þondre")
#           "third_singular": string,   # e.g. "-s" or "þondres"
#           "past":           string,   # e.g. "-d", "craipt", "þondred"
#           "participle":     string,   # same as past unless distinct
#           "gerund":         string,   # e.g. "-ing", "þondering", "copying"
#         }
#       NON-VERBS — raw array:
#         e.g. ["circuls"] for nouns, ["-ly"] for adjectives
#
#     "etymology":  [{form, lang}],
#     "sources":    string[]
#   }
#
# Conjugation classes handled:
#   1. Standard suffix:      root -s -d -ing
#   2. Irregular past:       root -s <past> -ing           (past = participle)
#   3. Full irregular:       root -s <past> <participle> -ing
#   4. Two-stem -er/-ir:     root present(s past gerund
#   5. Two-stem full irreg:  root present(s past participle gerund
#   6. Explicit Arrays:      root <am> <is> <are> <was> ... (no slot logic)
# ─────────────────────────────────────────────────────────────────────────────
etym-parse() {
    local file="$1"
    [[ ! -f "$file" ]] && { echo "Error: file not found: $file" >&2; return 1; }

    awk '
    BEGIN { RS = ""; FS = "\n" }

    # ── Helpers ────────────────────────────────────────────────────────────

    function is_verb(pos) {
        return (pos ~ /^(v|tr v|intr v|aux|auxiliary|modal)$/)
    }

    # Escapes double-quotes for safe JSON embedding
    function esc(s) {
        gsub(/"/, "\\\"", s)
        return s
    }

    function verb_conj_json(present, third_sing, past, participle, gerund) {
        return "{" \
            "\"present\":"        "\"" esc(present)    "\"," \
            "\"third_singular\":" "\"" esc(third_sing) "\"," \
            "\"past\":"           "\"" esc(past)        "\"," \
            "\"participle\":"     "\"" esc(participle)  "\"," \
            "\"gerund\":"         "\"" esc(gerund)      "\"" \
        "}"
    }

    # ── Main stanza loop ────────────────────────────────────────────────────

    {
        delete ef; delete el; delete src_arr
        n_etym = 0; n_src = 0
        reformed = ""

        # ---- Classify each line ----
        for (i = 1; i <= NF; i++) {
            line = $i
            gsub(/\r/, "", line)
            if (line == "") continue

            if (line ~ /^http/) {
                src_arr[++n_src] = line

            } else if (line ~ /\([a-z]/ && line !~ /\[[A-Z]/) {
                # Reformed line: has (pos) tag, no [LANG] tag
                reformed = line

            } else {
                # Etymology chain entry
                lang = ""
                if (match(line, /\[([A-Z]+)\]/, m)) lang = m[1]
                form = line
                gsub(/\[[A-Z]+\]/, "", form)
                gsub(/^[ \t]+|[ \t]+$/, "", form)
                if (form != "") {
                    n_etym++
                    ef[n_etym] = form
                    el[n_etym] = lang
                }
            }
        }

        if (reformed == "") next

        # ---- Parse reformed line ----
        # Strip trailing (pos) tag and capture it
        pos = ""
        if (match(reformed, /\(([a-z][a-z ,]*)\)[ \t]*$/, pm)) pos = pm[1]

        temp = reformed
        gsub(/\([a-z][a-z ,]*\)[ \t]*$/, "", temp)     # Remove trailing (pos)
        gsub(/^[ \t]+|[ \t]+$/, "", temp)       # Trim
        sub(/^[tT][oO][ \t]+/, "", temp)        # Strip infinitive "to "

        # Tokenize — split on whitespace and commas
        n_raw = split(temp, raw_tok, /[ \t,]+/)

        # Compact out any empty tokens left by the split
        n_tok = 0
        for (i = 1; i <= n_raw; i++) {
            if (raw_tok[i] != "") tokens[++n_tok] = raw_tok[i]
        }

        # tokens[1] is always the Inglisce root word
        inglisce_word = tokens[1]
        gsub(/[,.]$/, "", inglisce_word)

        # ---- Build conjugations ----
        conj_json = ""

        if (is_verb(pos)) {

            # ── Class 4 & 5: Two-stem -er/-ir ──────────────────────────────
            if (n_tok >= 2 && tokens[2] ~ /\(s$/) {
                present_stem = substr(tokens[2], 1, length(tokens[2]) - 2)
                third_sing   = present_stem "s"

                if (n_tok >= 5) {
                    past_form = tokens[3]
                    part_form = tokens[4]
                    gerund    = tokens[5]
                } else {
                    past_form = (n_tok >= 3) ? tokens[3] : ""
                    part_form = past_form
                    gerund    = (n_tok >= 4) ? tokens[4] : ""
                }
                conj_json = verb_conj_json(present_stem, third_sing, past_form, part_form, gerund)

            # ── Classes 1, 2, 3, 6: Standard, irregular, and explicit arrays ─
            } else {
                if (n_tok > 5) {
                    # Class 6: Fully explicit array (e.g., "to be", "to do")
                    conj_json = "["
                    for (i = 2; i <= n_tok; i++) {
                        if (i > 2) conj_json = conj_json ","
                        conj_json = conj_json "\"" esc(tokens[i]) "\""
                    }
                    conj_json = conj_json "]"
                } else {
                    third_sing = (n_tok >= 2) ? tokens[2] : "-s"
                    past_form  = ""
                    part_form  = ""
                    gerund     = ""

                    if (n_tok == 3) {
                        gerund = tokens[3]
                    } else if (n_tok == 4) {
                        past_form = tokens[3]
                        part_form = tokens[3]
                        gerund    = tokens[4]
                    } else if (n_tok == 5) {
                        past_form = tokens[3]
                        part_form = tokens[4]
                        gerund    = tokens[5]
                    }
                    conj_json = verb_conj_json("", third_sing, past_form, part_form, gerund)
                }
            }

        } else {
            # ── Non-verb: raw array ─────────────────────────────────────────
            conj_json = "["
            first_f = 1
            for (i = 2; i <= n_tok; i++) {
                t = tokens[i]
                if (t == "") continue
                if (!first_f) conj_json = conj_json ","
                conj_json = conj_json "\"" esc(t) "\""
                first_f = 0
            }
            conj_json = conj_json "]"
        }

        # ---- Resolve me_word: [ME] > [MI] > last ancestor ----
        me_word = ""
        for (i = 1; i <= n_etym; i++) {
            if (el[i] == "ME") { me_word = ef[i]; break }
        }
        if (me_word == "") {
            for (i = 1; i <= n_etym; i++) {
                if (el[i] == "MI") { me_word = ef[i]; break }
            }
        }
        if (me_word == "") me_word = ef[n_etym]

        sub(/^[tT][oO][ \t]+/, "", me_word)
        split(me_word, mw, /[ \t,]+/)
        me_word = mw[1]

        # ---- Build etymology JSON array ----
        etym_json = "["
        for (i = 1; i <= n_etym; i++) {
            f = ef[i]; l = el[i]
            if (i > 1) etym_json = etym_json ","
            etym_json = etym_json "{\"form\":\"" esc(f) "\",\"lang\":\"" esc(l) "\"}"
        }
        etym_json = etym_json "]"

        # ---- Build sources JSON array ----
        src_json = "["
        for (i = 1; i <= n_src; i++) {
            if (i > 1) src_json = src_json ","
            src_json = src_json "\"" src_arr[i] "\""
        }
        src_json = src_json "]"

        # ---- Emit JSONL ----
        printf "{\"me_word\":\"%s\",\"inglisce_word\":\"%s\",\"pos\":\"%s\",\"conjugations\":%s,\"etymology\":%s,\"sources\":%s}\n", esc(me_word), esc(inglisce_word), esc(pos), conj_json, etym_json, src_json
    }' "$file"
}
  

# =============================================================================
# BROWSING & LOOKUP
# =============================================================================

# etym-cat <word>
# Prints the raw stanza content of a word's file, with stanza numbers.
etym-cat() {
    local word="$1"
    [[ -z "$word" ]] && { echo "Usage: etym-cat <word>"; return 1; }
    local file
    file=$(_etym_resolve_file "$word") || return 1
    awk -v RS="" '{ print "Stanza " NR ":\n" $0 "\n" }' "$file"
}


# etym-find <query>
# Recursive grep across the entire dictionary. Accepts words or lang tags like [OE].
etym-find() {
    local query="$1"
    [[ -z "$query" ]] && { echo "Usage: etym-find <query_or_lang_tag>"; return 1; }
    grep -r "$query" "$DICT_DIR"
}


# etym-info <word>
etym-info() {
    local word="$1"
    [[ -z "$word" ]] && { echo "Usage: etym-info <word>"; return 1; }
    local file
    file=$(_etym_resolve_file "$word") || return 1

    printf -- "--- Primary Definitions for: %s ---\n" "$word"
    printf -- "%-22s | %-28s | %-6s | %s\n" "INGLISCE" "PART OF SPEECH" "ORIGIN" "FORMS"
    echo "--------------------------------------------------------------------------------"

    etym-parse "$file" | jq -r --arg word "$word" '
        select(
            (.me_word       | ascii_downcase) == ($word | ascii_downcase) or
            (.inglisce_word | ascii_downcase) == ($word | ascii_downcase)
        ) |
        (.etymology | map(select(.lang == "ME" or .lang == "MI")) | last // .[-1]) as $origin |
        (
            if (.conjugations | type) == "object" then
                if .conjugations.present != "" then
                    [.conjugations.present, .conjugations.third_singular, .conjugations.past, .conjugations.gerund]
                else
                    [.conjugations.third_singular, .conjugations.past, .conjugations.gerund]
                end | map(select(. and . != "")) | join(" ")
            else
                (.conjugations | join(" "))
            end
        ) as $forms |
        [
            .inglisce_word,
            .pos,
            ($origin.lang | if . == "" or . == null then "?" else . end),
            $forms
        ] | @tsv
    ' | awk -F'\t' '{ printf "%-22s | %-28s | %-6s | %s\n", $1, $2, $3, $4 }'
}


# etym-chain <word>
etym-chain() {
    local word="$1"
    [[ -z "$word" ]] && { echo "Usage: etym-chain <word>"; return 1; }
    local file
    file=$(_etym_resolve_file "$word") || return 1

    local reform_name="${DICT_PROJECT_NAME:-Inglisce}"
    echo "--- Evolutionary Chain for: $word ---"

    etym-parse "$file" | jq -r --arg word "$word" --arg rn "$reform_name" '
        select(
            (.me_word       | ascii_downcase) == ($word | ascii_downcase) or
            (.inglisce_word | ascii_downcase) == ($word | ascii_downcase)
        ) |
        (.etymology[] | " ↳ \(.form)  [\(.lang)]"),
        (" ↳ \(.inglisce_word)  [\($rn)]"),
        "------------------------------------------------------------"
    '
}

# etym-cognates <query>
# Note: cognates intentionally does NOT filter by word — it searches for
# all words whose ancestry contains the query root, across all files.
# The select here filters on etymology content, not on me_word equality.
etym-cognates() {
    local query="$1"
    [[ -z "$query" ]] && { echo "Usage: etym-cognates <root_word_or_phrase>"; return 1; }

    echo "--- Modern Cognates for: $query ---"

    grep -rlF "$query" "$DICT_DIR" | while IFS= read -r file; do
        etym-parse "$file"
    done | jq -r --arg q "$query" '
        select(
            (.etymology | any(.form | test($q; "i"))) or
            (.inglisce_word | test($q; "i"))
        ) |
        "  ↳ \(.inglisce_word)  (\(.pos))  [from \(.me_word)]"
    ' | sort -u

    echo "------------------------------------------------------------"
}


# =============================================================================
# ANALYSIS
# =============================================================================

# etym-summarize [path] [--json] [-o <file>]
# Prints POS and language-origin statistics across a dictionary directory.
etym-summarize() {
    local format="text"
    local out_file=""
    local target_input=""

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --json)      format="json"; shift ;;
            -o|--out)    out_file="$2"; shift 2 ;;
            *)           [[ -z "$target_input" ]] && target_input="$1"; shift ;;
        esac
    done

    local target_path
    if   [[ -z "$target_input" ]];           then target_path="$DICT_DIR"
    elif [[ -d "$DICT_DIR/$target_input" ]]; then target_path="$DICT_DIR/$target_input"
    else target_path="$target_input"; fi

    [[ ! -d "$target_path" ]] && { echo "Error: Directory '$target_path' not found."; return 1; }

    # Single jq pass computes everything — POS, languages, and cross-tabulation at once.
    # The stream is consumed once and never re-read.
    local stats
    stats=$(_etym_stream "$target_path" | jq -s '
        def origin:
            .etymology as $e |
            ($e | map(select(.lang == "ME" or .lang == "MI")) | last) //
            ($e | last);

        {
            parts_of_speech: (
                map(.pos | split(",") | map(ltrimstr(" ") | rtrimstr(" "))) |
                flatten |
                map(select(. != "")) |
                group_by(.) |
                map({tag: .[0], count: length}) |
                sort_by(-.count)
            ),
            languages: (
                map(origin) |
                group_by(.lang) |
                map({tag: .[0].lang, count: length}) |
                sort_by(-.count)
            ),
            cross_tabulation: (
                map({pos: .pos, lang: (origin | .lang // "?")}) |
                group_by([.pos, .lang]) |
                map({pos: .[0].pos, lang: .[0].lang, count: length}) |
                sort_by(-.count)
            )
        }
    ')

    # ── JSON mode ────────────────────────────────────────────────────────────
    if [[ "$format" == "json" ]]; then
        if [[ -n "$out_file" ]]; then
            echo "$stats" > "$out_file" && echo "✅ Summary written to $out_file"
        else
            echo "$stats"
        fi
        return 0
    fi

    # ---- Text mode ----
    local output=""
    output+="Summarizing Data in: $target_path\n"
    output+="=================================================================\n\n"

    # Parts of Speech
    output+="PARTS OF SPEECH\n"
    output+="-----------------------------------------------------------------\n"
    local total_pos=0
    while IFS=$'\t' read -r count tag; do
        [[ -z "$count" ]] && continue
        local full_name
        full_name=$(grep -i "^$tag[[:space:]]" "$CONFIG_DIR/parts-of-speech.tsv" 2>/dev/null \
            | sed "s/^$tag[[:space:]]*//" | xargs)
        output+="$(printf '%7s | %-25s (%s)' "$count" "${full_name:-Unknown}" "$tag")"$'\n'
        total_pos=$((total_pos + count))
    done < <(echo "$stats" | jq -r '.parts_of_speech[] | [.count, .tag] | @tsv')
    output+="-----------------------------------------------------------------\n"
    output+="$(printf %7s)"

    # Language Origins
    output+="LANGUAGE ORIGINS\n"
    output+="-----------------------------------------------------------------\n"
    while IFS=$'\t' read -r count tag; do
        [[ -z "$count" ]] && continue
        local full_name
        full_name=$(get_lang_name "$tag")
        output+="$(printf '%7s | %-25s [%s]' "$count" "${full_name:-Unknown}" "$tag")"$'\n'
    done < <(echo "$stats" | jq -r '.languages[] | [.count, .tag] | @tsv')
    output+="-----------------------------------------------------------------\n\n"

    # Cross-tabulation — top 5 POS × top 5 LANG
    output+="CROSS-TABULATION (Top 5 POS × Top 5 LANG)\n"
    output+="-----------------------------------------------------------------\n"

    local top_pos=()
    local top_langs=()
    while IFS= read -r tag; do
        top_pos+=("$tag")
        [[ ${#top_pos[@]} -ge 5 ]] && break
    done < <(echo "$stats" | jq -r '.parts_of_speech[].tag')

    while IFS= read -r tag; do
        top_langs+=("$tag")
        [[ ${#top_langs[@]} -ge 5 ]] && break
    done < <(echo "$stats" | jq -r '.languages[].tag')

    declare -A xtab
    while IFS=$'\t' read -r pos lang count; do
        xtab["$pos	$lang"]="$count"
    done < <(echo "$stats" | jq -r '.cross_tabulation[] | [.pos, .lang, .count] | @tsv')

    local header
    header=$(printf "%-18s" "POS \\ LANG")
    for lang in "${top_langs[@]}"; do
        header+=$(printf "| %-7s " "$lang")
    done
    output+="$header"$'\n'
    output+="-----------------------------------------------------------------\n"

    for pos in "${top_pos[@]}"; do
        local row
        row=$(printf "%-18s" "$pos")
        for lang in "${top_langs[@]}"; do
            local val="${xtab["$pos	$lang"]:-0}"
            row+=$(printf "| %-7s " "$val")
        done
        output+="$row"$'\n'
    done
    output+="-----------------------------------------------------------------\n"

    if [[ -n "$out_file" ]]; then
        echo -e "$output" > "$out_file" && echo "✅ Summary written to $out_file"
    else
        echo -e "$output"
    fi
}


# etym-affix [path] [--prefix|--suffix] [-n <len>] [-p <pos>] [-l <lang>]
# Morphological frequency analysis of prefixes or suffixes across the dictionary.
etym-affix() {
    local affix_type="suffix"
    local affix_len=3
    local filter_pos=""
    local filter_lang=""
    local target_input=""

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --prefix)    affix_type="prefix"; shift ;;
            --suffix)    affix_type="suffix"; shift ;;
            -n|--length) affix_len="$2"; shift 2 ;;
            -p|--pos)    filter_pos="${2,,}"; shift 2 ;;
            -l|--lang)   filter_lang="${2^^}"; shift 2 ;;
            *)           [[ -z "$target_input" ]] && target_input="$1"; shift ;;
        esac
    done

    local target_path
    if   [[ -z "$target_input" ]];             then target_path="$DICT_DIR"
    elif [[ -e "$DICT_DIR/$target_input" ]];   then target_path="$DICT_DIR/$target_input"
    elif [[ -e "$target_input" ]];             then target_path="$target_input"
    else echo "Error: '$target_input' not found."; return 1; fi

    echo "Morphological Analysis: $affix_type ($affix_len letters)"
    [[ -n "$filter_pos" ]]  && echo "Filter POS:  $filter_pos"
    [[ -n "$filter_lang" ]] && echo "Filter LANG: $filter_lang"
    echo "================================================================="

    _etym_stream "$target_path" | \
    jq -r \
        --arg  type  "$affix_type" \
        --argjson len "$affix_len" \
        --arg  fpos  "$filter_pos" \
        --arg  flang "$filter_lang" '
        select(
            ($fpos  == "" or (.pos | ascii_downcase | contains($fpos))) and
            ($flang == "" or (.etymology | any(.lang == $flang)))
        ) |
        .inglisce_word |
        if length >= $len then
            if $type == "prefix" then .[0:$len] + "-"
            else "-" + .[-($len):]
            end
        else empty end
    ' | sort | uniq -c | sort -rn | head -20 | \
    awk '
    BEGIN {
        printf "%-15s | %-10s | %s\n", "AFFIX", "COUNT", "PERCENTAGE"
        print "-----------------------------------------------------------------"
        total = 0
    }
    { count[NR] = $1; affix[NR] = $2; total += $1 }
    END {
        for (i = 1; i <= NR; i++)
            printf "%-15s | %-10d | %.2f%%\n", affix[i], count[i], (count[i] / total) * 100
        print "================================================================="
    }'
}


# =============================================================================
# BUILD PIPELINE
# =============================================================================

# etym-build-dataset [output_file]
# Crawls DICT_DIR and writes master_dataset.jsonl — the primary Node input.
# Replaces the old etym-flatten --jsonl workflow.
etym-build-dataset() {
    local out_file="${1:-$ETYM_LIB_DIR/dist/master_dataset.jsonl}"
    mkdir -p "$(dirname "$out_file")"

    echo "🔨 Building dataset from $DICT_DIR..."
    echo "   Output: $out_file"
    echo "================================================================="

    _etym_stream "$DICT_DIR" > "$out_file"

    local count
    count=$(wc -l < "$out_file")
    echo "✅ $count stanzas written to $out_file"
}


# etym-flatten [path] [--jsonl|--csv] [-o <file>]
# Backward-compatible flattening command. Delegates to etym-build-dataset for JSONL.
etym-flatten() {
    local format="jsonl"
    local out_file=""
    local target_input=""

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --csv)       format="csv"; shift ;;
            --jsonl)     format="jsonl"; shift ;;
            -o|--output) out_file="$2"; shift 2 ;;
            *)           [[ -z "$target_input" ]] && target_input="$1"; shift ;;
        esac
    done

    local target_path="${target_input:-$DICT_DIR}"
    [[ ! -d "$target_path" ]] && { echo "Error: '$target_path' not found."; return 1; }

    if [[ -z "$out_file" ]]; then
        out_file="$ETYM_LIB_DIR/dist/master_dataset.$format"
    fi
    mkdir -p "$(dirname "$out_file")"

    echo "Flattening dictionary to $format..."
    echo "Output: $out_file"
    echo "================================================================="

    if [[ "$format" == "jsonl" ]]; then
        _etym_stream "$target_path" > "$out_file"
    else
        # CSV: header + one row per stanza
        echo '"me_word","inglisce_word","pos","conjugations"' > "$out_file"
        _etym_stream "$target_path" | \
            jq -r '[.me_word, .inglisce_word, .pos, (.conjugations | join(" "))] | @csv' \
            >> "$out_file"
    fi

    local count
    count=$(wc -l < "$out_file")
    echo "✅ Extraction complete! $count records written."
}


# =============================================================================
# GRAPH & VISUALIZATION
# =============================================================================

# etym-graph [path] [-o <file>]
# Builds a JSON node/edge graph of all etymological relationships.
etym-graph() {
    local out_file="etym_graph.json"
    local target_input=""

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            -o|--out) out_file="$2"; shift 2 ;;
            *)        [[ -z "$target_input" ]] && target_input="$1"; shift ;;
        esac
    done

    local target_path
    if   [[ -z "$target_input" ]];             then target_path="$DICT_DIR"
    elif [[ -e "$DICT_DIR/$target_input" ]];   then target_path="$DICT_DIR/$target_input"
    elif [[ -e "$target_input" ]];             then target_path="$target_input"
    else echo "Error: '$target_input' not found."; return 1; fi

    ! command -v jq &>/dev/null && { echo "Error: 'jq' is required."; return 1; }

    # --- Explicit jq 1.6+ Version Check ---
    local jq_version
    jq_version=$(jq --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    if ! awk -v ver="$jq_version" 'BEGIN { exit (ver >= 1.6 ? 0 : 1) }'; then
        echo "❌ Error: etym-graph requires jq version 1.6 or higher (found: ${jq_version:-unknown})." >&2
        echo "Please update jq to safely process range() functions in the graph builder." >&2
        return 1
    fi

    local reform_name="${DICT_PROJECT_NAME:-Inglisce}"
    echo "Building Etymological Graph from $target_path..."
    echo "================================================================="

    _etym_stream "$target_path" | jq -rs --arg rn "$reform_name" '
        # Append the Inglisce node to each etymology chain, then flatten
        map(
            . as $e |
            (.etymology + [{form: $e.inglisce_word, lang: $rn, pos: $e.pos}]) as $chain |
            {
                nodes: ($chain | map({
                    id:    (.form + "_" + .lang),
                    label: .form,
                    lang:  .lang,
                    pos:   (.pos // "")
                })),
                edges: (
                    range(1; ($chain | length)) | . as $i | {
                        source: ($chain[$i-1].form + "_" + $chain[$i-1].lang),
                        target: ($chain[$i].form   + "_" + $chain[$i].lang)
                    }
                )
            }
        ) |
        {
            nodes: (map(.nodes[]) | unique_by(.id)),
            edges: (map(.edges)   | unique_by([.source, .target]))
        }
    ' > "$out_file"

    if [[ $? -eq 0 ]]; then
        local node_count edge_count
        node_count=$(jq '.nodes | length' "$out_file")
        edge_count=$(jq  '.edges | length' "$out_file")
        printf "✅ Graph complete! \e[1m%d\e[0m nodes, \e[1m%d\e[0m edges → \e[32m%s\e[0m\n" \
            "$node_count" "$edge_count" "$out_file"
    else
        echo "❌ Error generating graph. Check stanza formatting."
    fi
    echo "================================================================="
}


# etym-visualize [graph_file]
# Converts etym_graph.json into a Mermaid markdown file for preview.
etym-visualize() {
    local graph_file="${1:-etym_graph.json}"
    local out_file="etym_graph.md"

    if [[ ! -f "$graph_file" ]]; then
        echo "Error: '$graph_file' not found. Run 'etym-graph' first."
        return 1
    fi

    echo "Converting $graph_file to Mermaid Markdown..."
    echo "================================================================="

    {
        echo '```mermaid'
        echo 'graph LR'
        jq -r '
            (.nodes[] | "  \(.id)[\"\(.label)<br><b>[\(.lang)]</b>\"]"),
            (.edges[] | "  \(.source) --> \(.target)")
        ' "$graph_file"
        echo '```'
    } > "$out_file"

    echo "✅ Generated: $out_file"
    echo "💡 Open in your editor and use 'Open Preview' (Cmd+K V / Ctrl+K V) to view."
    echo "================================================================="
}


# =============================================================================
# FILE MANAGEMENT
# =============================================================================

# etym-create-histories [-d] [-v] [--dirs <a,b,c>]
# Splits each multi-stanza .txt file into individual per-definition history files.
etym-create-histories() {
    local dry_run=0
    local verbose=0
    local dirs=""
    local source_dir="$DICT_DIR"
    local output_dir="$HISTORIES_DIR"

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            -d|--dry-run) dry_run=1; shift ;;
            -v|--verbose) verbose=1; shift ;;
            --dirs)       dirs="$2"; shift 2 ;;
            -h|--help)
                echo "Usage: etym-create-histories [-d] [-v] [--dirs <a,b,c>]"
                echo "  -d, --dry-run      Preview without writing files"
                echo "  -v, --verbose      Show each extracted file"
                echo "  --dirs <a,b,c>     Process only specific letter directories"
                return 0 ;;
            *) echo "Unknown option: $1"; return 1 ;;
        esac
    done

    local target_dirs=()
    if [[ -n "$dirs" ]]; then
        IFS=',' read -ra target_dirs <<< "$dirs"
    else
        for d in "$source_dir"/?/; do
            [[ -d "$d" ]] && target_dirs+=("$(basename "$d")")
        done
    fi

    echo "Creating histories: $source_dir → $output_dir"
    [[ $dry_run -eq 1 ]] && echo "⚠️  DRY RUN — no files will be written."
    echo "================================================================="

    local total_extracted=0

    for dir in "${target_dirs[@]}"; do
        dir=$(echo "$dir" | xargs)
        local current_src="$source_dir/$dir"
        local target_dir="$output_dir/$dir"

        [[ ! -d "$current_src" ]] && continue
        
        if [[ $dry_run -eq 0 ]]; then
            mkdir -p "$target_dir"
        fi

        # 1. AWK parses by paragraph (RS="") so every stanza is processed independently
        find "$current_src" -maxdepth 1 -type f -name "*.txt" -exec awk \
            -v target_dir="$target_dir" \
            -v dry_run="$dry_run" \
            -v verbose="$verbose" \
            '
            BEGIN { RS = ""; FS = "\n" }
            {
                reformed = ""; base_word = ""; file_pos = ""; reformed_idx = 0

                # 1. Identify the reformed dictionary line and its line index
                for (i = 1; i <= NF; i++) {
                    line = $i
                    gsub(/\r/, "", line)
                    if (line ~ /^http/) break
                    
                    # Match the parentheses tag at the very end of the line
                    if (line ~ /\([^)]+\)[ \t]*$/ && line !~ /\[[A-Z]/) {
                        reformed = line
                        reformed_idx = i
                    }
                }

                if (reformed == "" || reformed_idx <= 1) next

                # 2. Extract POS and safely map it to a verbose string
                pos_tag = reformed
                # Greedy match clears out ALL parentheses before the final POS tag
                sub(/.*\(/, "", pos_tag)
                sub(/\).*/, "", pos_tag)
                
                # Split by comma if there are multiple tags, grab the first
                split(pos_tag, p_arr, ",")
                pos_tag = p_arr[1]
                gsub(/^[ \t]+|[ \t]+$/, "", pos_tag)
                pos_tag = tolower(pos_tag)

                # Map shorthand to full verbose names using end-of-string anchors ($)
                if (pos_tag ~ /(^|[ \t])(v|tr v|intr v|verb)$/) file_pos = "verb"
                else if (pos_tag ~ /(^|[ \t])(n|m n|f n|noun|masculine noun|feminine noun|neuter noun)$/) file_pos = "noun"
                else if (pos_tag ~ /(^|[ \t])(adj|adjective)$/) file_pos = "adjective"
                else if (pos_tag ~ /(^|[ \t])(adv|adverb)$/) file_pos = "adverb"
                else if (pos_tag ~ /(^|[ \t])(prep|preposition)$/) file_pos = "preposition"
                else if (pos_tag ~ /(^|[ \t])(pron|pronoun)$/) file_pos = "pronoun"
                else if (pos_tag ~ /(^|[ \t])(conj|conjunction)$/) file_pos = "conjunction"
                else if (pos_tag ~ /(^|[ \t])(num|number)$/) file_pos = "number"
                else if (pos_tag ~ /(^|[ \t])(art|article|definite article|indefinite article|defin|indefin)$/) file_pos = "article"
                else if (pos_tag ~ /(^|[ \t])(modal)$/) file_pos = "modal"
                else if (pos_tag ~ /(^|[ \t])(aux|auxiliary)$/) file_pos = "auxiliary"
                else {
                    # Safety fallback for completely unrecognized tags
                    file_pos = pos_tag
                    gsub(/[^a-z0-9]/, "_", file_pos)
                }

                # 3. Base word is ALWAYS the line immediately preceding the reformed line
                base_word = $(reformed_idx - 1)
                gsub(/\r/, "", base_word)

                # 4. Clean the base word to use as the filename (strips ANY language tag)
                temp_base = base_word
                gsub(/\[[A-Za-z0-9_ -]+\]/, "", temp_base)
                gsub(/^[ \t]+|[ \t]+$/, "", temp_base)
                sub(/^[tT][oO][ \t]+/, "", temp_base)
                
                # Grab just the primary English word
                split(temp_base, mw, /[ \t,]+/)
                word = mw[1]

                if (word == "" || file_pos == "") next

                out_file = target_dir "/" word "_" file_pos ".txt"

                # 5. Write the history stanza EXCLUDING the reformed line
                if (dry_run == "0") {
                    out_text = ""
                    first = 1
                    for (i = 1; i <= NF; i++) {
                        if (i == reformed_idx) continue
                        line = $i
                        gsub(/\r/, "", line)
                        if (!first) out_text = out_text "\n"
                        out_text = out_text line
                        first = 0
                    }
                    print out_text > out_file
                    close(out_file)
                }
                
                if (verbose == "1" || dry_run == "1") {
                    print "  → " word "_" file_pos ".txt"
                }
            }
            ' {} +

        # 3. Use find to calculate exact disk modifications
        local dir_count=0
        if [[ $dry_run -eq 0 ]]; then
            dir_count=$(find "$target_dir" -maxdepth 1 -type f -name "*.txt" 2>/dev/null | wc -l)
            dir_count=$(echo "$dir_count" | xargs) # Trim padding from wc
        fi

        if [[ $dir_count -gt 0 || $dry_run -eq 1 ]]; then
            echo "Extracted: $dir/ ($dir_count files processed)"
            total_extracted=$((total_extracted + dir_count))
        fi
    done

    echo "------------------------------------------"
    echo "Complete! Extracted/Updated $total_extracted files."
}

# etym-lint [path] [--strict]
# Validates .txt file formatting across the dictionary.
etym-lint() {
    local strict=0
    local target_input=""

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --strict) strict=1; shift ;;
            *)        [[ -z "$target_input" ]] && target_input="$1"; shift ;;
        esac
    done

    local target_dir
    if   [[ -z "$target_input" ]];             then target_dir="$DICT_DIR"
    elif [[ -e "$DICT_DIR/$target_input" ]];   then target_dir="$DICT_DIR/$target_input"
    else target_dir="$target_input"; fi

    [[ ! -e "$target_dir" ]] && { echo "Error: '$target_dir' not found."; return 1; }

    echo "Linting: $target_dir"
    echo "================================================================="

    local total=0 fatals=0 errors=0 warns=0

    # ── Format validation (per file) ────────────────────────────────────────
    while IFS= read -r -d '' file; do
        ((total++))
        local issues=()

        if [[ ! -s "$file" ]]; then
            issues+=("\e[31m[FATAL]\e[0m File is empty.")
            ((fatals++))
        else
            local no_urls
            no_urls=$(grep -v "http" "$file")

            if ! echo "$no_urls" | grep -Poq "\([a-z ]{1,5}(, [a-z ]{1,5})*\)"; then
                issues+=("\e[31m[ERROR]\e[0m Missing or malformed POS tag '()'")
                ((errors++))
            fi

            if ! echo "$no_urls" | grep -Poq "\[[A-Z]+\]"; then
                issues+=("\e[31m[ERROR]\e[0m Missing or malformed language tag '[]'")
                ((errors++))
            fi

            if echo "$no_urls" | grep -Eq "\[[A-Z]+\].*\(|\(.*\[[A-Z]+\]"; then
                issues+=("\e[31m[ERROR]\e[0m Language tag '[]' and POS tag '()' must be on separate lines.")
                ((errors++))
            fi

            if grep -q "[[:space:]]$" "$file"; then
                issues+=("\e[33m[WARN]\e[0m  Trailing whitespace on one or more lines.")
                ((warns++))
            fi

            # Stanzas with no resolvable language origin
            if etym-parse "$file" | jq -se '
                any(.[]; 
                    .etymology as $e |
                    (($e | map(select(.lang == "ME" or .lang == "MI")) | last) //
                     ($e | last)) |
                    .lang == "" or . == null
                )
            ' > /dev/null 2>&1; then
                issues+=("\e[33m[WARN]\e[0m  One or more stanzas have no resolvable language tag.")
                ((warns++))
            fi
        fi

        if [[ ${#issues[@]} -gt 0 ]]; then
            echo -e "📝 \e[1m${file#$DICT_DIR/}\e[0m"
            for issue in "${issues[@]}"; do echo -e "   $issue"; done
            echo ""
        fi

    done < <(find "$target_dir" -type f -print0)

    # ── Verb conjugation analysis (via etym-parse) ───────────────────────────
    # Stream all stanzas, collect verb stats in a single pass
    local verb_stats
    verb_stats=$(
        find "$target_dir" -type f -name "*.txt" | while IFS= read -r f; do
            etym-parse "$f" | jq -r --arg file "$f" '
                select(.pos | test("^(v|tr v|intr v)$"; "i")) |
                .conjugations as $c |
                (
                    if ($c.third_singular == "-s" and ($c.past == "-d" or $c.past == "-ed") and $c.gerund == "-ing")
                        then "standard"
                        else "nonstandard"
                        end
                ) + "\t" + $file + "\t" + .inglisce_word + "\t" + (
                    if $c.present != "" then
                        [$c.present, $c.third_singular, $c.past, $c.participle, $c.gerund]
                    else
                        [$c.third_singular, $c.past, $c.gerund]
                    end | map(select(. != "")) | join(" ")
                )
            '
        done
    )

    local verb_standard verb_nonstandard
    verb_standard=$(echo "$verb_stats"   | grep -c "^standard"   || true)
    verb_nonstandard=$(echo "$verb_stats" | grep -c "^nonstandard" || true)

    # ── Report ───────────────────────────────────────────────────────────────
    echo "-----------------------------------------------------------------"
    echo "LINTING COMPLETE"
    echo "-----------------------------------------------------------------"
    printf "Files Scanned:   %d\n"            "$total"
    printf "Fatal Errors:    \e[31m%d\e[0m\n" "$fatals"
    printf "Standard Errs:   \e[31m%d\e[0m\n" "$errors"
    printf "Warnings:        \e[33m%d\e[0m\n" "$warns"

    echo ""
    echo "VERB CONJUGATION COVERAGE"
    echo "-----------------------------------------------------------------"
    printf "Using -s -d -ing:  %d\n" "$verb_standard"
    printf "Non-standard:      %d\n" "$verb_nonstandard"

    if [[ "$verb_nonstandard" -gt 0 ]]; then
        echo ""
        echo "  Non-standard verb stanzas:"
        echo "$verb_stats" | grep "^nonstandard" | while IFS=$'\t' read -r _ file word forms; do
            printf "    %-30s  %-20s  %s\n" "${file#$DICT_DIR/}" "$word" "$forms"
        done
    fi

    echo "================================================================="

    [[ $fatals -gt 0 || $errors -gt 0 ]] && return 1
    return 0
}

# etym-trim [path]
# Strips trailing whitespace from all .txt files in a directory.
etym-trim() {
    local target_dir="${1:-$DICT_DIR}"
    [[ ! -d "$target_dir" ]] && { echo "Error: '$target_dir' not found."; return 1; }

    echo "Trimming trailing whitespace in: $target_dir"
    echo "================================================================="

    if [[ "$OSTYPE" == "darwin"* ]]; then
        find "$target_dir" -type f -name "*.txt" -exec sed -i '' -e 's/[[:space:]]*$//' {} +
    else
        find "$target_dir" -type f -name "*.txt" -exec sed -i 's/[[:space:]]*$//' {} +
    fi

    echo "✅ Trailing whitespace removed."
    echo "================================================================="
}
