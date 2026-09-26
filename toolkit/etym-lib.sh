#!/bin/bash

# --- 1. BOOTSTRAP CONFIG ---
export ETYM_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$ETYM_LIB_DIR/config/env.sh"
[[ -z "${ETYM_QUIET:-}" ]] && echo "etym-lib has been sourced" >&2

# The canonical stanza parser lives in its own file so it can be tested,
# edited, and linted directly. etym-parse.awk is strictly POSIX awk.
export ETYM_PARSE_AWK="$ETYM_LIB_DIR/etym-parse.awk"

# Which awk to run the parser with. Overridable via $ETYM_AWK; the dependency
# check below may upgrade this to gawk if the system awk is too limited.
_ETYM_AWK="${ETYM_AWK:-awk}"

# --- 2. DEPENDENCY CHECK (passive) ---
# Contract: sourcing this library NEVER prompts, blocks on stdin, or runs
# sudo. It only detects, warns on stderr, and records what's missing in
# $ETYM_MISSING_DEPS. Installation is a deliberate act: `etym-install-deps`.

ETYM_MISSING_DEPS=()

# _etym_check_deps
# Populates ETYM_MISSING_DEPS and prints a warning if anything is absent.
# Always returns 0 so it can never abort a `set -e` caller at source time.
_etym_check_deps() {
    ETYM_MISSING_DEPS=()

    command -v jq >/dev/null 2>&1 || ETYM_MISSING_DEPS+=("jq")

    # etym-parse.awk is POSIX awk, so gawk is no longer required — but the
    # parser does use POSIX character classes ([[:cntrl:]]), which very old
    # awks lack. Probe the selected binary; prefer gawk as a fallback.
    if ! "$_ETYM_AWK" 'BEGIN { if ("x" ~ /[[:alpha:]]/) exit 0; exit 1 }' </dev/null 2>/dev/null; then
        if command -v gawk >/dev/null 2>&1; then
            _ETYM_AWK="gawk"
        else
            ETYM_MISSING_DEPS+=("gawk")
        fi
    fi

    if (( ${#ETYM_MISSING_DEPS[@]} > 0 )); then
        {
            echo "⚠️  etym-lib: missing dependencies: ${ETYM_MISSING_DEPS[*]}"
            echo "   Most functions will not work until they are installed."
            echo "   Run 'etym-install-deps', or install manually:"
            echo "     macOS:         brew install ${ETYM_MISSING_DEPS[*]}"
            echo "     Debian/Ubuntu: sudo apt install ${ETYM_MISSING_DEPS[*]}"
        } >&2
    fi
    return 0
}

# etym-install-deps
# The ONLY place interaction and privilege escalation are allowed, because
# the user invoked it on purpose. Refuses politely in non-interactive shells.
etym-install-deps() {
    _etym_check_deps
    if (( ${#ETYM_MISSING_DEPS[@]} == 0 )); then
        echo "✅ All dependencies present."
        return 0
    fi

    if [[ ! -t 0 ]]; then
        echo "❌ Non-interactive shell — refusing to install automatically." >&2
        echo "   Install manually: ${ETYM_MISSING_DEPS[*]}" >&2
        return 1
    fi

    local reply
    read -r -p "Install ${ETYM_MISSING_DEPS[*]} now? (y/n) " reply
    [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted. No changes made."; return 1; }

    if [[ "$OSTYPE" == "darwin"* ]] && command -v brew >/dev/null 2>&1; then
        brew install "${ETYM_MISSING_DEPS[@]}"
    elif [[ "$OSTYPE" == "linux-gnu"* ]] && command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y "${ETYM_MISSING_DEPS[@]}"
    else
        echo "❌ No supported package manager found. Please install manually." >&2
        return 1
    fi

    _etym_check_deps
    (( ${#ETYM_MISSING_DEPS[@]} == 0 )) && echo "✅ All dependencies installed."
}

_etym_check_deps

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

    # Fallback: whole-word content search. POSIX ERE boundaries replace the
    # old PCRE lookarounds (-P is GNU-only and unavailable on macOS grep),
    # and the word is regex-escaped so punctuation can't inject patterns.
    if [[ -z "$file" ]]; then
        local esc_word
        esc_word=$(printf '%s' "$word" | sed 's/[][\.*^$(){}?+|/]/\\&/g')
        file=$(grep -rlE "(^|[^a-zA-Z])${esc_word}([^a-zA-Z]|$)" "$dir" 2>/dev/null | head -1)
    fi

    if [[ -z "$file" ]]; then
        echo "Error: '$word' not found in $dir" >&2
        return 1
    fi
    echo "$file"
}

# _etym_stream [path]
# Streams all JSONL from every .txt file under a given path.
# Defaults to $DICT_DIR. The output is suitable for piping into jq.
# Runs the parser as a SINGLE awk process over all files (paragraph mode
# never merges records across file boundaries), instead of forking one
# process per file.
_etym_stream() {
    local path="${1:-$DICT_DIR}"
    [[ ! -f "$ETYM_PARSE_AWK" ]] && { echo "Error: parser not found: $ETYM_PARSE_AWK" >&2; return 1; }
    find "$path" -type f -name "*.txt" -exec "$_ETYM_AWK" -f "$ETYM_PARSE_AWK" {} +
}

# etym-parse <file.txt>
# ─────────────────────────────────────────────────────────────────────────────
# THE CANONICAL STANZA PARSER. Single source of truth for reading .txt entries.
# Emits one JSONL record per stanza to stdout.
#
# The implementation lives in etym-parse.awk (same directory as this library)
# so it can be edited with syntax highlighting, linted, and golden-tested
# directly: see tests/test-etym-parse.sh. The output schema and the six
# conjugation classes are documented in that file's header.
# ─────────────────────────────────────────────────────────────────────────────
etym-parse() {
    local file="$1"
    [[ ! -f "$file" ]] && { echo "Error: file not found: $file" >&2; return 1; }
    [[ ! -f "$ETYM_PARSE_AWK" ]] && { echo "Error: parser not found: $ETYM_PARSE_AWK" >&2; return 1; }

    "$_ETYM_AWK" -f "$ETYM_PARSE_AWK" "$file"
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
# Recursive LITERAL search across the entire dictionary. Accepts words or lang
# tags like [OE]. Literal matching (-F) both prevents regex injection and fixes
# tag search: as a regex, "[OE]" was a character class matching any O or E.
etym-find() {
    local query="$1"
    [[ -z "$query" ]] && { echo "Usage: etym-find <query_or_lang_tag>"; return 1; }
    grep -rF "$query" "$DICT_DIR"
}


# etym-info <word>
# etym-info <word> [--brief|--chain|--json] [--no-sources]
#
# Merged replacement for the old etym-info + etym-chain pair. Both resolved the
# same file, ran the same parse and the same stanza selection, and differed only
# in projection — so a word with several stanzas produced a table from one and a
# stack of chains from the other, with no way to tell which chain belonged to
# which row. This prints one numbered block per stanza so the correspondence is
# structural rather than something the reader reconstructs.
#
# Modes:
#   (default)   summary table, then a detail block per stanza
#   --brief     summary table only (the old etym-info output)
#   --chain     descent chains only (the old etym-chain output)
#   --json      the selected records as a JSON array, for piping into jq
#
#   --no-sources  omit source URLs from the detail blocks
#
# ORIGIN is the oldest attested language in the chain — etymology[0] — not the
# newest. The previous implementation filtered the chain down to [ME]/[MI] lines
# and took the last, which could only ever return ME, since every stanza carries
# an [ME] line and the chain runs oldest to newest. Its `// .[-1]` fallback was
# unreachable for the same reason.
etym-info() {
    local word="" mode="full" show_sources=1
    local usage="Usage: etym-info <word> [--brief|--chain|--json] [--no-sources]"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --brief)      mode="brief" ;;
            --chain)      mode="chain" ;;
            --json)       mode="json" ;;
            --sources)    show_sources=1 ;;
            --no-sources) show_sources=0 ;;
            -*)           echo "$usage"; return 1 ;;
            *)            [[ -z "$word" ]] && word="$1" ;;
        esac
        shift
    done

    [[ -z "$word" ]] && { echo "$usage"; return 1; }

    local file
    file=$(_etym_resolve_file "$word") || return 1

    local reform_name="${DICT_PROJECT_NAME:-Inglisce}"

    # Parse once. Every mode below reads this, rather than re-spawning the
    # parser per view.
    local records
    records=$(etym-parse "$file" | jq -c --arg word "$word" '
        select(
            (.me_word       | ascii_downcase) == ($word | ascii_downcase) or
            (.inglisce_word | ascii_downcase) == ($word | ascii_downcase)
        )
    ')

    if [[ -z "$records" ]]; then
        echo "Error: '$word' resolved to ${file##*/}, but no stanza in it matches." >&2
        return 1
    fi

    if [[ "$mode" == "json" ]]; then
        printf '%s\n' "$records" | jq -s '.'
        return 0
    fi

    # ── Summary table ────────────────────────────────────────────────────────
    if [[ "$mode" == "full" || "$mode" == "brief" ]]; then
        printf -- "--- Primary Definitions for: %s ---\n" "$word"
        printf -- "%-3s %-22s | %-28s | %-6s | %s\n" \
            "#" "INGLISCE" "PART OF SPEECH" "ORIGIN" "FORMS"
        echo "--------------------------------------------------------------------------------"

        printf '%s\n' "$records" | jq -s -r '
            to_entries[] |
            .key as $i | .value |
            # conjugations is always a named object (slot verbs, {explicit},
            # {plural[,variants]}, {forms}); flatten every string leaf.
            (.conjugations | [.. | strings] | map(select(. != "")) | join(" ")) as $forms |
            ((.etymology[0].lang // "") | if . == "" then "?" else . end) as $origin |
            [ ($i + 1 | tostring), .inglisce_word, .pos, $origin, $forms ] | @tsv
        ' | awk -F'\t' '{ printf "%-3s %-22s | %-28s | %-6s | %s\n", $1, $2, $3, $4, $5 }'
    fi

    [[ "$mode" == "brief" ]] && return 0

    # ── Detail blocks ────────────────────────────────────────────────────────
    if [[ "$mode" == "full" ]]; then
        echo ""
    else
        printf -- "--- Evolutionary Chain for: %s ---\n" "$word"
    fi

    printf '%s\n' "$records" | jq -s -r \
        --arg rn "$reform_name" \
        --arg mode "$mode" \
        --argjson src "$show_sources" '
        def chain:
            [ (.etymology[] | "\(.form) [\(.lang)]") ]
            + [ "\(.inglisce_word) [\($rn)]" ]
            | join("  →  ");

        to_entries[] |
        .key as $i | .value as $r |
        ($r.conjugations | [.. | strings] | map(select(. != ""))) as $forms |
        (
            [ "[\($i + 1)] \($r.inglisce_word)  (\($r.pos))",
              "    " + ($r | chain) ]
            + (if $mode != "chain" and ($forms | length) > 0
               then [ "    forms: " + ($forms | join(" ")) ]
               else [] end)
            + (if $mode != "chain" and $src == 1
               then ($r.sources | map("    " + .))
               else [] end)
            + [ "" ]
        ) | .[]
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


# -----------------------------------------------------------------------------
# Shared by etym-pron and etym-morph
# -----------------------------------------------------------------------------

# _etym_me_rows <word> [<file>...]
# Emits one tab-separated row per stanza: file, stanza number, POS, [ME] text,
# reformed line (POS removed), and the language tags of the stanza's lines,
# top to bottom, space-separated. Consumers that want only the first four
# columns can ignore the rest.
# With no files named, reads a NUL-separated file list on stdin (find -print0),
# for runs over the whole dictionary that would overflow a command line.
# With <word> empty, every stanza that has an [ME] line; otherwise only those
# where <word> equals a comma-separated [ME] form or the reformed headword
# (the same selection as etym-info).
#
# Why this does not go through etym-parse: the parser's me_word keeps only the
# first token of the [ME] line, so "can, could, can't, couldn't" and
# "New York" would arrive truncated, and its me_src keeps the suffixes written
# after the tag ("to close [ME] -s -d -ing"). This reads the files itself,
# using etym-parse.awk's own tests for what counts as a reformed line, an [ME]
# line and a POS tag. If those change there, change them here too.
#
# The [ME] text is cut at the tag, and only the first [ME] line of a stanza is
# read, as in the parser. Stanza numbers are positions in the file (etym-cat).
_etym_me_rows() {
    local want="$1"; shift
    local prog='
        function trim(x) { gsub(/^[ \t]+|[ \t]+$/, "", x); return x }
        function strip_to(x) { sub(/^[tT][oO][ \t]+/, "", x); return x }
        BEGIN { RS = ""; FS = "\n"; want = tolower(want) }
        {
            me = ""; reformed = ""; pos = ""; langs = ""
            for (i = 1; i <= NF; i++) {
                line = $i
                gsub(/\r/, "", line)
                if (line == "" || line ~ /^http/) continue
                if (line ~ /\([a-z]/ && line !~ /\[[A-Z]/) { reformed = line; continue }
                if (match(line, /\[[A-Z]+\]/))
                    langs = langs (langs == "" ? "" : " ") substr(line, RSTART + 1, RLENGTH - 2)
                if (me == "" && match(line, /\[ME\]/))
                    me = trim(substr(line, 1, RSTART - 1))
            }
            rf = reformed
            sub(/[ \t]*\([a-z][a-z ,]*\)[ \t]*$/, "", rf)
            rf = trim(rf)

            if (match(reformed, /\([a-z][a-z ,]*\)[ \t]*$/)) {
                pos = substr(reformed, RSTART + 1)
                sub(/\).*$/, "", pos)
            }

            if (want == "") {
                hit = (me != "")
            } else {
                hit = 0
                n = split(me, forms, ",")
                for (j = 1; j <= n; j++)
                    if (tolower(strip_to(trim(forms[j]))) == want) hit = 1
                head = strip_to(trim(reformed))
                split(head, ht, /[ \t,]+/)
                sub(/[,.]$/, "", ht[1])
                if (ht[1] != "" && tolower(ht[1]) == want) hit = 1
            }

            if (hit) printf "%s\t%d\t%s\t%s\t%s\t%s\n", FILENAME, FNR, pos, me, rf, langs
        }
    '
    if [[ $# -gt 0 ]]; then
        "$_ETYM_AWK" -v want="$want" "$prog" "$@"
    else
        xargs -0 -r "$_ETYM_AWK" -v want="$want" "$prog"
    fi
}

# The venvs _etym_python looks in, in order. toolkit/ is where .gitignore
# expects one; the root is where the README puts it.
_etym_venvs() {
    printf '%s\n' "${VIRTUAL_ENV:-}" "$ETYM_LIB_DIR/venv" "$ETYM_LIB_DIR/.venv" \
                  "$PROJECT_ROOT/venv" "$PROJECT_ROOT/.venv"
}

# _etym_python
# Prints the full path of the Python the toolkit's scripts should run under:
# $ETYM_PYTHON if set, else the first venv from _etym_venvs, else python3. A
# venv is used without needing to be activated.
_etym_python() {
    local py="${ETYM_PYTHON:-}" venv
    if [[ -z "$py" ]]; then
        while IFS= read -r venv; do
            [[ -n "$venv" && -x "$venv/bin/python" ]] && { py="$venv/bin/python"; break; }
        done < <(_etym_venvs)
    fi
    [[ -z "$py" ]] && py="python3"
    command -v "$py" 2>/dev/null || echo "$py"
}

# _etym_need_module <python> <module> [<extra line>...]
# Returns 0 if <python> can import <module>. Otherwise prints an error naming
# that interpreter and the exact command to install into it, then any extra
# lines, then where it looked for a venv if it found none; returns 1.
_etym_need_module() {
    local py="$1" module="$2" venv; shift 2
    "$py" -c "import $module" >/dev/null 2>&1 && return 0
    {
        echo "Error: the $module package is not installed for $py."
        echo "  Install it into that interpreter:"
        echo "    \"$py\" -m pip install $module"
        echo "  or point ETYM_PYTHON at an interpreter that has it"
        local line; for line in "$@"; do echo "  $line"; done
        if [[ -z "${ETYM_PYTHON:-}" && "$py" != */venv/bin/python && "$py" != */.venv/bin/python ]]; then
            echo "  (No venv found. Looked in:"
            while IFS= read -r venv; do [[ -n "$venv" ]] && echo "     $venv"; done < <(_etym_venvs)
            [[ -z "${VIRTUAL_ENV:-}" ]] && echo "     (\$VIRTUAL_ENV is unset: no venv is active)"
            echo "  )"
        fi
    } >&2
    return 1
}


# etym-pron <word> [--ipa|--both]
# Prints the General American pronunciation (CMUdict ARPAbet, stress digits
# kept) of every word on the [ME] line of each stanza that matches <word>.
# --ipa converts it to IPA-like notation; --both prints IPA beside ARPAbet.
# The conversion and its limits are documented at to_ipa in cmu_pron.py.
#
# Stanzas are chosen and read by _etym_me_rows. Only [ME] is read — never [MI]
# or an older form, since CMUdict describes Modern English. The lookup itself
# is scripts/cmu_pron.py; it needs the `cmudict` package (pip install cmudict)
# in the interpreter _etym_python picks, or ETYM_CMUDICT pointing at a
# cmudict.dict file.
etym-pron() {
    local word="" mode="arpa"
    local usage="Usage: etym-pron <word> [--ipa|--both]"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --ipa)      mode="ipa" ;;
            --both)     mode="both" ;;
            --arpa)     mode="arpa" ;;
            -h|--help)  echo "$usage"; return 0 ;;
            -*)         echo "$usage" >&2; return 1 ;;
            *)          [[ -z "$word" ]] && word="$1" ;;
        esac
        shift
    done
    [[ -z "$word" ]] && { echo "$usage"; return 1; }

    local script="$ETYM_LIB_DIR/scripts/cmu_pron.py"
    [[ ! -f "$script" ]] && { echo "Error: lookup script not found: $script" >&2; return 1; }

    local file rows
    file=$(_etym_resolve_file "$word") || return 1
    rows=$(_etym_me_rows "$word" "$file" | cut -f2-)
    if [[ -z "$rows" ]]; then
        echo "Error: '$word' resolved to ${file##*/}, but no stanza in it matches." >&2
        return 1
    fi

    local py
    py=$(_etym_python)
    # Check the data source before printing anything, so a missing package
    # reports once, cleanly, and names the interpreter it was missing from.
    if [[ -n "${ETYM_CMUDICT:-}" ]]; then
        [[ -f "$ETYM_CMUDICT" ]] || {
            echo "Error: ETYM_CMUDICT is set but no file is there: $ETYM_CMUDICT" >&2
            return 1
        }
    else
        _etym_need_module "$py" cmudict "or set ETYM_CMUDICT to a cmudict.dict file." || return 1
    fi

    printf -- "--- Pronunciation (CMUdict, General American) for: %s ---\n" "$word"
    printf '%s\n' "$rows" | "$py" "$script" "$mode"
}


# etym-morph <word> [--raw]
# etym-morph --suffix <suffix> [--raw]
# etym-morph --setup [<MorphoLEX_en.xlsx>]
# Morphological segmentation from MorphoLex-en (68,624 English words, with the
# English Lexicon Project's part of speech for each).
#
#   <word>             segments every word on the [ME] line of each matching
#                      stanza, stanzas chosen as in etym-pron
#   --suffix <suffix>  lists every [ME] word in the dictionary whose
#                      segmentation contains <suffix>, grouped by ELP part of
#                      speech, with your POS and file:stanza beside each
#   --setup [<file>]   builds the lookup cache, downloading the workbook from
#                      GitHub unless a local copy is given
#
# Output shows each segmentation as parts ("wood + -en") and each part of
# speech in words ("adjective"). --raw shows MorphoLex's own notation
# ({(wood)}>en>) and the ELP codes (JJ) instead.
#
# MorphoLex writes every homographic suffix the same way (all -en are >en>), so
# its part of speech is what separates, say, wooden (adjective) from widen
# (verb).
# It is a derivational database: inflections such as participial -en may not
# be segmented at all.
#
# The cache is $ETYM_MORPHOLEX, default toolkit/.cache/morpholex/morpholex.tsv.
# --setup needs openpyxl (pip install openpyxl) in the interpreter
# _etym_python picks; lookups need nothing beyond Python itself.
etym-morph() {
    local usage="Usage: etym-morph <word> [--raw] | --suffix <suffix> [--raw] | --setup [<file.xlsx>]"
    local raw="" arg args=()
    for arg in "$@"; do
        if [[ "$arg" == "--raw" ]]; then raw="--raw"; else args+=("$arg"); fi
    done
    set -- "${args[@]}"
    local cache="${ETYM_MORPHOLEX:-$ETYM_LIB_DIR/.cache/morpholex/morpholex.tsv}"
    local script="$ETYM_LIB_DIR/scripts/morpholex.py"
    [[ ! -f "$script" ]] && { echo "Error: script not found: $script" >&2; return 1; }

    local py
    py=$(_etym_python)

    case "${1:-}" in
        ""|-h|--help)
            echo "$usage"; [[ -n "${1:-}" ]]; return $? ;;
        --setup)
            _etym_need_module "$py" openpyxl || return 1
            "$py" "$script" build "$cache" "${2:-}"
            return $? ;;
    esac

    if [[ ! -f "$cache" ]]; then
        echo "Error: no MorphoLex cache at $cache." >&2
        echo "  Build it once with: etym-morph --setup" >&2
        return 1
    fi

    if [[ "$1" == "--suffix" ]]; then
        [[ -z "${2:-}" ]] && { echo "$usage" >&2; return 1; }
        find "$DICT_DIR" -type f -name '*.txt' -print0 \
            | _etym_me_rows "" \
            | DICT_DIR="$DICT_DIR" "$py" "$script" suffix "$cache" "$2" $raw
        return $?
    fi

    [[ "$1" == -* ]] && { echo "$usage" >&2; return 1; }
    local word="$1" file rows
    file=$(_etym_resolve_file "$word") || return 1
    rows=$(_etym_me_rows "$word" "$file")
    if [[ -z "$rows" ]]; then
        echo "Error: '$word' resolved to ${file##*/}, but no stanza in it matches." >&2
        return 1
    fi
    printf -- "--- Morphology (MorphoLex-en) for: %s ---\n" "$word"
    printf '%s\n' "$rows" | "$py" "$script" word "$cache" $raw
}


# etym-sound [options]
# Finds [ME] words by how they sound, from a pronunciation index of the whole
# dictionary (CMUdict, General American). Sounds may be IPA or ARPAbet, and
# "schwa" stands for either unstressed schwa (ə or r-coloured ɚ).
#
#   etym-sound --schwa-final -p verb      # verbs whose last syllable is a schwa
#                                         #   (widen, bottle, butter)
#   etym-sound --schwa-end -p verb        # verbs whose last sound is a schwa
#   etym-sound --has aɪ -p noun           # nouns with "long i" anywhere
#   etym-sound --stressed aɪ -p noun      # ...where it carries the stress
#   etym-sound --ends ən                  # ending in /ən/ (same as --ends "AH0 N")
#   etym-sound --starts sk --syll 1       # one-syllable words starting /sk/
#   etym-sound --has aɪ --json            # records for jq; --bare, --count too
#   etym-sound --missing                  # forms CMUdict does not know
#   etym-sound --rebuild                  # rebuild the index now
#
# -p takes POS tags as etym-select does (comma-separated or repeated) and also
# the groups noun, verb, adj, adv, which gather every tag of that kind (noun is
# m n, f n, ...; verb is v, tr v, intr v, irv, ...). --arpa adds an ARPAbet
# column. The full option list is at the top of scripts/sounds.py.
#
# THE INDEX is $ETYM_SOUND_INDEX, default toolkit/dist/pronunciations.tsv: one
# row per pronunciation of every [ME] form, with its file, stanza, POS and your
# reformed line. It is plain TSV, fine to grep or open. It is rebuilt
# automatically whenever a dictionary file (or the lookup code) is newer than
# it, so a search never runs on stale data; building needs the cmudict package,
# like etym-pron. Forms CMUdict does not know are kept as rows with no
# pronunciation, so the gaps are countable rather than invisible.
etym-sound() {
    local script="$ETYM_LIB_DIR/scripts/sounds.py"
    local cmu_script="$ETYM_LIB_DIR/scripts/cmu_pron.py"
    local index="${ETYM_SOUND_INDEX:-$ETYM_LIB_DIR/dist/pronunciations.tsv}"
    [[ -f "$script" ]] || { echo "Error: script not found: $script" >&2; return 1; }

    if [[ $# -eq 0 || "$1" == -h || "$1" == --help ]]; then
        echo "Usage: etym-sound [--ends S] [--starts S] [--has S] [--stressed V]"
        echo "                  [--schwa-end] [--schwa-final] [--syll N|N-M] [-p POS]"
        echo "                  [--missing] [--arpa] [--bare|--count|--json] | --rebuild"
        [[ $# -gt 0 ]]; return $?
    fi

    local rebuild=0 args=() a
    for a in "$@"; do
        if [[ "$a" == "--rebuild" ]]; then rebuild=1; else args+=("$a"); fi
    done

    if (( ! rebuild )); then
        if [[ ! -f "$index" ]]; then
            rebuild=1
        elif [[ -n "$(find "$DICT_DIR" "$script" "$cmu_script" -newer "$index" -print -quit 2>/dev/null)" ]]; then
            rebuild=1
        fi
    fi

    local py
    py=$(_etym_python)
    if (( rebuild )); then
        if [[ -n "${ETYM_CMUDICT:-}" ]]; then
            [[ -f "$ETYM_CMUDICT" ]] || { echo "Error: ETYM_CMUDICT is set but no file is there: $ETYM_CMUDICT" >&2; return 1; }
        else
            _etym_need_module "$py" cmudict "or set ETYM_CMUDICT to a cmudict.dict file." || return 1
        fi
        echo "Building the pronunciation index ($index)..." >&2
        find "$DICT_DIR" -type f -name '*.txt' -print0 \
            | _etym_me_rows "" \
            | DICT_DIR="$DICT_DIR" "$py" "$script" build "$index" || return 1
    fi

    [[ ${#args[@]} -eq 0 ]] && return 0
    "$py" "$script" query "$index" "${args[@]}"
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
        full_name=$(get_pos_desc "$tag" 2>/dev/null)
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


# etym-select [pattern] [--starts|--ends|--exact] [--fold] [--length <n|n-m|n+>]
#             [-d <path>] [--me|--inglisce] [--pos] [--bare|--count|--json]
#
# Selects entries by their HEADWORDS ONLY — the [ME] line and the reformed
# line — and prints both sides of the reform for each. This is the narrow
# counterpart to etym-find, which greps whole files and so answers a search
# for "cion" with etymology forms, Middle English spellings and source URLs
# mixed in among the reformed forms you wanted.
#
#   etym-select cion --inglisce          # reformed forms containing "cion"
#   etym-select cion --inglisce --ends   # ...ending in it
#   etym-select tion --me                # English headwords containing "tion"
#   etym-select c̃ --inglisce             # every form carrying c-with-tilde
#   etym-select ough --me --length 6     # two criteria at once
#   etym-select --length 4-6             # length alone, as before
#   etym-select cion --inglisce --bare   # pipeable list of matches
#   etym-select -p irv                   # every irregular-verb stanza
#   etym-select -p 'irv,tr irv,intr irv' # all three irregular tags at once
#   etym-select ough --me -p 'intr v'    # pattern and tag together
#
# --me / --inglisce picks the side that is searched, measured and sorted;
# both columns print either way.
#
# -p/--pos-is SELECTS ON THE POS TAG; --pos only PRINTS the column. Selecting
# turns the column on by itself, because hiding the field the filter ran on
# would also re-collapse the multi-stanza headwords the filter just told apart.
#
# MATCHING IS PER TAG, NOT SUBSTRING. A stanza's pos is a comma-separated list
# ("aux, v"), so the test is membership: `-p v` finds it, and does NOT find
# every adverb the way a contains() test would. Repeat the flag or pass a
# comma-separated list to accept several tags. Every tag is checked against
# config/parts-of-speech.tsv and an unregistered one is an error rather than an
# empty table, because a silent zero reads as "the dictionary has none of
# those" when it means "no such tag".
#
# MATCHING IS LITERAL, NOT REGEX, for the same reason etym-find uses grep -F:
# punctuation in a query can never turn into a pattern. Case is folded for
# ASCII only, so the two entries beginning with Cyrillic Ћ are reachable by
# `Ћ` but not by a lowercase form of it.
#
# BOTH QUERY AND FORM ARE CANONICALLY DECOMPOSED FIRST, because the data
# writes the same letter two ways: `â` appears as U+00E2 six times and as
# a+U+0302 a thousand times. Without that step a search for `â` returns six
# of a thousand hits and looks like a wrong answer rather than an encoding
# mismatch. The lookup table in jq_defs covers the base+mark combinations
# the orthography currently uses and needs extending alongside it.
#
# BY DEFAULT THE PATTERN IS THEN MATCHED AGAINST THE FORM AS WRITTEN, marks
# included, so `c̃` finds c-with-tilde rather than every c. The cost is that
# a query spanning a marked letter can miss: `ac` will not match `âc`,
# because a combining circumflex sits between the two letters. Pass --fold
# to strip marks from both the query and the form before comparing, which
# makes `ac` match `âc` — and makes `c̃` match every c, so use it knowingly.
#
# SELECTION IS THE DURABLE PART OF THIS FUNCTION. POS is now here as a sibling
# to --length; language origin belongs here too when it lands, and anything that
# ACTS on a selection — bulk respelling above all — belongs downstream of
# the projection, never woven into it.
#
# The path is -d/--dir rather than a positional, unlike etym-affix and
# etym-summarize: a pattern and a path are both arbitrary strings, so
# `etym-select cion s` could not be told apart from a two-word query.
etym-select() {
    local pattern="" pmode="any" fold=0 spec=""
    local target_input="" side="me" mode="table" show_pos=0
    local pos_queries=()
    local usage="Usage: etym-select [pattern] [--starts|--ends|--exact] [--fold] [--length <n|n-m|n+>] [-p <pos>] [-d <path>] [--me|--inglisce] [--pos] [--bare|--count|--json]"

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            --me|--english|--modern)      side="me";  shift ;;
            --ing|--inglisce|--reformed)  side="ing"; shift ;;
            --starts|--prefix)            pmode="starts"; shift ;;
            --ends|--suffix)              pmode="ends";   shift ;;
            --exact)                      pmode="exact";  shift ;;
            --fold)                       fold=1; shift ;;
            -n|--length|--len)            spec="$2"; shift 2 ;;
            -d|--dir|--path)              target_input="$2"; shift 2 ;;
            -p|--pos-is)                  pos_queries+=("$2"); shift 2 ;;
            --pos)                        show_pos=1; shift ;;
            --bare)                       mode="bare";  shift ;;
            -c|--count)                   mode="count"; shift ;;
            --json)                       mode="json";  shift ;;
            -h|--help)                    echo "$usage"; return 0 ;;
            -*)                           echo "$usage" >&2; return 1 ;;
            *)                            [[ -z "$pattern" ]] && pattern="$1"; shift ;;
        esac
    done

    if [[ -z "$pattern" && -z "$spec" && ${#pos_queries[@]} -eq 0 ]]; then
        echo "$usage" >&2
        echo "Give a pattern, a --length, a -p/--pos-is, or any combination." >&2
        return 1
    fi

    # ── POS spec: registered tags, repeatable and/or comma-separated ─────────
    # Membership is settled by config/parts-of-speech.tsv through
    # pos_is_registered, the same authority etym-lint uses. Nothing here parses
    # the register itself.
    local pos_tags=() pos_json="[]"
    if (( ${#pos_queries[@]} > 0 )); then
        local q tag unknown=""
        for q in "${pos_queries[@]}"; do
            local parts=()
            IFS=',' read -ra parts <<< "$q"
            for tag in "${parts[@]}"; do
                tag="$(echo "$tag" | xargs)"
                tag="${tag,,}"
                [[ -z "$tag" ]] && continue
                if pos_is_registered "$tag"; then
                    pos_tags+=("$tag")
                else
                    unknown+="'$tag' "
                fi
            done
        done
        if [[ -n "$unknown" ]]; then
            echo "Error: unregistered POS tag(s): ${unknown% }" >&2
            echo "       See config/parts-of-speech.tsv for the register." >&2
            return 1
        fi
        if (( ${#pos_tags[@]} == 0 )); then
            echo "Error: -p/--pos-is was given no tag." >&2
            return 1
        fi
        # Tags are lowercase words and spaces, so they need no JSON escaping.
        pos_json=$(printf '%s\n' "${pos_tags[@]}" | awk 'NF { printf "%s\"%s\"", (n++ ? "," : ""), $0 }')
        pos_json="[$pos_json]"
        show_pos=1
    fi

    # ── Length spec: "6" | "4-6" | "12+", or unbounded when absent ───────────
    local min=1 max=1000
    if [[ -n "$spec" ]]; then
        if [[ ! "$spec" =~ ^[0-9]+(\+|-[0-9]+)?$ ]]; then
            echo "Error: '$spec' is not a length spec (expected n, n-m, or n+)." >&2
            return 1
        fi
        if   [[ "$spec" =~ ^([0-9]+)-([0-9]+)$ ]]; then
            min="${BASH_REMATCH[1]}"; max="${BASH_REMATCH[2]}"
        elif [[ "$spec" =~ ^([0-9]+)\+$ ]]; then
            min="${BASH_REMATCH[1]}"
        else
            min="$spec"; max="$spec"
        fi
        if (( max < 1 )); then
            echo "Error: '$spec' selects nothing — no word has fewer than 1 letter." >&2; return 1
        fi
        if (( min > max )); then
            echo "Error: '$spec' is an empty range ($min > $max)." >&2; return 1
        fi
        if (( min < 1 )); then min=1; fi
    fi

    # ── Path resolution (same precedence as etym-affix / etym-summarize) ─────
    local target_path
    if   [[ -z "$target_input" ]];           then target_path="$DICT_DIR"
    elif [[ -e "$DICT_DIR/$target_input" ]]; then target_path="$DICT_DIR/$target_input"
    elif [[ -e "$target_input" ]];           then target_path="$target_input"
    else echo "Error: '$target_input' not found." >&2; return 1; fi

    local reform_name="${DICT_PROJECT_NAME:-Inglisce}"
    local side_name="$reform_name"; [[ "$side" == "me" ]] && side_name="Modern English"

    # Criteria line, assembled so the header states exactly what ran.
    local crit=""
    if [[ -n "$pattern" ]]; then
        case "$pmode" in
            starts) crit="starting with '$pattern'" ;;
            ends)   crit="ending with '$pattern'" ;;
            exact)  crit="exactly '$pattern'" ;;
            *)      crit="containing '$pattern'" ;;
        esac
        (( fold )) && crit="$crit (marks folded)"
    fi
    if [[ -n "$spec" ]]; then
        if [[ -n "$crit" ]]; then crit="$crit, $spec letters"; else crit="$spec letters"; fi
    fi
    if (( ${#pos_tags[@]} > 0 )); then
        local pos_crit
        pos_crit="tagged $(printf '%s\n' "${pos_tags[@]}" | paste -sd'/' -)"
        if [[ -n "$crit" ]]; then crit="$crit, $pos_crit"; else crit="$pos_crit"; fi
    fi

    # letters: ASCII A–Z/a–z plus anything above ASCII that is not a combining
    #          diacritic — keeps þ ç ţ ḑ and precomposed vowels, drops the
    #          marks, hyphens, and the stray ';' '(' a few entries carry.
    # nomarks: the form with combining marks removed but everything else kept;
    #          the haystack under --fold.
    # width:   codepoints minus combining marks, i.e. columns on screen.
    local jq_defs='
        # Canonical decomposition for the precomposed letters this dictionary
        # actually uses. The same letter is written both ways in the data —
        # `a` is U+00E2 six times and a+U+0302 a thousand times — so without
        # this a mark-sensitive query silently misses one encoding. Extend the
        # table if a new base+mark combination enters the orthography.
        def nfd:
            { "194":[65,770], "205":[73,769], "206":[73,770], "210":[79,768], "218":[85,769],
              "224":[97,768], "225":[97,769], "226":[97,770], "231":[99,807], "232":[101,768],
              "233":[101,769], "234":[101,770], "237":[105,769], "238":[105,770], "239":[105,776],
              "241":[110,771], "242":[111,768], "243":[111,769], "244":[111,770], "250":[117,769],
              "251":[117,770], "252":[117,776], "253":[121,769], "255":[121,776], "351":[115,807],
              "355":[116,807], "375":[121,770], "537":[115,806], "539":[116,806], "7697":[100,807],
              "7923":[121,768]
            } as $d
            | explode | map(. as $c | $d[$c|tostring] // [$c]) | flatten | implode;
        def letters:
            explode
            | map(select(
                ((. >= 65 and . <= 90) or (. >= 97 and . <= 122))
                or (. >= 128 and (. < 768 or . > 879))
              ));
        def nomarks:
            explode | map(select(. < 768 or . > 879)) | implode;
        def width:
            explode | map(select(. < 768 or . > 879)) | length;
        def hit($pat; $pmode):
            if   $pat   == ""       then true
            elif $pmode == "starts" then startswith($pat)
            elif $pmode == "ends"   then endswith($pat)
            elif $pmode == "exact"  then . == $pat
            else contains($pat) end;
        # A stanza pos is a list ("aux, v"), so the POS test is membership
        # tag by tag. Substring matching would answer a search for "v" with
        # every adverb; the array difference below is an intersection.
        def postags:
            (. // "") | ascii_downcase | split(",")
            | map(sub("^ +"; "") | sub(" +$"; ""));
        def pos_hit($want):
            if ($want | length) == 0 then true
            else (postags as $t | (($want - ($want - $t)) | length) > 0)
            end;
    '

    # ── JSON mode ────────────────────────────────────────────────────────────
    if [[ "$mode" == "json" ]]; then
        _etym_stream "$target_path" | jq -s \
            --arg     side  "$side" \
            --arg     pat   "$pattern" \
            --arg     pmode "$pmode" \
            --argjson fold  "$fold" \
            --argjson min   "$min" \
            --argjson max   "$max" \
            --argjson ptags "$pos_json" \
            "$jq_defs"'
            map(
                (.me_word       // "") as $mw
              | (.inglisce_word // "") as $iw
              | (if $side == "me" then $mw else $iw end | nfd) as $subject
              | ($subject | letters | length) as $len
              | (if $fold == 1 then ($subject | nomarks) else $subject end
                 | ascii_downcase) as $hay
              | ($pat | nfd) as $p
              | (if $fold == 1 then ($p | nomarks) else $p end
                 | ascii_downcase) as $needle
              | select($len >= $min and $len <= $max)
              | select($hay | hit($needle; $pmode))
              | select(.pos | pos_hit($ptags))
              | { me_word, inglisce_word, pos: (.pos // ""),
                  me_length:  ($mw | letters | length),
                  ing_length: ($iw | letters | length) }
            )
            | unique_by([.me_word, .inglisce_word, .pos])
            | sort_by((if $side == "me" then .me_length else .ing_length end),
                      (.me_word | ascii_downcase))
        '
        return
    fi

    # ── Shared projection ────────────────────────────────────────────────────
    # len \t sortkey \t me \t inglisce \t me_width \t ing_width \t pos
    #
    # Dedupe runs on whichever columns survive the cut. The two width fields
    # are functions of the words themselves, so they never split a duplicate;
    # dropping pos collapses the ~1,540 headwords that carry more than one
    # stanza into a single row instead of repeating them.
    local trim=(cat); (( show_pos )) || trim=(cut -f1-6)

    local rows
    rows=$(
        _etym_stream "$target_path" | jq -r \
            --arg     side  "$side" \
            --arg     pat   "$pattern" \
            --arg     pmode "$pmode" \
            --argjson fold  "$fold" \
            --argjson min   "$min" \
            --argjson max   "$max" \
            --argjson ptags "$pos_json" \
            "$jq_defs"'
            (.me_word       // "") as $mw
          | (.inglisce_word // "") as $iw
          | (if $side == "me" then $mw else $iw end | nfd) as $subject
          | ($subject | letters) as $key
          | ($key | length) as $len
          | (if $fold == 1 then ($subject | nomarks) else $subject end
             | ascii_downcase) as $hay
          | ($pat | nfd) as $p
          | (if $fold == 1 then ($p | nomarks) else $p end
             | ascii_downcase) as $needle
          | select($len >= $min and $len <= $max)
          | select($hay | hit($needle; $pmode))
          | select(.pos | pos_hit($ptags))
          | [ ($len | tostring),
              ($key | implode | ascii_downcase),
              $mw,
              $iw,
              ($mw | width | tostring),
              ($iw | width | tostring),
              (.pos // "") ]
          | @tsv
        ' | "${trim[@]}" | LC_ALL=C sort -u -t$'\t' -k1,1n -k2
    )

    # ── Output ───────────────────────────────────────────────────────────────
    case "$mode" in
        bare)
            local col=3; [[ "$side" == "ing" ]] && col=4
            # Dedupe order-preservingly: $rows is already ordered by length
            # then by the accent-stripped key, and re-sorting here on raw bytes
            # would throw every accented form to the end of the list.
            [[ -n "$rows" ]] && printf '%s\n' "$rows" | cut -f"$col" | awk '!seen[$0]++'
            ;;

        count)
            printf 'Selected: %s %s — tally\n' "$side_name" "$crit"
            echo "================================================================="
            if [[ -z "$rows" ]]; then
                echo "(no entries)"
            else
                printf '%s\n' "$rows" | cut -f1 | LC_ALL=C sort -n | uniq -c | \
                awk '{ printf "%4d %-7s | %d\n", $2, ($2 == 1 ? "letter" : "letters"), $1
                       total += $1 }
                     END { print "-----------------------------------------------------------------"
                           printf "%4s %-7s | %d\n", "all", "", total }'
            fi
            echo "================================================================="
            ;;

        *)
            printf 'Selected: %s %s\n' "$side_name" "$crit"
            echo "================================================================="
            printf '%-4s %-26s | %-26s' "LEN" "MODERN ENGLISH" "${reform_name^^}"
            (( show_pos )) && printf ' | %s' "PART OF SPEECH"
            printf '\n'
            echo "-----------------------------------------------------------------"
            if [[ -z "$rows" ]]; then
                echo "(no entries)"
            else
                printf '%s\n' "$rows" | awk -F'\t' -v pos="$show_pos" '
                    # Pad by display width, not byte length: combining marks
                    # make accented words longer in bytes than on screen.
                    function pad(s, w, target,   n) {
                        n = target - w
                        if (n < 1) n = 1
                        return s sprintf("%*s", n, "")
                    }
                    {
                        printf "%-4d %s| %s", $1, pad($3, $5, 27), pad($4, $6, 27)
                        if (pos) printf "| %s", ($7 == "" ? "?" : $7)
                        printf "\n"
                        total++
                    }
                    END {
                        print "-----------------------------------------------------------------"
                        printf "%d %s\n", total, (total == 1 ? "entry" : "entries")
                    }'
            fi
            echo "================================================================="
            ;;
    esac
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
            jq -r '[.me_word, .inglisce_word, .pos, (.conjugations | [.. | strings] | join(" "))] | @csv' \
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

# -----------------------------------------------------------------------------
# Language tags: the register, retired tags, and a census of what is in use
# -----------------------------------------------------------------------------
# config/languages.tsv is the register: a tag is official if it is listed
# there, one per line as "TAG  Name". config/language-aliases.tsv (optional)
# lists retired tags, one per line as "OLD  NEW" for a tag with a
# replacement, or "OLD  (reason)" for one that should not be used at all:
#
#     AG    GK
#     FRK   (Frankish is reconstructed: stop the chain at the oldest attested form)
#
# etym-lint checks every tagged line against both; etym-langs shows what the
# data actually uses, which is the evidence for deciding what goes in them.
#
# Three things the parser cannot read as a language, and so records as an
# empty lang, are reported by both:
#   - a name in brackets instead of a tag:   tomatl [Nahuatl]
#   - a chain line with no bracket at all:   τριάς
#   - (for completeness) an unregistered tag, which parses but is unofficial
# A reformed conjugation line ("to eite -s éit eiten -ing") is not a chain
# line and is never flagged; the test for it is the one etym-lint already
# uses to recognise conjugation lines.

# Registered tags, one per line.
_etym_lang_register() {
    [[ -f "$CONFIG_DIR/languages.tsv" ]] || return 0
    sed -e 's/\r$//' "$CONFIG_DIR/languages.tsv" \
        | awk '!/^[ \t]*#/ && NF { print $1 }'
}

# Retired tags, one per line as "OLD<TAB>replacement-or-(reason)".
_etym_lang_aliases() {
    [[ -f "$CONFIG_DIR/language-aliases.tsv" ]] || return 0
    sed -e 's/\r$//' "$CONFIG_DIR/language-aliases.tsv" \
        | awk '!/^[ \t]*#/ && NF {
              old = $1; rest = $0
              sub(/^[ \t]*[^ \t]+[ \t]+/, "", rest); sub(/[ \t]+$/, "", rest)
              if (rest != "" && rest != old) print old "\t" rest
          }'
}

# The per-line classification both etym-langs and etym-lint use. Reads the
# register and aliases from the environment (LANG_REG, LANG_ALIASES) so that
# nothing in them is mangled by awk -v escape processing.
#
# Emits one TAB-separated row per finding:
#   tag      <TAG> <file> <stanza> <line>     every tag, registered or not
#   named    <[Name]> <file> <stanza> <line>
#   untagged -     <file> <stanza> <line>
_ETYM_LANG_SCAN='
    BEGIN {
        RS = ""; FS = "\n"
        n = split(ENVIRON["LANG_REG"], r_, "\n")
        for (i = 1; i <= n; i++) if (r_[i] != "") reg[r_[i]] = 1
    }
    {
        for (i = 1; i <= NF; i++) {
            line = $i; gsub(/\r/, "", line)
            if (line == "" || line ~ /^http/) continue
            # Reformed line: same test as the parser.
            if (line ~ /\([a-z]/ && line !~ /\[[A-Z]/) continue

            found = 0
            rest = line
            while (match(rest, /\[[A-Z]+\]/)) {
                t = substr(rest, RSTART + 1, RLENGTH - 2)
                printf "tag\t%s\t%s\t%d\t%s\n", t, FILENAME, FNR, line
                rest = substr(rest, RSTART + RLENGTH); found = 1
            }
            rest = line
            while (match(rest, /\[[A-Z][^]\[]*[a-z][^]\[]*\]/)) {
                printf "named\t%s\t%s\t%d\t%s\n", substr(rest, RSTART, RLENGTH), FILENAME, FNR, line
                rest = substr(rest, RSTART + RLENGTH); found = 1
            }
            if (found) continue
            # A reformed conjugation line, recognised as etym-lint does.
            if (line ~ /(^| )-[a-z]+/ || line ~ /\(s( |$)/) continue
            printf "untagged\t-\t%s\t%d\t%s\n", FILENAME, FNR, line
        }
    }'

# etym-langs [path] [--json]
# A census of the language tags in use: each tag with its count, whether it is
# registered, retired (and to what), or neither, its registered name, and
# example lines to show what it is actually being used for. Then the lines the
# parser cannot read a language from at all: names in brackets, and chain
# lines with no tag.
#
# This is the evidence for deciding the official set. The same tag is used
# for different languages in places (look at the examples), and the same
# language under different tags, so the decision is yours; the census only
# makes it quick.
etym-langs() {
    local target="" json=0
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --json) json=1 ;;
            -h|--help) echo "Usage: etym-langs [path] [--json]"; return 0 ;;
            *) target="$1" ;;
        esac
        shift
    done
    local path="${target:-$DICT_DIR}"
    [[ -e "$DICT_DIR/$path" ]] && path="$DICT_DIR/$path"
    [[ -e "$path" ]] || { echo "Error: '$path' not found." >&2; return 1; }

    local reg aliases
    reg=$(_etym_lang_register)
    aliases=$(_etym_lang_aliases)

    find "$path" -type f -name '*.txt' -print0 \
        | LANG_REG="$reg" xargs -0 -r "$_ETYM_AWK" "$_ETYM_LANG_SCAN" \
        | LANG_REG="$reg" LANG_ALIASES="$aliases" LANG_FILE="$CONFIG_DIR/languages.tsv" \
          DICT_DIR="$DICT_DIR" JSON="$json" "$_ETYM_AWK" -F'\t' '
        function short(f) { return (index(f, root "/") == 1) ? substr(f, length(root) + 2) : f }
        function jstr(s) { gsub(/\\/, "\\\\", s); gsub(/"/, "\\\"", s); gsub(/\t/, " ", s); return "\"" s "\"" }
        BEGIN {
            root = ENVIRON["DICT_DIR"]; sub(/\/$/, "", root)
            n = split(ENVIRON["LANG_REG"], r_, "\n")
            for (i = 1; i <= n; i++) if (r_[i] != "") reg[r_[i]] = 1
            n = split(ENVIRON["LANG_ALIASES"], a_, "\n")
            for (i = 1; i <= n; i++) if (split(a_[i], p_, "\t") == 2) alias[p_[1]] = p_[2]
            while ((getline l < ENVIRON["LANG_FILE"]) > 0) {
                if (l ~ /^[ \t]*#/ || l !~ /[^ \t]/) continue
                t = l; sub(/[ \t].*$/, "", t); nm = l; sub(/^[^ \t]+[ \t]+/, "", nm)
                name[t] = nm
            }
        }
        {
            kind = $1; key = $2; where = short($3) ":" $4
            if (kind == "untagged") key = "(no tag)"
            count[kind SUBSEP key]++
            if (!((kind SUBSEP key) in first)) { order[++no] = kind SUBSEP key; first[kind SUBSEP key] = 1 }
            if (ex_n[kind SUBSEP key] < 3) {
                ex_n[kind SUBSEP key]++
                ex[kind SUBSEP key, ex_n[kind SUBSEP key]] = $5 "  (" where ")"
            }
        }
        function status(t) {
            if (t in alias) return (alias[t] ~ /^\(/) ? "retired " alias[t] : "retired, use [" alias[t] "]"
            return (t in reg) ? "registered" : "UNREGISTERED"
        }
        END {
            # sort each kind by count, descending (simple selection; sets are small)
            for (i = 1; i <= no; i++) { split(order[i], k_, SUBSEP); list[k_[1], ++ln[k_[1]]] = k_[2] }
            for (kd = 1; kd <= 3; kd++) {
                kind = (kd == 1 ? "tag" : kd == 2 ? "named" : "untagged")
                m = ln[kind]
                for (a = 1; a <= m; a++) for (b = a + 1; b <= m; b++)
                    if (count[kind SUBSEP list[kind, b]] > count[kind SUBSEP list[kind, a]]) {
                        tmp = list[kind, a]; list[kind, a] = list[kind, b]; list[kind, b] = tmp
                    }
            }
            if (ENVIRON["JSON"] == 1) {
                printf "{\n \"tags\": ["
                for (a = 1; a <= ln["tag"]; a++) {
                    t = list["tag", a]; k = "tag" SUBSEP t
                    printf "%s\n  {\"tag\": %s, \"count\": %d, \"status\": %s, \"name\": %s, \"examples\": [", \
                        (a > 1 ? "," : ""), jstr(t), count[k], jstr(status(t)), jstr(name[t])
                    for (e = 1; e <= ex_n[k]; e++) printf "%s%s", (e > 1 ? ", " : ""), jstr(ex[k, e])
                    printf "]}"
                }
                printf "\n ],\n \"named\": ["
                for (a = 1; a <= ln["named"]; a++) {
                    t = list["named", a]; k = "named" SUBSEP t
                    printf "%s\n  {\"written\": %s, \"count\": %d, \"examples\": [", (a > 1 ? "," : ""), jstr(t), count[k]
                    for (e = 1; e <= ex_n[k]; e++) printf "%s%s", (e > 1 ? ", " : ""), jstr(ex[k, e])
                    printf "]}"
                }
                k = "untagged" SUBSEP "(no tag)"
                printf "\n ],\n \"untagged\": {\"count\": %d, \"examples\": [", count[k] + 0
                for (e = 1; e <= ex_n[k]; e++) printf "%s%s", (e > 1 ? ", " : ""), jstr(ex[k, e])
                printf "]}\n}\n"
                exit
            }

            total = 0; unreg = 0
            for (a = 1; a <= ln["tag"]; a++) {
                t = list["tag", a]; total += count["tag" SUBSEP t]
                if (!(t in reg) || (t in alias)) unreg++
            }
            printf "--- Language tags in use: %d tags on %d lines; %d not official ---\n\n", ln["tag"], total, unreg
            for (a = 1; a <= ln["tag"]; a++) {
                t = list["tag", a]; k = "tag" SUBSEP t
                printf "%7d  %-6s %-22s %s\n", count[k], "[" t "]", status(t), name[t]
                if (status(t) != "registered")
                    for (e = 1; e <= ex_n[k]; e++) printf "                 e.g. %s\n", ex[k, e]
            }
            if (ln["named"] > 0) {
                printf "\nNames in brackets, which the parser does not read as a language:\n"
                for (a = 1; a <= ln["named"]; a++) {
                    t = list["named", a]; k = "named" SUBSEP t
                    printf "%7d  %s   e.g. %s\n", count[k], t, ex[k, 1]
                }
            }
            k = "untagged" SUBSEP "(no tag)"
            if (count[k] > 0) {
                printf "\n%d chain line(s) with no language tag at all, e.g.:\n", count[k]
                for (e = 1; e <= ex_n[k]; e++) printf "         %s\n", ex[k, e]
                print "         (etym-lint lists every one, file by file)"
            }
        }'
}


# etym-lint [path] [--strict]
# Validates .txt file formatting across the dictionary.
# Language tags are checked line by line against config/languages.tsv and
# config/language-aliases.tsv (see etym-langs). Those findings are warnings;
# --strict makes them errors.
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

    # Language register and retired tags, read once. See etym-langs.
    local lang_reg lang_aliases
    lang_reg=$(_etym_lang_register)
    lang_aliases=$(_etym_lang_aliases)

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

            if ! echo "$no_urls" | grep -Eq "\[[A-Z]+\]"; then
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

            # ── POS tag validation, stanza by stanza ────────────────────
            # This uses ETYM-PARSE'S OWN REGEXES rather than a second dialect
            # of them. The check it replaces was file-level and matched
            # \([a-z ]{1,5}(, [a-z ]{1,5})*\), which capped every tag at five
            # characters and so rejected (interj), (suffix), (prefix) and
            # (intr v) — all of which the parser accepts and all of which are
            # registered in parts-of-speech.tsv. Being file-level it also
            # passed a file whenever any one stanza carried a valid tag, so it
            # only ever surfaced on single-stanza files such as h/hi.txt.
            #
            # Shape is settled here; membership is settled by the register
            # below. Those are the only two authorities, and neither restates
            # the other.
            local bad_stanzas
            bad_stanzas=$("$_ETYM_AWK" '
                BEGIN { RS = ""; FS = "\n" }
                {
                    reformed = ""; conj_shape = 0; body = 0; urls = 0; langs = 0
                    for (i = 1; i <= NF; i++) {
                        line = $i; gsub(/\r/, "", line)
                        if (line == "") continue
                        if (line ~ /^http/) { urls++; continue }
                        body++
                        if (line ~ /\[[A-Z]+\]/) langs++
                        # Same reformed-line test as parse_stanza_lines().
                        if (line ~ /\([a-z]/ && line !~ /\[[A-Z]/) { reformed = line; continue }
                        if (line !~ /\[[A-Z]+\]/ && \
                            (line ~ /(^| )-[a-z]+/ || line ~ /\(s( |$)/)) conj_shape = 1
                    }
                    # A paragraph of nothing but URLs means a blank line was
                    # left between a stanza and its sources; etym-parse reads
                    # paragraphs, so those sources never reach the record.
                    if (body == 0 && urls > 0)
                        printf "%d:orphansrc ", NR
                    # No reformed line. Three different situations, and only
                    # two of them are mistakes: a stanza carrying etymology but
                    # no reformed spelling is simply a word not yet reformed
                    # (see tests/fixtures/parser/u/unreformed.txt), so it warns
                    # rather than errors — but it still warns, because the
                    # parser drops it and it reaches no dataset.
                    else if (reformed == "")
                        printf "%d:%s ", NR, \
                            (conj_shape ? "dropped" : (langs > 0 ? "unreformed" : "nopos"))
                    # Same POS test as extract_pos(): anchored at end of line.
                    else if (reformed !~ /\([a-z][a-z ,]*\)[ \t]*$/)
                        printf "%d:malformed ", NR
                }' "$file")

            if [[ -n "$bad_stanzas" ]]; then
                local s_dropped="" s_nopos="" s_malformed="" s_orphan="" s_unref="" item
                for item in $bad_stanzas; do
                    case "${item#*:}" in
                        dropped)   s_dropped+="${item%%:*} " ;;
                        nopos)     s_nopos+="${item%%:*} " ;;
                        malformed) s_malformed+="${item%%:*} " ;;
                        orphansrc)  s_orphan+="${item%%:*} " ;;
                        unreformed) s_unref+="${item%%:*} " ;;
                    esac
                done
                if [[ -n "$s_dropped" ]]; then
                    issues+=("\e[31m[ERROR]\e[0m Stanza(s) ${s_dropped% }: conjugation line missing its (pos) tag — stanza is silently dropped by etym-parse.")
                    ((errors++))
                fi
                if [[ -n "$s_nopos" ]]; then
                    issues+=("\e[31m[ERROR]\e[0m Stanza(s) ${s_nopos% }: no reformed line carrying a (pos) tag — stanza is silently dropped by etym-parse.")
                    ((errors++))
                fi
                if [[ -n "$s_malformed" ]]; then
                    issues+=("\e[31m[ERROR]\e[0m Stanza(s) ${s_malformed% }: (pos) tag is not at the end of the reformed line — etym-parse records an empty pos.")
                    ((errors++))
                fi
                if [[ -n "$s_unref" ]]; then
                    issues+=("\e[33m[WARN]\e[0m  Stanza(s) ${s_unref% }: no reformed line yet — etym-parse drops the stanza, so it reaches no dataset.")
                    ((warns++))
                fi
                if [[ -n "$s_orphan" ]]; then
                    issues+=("\e[31m[ERROR]\e[0m Block(s) ${s_orphan% }: source URLs separated from their stanza by a blank line — etym-parse reads paragraphs, so these sources are dropped.")
                    ((errors++))
                fi
            fi

            # Stanza-level: every comma-separated POS tag must exist in
            # config/parts-of-speech.tsv (catches typos like "mn" or
            # "adj m n"). NOTE: passing this does not guarantee the record
            # survives the build — build-dictionary.js keeps its own posMap,
            # and suffix/prefix/interj/obs/def v/indef are registered here but
            # absent there, so buildBrain drops them regardless.
            local unknown_tags
            unknown_tags=$("$_ETYM_AWK" '
                BEGIN { RS = ""; FS = "\n" }
                {
                    for (i = 1; i <= NF; i++) {
                        line = $i; gsub(/\r/, "", line)
                        if (line ~ /^http/ || line ~ /\[[A-Z]/) continue
                        if (match(line, /\([a-z][a-z ,]*\)[ \t]*$/)) {
                            tag_str = substr(line, RSTART + 1)
                            sub(/\).*$/, "", tag_str)
                            n = split(tag_str, tag_arr, /,/)
                            for (t = 1; t <= n; t++) {
                                tag = tag_arr[t]
                                gsub(/^[ \t]+|[ \t]+$/, "", tag)
                                if (tag != "") print tag
                            }
                        }
                    }
                }' "$file" | sort -u | while IFS= read -r tag; do
                    pos_is_registered "$tag" || printf "'%s' " "$tag"
                done)
            if [[ -n "$unknown_tags" ]]; then
                issues+=("\e[33m[WARN]\e[0m  Unknown POS tag(s): ${unknown_tags% } — not in parts-of-speech.tsv.")
                ((warns++))
            fi

            # ── Language tags, line by line ─────────────────────────────
            # Every tagged line is checked against config/languages.tsv and
            # config/language-aliases.tsv, and every chain line must carry a
            # tag the parser can read. Findings are warnings, since the
            # register is still being settled; --strict makes them errors.
            local lang_findings
            lang_findings=$(LANG_REG="$lang_reg" "$_ETYM_AWK" "$_ETYM_LANG_SCAN" "$file" \
                | LANG_REG="$lang_reg" LANG_ALIASES="$lang_aliases" "$_ETYM_AWK" -F'\t' '
                    BEGIN {
                        n = split(ENVIRON["LANG_REG"], r_, "\n")
                        for (i = 1; i <= n; i++) if (r_[i] != "") reg[r_[i]] = 1
                        n = split(ENVIRON["LANG_ALIASES"], a_, "\n")
                        for (i = 1; i <= n; i++) if (split(a_[i], p_, "\t") == 2) alias[p_[1]] = p_[2]
                    }
                    $1 == "tag" && ($2 in alias) && !seen_r[$2]++ {
                        retired = retired (retired == "" ? "" : "; ") "[" $2 "] " \
                            (alias[$2] ~ /^\(/ ? alias[$2] : "-> [" alias[$2] "]")
                    }
                    $1 == "tag" && !($2 in alias) && !($2 in reg) && !seen_u[$2]++ {
                        unreg = unreg (unreg == "" ? "" : " ") "[" $2 "]"
                    }
                    $1 == "named"    { printf "NAMED\t%s\t%s\n", $4, $5 }
                    $1 == "untagged" { printf "UNTAGGED\t%s\t%s\n", $4, $5 }
                    END {
                        if (unreg != "")   printf "UNREG\t%s\n", unreg
                        if (retired != "") printf "RETIRED\t%s\n", retired
                    }')
            if [[ -n "$lang_findings" ]]; then
                local sev="\e[33m[WARN]\e[0m " kind a b
                (( strict )) && sev="\e[31m[ERROR]\e[0m"
                while IFS=$'\t' read -r kind a b; do
                    case "$kind" in
                        UNREG)    issues+=("$sev Unregistered language tag(s): $a — not in languages.tsv.") ;;
                        RETIRED)  issues+=("$sev Retired language tag(s): $a") ;;
                        NAMED)    issues+=("$sev Stanza $a: '$b' — a language written as a name, not a tag; etym-parse records no language for it.") ;;
                        UNTAGGED) issues+=("$sev Stanza $a: '$b' — chain line with no language tag; etym-parse records no language for it.") ;;
                        *)        continue ;;
                    esac
                    if (( strict )); then ((errors++)); else ((warns++)); fi
                done <<< "$lang_findings"
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
                    if ($c.present // "") != "" then
                        [$c.present, $c.third_singular, $c.past, $c.participle, $c.gerund]
                    else
                        [$c.third_singular, $c.past, $c.gerund]
                    end | map(select(. != null and . != "")) | join(" ")
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

# etym-prune-list <file> [--dry-run] [--no-backup] [--quiet]
# Removes from a word list every word the dictionary already has, so the list
# is left holding only what still needs an entry. The list is one word or
# phrase per line, like dist/missing_words.txt; blank lines and lines starting
# with # are kept untouched.
#
#   etym-prune-list todo.txt --dry-run    # show what would go, change nothing
#   etym-prune-list todo.txt              # remove them (todo.txt.bak keeps the original)
#
# "Already in the dictionary" means the line equals a form on some stanza's
# [ME] line. The whole [ME] line is read, not the parser's first token, so
# "could" is found on the can stanza and "New York" as one form; a leading
# "to " is ignored on both sides. Stanzas not yet reformed count, since the
# word already has a file.
#
# Case: an exact match always counts, and a list word also matches a form that
# is all lowercase in the dictionary, so "Walk" matches walk. The reverse does
# not hold: "polish" in the list is not removed by Polish alone.
#
# Only exact forms are matched. An inflected form in the list ("abhorred",
# "absolutely") stays unless the dictionary lists that form itself.
#
# Each removed word is printed with the entry that already holds it
# (entry:stanza), so a removal can be checked against the dictionary.
#
# The original is kept as <file>.bak (overwriting any earlier backup) unless
# --no-backup. The new content is written into the existing file rather than
# swapped in, so its permissions and any links to it survive. Line endings and
# every kept line are preserved byte for byte.
etym-prune-list() {
    local file="" dry=0 backup=1 quiet=0
    local usage="Usage: etym-prune-list <file> [--dry-run] [--no-backup] [--quiet]"
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -n|--dry-run) dry=1 ;;
            --no-backup)  backup=0 ;;
            -q|--quiet)   quiet=1 ;;
            -h|--help)    echo "$usage"; return 0 ;;
            -*)           echo "$usage" >&2; return 1 ;;
            *)            [[ -z "$file" ]] && file="$1" ;;
        esac
        shift
    done
    [[ -z "$file" ]] && { echo "$usage" >&2; return 1; }
    [[ -f "$file" ]] || { echo "Error: '$file' not found." >&2; return 1; }
    [[ -w "$file" || $dry -eq 1 ]] || { echo "Error: '$file' is not writable." >&2; return 1; }
    [[ -d "$DICT_DIR" ]] || { echo "Error: DICT_DIR '$DICT_DIR' not found." >&2; return 1; }

    # Every [ME] form in the dictionary, one per line, with where it lives:
    #   form TAB entry:stanza
    local forms
    forms=$(find "$DICT_DIR" -type f -name '*.txt' -print0 \
        | _etym_me_rows "" \
        | "$_ETYM_AWK" -F'\t' -v root="$DICT_DIR/" '{
              where = $1; if (index(where, root) == 1) where = substr(where, length(root) + 1)
              n = split($4, f, ",")
              for (i = 1; i <= n; i++) {
                  w = f[i]; gsub(/^[ \t]+|[ \t]+$/, "", w); sub(/^[tT][oO][ \t]+/, "", w)
                  if (w != "") print w "\t" where ":" $2
              }
          }')
    [[ -n "$forms" ]] || { echo "Error: found no [ME] forms under $DICT_DIR." >&2; return 1; }

    # Split the list: kept lines to one file, removed words to another.
    local tmp removed
    tmp=$(mktemp "${TMPDIR:-/tmp}/etym-prune-list.XXXXXX") || return 1
    removed=$(mktemp "${TMPDIR:-/tmp}/etym-prune-list.XXXXXX") || { rm -f "$tmp"; return 1; }
    FORMS="$forms" "$_ETYM_AWK" -v removed="$removed" '
        function trim(x) { gsub(/^[ \t]+|[ \t]+$/, "", x); return x }
        BEGIN {
            n = split(ENVIRON["FORMS"], f, "\n")
            for (i = 1; i <= n; i++) {
                if (split(f[i], p, "\t") < 2) continue
                if (!(p[1] in exact)) exact[p[1]] = p[2]
                if (p[1] == tolower(p[1]) && !(p[1] in lower)) lower[p[1]] = p[2]
            }
        }
        {
            w = $0; sub(/\r$/, "", w); w = trim(w)
            if (w == "" || w ~ /^#/) { print; next }
            k = w; sub(/^[tT][oO][ \t]+/, "", k)
            if (k in exact)          { print w "\t" exact[k] > removed; next }
            if (tolower(k) in lower) { print w "\t" lower[tolower(k)] > removed; next }
            print
        }' "$file" > "$tmp" || { rm -f "$tmp" "$removed"; return 1; }

    local total gone
    total=$(grep -cv '^[[:space:]]*\(#.*\)\{0,1\}$' "$file")
    gone=$(wc -l < "$removed" | tr -d ' ')

    if (( ! quiet )) && (( gone > 0 )); then
        echo "Already in the dictionary:"
        "$_ETYM_AWK" -F'\t' '{ printf "  %-28s %s\n", $1, $2 }' "$removed"
        echo
    fi

    if (( dry )); then
        echo "Dry run: $gone of $total word(s) would be removed from ${file##*/}; nothing was changed."
        rm -f "$tmp" "$removed"
        return 0
    fi

    if (( gone == 0 )); then
        echo "Nothing to remove: none of the $total word(s) in ${file##*/} is in the dictionary."
        rm -f "$tmp" "$removed"
        return 0
    fi

    (( backup )) && cp -p "$file" "$file.bak"
    # Write through the existing file, so its permissions and links survive.
    cat "$tmp" > "$file" || { rm -f "$tmp" "$removed"; return 1; }
    rm -f "$tmp" "$removed"
    echo "Removed $gone of $total word(s) from ${file##*/}; $((total - gone)) remain."
    (( backup )) && echo "The original is in ${file##*/}.bak."
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