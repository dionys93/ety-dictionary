#!/usr/bin/awk -f
# ═════════════════════════════════════════════════════════════════════════════
# etym-parse.awk — THE CANONICAL STANZA PARSER
# Single source of truth for reading dictionary .txt entries.
# Emits one JSONL record per stanza to stdout.
#
# Invoked by etym-lib.sh:  awk -f etym-parse.awk <file.txt> [more files...]
# Multiple files may be passed in one invocation; paragraph mode (RS="")
# never merges records across file boundaries (end-of-file ends a record).
#
# PORTABILITY: strictly POSIX awk. Runs identically under gawk, mawk, and
# BSD/macOS awk. Do NOT reintroduce gawk-only features (3-arg match(),
# gensub(), \y word boundaries, etc.) — use match() + RSTART/RLENGTH.
#
# Output schema:
#   {
#     "me_word":       string,
#     "inglisce_word": string,
#     "pos":           string,
#
#     "conjugations" — ALWAYS a named JSON object (never a raw array):
#       SLOT VERBS (classes 1–5):
#         { "present", "third_singular", "past", "participle", "gerund" }
#       EXPLICIT VERBS / MODALS (class 6):
#         { "explicit": { "<english form>": "<inglisce form>", ... } }
#         Keys are ZIPPED from the stanza's own [ME] line, which must list the
#         SAME NUMBER of comma-separated forms as the reformed line, in the
#         same order (e.g. "will, would, won't, wouldn't [ME]" over
#         "uill, oûd, uon't, oûdn't (modal, aux)"). No hardcoded English
#         schemas anywhere — the pairing is visible in the .txt file itself.
#       NOUNS:
#         { "plural": "<last token>" [, "variants": [middle tokens]] }
#       EVERYTHING ELSE:
#         { "forms": [tokens] }   or   {} when there are none
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
#   6. Explicit ME-zip:      requires parallel [ME] forms (see above); a class
#                            6 candidate WITHOUT parallel ME forms emits {} and
#                            a stderr warning — never a silent positional guess
# ═════════════════════════════════════════════════════════════════════════════

BEGIN {
    RS = ""; FS = "\n"

    # Ordinal lookup for JSON control-character escaping (see esc()).
    for (i = 1; i < 32; i++) ORD[sprintf("%c", i)] = i
}

# =============================================================================
# 1. UTILITY FUNCTIONS
# =============================================================================

# Multi-tag aware POS tests: "(aux, v)" and "(modal, aux)" now count as
# verbish. (The old anchored single-tag test treated them as non-verbs, which
# the JS layer silently depended on to receive raw arrays for its positional
# zip — that whole mechanism is gone.)
function has_tag(pos, re,    n, parts, i, t) {
    n = split(pos, parts, /,/)
    for (i = 1; i <= n; i++) {
        t = parts[i]
        gsub(/^[ \t]+|[ \t]+$/, "", t)
        if (t ~ re) return 1
    }
    return 0
}

function is_verbish(pos)  { return has_tag(pos, "^(v|tr v|intr v|aux|auxiliary|modal)$") }
function can_slot(pos)    { return has_tag(pos, "^(v|tr v|intr v)$") }
function is_nounish(pos)  { return has_tag(pos, "^(n|noun|m n|f n|masculine noun|feminine noun|neuter noun)$") }

# JSON string escaping, RFC 8259 compliant:
#   * backslash and double quote are escaped (backslash FIRST — order matters)
#   * control characters U+0001–U+001F are escaped as \t, \n, \r, or \u00XX
# The control-char pass only runs when needed ([[:cntrl:]] fast-path check),
# so the common case costs two gsubs.
function esc(s,    out, i, c, n) {
    gsub(/\\/, "\\\\", s)
    gsub(/"/,  "\\\"", s)
    if (s !~ /[[:cntrl:]]/) return s

    out = ""; n = length(s)
    for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if      (c == "\t") out = out "\\t"
        else if (c == "\n") out = out "\\n"
        else if (c == "\r") out = out "\\r"
        else if (c in ORD)  out = out sprintf("\\u%04x", ORD[c])
        else                out = out c
    }
    return out
}

function verb_conj_json(present, third_sing, past, participle, gerund) {
    return "{" \
        "\"present\":"        "\"" esc(present)     "\"," \
        "\"third_singular\":" "\"" esc(third_sing)  "\"," \
        "\"past\":"           "\"" esc(past)        "\"," \
        "\"participle\":"     "\"" esc(participle)  "\"," \
        "\"gerund\":"         "\"" esc(gerund)      "\"" \
    "}"
}

# =============================================================================
# 2. EXTRACTION & CLEANING FUNCTIONS
# =============================================================================

# Reads all lines in the stanza and populates global arrays (etymology, sources)
function parse_stanza_lines(num_fields,    i, line, lang, form) {
    delete ef; delete el; delete src_arr
    n_etym = 0; n_src = 0; reformed = ""
    me_src = ""; mi_src = ""

    for (i = 1; i <= num_fields; i++) {
        line = $i
        gsub(/\r/, "", line)
        if (line == "") continue

        if (line ~ /^http/) {
            src_arr[++n_src] = line
        } else if (line ~ /\([a-z]/ && line !~ /\[[A-Z]/) {
            reformed = line
        } else {
            lang = ""
            # POSIX equivalent of gawk's match(line, /\[([A-Z]+)\]/, m):
            # locate the bracketed tag, then peel the brackets off by position.
            if (match(line, /\[[A-Z]+\]/)) {
                lang = substr(line, RSTART + 1, RLENGTH - 2)
            }
            form = line
            gsub(/\[[A-Z]+\]/, "", form)
            gsub(/^[ \t]+|[ \t]+$/, "", form)
            if (form != "") {
                n_etym++
                ef[n_etym] = form
                el[n_etym] = lang
                if (lang == "ME" && me_src == "") me_src = form
                if (lang == "MI" && mi_src == "") mi_src = form
            }
        }
    }
}

function extract_pos(line,    pos) {
    pos = ""
    # POSIX equivalent of gawk's match(line, /\(([a-z][a-z ,]*)\)[ \t]*$/, pm):
    # anchor the full tag at end-of-line, then slice out the inside of the
    # parens. The character class excludes ")", so the first ")" after RSTART
    # is the closing paren.
    if (match(line, /\([a-z][a-z ,]*\)[ \t]*$/)) {
        pos = substr(line, RSTART + 1)
        sub(/\).*$/, "", pos)
    }
    return pos
}

function clean_reformed_line(line) {
    gsub(/\([a-z][a-z ,]*\)[ \t]*$/, "", line) # Remove trailing (pos)
    gsub(/^[ \t]+|[ \t]+$/, "", line)          # Trim
    sub(/^[tT][oO][ \t]+/, "", line)           # Strip infinitive "to "
    return line
}

function tokenize_line(clean_line,    n_raw, raw_tok, i) {
    delete tokens
    n_raw = split(clean_line, raw_tok, /[ \t,]+/)
    n_tok = 0
    for (i = 1; i <= n_raw; i++) {
        if (raw_tok[i] != "") tokens[++n_tok] = raw_tok[i]
    }
    return n_tok
}

# Tokenizes the explicit-zip source line (ME, falling back to MI, then the
# last etymology form — same precedence as resolve_me_word) into me_toks[].
function tokenize_me_line(num_etym,    src, n_raw, raw_tok, i) {
    delete me_toks
    src = (me_src != "") ? me_src : ((mi_src != "") ? mi_src : ef[num_etym])
    sub(/^[tT][oO][ \t]+/, "", src)
    n_raw = split(src, raw_tok, /[ \t,]+/)
    n_me_tok = 0
    for (i = 1; i <= n_raw; i++) {
        if (raw_tok[i] != "") me_toks[++n_me_tok] = raw_tok[i]
    }
    return n_me_tok
}

function resolve_me_word(num_etym,    i, me_word, mw) {
    me_word = ""
    for (i = 1; i <= num_etym; i++) { if (el[i] == "ME") { me_word = ef[i]; break } }
    if (me_word == "") {
        for (i = 1; i <= num_etym; i++) { if (el[i] == "MI") { me_word = ef[i]; break } }
    }
    if (me_word == "") me_word = ef[num_etym]

    sub(/^[tT][oO][ \t]+/, "", me_word)
    split(me_word, mw, /[ \t,]+/)
    return mw[1]
}

# =============================================================================
# 3. JSON BUILDER FUNCTIONS
# =============================================================================

function build_verb_conjugations(num_tokens,    pres, ts, past, part, ger, json, i) {
    # Class 4 & 5: Two-stem -er/-ir
    if (num_tokens >= 2 && tokens[2] ~ /\(s$/) {
        pres = substr(tokens[2], 1, length(tokens[2]) - 2)
        ts   = pres "s"
        if (num_tokens >= 5) {
            past = tokens[3]; part = tokens[4]; ger = tokens[5]
        } else {
            past = (num_tokens >= 3) ? tokens[3] : ""
            part = past
            ger  = (num_tokens >= 4) ? tokens[4] : ""
        }
        return verb_conj_json(pres, ts, past, part, ger)
    }

    # Class 6 candidates (>5 tokens) that reach here lack parallel ME forms —
    # explicit zipping happens in build_conjugations_json BEFORE slotting. A
    # positional guess would be silent data corruption, so: warn and emit {}.
    if (num_tokens > 5) {
        printf "⚠️  %s: explicit verb stanza (%d forms) has no parallel [ME] forms — conjugations dropped\n", FILENAME, num_tokens - 1 > "/dev/stderr"
        return "{}"
    }

    # Classes 1, 2, 3: Standard and irregular
    ts   = (num_tokens >= 2) ? tokens[2] : "-s"
    past = ""; part = ""; ger = ""

    if (num_tokens == 3) {
        ger = tokens[3]
    } else if (num_tokens == 4) {
        past = tokens[3]; part = tokens[3]; ger = tokens[4]
    } else if (num_tokens == 5) {
        past = tokens[3]; part = tokens[4]; ger = tokens[5]
    }
    return verb_conj_json("", ts, past, part, ger)
}

# {"explicit":{"<eng>":"<ing>", ...}} — pairs reformed tokens with the ME
# line's tokens by position WITHIN the same stanza. Only called when the
# counts match, so every pair is verifiable by reading two adjacent lines.
function has_slot_markers(num_tokens,    i) {
    for (i = 2; i <= num_tokens; i++) {
        if (tokens[i] ~ /^-/ || tokens[i] ~ /\(s$/) return 1
    }
    return 0
}

function build_explicit_json(num_tokens,    json, i) {
    json = "{\"explicit\":{"
    for (i = 2; i <= num_tokens; i++) {
        if (i > 2) json = json ","
        json = json "\"" esc(me_toks[i]) "\":\"" esc(tokens[i]) "\""
    }
    return json "}}"
}

# Nouns — TYPE-AWARE (validated against all 4,862 noun stanzas of the real
# dictionary, which mixes two incompatible positional conventions):
#   * first trailing token is a SUFFIX ("-s -ly", "-es addie -is"):
#       it is the plural; everything after it goes to "forms" (derivational
#       suffixes like -ly/-ness, or secondary variant+plural runs)
#   * first trailing token is a FULL WORD ("sihor -s", "tributarie -is"):
#       leading full words are variant singulars; the plural is the first
#       suffix after them, else the last token
# Neither "first token is the plural" (old JS) nor "last token is the plural"
# survives the data alone; this rule satisfies every observed pattern.
function build_noun_conjugations(num_tokens,    json, i, plural_idx, sep) {
    if (num_tokens < 2) return "{}"

    if (tokens[2] ~ /^-/) {
        # Suffix-first: plural, then derivational/secondary forms
        json = "{\"plural\":\"" esc(tokens[2]) "\""
        if (num_tokens > 2) {
            json = json ",\"forms\":["
            for (i = 3; i <= num_tokens; i++) {
                if (i > 3) json = json ","
                json = json "\"" esc(tokens[i]) "\""
            }
            json = json "]"
        }
        return json "}"
    }

    # Word-first: variants, then plural
    plural_idx = num_tokens
    for (i = 3; i <= num_tokens; i++) {
        if (tokens[i] ~ /^-/) { plural_idx = i; break }
    }
    json = "{\"plural\":\"" esc(tokens[plural_idx]) "\""
    if (plural_idx > 2) {
        json = json ",\"variants\":["
        sep = 0
        for (i = 2; i < plural_idx; i++) {
            if (sep) json = json ","
            json = json "\"" esc(tokens[i]) "\""
            sep = 1
        }
        json = json "]"
    }
    return json "}"
}

function build_forms_json(num_tokens,    json, first_f, i) {
    if (num_tokens < 2) return "{}"
    json = "{\"forms\":["
    first_f = 1
    for (i = 2; i <= num_tokens; i++) {
        if (tokens[i] == "") continue
        if (!first_f) json = json ","
        json = json "\"" esc(tokens[i]) "\""
        first_f = 0
    }
    return json "]}"
}

function build_conjugations_json(num_tokens, pos) {
    if (is_verbish(pos)) {
        # Explicit ME-zip whenever the stanza provides parallel forms.
        # Guards: (a) a GENUINE [ME] line must exist — never zip against MI or
        # older ancestors, whose forms are not what the transcriber looks up;
        # (b) suffix ("-d") or two-stem ("xxx(s") tokens mean this is a slot
        # stanza that merely coincides in count — never zip those.
        if (me_src != "" && n_me_tok == num_tokens && num_tokens > 1 && !has_slot_markers(num_tokens)) return build_explicit_json(num_tokens)
        # Plain verbs without parallel forms use positional slot classes 1-5
        if (can_slot(pos)) return build_verb_conjugations(num_tokens)
        # Modal/aux-only stanzas cannot be slotted; without parallel ME forms
        # there is nothing safe to emit
        return "{}"
    }
    if (is_nounish(pos)) return build_noun_conjugations(num_tokens)
    return build_forms_json(num_tokens)
}

function build_etymology_json(num_etym,    json, i) {
    json = "["
    for (i = 1; i <= num_etym; i++) {
        if (i > 1) json = json ","
        json = json "{\"form\":\"" esc(ef[i]) "\",\"lang\":\"" esc(el[i]) "\"}"
    }
    return json "]"
}

function build_sources_json(num_src,    json, i) {
    json = "["
    for (i = 1; i <= num_src; i++) {
        if (i > 1) json = json ","
        json = json "\"" esc(src_arr[i]) "\""
    }
    return json "]"
}

# =============================================================================
# 4. THE MAIN PIPELINE (A -> B -> C)
# =============================================================================

{
    # --- Step A: Parse raw lines ---
    parse_stanza_lines(NF)
    if (reformed == "") next

    # --- Step B: Clean & Extract ---
    pos_tag    = extract_pos(reformed)
    clean_line = clean_reformed_line(reformed)
    num_tokens = tokenize_line(clean_line)

    inglisce_word = tokens[1]
    gsub(/[,.]$/, "", inglisce_word)
    me_word = resolve_me_word(n_etym)
    n_me_tok = tokenize_me_line(n_etym)

    # --- Step C: Build JSON payload ---
    conj_json = build_conjugations_json(num_tokens, pos_tag)
    etym_json = build_etymology_json(n_etym)
    src_json  = build_sources_json(n_src)

    # --- Step D: Emit ---
    printf "{\"me_word\":\"%s\",\"inglisce_word\":\"%s\",\"pos\":\"%s\",\"conjugations\":%s,\"etymology\":%s,\"sources\":%s}\n", esc(me_word), esc(inglisce_word), esc(pos_tag), conj_json, etym_json, src_json
}
