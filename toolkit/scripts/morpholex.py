"""MorphoLex-en support for etym-morph.

MorphoLex-en (Sánchez-Gutiérrez, Mailhot, Deacon & Wilson 2018) segments
68,624 words from the English Lexicon Project into morphemes. It ships as one
Excel workbook with a sheet per prefix-root-suffix signature ("0-1-1" is one
root and one suffix). Segmentations are written

    <un<      a prefix          >ness>    a suffix
    (clean)   a root            {...}     a free base, which may nest

so "cleanliness" is {(clean)>ly>}>ness>, and "wooden" is {(wood)}>en>.
Homographic suffixes share a spelling: every -en is >en>, whatever its
history. The ELP part of speech that comes with each word is what separates
them.

Subcommands (etym-morph calls these; they can also be run by hand):

  build <cache.tsv> [<workbook.xlsx>]
      Read the workbook (downloading it first if no path is given) and write
      a flat TSV cache: word, ELP POS, PRS signature, segmentation.
  Lookups print segmentations as parts ("wood + -en") and parts of speech in
  words ("adjective"); add --raw for MorphoLex's own notation and ELP codes.

  word <cache.tsv>
      Read etym-lib rows (file, stanza, POS, [ME] text) on stdin and print the
      segmentation of every word on each [ME] line.
  suffix <cache.tsv> <suffix>
      Read rows for the whole dictionary on stdin and list every [ME] word
      whose segmentation contains <suffix>, grouped by ELP part of speech.
"""

import os
import re
import sys
import tempfile
import urllib.request
from collections import defaultdict
from typing import Dict, List, Tuple

from cmu_pron import words_of  # same reading of an [ME] line as etym-pron

WORKBOOK_URL = (
    "https://raw.githubusercontent.com/hugomailhot/MorphoLex-en/"
    "master/MorphoLEX_en.xlsx"
)
SIGNATURE_SHEET = re.compile(r"^\d+-\d+-\d+$")

PREFIX = re.compile(r"<([^<>{}()]+)<")
SUFFIX = re.compile(r">([^<>{}()]+)>")
ROOT = re.compile(r"\(([^()]+)\)")

Entry = Tuple[str, str, str]          # ELP POS, PRS signature, segmentation


# ── build ────────────────────────────────────────────────────────────────────

def _find_columns(header: List[str]) -> Dict[str, int]:
    """Locate the columns we need by name, tolerating case and spacing."""
    names = [str(h or "").strip().lower() for h in header]
    cols = {}
    for i, name in enumerate(names):
        if name == "word" and "word" not in cols:
            cols["word"] = i
        elif name == "pos" and "pos" not in cols:
            cols["pos"] = i
        elif "segm" in name and "segm" not in cols:
            cols["segm"] = i
        elif "prs" in name and "prs" not in cols:
            cols["prs"] = i
    return cols


def build(cache_path: str, workbook: str = "") -> int:
    try:
        import openpyxl  # type: ignore
    except ImportError:
        sys.exit(f'morpholex: openpyxl is needed to read the workbook.\n'
                 f'  "{sys.executable}" -m pip install openpyxl')

    cache_dir = os.path.dirname(cache_path)
    os.makedirs(cache_dir, exist_ok=True)

    if not workbook:
        workbook = os.path.join(cache_dir, "MorphoLEX_en.xlsx")
        if not os.path.exists(workbook):
            print(f"Downloading {WORKBOOK_URL}")
            try:
                urllib.request.urlretrieve(WORKBOOK_URL, workbook + ".part")
            except OSError as exc:
                sys.exit(f"morpholex: download failed: {exc}\n"
                         f"  Download it by hand and run: etym-morph --setup <file.xlsx>")
            os.replace(workbook + ".part", workbook)
        else:
            print(f"Using the workbook already downloaded: {workbook}")

    wb = openpyxl.load_workbook(workbook, read_only=True, data_only=True)
    rows: List[Tuple[str, str, str, str]] = []
    used, skipped = [], []
    first_headers = None

    for ws in wb.worksheets:
        if not SIGNATURE_SHEET.match(ws.title.strip()):
            continue
        it = ws.iter_rows(values_only=True)
        header = next(it, None)
        if header is None:
            continue
        if first_headers is None:
            first_headers = header
        cols = _find_columns(list(header))
        if not {"word", "segm"} <= cols.keys():
            skipped.append(ws.title)
            continue
        used.append(ws.title)
        for r in it:
            word = r[cols["word"]] if cols["word"] < len(r) else None
            segm = r[cols["segm"]] if cols["segm"] < len(r) else None
            if not word or not segm:
                continue
            pos = r[cols["pos"]] if "pos" in cols and cols["pos"] < len(r) else ""
            prs = r[cols["prs"]] if "prs" in cols and cols["prs"] < len(r) else ws.title
            rows.append((str(word).strip(), str(pos or "").strip(),
                         str(prs or ws.title).strip(), str(segm).strip()))
    wb.close()

    if not rows:
        print("morpholex: found no sheet with a word and a segmentation column.",
              file=sys.stderr)
        if first_headers is not None:
            print(f"  Headers of the first signature sheet: {list(first_headers)}",
                  file=sys.stderr)
        return 1

    fd, tmp = tempfile.mkstemp(dir=cache_dir, suffix=".tsv")
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write("word\tpos\tprs\tsegm\n")
        for row in rows:
            out.write("\t".join(v.replace("\t", " ") for v in row) + "\n")
    os.replace(tmp, cache_path)

    print(f"Read {len(rows):,} words from {len(used)} signature sheets.")
    if skipped:
        print(f"Skipped sheets without the expected columns: {', '.join(skipped)}")
    print(f"Cache written to {cache_path}")
    return 0


# ── lookups ──────────────────────────────────────────────────────────────────

def load_cache(path: str) -> Dict[str, List[Entry]]:
    table: Dict[str, List[Entry]] = defaultdict(list)
    with open(path, encoding="utf-8") as fh:
        next(fh, None)
        for line in fh:
            word, pos, prs, segm = (line.rstrip("\n").split("\t") + ["", "", ""])[:4]
            table[word.lower()].append((pos, prs, segm))
    return table


def parts(segm: str) -> Tuple[List[str], List[str], List[str]]:
    """Prefixes, roots and suffixes named in a segmentation, in order."""
    return PREFIX.findall(segm), ROOT.findall(segm), SUFFIX.findall(segm)


# One pass over a segmentation, morphemes in the order they are written.
_MORPHEME = re.compile(r"<([^<>{}()]+)<|\(([^()]+)\)|>([^<>{}()]+)>")


def readable(segm: str) -> str:
    """{(clean)>ly>}>ness> -> "clean + -ly + -ness"; <un<{(close)} -> "un- + close".

    Falls back to the raw segmentation if nothing in it parses.
    """
    out = []
    for m in _MORPHEME.finditer(segm):
        prefix, root, suffix = m.groups()
        if prefix:
            out.append(prefix + "-")
        elif root:
            out.append(root)
        elif suffix:
            out.append("-" + suffix)
    return " + ".join(out) if out else segm


# English Lexicon Project part-of-speech codes, which are Penn Treebank tags
# plus a few of ELP's own. Anything not listed is shown as given.
_POS_NAMES = {
    "NN": "noun", "NNS": "plural noun", "NNP": "proper noun",
    "NNPS": "plural proper noun",
    "VB": "verb", "VBD": "past tense", "VBN": "past participle",
    "VBG": "-ing form", "VBZ": "3rd person verb", "VBP": "present verb",
    "JJ": "adjective", "JJR": "comparative adjective",
    "JJS": "superlative adjective",
    "RB": "adverb", "RBR": "comparative adverb", "RBS": "superlative adverb",
    "IN": "preposition", "CC": "conjunction", "DT": "determiner",
    "PRP": "pronoun", "PRP$": "possessive pronoun", "MD": "modal",
    "UH": "interjection", "CD": "number", "RP": "particle",
    "minor": "function word", "encl": "contraction",
}


def pos_name(code: str) -> str:
    """'VB|JJ' -> 'verb or adjective'; '' -> 'no part of speech given'."""
    if not code:
        return "no part of speech given"
    return " or ".join(_POS_NAMES.get(c.strip(), c.strip()) for c in code.split("|"))


def _read_rows():
    for line in sys.stdin:
        line = line.rstrip("\n")
        if line:
            yield (line.split("\t") + ["", "", ""])[:4]


def _short(path: str) -> str:
    root = os.environ.get("DICT_DIR", "")
    if root and path.startswith(root.rstrip("/") + "/"):
        return path[len(root.rstrip("/")) + 1:]
    return path


def cmd_word(cache: str, raw: bool = False) -> int:
    table = load_cache(cache)
    for _file, stanza, pos, me in _read_rows():
        header = f"[{stanza}] {me}"
        if pos:
            header += f"  ({pos})"
        print(header)

        # Lay out the whole stanza first so its columns line up across words.
        lines = []
        for word in words_of(me):
            entries = table.get(word.lower())
            if not entries:
                lines.append((word, "not in MorphoLex", ""))
                continue
            for i, (code, _prs, segm) in enumerate(entries):
                lines.append((word if i == 0 else "",
                              segm if raw else readable(segm),
                              (code or "-") if raw else pos_name(code)))
        w_word = max((len(l[0]) for l in lines), default=0) + 2
        w_seg = max((len(l[1]) for l in lines), default=0) + 3
        for word, seg, name in lines:
            print(f"    {word:<{w_word}}{seg:<{w_seg}}{name}".rstrip())
        print()
    return 0


def cmd_suffix(cache: str, suffix: str, raw: bool = False) -> int:
    suffix = suffix.lstrip("-")
    table = load_cache(cache)

    hits = defaultdict(list)          # POS code -> [(word, parts, your POS, where)]
    seen = set()
    looked = found = 0
    for file, stanza, pos, me in _read_rows():
        for word in words_of(me):
            key = (word.lower(), file, stanza)
            if key in seen:
                continue
            seen.add(key)
            looked += 1
            entries = table.get(word.lower())
            if not entries:
                continue
            found += 1
            for code, _prs, segm in entries:
                if suffix in parts(segm)[2]:
                    hits[code].append((word, segm if raw else readable(segm),
                                       pos, f"{_short(file)}:{stanza}"))

    total = sum(len(v) for v in hits.values())
    print(f"--- Dictionary words ending in the suffix -{suffix} (MorphoLex-en) ---")
    print(f"{found:,} of your {looked:,} [ME] words are in MorphoLex; "
          f"{total:,} of them have -{suffix}.")
    if not total:
        return 0
    print("Grouped by the part of speech MorphoLex gives each word.")

    rows = [r for v in hits.values() for r in v]
    w_word = max([len("word")] + [len(r[0]) for r in rows]) + 2
    w_segm = max([len("parts")] + [len(r[1]) for r in rows]) + 2
    w_pos = max([len("your tag")] + [len(f"({r[2]})") for r in rows if r[2]]) + 2

    for code in sorted(hits, key=lambda c: (-len(hits[c]), c)):
        group = sorted(hits[code], key=lambda r: r[0].lower())
        n = len(group)
        title = (code or "-") if raw else pos_name(code)
        print(f"\n{title}  ({n} word{'s' if n != 1 else ''})")
        print(f"    {'word':<{w_word}}{'parts':<{w_segm}}{'your tag':<{w_pos}}entry")
        for word, seg, pos, where in group:
            yours = f"({pos})" if pos else "-"
            print(f"    {word:<{w_word}}{seg:<{w_segm}}{yours:<{w_pos}}{where}")
    return 0


def main(argv: List[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    raw = "--raw" in argv
    argv = [a for a in argv if a != "--raw"]
    cmd, cache = argv[0], argv[1]
    if cmd == "build":
        return build(cache, argv[2] if len(argv) > 2 else "")
    if cmd == "word":
        return cmd_word(cache, raw)
    if cmd == "suffix" and len(argv) > 2:
        return cmd_suffix(cache, argv[2], raw)
    print(__doc__, file=sys.stderr)
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except BrokenPipeError:
        sys.stderr.close()
        sys.exit(0)