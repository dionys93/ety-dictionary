#!/usr/bin/env bash
# test-wiki.sh — a standalone trial of Wiktionary as an etymology source.
#
#   source test-wiki.sh && etym-wiktionary exhort
#   ./test-wiki.sh exhort
#
# Deliberately self-contained: it does not read etym-lib.sh, CONFIG_DIR or
# any config file, so it can be thrown away without leaving anything behind.
# Nothing here writes to the dictionary.
#
# Requires curl and jq for the live fetch; --file needs neither.

# etym-wiktionary <word> [--file <path>] [--raw] [--lang <section>] [--all]
#
# Fetches an entry's wikitext from the Wiktionary Action API and proposes a
# candidate etymology chain in stanza format, for you to check by eye. It
# NEVER writes a file and is not part of any pipeline — the dictionary stays
# hand-authored.
#
#   etym-wiktionary exhort              # propose a chain
#   etym-wiktionary exhort --raw        # dump the wikitext instead
#   etym-wiktionary exhort --raw > x.wiki && etym-wiktionary -f x.wiki
#   etym-wiktionary exhort --all        # every Etymology section, not just the first
#
# WHY WIKTIONARY AND NOT A TRANSLATION API: the etymology is written in
# templates that name the relationship, so the distinction the dictionary
# cares about is already in the markup rather than in prose that has to be
# read. {{inh}} {{der}} {{bor}} and the specialised borrowings are descent
# and go in the chain; {{cog}} and {{ncog}} are cognates and are dropped,
# which is the "akin to / compare" rule enforced mechanically instead of by
# eye. Proto-languages are dropped by the same pass.
#
# Both drops are REPORTED rather than silent, because the prose that follows
# a stanza is supposed to say what came out and why.
#
# WHAT IT CANNOT DO. Wiktionary writes newest-first ("From Middle English X,
# from Old French Y"); the output is reversed into oldest-first, but a page
# that discusses two competing derivations will interleave them and the
# result will be wrong in a way only reading can catch. Affixal etymologies
# ({{af}}, {{suffix}}, {{compound}}) are morphology, not descent, and are
# listed separately rather than chained. The newer {{etymon}} tree template
# has a different argument shape and is flagged, not parsed. Treat every
# line as a proposal.
etym-wiktionary() {
    local word="" src_file="" raw=0 section="English" all=0 keep_macrons=0 mode="chain"
    local usage="Usage: etym-wiktionary <word> [--file <path>] [--raw] [--lang <section>] [--all] [--macrons] [--descendants]"

    while [[ "$#" -gt 0 ]]; do
        case $1 in
            -f|--file)      src_file="$2"; shift 2 ;;
            --raw)          raw=1; shift ;;
            -l|--lang)      section="$2"; shift 2 ;;
            -a|--all)       all=1; shift ;;
            --macrons)      keep_macrons=1; shift ;;
            -D|--descendants) mode="desc"; shift ;;
            -h|--help)      echo "$usage"; return 0 ;;
            -*)             echo "$usage" >&2; return 1 ;;
            *)              [[ -z "$word" ]] && word="$1"; shift ;;
        esac
    done

    if [[ -z "$word" && -z "$src_file" ]]; then echo "$usage" >&2; return 1; fi

    # U+0304 combining macron, built in the shell rather than written as an
    # awk escape: \xNN is ambiguous in gawk and a byte range like [\200-\277]
    # is rejected outright in a UTF-8 locale. A plain string handed to gsub is
    # portable across gawk, mawk and BSD awk.
    local cmac
    cmac=$(printf '\xcc\x84')

    # Wiktionary language code -> dictionary tag. Inline so this script has
    # no dependencies beyond curl, jq and awk. An unmapped code prints as
    # [??] and is listed at the end rather than guessed at.
    #
    # Codes are case-sensitive, and the trailing periods on VL. LL. ML. NL.
    # are not typos — those are Wiktionary's etymology-only Latin varieties.
    #
    # Proto-languages are NOT handled here; they are dropped by the suffix
    # rule "ends with -pro". Matching a bare "pro" would wrongly drop Old
    # Occitan, whose code is exactly that.
    # Fields are  code:TAG:WiktionarySectionName  — the third is optional and
    # only used to tell you which --lang to pass when chasing descendants.
    local code_map="
        enm:MI:Middle_English    ang:OE:Old_English      non:ON:Old_Norse
        la:L:Latin               VL.:VL:Latin            LL.:LL:Latin
        ML.:ML:Latin             NL.:NL:Latin
        grc:AG:Ancient_Greek     el:GR:Greek
        fro:OF:Old_French        xno:AF:Anglo-Norman     nrf:ONF:Norman
        fr:FR:French             frm:FR:Middle_French    pro:OP:Old_Occitan
        ca:CAT:Catalan           oc:OC:Occitan           gl:GAL:Galician
        an:ARG:Aragonese         scn:SCN:Sicilian        sc:SRD:Sardinian
        rup:ARO:Aromanian        osp:OSP:Old_Spanish     roa-opt:OPT:Old_Portuguese
        en:ME:English
        it:IT:Italian            es:SP:Spanish           pt:POR:Portuguese
        ro:ROM:Romanian
        dum:MD:Middle_Dutch      nl:DU:Dutch             gml:MLG:Middle_Low_German
        goh:OHG:Old_High_German  gmh:MHG:Middle_High_German
        de:GER:German            got:GOT:Gothic
        sga:OIR:Old_Irish        ga:IR:Irish             gd:GA:Scottish_Gaelic
        cy:WEL:Welsh             xtg:GAU:Gaulish
        ar:AR:Arabic             he:HE:Hebrew            syc:SYR:Classical_Syriac
        akk:AKK:Akkadian         phn:PHO:Phoenician      egy:EGY:Egyptian
        hit:HIT:Hittite          ett:ETR:Etruscan
        sa:SK:Sanskrit           pal:MP:Middle_Persian   fa:PER:Persian
        hi:HI:Hindi
        ms:MAL:Malay            zh:CH:Chinese            ja:JP:Japanese
        ta:TA:Tamil             nci:AZ:Classical_Nahuatl
    "

    # ── Source: a local file, or the Action API ─────────────────────────────
    local wikitext
    if [[ -n "$src_file" ]]; then
        [[ -f "$src_file" ]] || { echo "Error: '$src_file' not found." >&2; return 1; }
        wikitext=$(cat "$src_file")
    else
        command -v curl >/dev/null 2>&1 || { echo "Error: curl is required." >&2; return 1; }
        local api="https://en.wiktionary.org/w/api.php"
        local ua="${ETYM_USER_AGENT:-etym-toolkit/1.0 (dictionary research; contact via repo)}"
        local response
        # A descriptive User-Agent is required by Wikimedia's policy; requests
        # with a generic one are refused. --get + --data-urlencode keeps the
        # word correctly escaped whatever is in it.
        response=$(curl -sS --fail --max-time 20 --compressed \
            -A "$ua" --get "$api" \
            --data-urlencode "action=parse" \
            --data-urlencode "page=$word" \
            --data-urlencode "prop=wikitext" \
            --data-urlencode "format=json" \
            --data-urlencode "formatversion=2" 2>&1) || {
                echo "Error: request failed: $response" >&2; return 1; }

        if printf '%s' "$response" | jq -e 'has("error")' >/dev/null 2>&1; then
            echo "Error: Wiktionary: $(printf '%s' "$response" | jq -r '.error.info')" >&2
            return 1
        fi
        wikitext=$(printf '%s' "$response" | jq -r '.parse.wikitext // empty')
        [[ -n "$wikitext" ]] || { echo "Error: no wikitext returned for '$word'." >&2; return 1; }
    fi

    if (( raw )); then printf '%s\n' "$wikitext"; return 0; fi


    # ── Descendants mode ────────────────────────────────────────────────────
    # The siblings of an English word are not on the English page. They are on
    # the ANCESTOR's page, under ====Descendants====, because that is where a
    # word's children are listed. So Spanish animal is reached from Latin
    # animalis, not from English animal.
    #
    # {{desc}} marks how each descendant arrived: bor=1 borrowed, lbor=1
    # learned borrowing, slb=1 semi-learned. For a reformed-spelling project
    # that distinction is the point — a learned borrowing from Latin has not
    # undergone the sound changes an inherited reflex has, so it is not the
    # same kind of evidence.
    if [[ "$mode" == "desc" ]]; then
        printf '%s\n' "$wikitext" | "${ETYM_AWK:-awk}" \
            -v want_section="$section" \
            -v codemap="$code_map" \
            -v keep_macrons="$keep_macrons" \
            -v cmac="$cmac" \
            -v headword="${word:-$src_file}" '
        function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
        function destar(s) { sub(/^\*/, "", s); return s }
        function cleanterm(s) { sub(/#.*$/, "", s); gsub(/<[^>]*>/, "", s); return trim(s) }
        function demacron(s) {
            if (keep_macrons == 1) return s
            gsub(cmac, "", s)
            gsub(/ā/, "a", s); gsub(/ē/, "e", s); gsub(/ī/, "i", s)
            gsub(/ō/, "o", s); gsub(/ū/, "u", s); gsub(/ȳ/, "y", s)
            return s
        }
        BEGIN {
            np_ = split(codemap, pairs, /[ \t\n]+/)
            for (i = 1; i <= np_; i++) {
                if (pairs[i] == "") continue
                nf_ = split(pairs[i], f_, ":")
                if (nf_ < 2) continue
                tag[f_[1]] = f_[2]
                if (nf_ >= 3) { langname[f_[1]] = f_[3]; gsub(/_/, " ", langname[f_[1]]) }
            }
            in_section = 0; in_desc = 0; n = 0
            nsec = 0; seen_want = 0; lemma = ""; nelse = 0
        }
        /^==[^=]/ {
            hdr = $0; gsub(/^==[ \t]*|[ \t]*==$/, "", hdr)
            cur_section = hdr
            sections[++nsec] = hdr
            in_section = (hdr == want_section)
            if (in_section) seen_want = 1
            in_desc = 0; next
        }
        # Note Descendants sections in OTHER languages too, so a miss can say
        # where the data actually is instead of just reporting absence.
        /^===+[ \t]*Descendants/ && !in_section { elsewhere[++nelse] = cur_section; next }
        !in_section { next }
        /^===+[ \t]*Descendants/ { in_desc = 1; next }
        /^===+/ { in_desc = 0; next }

        # Form-of pages. Wiktionary lemmatises Latin verbs at the first-person
        # singular, so "animare" is a non-lemma form whose entry is nothing but
        # {{inflection of|la|animo||...}} — no Descendants, because they live
        # on the lemma. Every form-of template is named "... of", with |1| the
        # language and |2| the lemma, so one rule catches the whole family.
        in_section && lemma == "" {
            l2 = $0
            while ((st2 = index(l2, "{{")) > 0) {
                r2 = substr(l2, st2 + 2)
                e2 = index(r2, "}}")
                if (e2 == 0) break
                b2 = substr(r2, 1, e2 - 1)
                l2 = substr(r2, e2 + 2)
                if (index(b2, "{{") > 0) continue
                na2 = split(b2, p2, "|")
                nm2 = trim(p2[1])
                if (nm2 !~ / of$/) continue
                np2 = 0
                for (i = 2; i <= na2; i++)
                    if (p2[i] !~ /^[A-Za-z0-9_]+=/) a2[++np2] = trim(p2[i])
                if (np2 >= 2 && a2[2] != "" && a2[2] != "-")
                    lemma = cleanterm(demacron(destar(a2[2])))
                for (i = 1; i <= np2; i++) delete a2[i]
            }
        }
        !in_desc { next }
        /^[ \t]*\*/ {
            line = $0
            # list depth carries the tree shape
            depth = 0
            while (substr(trim(line), depth + 1, 1) == "*") depth++
            while ((st = index(line, "{{")) > 0) {
                rest = substr(line, st + 2)
                e = index(rest, "}}")
                if (e == 0) break
                body = substr(rest, 1, e - 1)
                line = substr(rest, e + 2)
                if (index(body, "{{") > 0) continue
                na = split(body, parts, "|")
                name = trim(parts[1])
                if (name !~ /^(desc|descendant|desctree|descendants tree)$/) continue
                np = 0; via = ""
                for (i = 2; i <= na; i++) {
                    if (parts[i] ~ /^[A-Za-z0-9_]+=/) {
                        k = substr(parts[i], 1, index(parts[i], "=") - 1)
                        v = substr(parts[i], index(parts[i], "=") + 1)
                        if (trim(v) == "1") {
                            if (k ~ /^bor[0-9]*$/)  via = "borrowed"
                            if (k ~ /^lbor[0-9]*$/) via = "learned borrowing"
                            if (k ~ /^slb[0-9]*$/)  via = "semi-learned borrowing"
                            if (k ~ /^unc[0-9]*$/)  via = via (via == "" ? "" : ", ") "uncertain"
                        }
                    } else arg[++np] = trim(parts[i])
                }
                code = arg[1]
                for (j = 2; j <= np; j++) {
                    nt_ = split(arg[j], tt_, ",")
                    for (k2 = 1; k2 <= nt_; k2++) {
                        t_ = cleanterm(demacron(destar(tt_[k2])))
                        if (t_ == "" || t_ == "-") continue
                        n++
                        d_code[n] = code; d_term[n] = t_
                        d_depth[n] = depth; d_via[n] = via
                        d_tree[n] = (name ~ /tree/)
                    }
                }
                for (i = 1; i <= np; i++) delete arg[i]
            }
        }
        END {
            print "Descendants of: " headword " (" want_section ")"
            print "================================================================="
            if (n == 0) {
                if (!seen_want) {
                    print "There is no " want_section " section on this page."
                    if (nsec > 0) {
                        line_ = ""
                        for (i = 1; i <= nsec; i++) line_ = line_ (line_ == "" ? "" : ", ") sections[i]
                        print "Sections present: " line_
                    }
                } else if (lemma != "") {
                    print "This is a NON-LEMMA FORM page: the " want_section " entry only says"
                    print "it is an inflection of " lemma ". Descendants are listed on the lemma."
                    print ""
                    printf "  etym-wiktionary %s --lang \"%s\" --descendants\n", lemma, want_section
                } else {
                    print "The " want_section " entry has no Descendants section."
                    print "Descendants are listed on the ancestor, so if this word was itself"
                    print "borrowed or inherited, try the page it came from."
                }
                if (nelse > 0) {
                    line_ = ""
                    for (i = 1; i <= nelse; i++) line_ = line_ (line_ == "" ? "" : ", ") elsewhere[i]
                    print ""
                    print "A Descendants section does exist under: " line_
                }
                print "================================================================="
                exit
            }
            for (i = 1; i <= n; i++) {
                indent = ""
                for (j = 2; j <= d_depth[i]; j++) indent = indent "  "
                lname = (d_code[i] in langname) ? langname[d_code[i]] : d_code[i]
                t = (d_code[i] in tag) ? "[" tag[d_code[i]] "]" : "[??]"
                # ONLY ASCII FIELDS ARE PADDED. Language names come from the
                # map and tags are ASCII, so %-Ns is safe for them; the term
                # may be Greek or accented, and awks disagree about whether
                # length() counts bytes or characters. Measuring it needed a
                # byte-range regex that gawk rejects outright, so the term is
                # simply printed last-but-one with the ragged marker after it.
                # Shrink the pad by the indent so nested rows keep the same
                # tag column as their parent.
                w = 20 - length(indent)
                if (w < 1) w = 1
                printf "%s%-*s %-6s %s%s%s\n", indent, w, lname, t, d_term[i], \
                    (d_via[i] == "" ? "" : "  <- " d_via[i]), \
                    (d_tree[i] ? "  (subtree on its own page)" : "")
            }
            print "================================================================="
            print "Unmarked descendants are inherited. A borrowing has not undergone"
            print "the sound changes an inherited reflex has — say so in the prose."
        }'
        return
    fi

    # ── Parse ───────────────────────────────────────────────────────────────
    # Everything below is plain POSIX awk over the wikitext, so the only jq in
    # this function is the one expression that lifts a string out of the API
    # envelope. Nothing here touches the network or the dictionary.
    printf '%s\n' "$wikitext" | "${ETYM_AWK:-awk}" \
        -v want_section="$section" \
        -v all_etym="$all" \
        -v codemap="$code_map" \
        -v keep_macrons="$keep_macrons" \
        -v cmac="$cmac" \
        -v headword="${word:-$src_file}" '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }

    # Wiktionary marks reconstructed forms with a leading asterisk and the
    # dictionary strips them; do it here so the proposal is already in
    # stanza shape.
    function destar(s) { sub(/^\*/, "", s); return s }

    # Real pages carry things the documentation does not advertise: a section
    # anchor ("rother#Noun"), inline modifiers ("rother<id:bovine>"), and more
    # than one form in a single argument ("der,deor"). Strip the first two;
    # the comma case is split by the caller so each form is listed separately.
    function cleanterm(s) {
        sub(/#.*$/, "", s)
        gsub(/<[^>]*>/, "", s)
        return trim(s)
    }


    # Wiktionary always writes Latin with macrons; this dictionary does not
    # (2 of 3,780 Latin-family forms carry one, and both look like slips).
    # Stripping them here means a proposed line can be pasted as it stands.
    # --macrons keeps them. Handles the precomposed letters and the bare
    # combining macron alike; the characters below are literal UTF-8 and awk
    # matches them as byte sequences.
    function demacron(s) {
        if (keep_macrons == 1) return s
        gsub(cmac, "", s)
        gsub(/ā/, "a", s); gsub(/ē/, "e", s); gsub(/ī/, "i", s)
        gsub(/ō/, "o", s); gsub(/ū/, "u", s); gsub(/ȳ/, "y", s)
        gsub(/Ā/, "A", s); gsub(/Ē/, "E", s); gsub(/Ī/, "I", s)
        gsub(/Ō/, "O", s); gsub(/Ū/, "U", s); gsub(/Ȳ/, "Y", s)
        return s
    }

    function is_proto(code) {
        # ENDS WITH "-pro". Not "contains": Old Occitan is exactly "pro".
        return (length(code) > 4 && substr(code, length(code) - 3) == "-pro")
    }

    BEGIN {
        np_ = split(codemap, pairs, /[ \t\n]+/)
        for (i = 1; i <= np_; i++) {
            if (pairs[i] == "") continue
            nf_ = split(pairs[i], f_, ":")
            if (nf_ < 2) continue
            tag[f_[1]] = f_[2]
            if (nf_ >= 3) { langname[f_[1]] = f_[3]; gsub(/_/, " ", langname[f_[1]]) }
        }
        in_section = 0; in_etym = 0; n = 0; nd = 0; nm = 0; nu = 0; etym_seen = 0
    }

    # --- section tracking ---
    /^==[^=]/ {
        hdr = $0; gsub(/^==[ \t]*|[ \t]*==$/, "", hdr)
        in_section = (hdr == want_section); in_etym = 0; next
    }
    !in_section { next }
    /^===+[ \t]*Etymology/ {
        etym_seen++
        in_etym = (all_etym == 1 || etym_seen == 1)
        next
    }
    /^===+/ { in_etym = 0; next }
    !in_etym { next }

    {
        line = $0
        # Walk every {{...}} on the line. Nested braces are rare in etymology
        # sections and a nested template is skipped rather than mis-split.
        while ((s = index(line, "{{")) > 0) {
            rest = substr(line, s + 2)
            e = index(rest, "}}")
            if (e == 0) break
            body = substr(rest, 1, e - 1)
            line = substr(rest, e + 2)
            if (index(body, "{{") > 0) continue

            # split on "|", ignoring named args (x=y)
            na = split(body, parts, "|")
            name = trim(parts[1])
            np = 0
            for (i = 2; i <= na; i++)
                if (parts[i] !~ /^[A-Za-z0-9_]+=/) arg[++np] = trim(parts[i])

            if (name == "etymon") {
                flagged_etymon = 1
                for (i = 1; i <= np; i++) delete arg[i]
                continue
            }

            # descent: |1|=this lang, |2|=source lang, |3|=term
            if (name ~ /^(inh|inherited|der|derived|bor|borrowed|uder|lbor|slbor|ubor|psm|learned borrowing|semi-learned borrowing|unadapted borrowing)\+?$/) {
                code = arg[2]; term = destar(arg[3])
                if (code == "") { for (i = 1; i <= np; i++) delete arg[i]; continue }
                if (is_proto(code)) {
                    nd++; dropped[nd] = code " " (term == "" || term == "-" ? "(no form)" : term) " [reconstructed]"; drop_sec[nd] = etym_seen
                } else if (term == "" || term == "-") {
                    nd++; dropped[nd] = code " (template gives no form) [" name "]"; drop_sec[nd] = etym_seen
                } else {
                    n++; ch_code[n] = code; ch_term[n] = demacron(term); ch_kind[n] = name
                    ch_sec[n] = etym_seen
                    if (!(code in tag)) unmapped[++nu] = code
                }
            }
            # cognates: |1|=lang, |2|=term. Siblings, never ancestors.
            else if (name ~ /^(cog|cognate|ncog|noncognate)$/) {
                for (j = 2; j <= np; j++) {
                    nt_ = split(arg[j], tt_, ",")
                    for (k = 1; k <= nt_; k++) {
                        t_ = cleanterm(demacron(destar(tt_[k])))
                        if (t_ == "" || t_ == "-") continue
                        nm++; cogs[nm] = arg[1] " " t_; cog_sec[nm] = etym_seen
                    }
                }
            }
            # bare mentions: real pages use {{m}} both for a continuation of
            # a chain and for the pieces of an affixal etymology. Ambiguous,
            # so surfaced for the eye rather than chained.
            else if (name ~ /^(m|mention|l|link)$/) {
                for (j = 2; j <= np; j++) {
                    nt_ = split(arg[j], tt_, ",")
                    for (k = 1; k <= nt_; k++) {
                        t_ = cleanterm(demacron(destar(tt_[k])))
                        if (t_ == "" || t_ == "-") continue
                        nme++; mentions[nme] = arg[1] " " t_; men_sec[nme] = etym_seen
                    }
                }
            }
            # morphology, not descent
            else if (name ~ /^(af|affix|suffix|prefix|compound|com|blend|clipping|back-form|back-formation|doublet)$/) {
                nmo++; morph[nmo] = name ": " body; mor_sec[nmo] = etym_seen
            }
            for (i = 1; i <= np; i++) delete arg[i]
        }
    }

    function secmark(n_) { return (etym_seen > 1 ? sprintf("[Ety %d] ", n_) : "") }

    END {
        print "Proposed chain for: " headword
        print "================================================================="
        if (n == 0) {
            print "(no descent templates found in the " want_section " Etymology section)"
        } else {
            # Wiktionary runs newest-first; stanzas run oldest-first.
            # Printed without column padding so the lines can be pasted
            # straight into an entry — and because byte-width padding would
            # misalign every form carrying a macron or a Greek letter anyway.
            #
            # Each Etymology section is printed as its own block. Wiktionary
            # numbers them because they are DIFFERENT WORDS that share a
            # spelling, so merging them would hand back one chain splicing
            # two homographs together — the case the stanza rules say to stop
            # and ask about, silently got wrong instead.
            for (sec = 1; sec <= etym_seen; sec++) {
                any = 0
                for (i = 1; i <= n; i++) if (ch_sec[i] == sec) { any = 1; break }
                if (!any) continue
                if (etym_seen > 1) {
                    if (sec > 1) print ""
                    printf "--- Etymology %d ---\n", sec
                }
                for (i = n; i >= 1; i--) {
                    if (ch_sec[i] != sec) continue
                    t = (ch_code[i] in tag) ? tag[ch_code[i]] : "??"
                    printf "%s [%s]\n", ch_term[i], t
                    if (ch_kind[i] ~ /^(bor|borrowed|lbor|slbor|ubor|psm)/)
                        borrowed[++nb] = ch_term[i] " [" t "]"
                }
            }
            print ""
            if (etym_seen > 1 && all_etym == 1)
                print "(separate Etymology sections are separate words — file them as the homograph rules require)"
            print "(the [ME] headword line and the reformed line are yours to write)"
        }
        print "================================================================="

        if (nb > 0) {
            print ""
            print "BORROWED, not inherited — worth a clause in the prose:"
            for (i = 1; i <= nb; i++) print "  - " borrowed[i]
        }
        if (nd > 0) {
            print ""
            print "DROPPED (not eligible for the chain):"
            for (i = 1; i <= nd; i++) print "  - " secmark(drop_sec[i]) dropped[i]
        }
        if (nm > 0) {
            print ""
            print "COGNATES (siblings, excluded by the stanza rules):"
            for (i = 1; i <= nm; i++) print "  - " secmark(cog_sec[i]) cogs[i]
        }
        if (nmo > 0) {
            print ""
            print "MORPHOLOGY (word-formation, not descent — for the prose):"
            for (i = 1; i <= nmo; i++) print "  - " secmark(mor_sec[i]) morph[i]
        }
        if (nme > 0) {
            print ""
            print "MENTIONS (ambiguous — chain continuation or affix pieces):"
            for (i = 1; i <= nme; i++) print "  - " secmark(men_sec[i]) mentions[i]
        }
        if (nu > 0) {
            print ""
            print "UNMAPPED CODES (add to code_map near the top of this script):"
            for (i = 1; i <= nu; i++) print "  - " unmapped[i]
        }
        if (n > 0) {
            print ""
            print "COUSINS: descendants live on the ANCESTOR page, not this one."
            # One suggestion per Etymology section — they are different words,
            # so they have different ancestors and different cousins.
            for (sec = 1; sec <= etym_seen; sec++) {
                oi = 0
                for (i = 1; i <= n; i++) if (ch_sec[i] == sec) oi = i
                if (oi == 0) continue
                oc = ch_code[oi]
                printf "  %setym-wiktionary %s%s --descendants\n", secmark(sec), \
                    ch_term[oi], (oc in langname ? " --lang \"" langname[oc] "\"" : "")
            }
        }
        if (flagged_etymon) {
            print ""
            print "NOTE: this entry uses {{etymon}}, whose tree syntax this"
            print "      function does not parse. Check the page by hand."
        }
        if (etym_seen > 1 && all_etym != 1) {
            print ""
            printf "NOTE: %d Etymology sections on this page; only the first was read.\n", etym_seen
            print "      Re-run with --all to see them all."
        }
    }'
}

# Run directly as well as being sourced.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    etym-wiktionary "$@"
fi