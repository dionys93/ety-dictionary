"""Pronunciation index and sound search for etym-sound.

BUILD reads etym-lib rows (file, stanza, POS, [ME] text, reformed line, ...)
on stdin and writes one row per pronunciation of every [ME] form:

    file  stanza  pos  form  reformed  arpabet  ipa

A form is one comma-separated item of the [ME] line, "to" dropped, so
"can, could, can't" gives three forms and "New York" gives one, pronounced
word by word. A single-word form gets every pronunciation CMUdict has; a
form CMUdict does not know gets a row with the last two columns empty, so the
gaps stay visible (etym-sound --missing lists them).

QUERY reads the index and filters it. Sounds may be written in IPA ("aɪ",
"ən") or ARPAbet ("AY", "AH0 N"), and the word "schwa" stands for either
unstressed schwa, plain (ə, AH0) or r-coloured (ɚ, ER0).

    --ends S       the pronunciation ends with S
    --starts S     ...starts with S
    --has S        ...contains S anywhere
    --stressed V   the vowel with primary stress is V
    --schwa-end    the last sound is a schwa            (sofa, butter)
    --schwa-final  the last syllable's vowel is a schwa (widen, bottle, butter)
    --syll N       N syllables, or a range N-M
    -p POS         by POS tag, as in etym-select; also the groups
                   noun, verb, adj, adv (e.g. noun = m n, f n, ...)
    --missing      only the forms CMUdict does not know
    --arpa         add an ARPAbet column
    --bare | --count | --json

Stress in a pattern: IPA ˈ or ˌ before a vowel, or an ARPAbet digit (AY1),
requires that stress; without one, any stress matches. ə and ʌ are the same
CMUdict vowel (AH) told apart by stress, as are ɚ and ɝ (ER), so ə only
matches the unstressed one and ʌ only a stressed one.
"""

import json
import os
import re
import sys
import unicodedata
from typing import Dict, List, Optional, Set, Tuple

from cmu_pron import _CONSONANTS, _VOWELS, load_cmudict, lookup, to_ipa

Phone = Tuple[str, str]                      # ("AH", "0"), ("K", "")
Matcher = Tuple[Set[str], Optional[Set[str]]]  # (bases, allowed stresses or None)

ARPA_BASES = set(_VOWELS) | set(_CONSONANTS) | {"AH", "ER"}
VOWEL_BASES = set(_VOWELS) | {"AH", "ER"}

SCHWA: Matcher = ({"AH", "ER"}, {"0"})

# IPA symbol -> matcher. ə/ʌ and ɚ/ɝ share a CMUdict base and differ by stress.
IPA: Dict[str, Matcher] = {}
for base, sym in _VOWELS.items():
    IPA[sym] = ({base}, None)
for base, sym in _CONSONANTS.items():
    IPA[sym] = ({base}, None)
IPA.update({
    "ə": ({"AH"}, {"0"}), "ʌ": ({"AH"}, {"1", "2"}),
    "ɚ": ({"ER"}, {"0"}), "ɝ": ({"ER"}, {"1", "2"}), "ɜ": ({"ER"}, None),
    "g": ({"G"}, None), "r": ({"R"}, None), "ɒ": ({"AA"}, None),
    "e": ({"EY"}, None), "o": ({"OW"}, None),
})
IPA_SYMBOLS = sorted(IPA, key=len, reverse=True)


# ── patterns ─────────────────────────────────────────────────────────────────

def parse_sounds(text: str) -> List[Matcher]:
    """'aɪ' -> [AY]; 'AH0 N' -> [AH0, N]; 'ən' -> [AH0, N]; 'schwa' -> [SCHWA]."""
    out: List[Matcher] = []
    for chunk in text.split():
        if chunk.lower() == "schwa":
            out.append(SCHWA)
            continue
        m = re.fullmatch(r"([A-Za-z]{1,2})([012]?)", chunk)
        if m and m.group(1).upper() in ARPA_BASES and \
                (m.group(1).isupper() or m.group(1).upper() not in ("E", "O")):
            base, digit = m.group(1).upper(), m.group(2)
            out.append(({base}, {digit} if digit else None))
            continue
        out.extend(_parse_ipa(chunk))
    return out


def _parse_ipa(chunk: str) -> List[Matcher]:
    chunk = unicodedata.normalize("NFC", chunk).replace("ː", "").replace("ˑ", "")
    out: List[Matcher] = []
    stress: Optional[str] = None
    i = 0
    while i < len(chunk):
        ch = chunk[i]
        if ch in "ˈ'":
            stress, i = "1", i + 1
            continue
        if ch == "ˌ":
            stress, i = "2", i + 1
            continue
        for sym in IPA_SYMBOLS:
            if chunk.startswith(sym, i):
                bases, allowed = IPA[sym]
                if stress and bases & VOWEL_BASES:
                    allowed = {stress} if allowed is None else (allowed & {stress})
                    stress = None
                out.append((bases, allowed))
                i += len(sym)
                break
        else:
            raise ValueError(f"'{chunk[i]}' in '{chunk}' is not a sound this search knows. "
                             f"Use IPA ({' '.join(sorted(IPA))}) or ARPAbet.")
    return out


def split_phones(arpa: str) -> List[Phone]:
    out = []
    for p in arpa.split():
        out.append((p[:-1], p[-1]) if p[-1].isdigit() else (p, ""))
    return out


def fits(phone: Phone, m: Matcher) -> bool:
    bases, allowed = m
    return phone[0] in bases and (allowed is None or phone[1] in allowed)


def seq_at(phones: List[Phone], pat: List[Matcher], at: int) -> bool:
    return at >= 0 and at + len(pat) <= len(phones) and \
        all(fits(phones[at + k], pat[k]) for k in range(len(pat)))


# ── build ────────────────────────────────────────────────────────────────────

def forms_of(me: str) -> List[str]:
    out = []
    for form in me.split(","):
        form = form.strip().replace("\u2019", "'")
        form = re.sub(r"^to\s+", "", form, flags=re.IGNORECASE)
        if form and form not in out:
            out.append(form)
    return out


def pronounce(form: str, table) -> List[List[str]]:
    words = form.split()
    if len(words) == 1:
        return lookup(words[0], table)
    joined: List[str] = []
    for w in words:
        prons = lookup(w, table)
        if not prons:
            return []
        joined += prons[0]
    return [joined]


def build(index: str) -> int:
    table = load_cmudict()
    root = os.environ.get("DICT_DIR", "").rstrip("/")
    rows, missing = [], 0
    for line in sys.stdin:
        f = (line.rstrip("\n").split("\t") + [""] * 6)[:6]
        path, stanza, pos, me, reformed, _langs = f
        if not me:
            continue
        where = path[len(root) + 1:] if root and path.startswith(root + "/") else path
        for form in forms_of(me):
            prons = pronounce(form, table)
            if not prons:
                missing += 1
                rows.append((where, stanza, pos, form, reformed, "", ""))
            for p in prons:
                rows.append((where, stanza, pos, form, reformed, " ".join(p), to_ipa(p)))

    seen, unique = set(), []
    for r in rows:
        if r not in seen:
            seen.add(r)
            unique.append(r)
    os.makedirs(os.path.dirname(os.path.abspath(index)), exist_ok=True)
    tmp = index + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write("file\tstanza\tpos\tform\treformed\tarpabet\tipa\n")
        for r in unique:
            fh.write("\t".join(v.replace("\t", " ") for v in r) + "\n")
    os.replace(tmp, index)
    forms = len({(r[0], r[1], r[3]) for r in unique})
    print(f"Indexed {forms:,} forms ({len(unique):,} pronunciations); "
          f"{missing:,} not in CMUdict.", file=sys.stderr)
    return 0


# ── query ────────────────────────────────────────────────────────────────────

def load_index(index: str) -> List[dict]:
    out = []
    with open(index, encoding="utf-8") as fh:
        next(fh, None)
        for line in fh:
            f = (line.rstrip("\n").split("\t") + [""] * 7)[:7]
            out.append(dict(zip(("file", "stanza", "pos", "form", "reformed", "arpabet", "ipa"), f)))
    return out


POS_GROUPS = {"noun": {"n"}, "verb": {"v", "irv"}, "adj": {"adj"}, "adv": {"adv"}}


def pos_ok(pos: str, wanted: List[str]) -> bool:
    tags = [t.strip() for t in pos.split(",") if t.strip()]
    for w in wanted:
        if w in POS_GROUPS:
            if any(t.split()[-1] in POS_GROUPS[w] for t in tags):
                return True
        elif w in tags:
            return True
    return False


def syll_ok(n: int, spec: str) -> bool:
    if "-" in spec:
        lo, hi = spec.split("-", 1)
        return (not lo or n >= int(lo)) and (not hi or n <= int(hi))
    if spec.endswith("+"):
        return n >= int(spec[:-1])
    return n == int(spec)


def width(text: str) -> int:
    return sum(0 if unicodedata.combining(ch) else 1 for ch in text)


def pad(text: str, cols: int) -> str:
    return text + " " * max(cols - width(text), 1)


def col(cells: List[str], cap: int = 28) -> int:
    return min(max(width(c) for c in cells), cap) + 2


def query(index: str, args: List[str]) -> int:
    ends = starts = has = stressed = None
    schwa_end = schwa_final = missing = arpa = False
    syll = None
    pos: List[str] = []
    out_mode = "table"
    described = []
    it = iter(args)
    try:
        for a in it:
            if a == "--ends":        v = next(it); ends = parse_sounds(v); described.append(f"ending in {v}")
            elif a == "--starts":    v = next(it); starts = parse_sounds(v); described.append(f"starting with {v}")
            elif a == "--has":       v = next(it); has = parse_sounds(v); described.append(f"with {v}")
            elif a == "--stressed":  v = next(it); stressed = parse_sounds(v); described.append(f"stressing {v}")
            elif a == "--schwa-end":   schwa_end = True; described.append("ending in a schwa")
            elif a == "--schwa-final": schwa_final = True; described.append("with a schwa in the last syllable")
            elif a == "--syll":      syll = next(it); described.append(f"{syll} syllable(s)")
            elif a in ("-p", "--pos"):
                v = next(it); pos += [t.strip() for t in v.split(",") if t.strip()]
            elif a == "--missing":   missing = True
            elif a == "--arpa":      arpa = True
            elif a in ("--bare", "--count", "--json"): out_mode = a[2:]
            else:
                print(f"etym-sound: unknown option {a}", file=sys.stderr)
                return 1
    except StopIteration:
        print("etym-sound: an option is missing its value.", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"etym-sound: {exc}", file=sys.stderr)
        return 1
    if stressed and len(stressed) != 1:
        print("etym-sound: --stressed takes one vowel.", file=sys.stderr)
        return 1

    hits = []
    for r in load_index(index):
        if pos and not pos_ok(r["pos"], pos):
            continue
        if missing:
            if not r["arpabet"]:
                hits.append(r)
            continue
        if not r["arpabet"]:
            continue
        ph = split_phones(r["arpabet"])
        vowels = [p for p in ph if p[0] in VOWEL_BASES]
        if ends and not seq_at(ph, ends, len(ph) - len(ends)):
            continue
        if starts and not seq_at(ph, starts, 0):
            continue
        if has and not any(seq_at(ph, has, k) for k in range(len(ph))):
            continue
        if stressed and not any(p[1] == "1" and fits(p, stressed[0]) for p in ph):
            continue
        if schwa_end and not (ph and fits(ph[-1], SCHWA)):
            continue
        if schwa_final and not (vowels and fits(vowels[-1], SCHWA)):
            continue
        if syll and not syll_ok(len(vowels), syll):
            continue
        hits.append(r)

    hits.sort(key=lambda r: (r["form"].lower(), r["file"], int(r["stanza"] or 0)))

    if out_mode == "json":
        json.dump(hits, sys.stdout, ensure_ascii=False, indent=1)
        print()
        return 0
    if out_mode == "count":
        print(len({(r["file"], r["stanza"], r["form"]) for r in hits}))
        return 0
    if out_mode == "bare":
        for form in dict.fromkeys(r["form"] for r in hits):
            print(form)
        return 0

    what = "not in CMUdict" if missing else (", ".join(described) or "all")
    if pos:
        what += f"; pos {', '.join(pos)}"
    forms = len({(r["file"], r["stanza"], r["form"]) for r in hits})
    print(f"--- Sounds: {what} — {forms} form{'s' if forms != 1 else ''} ---")
    if not hits:
        return 0
    rows = []
    for r in hits:
        row = [r["form"], f"/{r['ipa']}/" if r["ipa"] else "-"]
        if arpa:
            row.append(r["arpabet"] or "-")
        row += [f"({r['pos']})" if r["pos"] else "-", r["reformed"] or "-", f"{r['file']}:{r['stanza']}"]
        rows.append(row)
    heads = ["word", "sound"] + (["arpabet"] if arpa else []) + ["pos", "reformed", "entry"]
    widths = [col([h] + [row[i] for row in rows], cap=(40 if heads[i] == "arpabet" else 28))
              for i, h in enumerate(heads[:-1])]
    print("    " + "".join(pad(h, w) for h, w in zip(heads, widths)) + heads[-1])
    for row in rows:
        print("    " + "".join(pad(c, w) for c, w in zip(row, widths)) + row[-1])
    return 0


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    if argv[0] == "build":
        return build(argv[1])
    if argv[0] == "query":
        return query(argv[1], argv[2:])
    print(__doc__, file=sys.stderr)
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except BrokenPipeError:
        sys.stderr.close()
        sys.exit(0)