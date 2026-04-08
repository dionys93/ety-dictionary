#!/bin/bash

# Load your library
# Adjust the path if etym-lib.sh is in a different relative location
source ../src/etym-lib.sh

# UI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
    echo "Usage: ./run-auditor.sh [suite_name] [--update]"
    echo "Example: ./run-auditor.sh verbs"
    echo "Options: --update (Overwrite snapshots with current output)"
    exit 1
}

run_suite() {
    local SUITE_NAME="$1"
    local UPDATE_MODE="$2"
    local SUITE_FILE="./suites/${SUITE_NAME}.txt"
    local SNAP_DIR="./snapshots/${SUITE_NAME}"

    if [[ ! -f "$SUITE_FILE" ]]; then
        echo -e "${RED}Error:${NC} Suite '$SUITE_NAME' not found in ./suites/"
        exit 1
    fi

    mkdir -p "$SNAP_DIR"

    echo -e "${YELLOW}=== Running Suite: $SUITE_NAME ===${NC}"

    while read -r word; do
        # Skip empty lines and comments
        [[ -z "$word" || "$word" == "#"* ]] && continue 

        local current_json="/tmp/etym_test_${word}.json"
        local snap_json="$SNAP_DIR/${word}.json"
        
        # Run export
        etym-export "$word" > "$current_json" 2>/dev/null
        
        # Check if we are initializing or updating
        if [[ ! -f "$snap_json" || $UPDATE_MODE -eq 1 ]]; then
            echo -e "📸 ${YELLOW}Saving snapshot:${NC} $word"
            cp "$current_json" "$snap_json"
            continue
        fi

        # Compare JSON structure using jq to normalize formatting
        if diff <(jq -S . "$snap_json") <(jq -S . "$current_json") > /dev/null 2>&1; then
            echo -e "  [${GREEN}PASS${NC}] $word"
        else
            echo -e "  [${RED}FAIL${NC}] $word"
            echo -e "      ${YELLOW}Diff (Expected vs Actual):${NC}"
            diff -u <(jq -S . "$snap_json") <(jq -S . "$current_json") | grep -E "^\+|\-" | grep -vE "^\+\+\+|---"
        fi

    done < "$SUITE_FILE"
}

# --- Main Logic ---

[[ -z "$1" ]] && usage

UPDATE=0
[[ "$2" == "--update" ]] && UPDATE=1

# Execute the suite
run_suite "$1" "$UPDATE"