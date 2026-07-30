#!/bin/bash
# translate-books.sh — Inglisce translation pipeline orchestrator
#
# Failure guarantees:
#   * Any phase failing aborts the run immediately (no stale-cache transcription).
#   * Unset config variables are treated as fatal errors, not empty strings.
#   * A failed run always exits non-zero and names the phase that died.

set -euo pipefail

# ── 1. Config ────────────────────────────────────────────────────────────────
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../config" && pwd)"
# shellcheck source=/dev/null
source "$CONFIG_DIR/env.sh"

# Fail fast, with friendly messages, if env.sh didn't define what we need.
# (set -u would catch these anyway, but with a cryptic "unbound variable".)
for var in PROJECT_ROOT BOOKS_RAW_DIR BOOKS_AST_DIR BOOKS_TRANS_DIR; do
    if [[ -z "${!var:-}" ]]; then
        echo "❌ Error: \$$var is not set. Check $CONFIG_DIR/env.sh" >&2
        exit 1
    fi
done

if [[ ! -d "$BOOKS_RAW_DIR" ]]; then
    echo "❌ Error: source books directory not found: $BOOKS_RAW_DIR" >&2
    exit 1
fi

# ── 2. Failure reporting ─────────────────────────────────────────────────────
CURRENT_PHASE="startup"
on_error() {
    local exit_code=$?
    echo "" >&2
    echo "❌ PIPELINE FAILED during: $CURRENT_PHASE (exit code $exit_code)" >&2
    echo "   Nothing after this phase was run — the AST cache and output" >&2
    echo "   directories may be partial. Fix the error and re-run." >&2
    exit "$exit_code"
}
trap on_error ERR

echo "======================================================"
echo " 📚 STARTING INGLISCE PIPELINE"
echo "======================================================"

# ── 3. Python virtual environment ────────────────────────────────────────────
# Resolution order: $VENV_DIR override → toolkit/venv → project-root venv.
CURRENT_PHASE="venv activation"
VENV_DIR="${VENV_DIR:-}"
if [[ -z "$VENV_DIR" ]]; then
    for candidate in "$PROJECT_ROOT/toolkit/venv" "$PROJECT_ROOT/venv"; do
        if [[ -f "$candidate/bin/activate" ]]; then
            VENV_DIR="$candidate"
            break
        fi
    done
fi

if [[ -z "$VENV_DIR" || ! -f "$VENV_DIR/bin/activate" ]]; then
    echo "❌ Error: Python virtual environment not found." >&2
    echo "   Searched: $PROJECT_ROOT/toolkit/venv and $PROJECT_ROOT/venv" >&2
    echo "   (Or set VENV_DIR explicitly. See README §1 to create one.)" >&2
    exit 1
fi

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
echo "🐍 Using venv: $VENV_DIR"

# Deactivate on ANY exit (success or failure) so the caller's shell state
# is never left mutated when this script is sourced or run with errors.
trap 'command -v deactivate >/dev/null 2>&1 && deactivate' EXIT

# ── 4. Phase 1: spaCy neural parsing ─────────────────────────────────────────
CURRENT_PHASE="Phase 1/2 — spaCy AST generation"
echo ""
echo "[1/2] Generating Abstract Syntax Trees (AST)..."
python "$PROJECT_ROOT/toolkit/scripts/spacy_parser.py" "$BOOKS_RAW_DIR" "$BOOKS_AST_DIR"

# ── 5. Phase 2: Node transcription ───────────────────────────────────────────
CURRENT_PHASE="Phase 2/2 — Node.js transcription"
echo ""
echo "[2/2] Transcribing to Inglisce..."
node "$PROJECT_ROOT/toolkit/scripts/transcriber.js" "$BOOKS_AST_DIR" "$BOOKS_TRANS_DIR"

# ── 6. Done ──────────────────────────────────────────────────────────────────
CURRENT_PHASE="cleanup"
echo ""
echo "🎉 Pipeline complete! Translated files are in: $BOOKS_TRANS_DIR"
