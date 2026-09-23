"""CMUdict lookup for etym-pron.

Reads tab-separated rows on stdin, one per stanza, as emitted by etym-pron:

    <stanza number> TAB <pos> TAB <[ME] text>

and prints ARPAbet pronunciations for every word on the [ME] line. The [ME]
text arrives already cut at the tag, so conjugation suffixes written after it
("to close [ME] -s -d -ing") never reach this script.

Data source, in order:
  1. $ETYM_CMUDICT — a plain cmudict.dict file ("word PH ON ES", variants as
     "word(2)", "#" comments allowed). Useful offline or for pinning a version.
  2. The `cmudict` package (pip install cmudict), which bundles the same file.
"""

import os
import re
import sys
from typing import Dict, List

Pron = List[str]

# A lookup key keeps letters, digits, apostrophes, hyphens and dots, which are
# the only punctuation CMUdict headwords carry ("can't", "mr.").
_EDGE_PUNCT = re.compile(r"^[^\w']+|[^\w'.]+$")


def load_cmudict() -> Dict[str, List[Pron]]:
    path = os.environ.get("ETYM_CMUDICT")
    if path:
        return _read_dict_file(path)
    try:
        import cmudict  # type: ignore
    except ImportError:
        # etym-pron checks this before calling, so this is reached only when
        # the script is run by hand.
        sys.exit(
            f"cmu_pron: the cmudict package is not installed for {sys.executable}.\n"
            f'  "{sys.executable}" -m pip install cmudict\n'
            "  or set ETYM_CMUDICT to a cmudict.dict file."
        )
    return cmudict.dict()


def _read_dict_file(path: str) -> Dict[str, List[Pron]]:
    table: Dict[str, List[Pron]] = {}
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            word, *phones = line.split()
            word = re.sub(r"\(\d+\)$", "", word).lower()
            table.setdefault(word, []).append(phones)
    return table


def words_of(me_text: str) -> List[str]:
    """Every distinct word on an [ME] line, in order.

    Comma-separated forms are separate headwords ("can, could, can't"); a
    leading "to " marks the infinitive and is not pronounced; multi-word forms
    ("New York") contribute each of their words.
    """
    seen, out = set(), []
    for form in me_text.split(","):
        form = form.strip().replace("\u2019", "'")
        form = re.sub(r"^to\s+", "", form, flags=re.IGNORECASE)
        for w in form.split():
            if w and w.lower() not in seen:
                seen.add(w.lower())
                out.append(w)
    return out


def lookup(word: str, table: Dict[str, List[Pron]]) -> List[Pron]:
    """All CMUdict pronunciations for a word, or [] if it has none.

    Tries the word as written, then with edge punctuation stripped. A
    hyphenated compound CMUdict lacks is assembled from its parts' first
    pronunciations, but only when every part is found.
    """
    key = word.lower()
    for candidate in (key, _EDGE_PUNCT.sub("", key)):
        if candidate in table:
            return table[candidate]
    if "-" in key:
        parts = [p for p in key.split("-") if p]
        found = [lookup(p, table) for p in parts]
        if parts and all(found):
            return [[ph for pron in found for ph in pron[0]]]
    return []


# ── ARPAbet → IPA ────────────────────────────────────────────────────────────
# General American values. Two vowels split on stress, because CMUdict uses one
# symbol for what IPA writes two ways: AH0 is schwa, AH1/AH2 is wedge; ER0 is
# unstressed ɚ, ER1/ER2 is stressed ɝ. R is written ɹ, the English approximant,
# and the affricates without a tie bar (tʃ, dʒ).
_VOWELS = {
    "AA": "ɑ", "AE": "æ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ",
    "EY": "eɪ", "IH": "ɪ", "IY": "i", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ",
    "UW": "u",
}
_CONSONANTS = {
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h",
    "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p",
    "R": "ɹ", "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v", "W": "w",
    "Y": "j", "Z": "z", "ZH": "ʒ",
}

# Consonant clusters English allows at the start of a syllable (General
# American, so no yod after coronals: "tune" is T UW1 N in CMUdict anyway).
# Used only to decide where a stress mark goes — see to_ipa.


def _build_onsets():
    raw = """P R|P L|P Y|B R|B L|B Y|T R|T W|D R|D W|K R|K L|K W|K Y|G R|G L|G W|
             F R|F L|F Y|V Y|TH R|TH W|SH R|HH Y|M Y|S P|S T|S K|S M|S N|S L|
             S W|S F|S P R|S P L|S P Y|S T R|S K R|S K L|S K W|S K Y"""
    onsets = {tuple(c.split()) for c in raw.replace("\n", "").split("|")}
    onsets |= {(c,) for c in _CONSONANTS if c != "NG"}
    return onsets


_ONSETS = _build_onsets()


def _split(phone):
    """'AH0' -> ('AH', '0'); 'K' -> ('K', '')."""
    return (phone[:-1], phone[-1]) if phone[-1].isdigit() else (phone, "")


def to_ipa(phones):
    """Convert one CMUdict pronunciation to IPA, with stress marks.

    IPA puts ˈ and ˌ at the start of the stressed syllable, and CMUdict marks
    stress on the vowel without saying where syllables begin. The mark is
    therefore placed by maximal onset: it moves back over the longest run of
    preceding consonants that English allows to begin a syllable ("extra" →
    ˈɛkstɹə, "construct" → kənˈstɹʌkt). That is a rule, not a transcription,
    and it can differ from a dictionary's syllabification — hence "IPA-like".
    """
    out = []
    cluster = []            # consonants seen since the last vowel
    for phone in phones:
        base, stress = _split(phone)
        if base not in _VOWELS and base not in ("AH", "ER"):
            cluster.append(base)
            continue

        # Longest legal onset at the end of the cluster goes with this vowel.
        onset_len = 0
        for n in range(len(cluster), 0, -1):
            if tuple(cluster[-n:]) in _ONSETS:
                onset_len = n
                break
        coda, onset = cluster[:len(cluster) - onset_len], cluster[len(cluster) - onset_len:]
        out.extend(_CONSONANTS.get(c, c.lower()) for c in coda)
        if stress == "1":
            out.append("ˈ")
        elif stress == "2":
            out.append("ˌ")
        out.extend(_CONSONANTS.get(c, c.lower()) for c in onset)
        cluster = []

        if base == "AH":
            out.append("ə" if stress == "0" else "ʌ")
        elif base == "ER":
            out.append("ɚ" if stress == "0" else "ɝ")
        else:
            out.append(_VOWELS[base])

    out.extend(_CONSONANTS.get(c, c.lower()) for c in cluster)
    return "".join(out)


def main() -> int:
    # Output mode from etym-pron: "arpa" (default), "ipa", or "both".
    mode = sys.argv[1] if len(sys.argv) > 1 else "arpa"
    table = load_cmudict()

    def render(pron):
        arpa, ipa = " ".join(pron), "/" + to_ipa(pron) + "/"
        if mode == "ipa":
            return ipa
        if mode == "both":
            return f"{ipa:<16}{arpa}"
        return arpa

    for row in sys.stdin:
        row = row.rstrip("\n")
        if not row:
            continue
        stanza, pos, me_text = (row.split("\t") + ["", ""])[:3]

        header = f"[{stanza}] {me_text or '(no [ME] line)'}"
        if pos:
            header += f"  ({pos})"
        print(header)

        words = words_of(me_text)
        width = max((len(w) for w in words), default=0) + 2
        for word in words:
            prons = lookup(word, table)
            if not prons:
                print(f"    {word:<{width}}-- not in CMUdict")
                continue
            for i, pron in enumerate(prons):
                label = word if i == 0 else ""
                print(f"    {label:<{width}}{render(pron)}")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())