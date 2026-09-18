import spacy
import json
import sys
from pathlib import Path
from typing import Optional

# ==========================================
# 1. PURE FUNCTIONS (Data Transformation)
# ==========================================

# Dependency labels that mark a verb as taking an object IN THIS CLAUSE.
# Transitivity in English is a property of the clause, not of the lemma —
# "burn" is genuinely both verbs — so it is read off the parse per occurrence
# rather than looked up. Nothing in pos_ or tag_ carries it: the Penn tags
# encode inflection only, and English morph has no transitivity feature.
#
# spaCy's English models use the ClearNLP scheme, so the direct object is
# `dobj`, not Universal Dependencies' `obj`. Check with
# `spacy.explain("dobj")` if a model ever changes under you.
OBJECT_DEPS = frozenset({"dobj", "dative", "ccomp", "xcomp", "attr", "oprd"})

# A passive clause has no dobj — the object has moved into subject position —
# but it is still a transitive use and wants the transitive entry.
PASSIVE_DEPS = frozenset({"auxpass", "nsubjpass"})

VERBAL_POS = frozenset({"VERB", "AUX"})


def transitivity(token) -> Optional[str]:
    """Pure function: 'tr' or 'intr' for a verb, None for anything else.

    Known misses, all of them clause-shape rather than model error:
    prepositional objects ("burned through the fuel") attach as pobj and read
    intransitive; object-drop ("I already ate") reads intransitive though the
    sense is transitive; ellipsis in dialogue likewise.
    """
    if token.pos_ not in VERBAL_POS:
        return None
    deps = {child.dep_ for child in token.children}
    return "tr" if (deps & OBJECT_DEPS or deps & PASSIVE_DEPS) else "intr"


def extract_token_data(token) -> dict:
    """Pure function: maps a single spaCy token to a dictionary."""
    return {
        "text": token.text,
        "lemma": token.lemma_,
        "pos": token.pos_,
        "tag": token.tag_,
        "transitivity": transitivity(token),
        "is_ent": token.ent_type_ != "",
        "whitespace": token.whitespace_
    }

def parse_text(text: str, nlp_model) -> list:
    """Pure function: takes raw string and model, returns the AST list."""
    doc = nlp_model(text)
    # Use map to functionally apply the extraction over the document tokens
    return list(map(extract_token_data, doc))

def compute_output_path(file_path: Path, base_input_dir: Path, base_output_dir: Path) -> Path:
    """Pure function: calculates the mirrored output directory structure."""
    relative_path = file_path.relative_to(base_input_dir)
    return base_output_dir / relative_path.with_suffix('.json')

# ==========================================
# 2. IMPURE FUNCTIONS (Side Effects / I/O)
# ==========================================

def process_single_file(input_path: Path, output_path: Path, nlp_model) -> Path:
    """Impure: Handles the physical reading, directory creation, and writing."""
    print(f"🧠 Parsing: {input_path}")
    
    # Read
    text = input_path.read_text(encoding='utf-8')
    
    # Transform (Pure)
    ast_data = parse_text(text, nlp_model)
    
    # Write
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(ast_data, indent=2), encoding='utf-8')
    
    return output_path

# ==========================================
# 3. THE PIPELINE (Orchestrator)
# ==========================================

def process_directory(input_dir_str: str, output_dir_str: str):
    """Orchestrates the functional pipeline."""
    input_dir = Path(input_dir_str)
    output_dir = Path(output_dir_str)
    
    if not input_dir.is_dir():
        print(f"❌ Error: Input '{input_dir}' is not a valid directory.")
        sys.exit(1)

    print("⏳ Loading spaCy model (en_core_web_trf)...")
    nlp = spacy.load("en_core_web_trf")

    # 1. Create a lazy generator of all .txt files in the tree
    txt_files = input_dir.rglob('*.txt')

    # 2. Map files to a tuple of (input_path, calculated_output_path)
    path_pairs = map(lambda p: (p, compute_output_path(p, input_dir, output_dir)), txt_files)

    # 3. Map the processing function over the pairs
    # Note: map is lazy in Python 3, so nothing executes until we consume it
    results = map(lambda paths: process_single_file(paths[0], paths[1], nlp), path_pairs)

    # 4. Consume the iterator to execute the side-effects
    for out_path in results:
        print(f"✅ Exported: {out_path}")

    print("\n🎉 Batch processing complete!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/spacy_parser.py <input_dir> <output_dir>")
        sys.exit(1)
        
    process_directory(sys.argv[1], sys.argv[2])