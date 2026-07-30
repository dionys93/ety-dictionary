#!/bin/bash
# test-etym-parse.sh — Golden-file test suite for etym-parse.awk
#
# Checks, in order:
#   1. GOLDEN   — each fixture's output is byte-identical to its frozen golden
#   2. JSON     — every emitted line parses as valid JSON (python3 or node)
#   3. ESCAPING — hostile characters (\ " tab) round-trip losslessly
#   4. STREAM   — one multi-file awk invocation == concatenated per-file runs
#                 (guards the RS="" paragraph-mode file-boundary behavior that
#                  _etym_stream's single-process optimization depends on,
#                  including a fixture with no trailing newline)
#   5. CONTRACT — golden JSONL piped through the REAL buildBrain() from
#                 scripts/build-dictionary.js (catches awk↔Node schema drift;
#                 skipped if node or the script is absent)
#
# Usage:  bash tests/test-etym-parse.sh
# Env:    ETYM_AWK=<awk binary> to test a specific implementation
#         (run it once per awk you care about: awk, gawk, mawk)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARSER="$HERE/../etym-parse.awk"
FIXTURES="$HERE/fixtures/parser"
GOLDEN="$HERE/snapshots/parser"
AWK_BIN="${ETYM_AWK:-awk}"

[[ -f "$PARSER" ]] || { echo "❌ parser not found: $PARSER" >&2; exit 1; }

pass=0
fail=0
check() { # check <label> <ok_flag>
    if [[ "$2" == "0" ]]; then
        printf '  ✅ %s\n' "$1"; ((pass++)) || true
    else
        printf '  ❌ %s\n' "$1"; ((fail++)) || true
    fi
}

echo "Testing with: $AWK_BIN ($($AWK_BIN -W version 2>&1 | head -1 || true))"
echo "================================================================="

# ── 1. Golden comparisons ────────────────────────────────────────────────────
echo "[1/5] Golden-file comparisons"
while IFS= read -r fixture; do
    rel="${fixture#$FIXTURES/}"
    golden="$GOLDEN/$(echo "${rel%.txt}" | tr '/' '_').jsonl"
    if [[ ! -f "$golden" ]]; then
        check "$rel (golden file missing: $golden)" 1
        continue
    fi
    if diff -u "$golden" <("$AWK_BIN" -f "$PARSER" "$fixture") >/dev/null 2>&1; then
        check "$rel" 0
    else
        check "$rel" 1
        diff -u "$golden" <("$AWK_BIN" -f "$PARSER" "$fixture") | sed 's/^/     /' || true
    fi
done < <(find "$FIXTURES" -name '*.txt' | sort)

# ── 2. JSON validity of every record ─────────────────────────────────────────
echo "[2/5] JSON validity"
json_validator=""
if command -v python3 >/dev/null 2>&1; then
    json_validator="python3"
elif command -v node >/dev/null 2>&1; then
    json_validator="node"
fi

if [[ -z "$json_validator" ]]; then
    echo "  ⚠️  skipped (need python3 or node to validate JSON)"
else
    all_output=$(find "$FIXTURES" -name '*.txt' | sort | xargs "$AWK_BIN" -f "$PARSER")
    if [[ "$json_validator" == "python3" ]]; then
        echo "$all_output" | python3 -c '
import json, sys
n = 0
for line in sys.stdin:
    if line.strip():
        json.loads(line)
        n += 1
print(f"     {n} records validated")
' && check "every emitted line is valid JSON ($json_validator)" 0 \
  || check "every emitted line is valid JSON ($json_validator)" 1
    else
        echo "$all_output" | node -e '
let n = 0;
require("readline").createInterface({ input: process.stdin }).on("line", l => {
    if (l.trim()) { JSON.parse(l); n++; }
}).on("close", () => console.log(`     ${n} records validated`));
' && check "every emitted line is valid JSON ($json_validator)" 0 \
  || check "every emitted line is valid JSON ($json_validator)" 1
    fi
fi

# ── 3. Escaping round-trip ───────────────────────────────────────────────────
echo "[3/5] Escaping round-trip (backslash, quote, tab)"
if [[ -z "$json_validator" ]]; then
    echo "  ⚠️  skipped (need python3 or node)"
elif [[ "$json_validator" == "python3" ]]; then
    "$AWK_BIN" -f "$PARSER" "$FIXTURES/e/escape.txt" | python3 -c '
import json, sys
rec = json.loads(sys.stdin.readline())
assert rec["etymology"][0]["form"] == "es\"ca\\pe"
assert rec["etymology"][1]["form"] == "es\tcape"
assert rec["sources"][0] == "https://example.com/esc\"ape\\path"
' && check "hostile characters survive intact" 0 || check "hostile characters survive intact" 1
else
    "$AWK_BIN" -f "$PARSER" "$FIXTURES/e/escape.txt" | node -e '
let data = "";
process.stdin.on("data", d => data += d).on("end", () => {
    const rec = JSON.parse(data.split("\n")[0]);
    const ok = rec.etymology[0].form === "es\"ca\\pe"
        && rec.etymology[1].form === "es\tcape"
        && rec.sources[0] === "https://example.com/esc\"ape\\path";
    process.exit(ok ? 0 : 1);
});
' && check "hostile characters survive intact" 0 || check "hostile characters survive intact" 1
fi

# ── 4. Stream boundary equivalence ───────────────────────────────────────────
echo "[4/5] Multi-file stream equivalence (single awk process vs per-file)"
single=$(find "$FIXTURES" -name '*.txt' | sort | xargs "$AWK_BIN" -f "$PARSER")
perfile=$(find "$FIXTURES" -name '*.txt' | sort | while IFS= read -r f; do
    "$AWK_BIN" -f "$PARSER" "$f"
done)
if [[ "$single" == "$perfile" ]]; then
    check "records never merge across file boundaries" 0
else
    check "records never merge across file boundaries" 1
fi

# ── 5. awk ↔ Node schema contract (shared with tests/node/brain-contract.test.js) ──
echo "[5/5] buildBrain() schema contract"
if command -v node >/dev/null 2>&1 && [[ -f "$HERE/../scripts/build-dictionary.js" ]]; then
    if node "$HERE/node/brain-contract.assertions.mjs"; then
        check "golden JSONL compiles into a correct translation brain" 0
    else
        check "golden JSONL compiles into a correct translation brain" 1
    fi
else
    echo "  ⚠️  skipped (needs node and ../scripts/build-dictionary.js)"
fi

# ── Report ───────────────────────────────────────────────────────────────────
echo "================================================================="
echo "PASSED: $pass   FAILED: $fail"
[[ $fail -eq 0 ]]
