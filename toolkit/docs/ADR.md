# ADR 001: NLP Engine Selection (Compromise vs. Wink)

## Status
Accepted

## Context
Our translation engine requires highly accurate Part-of-Speech (POS) tagging and lemmatization to map English words to the Inglisce dictionary. We spiked two engines: `compromise` (rule-based) and `wink-nlp` (statistical/lite). 
* `wink-nlp` provided superior tokenization and lemmatization (especially for contractions).
* However, `wink-nlp` failed on contextual disambiguation (e.g., tagging "watch" as a VERB in "I bought a gold watch") and aggressive auxiliary tagging.
* `compromise` provides granular tags (e.g., `#PastTense`, `#Gerund`) which are highly useful for our suffix-reconstruction pipeline.

## Decision
We decided to come back to Compromise and do further tests. 

## Consequences
* **Positive:** We retain the ability to inject custom regex rules to fix edge cases.
* **Negative:** We must manually handle some lemmatization steps that Wink would have done for us automatically.