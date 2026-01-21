## Diacritics in Inglisce

### Overview

Inglisce employs a small, tightly controlled set of **diacritics** to encode pronunciation, stress, and morphological structure with greater consistency than traditional English spelling.

Each diacritic has a **clearly delimited role**. No diacritic is decorative, redundant, or optional: every mark exists to resolve a specific class of ambiguity.

Together, the diacritics form a system in which:

* **Stress** is predictable unless explicitly marked
* **Vowel quality** is preserved across derivations
* **Consonantal alternations** remain morphologically transparent
* **Glides and complex consonants** are clearly signaled

---

### Inventory of Diacritics

| Diacritic                     | Primary Function           | Secondary Function         |
| ----------------------------- | -------------------------- | -------------------------- |
| Acute (´)                     | Stress marking             | Vowel quality              |
| Grave (`)                     | Stress marking             | Vowel quality              |
| Circumflex (ˆ)                | Vowel quality              | Conditional stress         |
| Diaeresis (¨)                 | Glide and vowel separation | Stress clarification       |
| Tilde (˜)                     | Consonantal structure      | Stress preservation        |
| Cedilla / Comma below (¸ / ̦) | Consonant quality          | Morphological transparency |

---

### Stress-First vs Quality-First Diacritics

Diacritics in Inglisce divide into two functional classes.

#### Stress-First Diacritics

The **acute** and **grave** accents primarily mark **stress**. Vowel quality is encoded simultaneously.

* Acute: marks non-default stress on **á, í, é, ó, ú**
* Grave: marks non-default stress on **à, è, ò**

These accents appear only when stress cannot be inferred from default rules.

#### Quality-First Diacritics

The **circumflex** primarily marks **vowel quality** arising from historical developments (diphthongization, r-coloring). Stress is marked only when required by grammatical gender.

* Masculine nouns/adjectives: circumflex marks quality only
* Feminine nouns/adjectives: circumflex marks both quality and stress

---

### Stress and Accent Economy

Stress in Inglisce is **predictable by word class and morphology**:

* Nouns and adjectives default to **first-syllable stress**
* Verbs default to **final or penultimate stress**, depending on suffix

As a result:

* **Unaccented words** follow default stress
* **Accented words** signal deviation from default stress or vowel quality

Only **one accent** (acute, grave, or circumflex) may appear per word, except when a **diaeresis** is also present.

---

### Consonantal Diacritics

#### Tilde (˜)

The tilde appears on **m̃** and **ñ**, representing the consonant clusters **/mj/** and **/nj/**.

Its function is to:

* Preserve the presence of a historical yod
* Prevent misinterpretation as vowel sequences
* Maintain predictable stress behavior when schwa is reduced

The tilde marks a **single complex consonantal unit**, not a consonant–vowel sequence.

---

#### Cedilla / Comma Below

Cedillas appear on **c, d, s, t** to mark predictable consonant softening and affrication.

They serve to:

* Preserve etymological relationships across derivations
* Encode consonant shifts consistently
* Reduce ambiguity in inherited and borrowed vocabulary

Cedillas do **not** interact with stress or vowel quality.

---

### Diaeresis

The diaeresis (¨) is used on **ü, ï, ÿ** to disambiguate glides and vowel relationships.

Its functions include:

* Marking **ü** as /w/ in ambiguous environments
* Separating **i** from following vowels to block long-vowel interpretations
* Clarifying stressed high vowels in derived forms (e.g. *ie + ing → ÿing*)

The diaeresis may co-occur with another accent in the same word.

---

### System Design Principles

The diacritic system of Inglisce is governed by the following principles:

1. **Economy** – Diacritics appear only when required
2. **Predictability** – Default patterns remain unmarked
3. **Morphological transparency** – Related forms remain visibly connected
4. **Phonological clarity** – Ambiguity is resolved explicitly, not contextually

Each diacritic occupies a distinct functional niche, preventing overlap and redundancy.

---

### Cross-References

* See [Stress](stress.md) for default stress rules
* See [Acute Accent](acute.md)
* See [Grave Accent](grave.md)
* See [Circumflex Accent](circumflex.md)
* See [Tildes](tilde.md)
* See [Diaeresis](diaeresis.md)
* See [Cedilla](cedilla.md)
