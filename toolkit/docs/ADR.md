# ADR 001: NLP Engine Architecture (Node.js vs. Python/spaCy)

## Status
Accepted

## Context
Our translation engine requires highly accurate Part-of-Speech (POS) tagging, lemmatization, and contextual disambiguation to map complex English literature (e.g., Sophocles) to the Inglisce dictionary. We initially spiked two Node.js engines to keep the architecture contained within a single language runtime:
* **`wink-nlp` (Statistical/Lite):** Provided fast tokenization but failed on basic contextual disambiguation (e.g., tagging "watch" as a VERB in "I bought a gold watch").
* **`compromise` (Rule-Based):** Provided excellent morphological tags (`#PastTense`, `#Gerund`) but suffered from "List Traps" (e.g., miscategorizing "chants" as a Verb in a comma-separated list of nouns).
* **The Core Issue:** Because Node.js engines lack true Deep Learning Dependency Parsing, they process text strictly left-to-right using proximity heuristics rather than mathematically mapping the structural syntax of the sentence. 

## Decision
We are officially abandoning Node.js-based NLP libraries for parsing. The maintenance burden of writing manual AST overrides and regex patches for every literary edge case is unscalable. 

We will adopt **spaCy** (Python, `en_core_web_trf` transformer model) as our core NLP engine using a **Decoupled 2-Step File Pipeline**:
1. A Python script (`spacy_parser.py`) will parse the source text and export a highly structured AST (Abstract Syntax Tree) to an intermediate `.json` file.
2. Our Node.js transcriber (`transcriber.js`) will consume this JSON file synchronously to handle the Inglisce dictionary lookups, suffix reconstruction, and string generation.

## Consequences
* **Positive (Accuracy):** Unmatched accuracy. spaCy's neural network natively understands complex syntactic dependencies, entirely eliminating "List Traps" and the need for manual grammar patching.
* **Positive (Debuggability & Caching):** By communicating via a static JSON file rather than a live microservice, we can cache the heavy neural network output. We can run our lightweight JS transcriber thousands of times instantly against the cached `ast.json` file, and physically open the JSON to inspect spaCy's exact tags if a word translates strangely.
* **Positive (Performance):** Zero local HTTP network latency or timeout risks, as the processes are strictly synchronous batch scripts.
* **Negative (Polyglot Complexity):** We must now manage, test, and document both a Node.js environment and a Python virtual environment (`venv`) for the build pipeline.