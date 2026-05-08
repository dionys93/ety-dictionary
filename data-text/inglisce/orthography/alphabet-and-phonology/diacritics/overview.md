# Diacritical Marks in Inglisce

### Overview

Inglisce employs a small, tightly controlled set of **diacritics** to encode pronunciation, stress, and morphological structure. Each diacritic has a **clearly delimited role**. No diacritic is decorative, redundant, or optional: every mark exists to resolve a specific class of ambiguity. The system creates visual consistency—related sounds use related marks, making patterns easier to learn and read.

Together, the diacritics form a system in which:
* **Stress** is predictable unless explicitly marked.
* **Vowel quality** is preserved across derivations.
* **Consonantal alternations** remain morphologically transparent.
* **Glides and complex consonants** are clearly signaled.

---

### System Design Principles

The diacritic system of Inglisce is governed by four core principles:

1. **Conservation (Economy):** Diacritics appear *only* when required. Regular, predictable spelling patterns do not require marks.
2. **The One-Mark Rule:** Only **one** primary accent (acute, grave, or circumflex) may appear per word. The only exception is the diaeresis, which may legally co-occur with an accent.
3. **Morphological Transparency:** Related forms remain visibly connected across derivations (e.g., using cedillas to show consonant softening rather than changing the root letter).
4. **Phonological Clarity:** Ambiguity is resolved explicitly, not contextually.

---

### Inventory of Diacritics

| Diacritic | Primary Function | Secondary Function |
| :--- | :--- | :--- |
| **Acute ( ´ )** | Stress marking | Vowel quality (Close/Tense) |
| **Grave ( \` )** | Stress marking | Vowel quality (Open/Lax) |
| **Circumflex ( ˆ )** | Vowel quality | Conditional stress |
| **Diaeresis ( ¨ )** | Glide and vowel separation | Prosodic disambiguation |
| **Tilde ( ˜ )** | Consonantal structure | Prosodic stability & Etymology |
| **Cedilla / Comma ( ¸ / ̦ )** | Consonant quality | Morphological transparency |

---

### Stress and Accent Economy

Stress in Inglisce is **predictable by word class and morphology**:
* **Nouns and Adjectives** default to **first-syllable stress**.
* **Verbs** default to **final or penultimate stress**, depending on their suffix.

As a result, unaccented words follow default stress. Accented words signal a strict deviation from default stress, a non-default vowel quality, or both.

---

### Vowel Diacritics (Stress vs. Quality)

Vowel diacritics in Inglisce divide into two functional classes:

#### 1. Stress-First Diacritics (Acute & Grave)
The **acute** and **grave** accents primarily mark **stress**. Vowel quality is encoded simultaneously.
* **Acute:** Marks non-default stress on tense vowels (**á, é, í, ó, ú**).
* **Grave:** Marks non-default stress on lax/open vowels (**à, è, ò**).
* *Rule:* These accents appear *only* when stress cannot be inferred from default rules. When they appear, the syllable is always stressed.

#### 2. Quality-First Diacritics (Circumflex)
The **circumflex** primarily marks **vowel quality** arising from historical developments (like diphthongization or r-coloring). 
* In **masculine nouns/adjectives** and **verbs**: The circumflex marks quality *only*.
* In **feminine nouns/adjectives**: The circumflex marks *both* quality and stress.
* *Rule:* Unlike the acute and grave, the circumflex may appear in **unstressed syllables** to preserve structural vowel quality.

---

### Consonantal & Structural Diacritics

#### The Tilde (˜)
The tilde marks a **single complex consonantal unit**, representing a historical or phonological shift without cluttering the orthography.
* **Palatal Affricate:** **c̃** explicitly marks the native Germanic `/tʃ/` (e.g., *child* → **c̃ildren**).
* **Historical Rhotic:** **r̃** preserves the lost Germanic `wr-` cluster (e.g., *write* → **r̃aite**).
* **Palatalized Nasals:** **m̃** and **ñ** represent the sequences `/mj/` and `/nj/`, preserving the historical yod without falsely suggesting a vowel sequence.

#### The Cedilla / Comma Below (¸ / ̦)
Cedillas appear on **c, d, s, t, x** to mark predictable consonant softening and affrication (assibilation). They allow derived forms to remain visibly connected to their bases (*juce* → **juçor**) while clearly encoding the surface pronunciation. They do not interact with stress or vowel quality.

#### The Diaeresis (¨)
The diaeresis is used on **ü, ï, ÿ** to disambiguate glides and vowel relationships. It marks **ü** as a `/w/` glide, separates **i** from following vowels to block false diphthongs, and clarifies stressed high vowels in complex derivations (like *íe + ing → ÿing*). Because it alters interpretation rather than inherent sound, it is exempt from the One-Mark Rule.

---

### Cross-References
* See [Stress](../../phenomena/stress.md) for default stress rules.
* See [Acute Accent](acute.md)
* See [Grave Accent](grave.md)
* See [Circumflex Accent](circumflex.md)
* See [Tildes](tilde.md)
* See [Diaeresis](diaeresis.md)
* See [Cedilla](cedilla.md)
