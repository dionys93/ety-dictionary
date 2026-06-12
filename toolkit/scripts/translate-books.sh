#!/bin/bash

# 1. Source the environment variables
CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../config" && pwd)"
source "$CONFIG_DIR/env.sh"

echo "======================================================"
echo " 📚 STARTING INGLISCE PIPELINE"
echo "======================================================"

# 2. Wake up the Python Virtual Environment
# (Adjust this path if your venv is named or located differently)
if [ -f "$PROJECT_ROOT/toolkit/venv/bin/activate" ]; then
    source "$PROJECT_ROOT/toolkit/venv/bin/activate"
else
    echo "❌ Error: Python virtual environment not found at $PROJECT_ROOT/venv"
    exit 1
fi

# 3. Phase 1: spaCy Neural Network Parsing
echo -e "\n[1/2] Generating Abstract Syntax Trees (AST)..."
python "$PROJECT_ROOT/toolkit/scripts/spacy_parser.py" "$BOOKS_RAW_DIR" "$BOOKS_AST_DIR"

# 4. Phase 2: Node.js Transcription & Morphological Suffixing
echo -e "\n[2/2] Transcribing to Inglisce..."
node "$PROJECT_ROOT/toolkit/scripts/transcriber.js" "$BOOKS_AST_DIR" "$BOOKS_TRANS_DIR"

# 5. Clean exit
echo -e "\n🎉 Pipeline complete! Translated files are in: $BOOKS_TRANS_DIR"
deactivate