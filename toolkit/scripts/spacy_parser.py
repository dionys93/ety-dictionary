import spacy
import json
import sys
import os

# Load the transformer model
nlp = spacy.load("en_core_web_trf")

def process_file(input_path, output_path):
    print(f"🧠 spaCy parsing: {input_path}...")
    
    with open(input_path, 'r', encoding='utf-8') as f:
        text = f.read()

    # Pass the text through the neural network
    doc = nlp(text)
    
    tokens = []
    for token in doc:
        tokens.append({
            "text": token.text,
            "lemma": token.lemma_,
            "pos": token.pos_,       # Coarse POS (VERB, NOUN)
            "tag": token.tag_,       # Fine POS (VBD, NNS)
            "is_ent": token.ent_type_ != "", # Named Entity Boolean
            "whitespace": token.whitespace_
        })

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(tokens, f, indent=2)
        
    print(f"✅ AST exported to: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python spacy_parser.py <input.txt> <output.json>")
        sys.exit(1)
        
    process_file(sys.argv[1], sys.argv[2])