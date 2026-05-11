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
| **Circumflex ( ˆ )** | Vowel quality (GVS) | Conditional stress |
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

## 1. The Acute Accent ( ´ )

### Overview
In Inglisce, the **acute accent** is used to mark stressed close or tense vowels, specifically appearing on **á, éi, í, ó, ú**. 

The acute accent signals two things simultaneously:
1. **Vowel Quality:** It explicitly indicates a specific, tense pronunciation for the vowel.
2. **Stress:** It marks the stressed syllable in a word when that stress is not predictable by default grammatical rules.

The acute accent never appears on syllables whose stress and vowel quality are fully predictable by default rules. When an acute accent does appear, that vowel is **always stressed**. 

*(Note: Inglisce follows a strict One-Mark Rule. Only one primary accent—acute, grave, or circumflex—may appear per word, except when a diaeresis is also present).*

### Phonetic Values and Examples
The acute accent is used primarily to preserve vowel quality that would otherwise be reduced or altered in unstressed syllables, especially in borrowed or morphologically complex words.

| Grapheme | Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- | :--- |
| **Á** | /ɑ/ | f*á*þre, f*á*þors, u*á*tre  | father, fathers, water |
| **ÉI** | /eɪ/ | conv*éi*ance, cont*éi*nment, der*éi*lment | conveyance, containment, derailment |
| **Í** | /i/ | m*í*dia, maç*í*ns, cu*í*ns | media, machines, queens |
| **Ó** | /oʊ/ | expl*ó*sion, expl*ó*ssif, alþ*ó*, bel*ó* | explosion, explosive, although, below |
| **Ú** | /ju/ or /u/ | *ú*nicorn, un*ú*șual, un*ú*sable, *ú*sage, r*ú*ins  | unicorn, unusual, unusable, usage, ruins |

---

## 2. The Grave Accent ( \` )

### Overview
In Inglisce, the **grave accent** is used on the vowels **à, è, ò**. 

Like the acute accent, it signals both **vowel quality** and **stress** when they deviate from default rules. However, the grave accent contrasts with the acute by specifically marking **open or lax vowel qualities** in stressed syllables.

It typically occurs in borrowed words or morphologically complex words where orthographic clarity is required to lock in the unpredictable stress, or to indicate a vowel quality that deviates from the default unaccented pronunciation.

### Phonetic Values and Examples

| Grapheme | Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- | :--- |
| **À** | /æ/ | an*à*lysis | analysis |
| **È** | /ɛ/ | an*è*monie, regr*è*ts | anemone, regrets |
| **Ò** | /ɔ/ | c*ò*ste, l*ò*st, l*ò*ss, *Ò*stria | cost,  lost, loss, Austria |

---

## 3. The Circumflex Accent ( ˆ )

### Overview
In Inglisce, the **circumflex accent** is used on the vowels **â, ê, î, ô, û**.

While the acute and grave accents are *stress-first* diacritics, the circumflex is a **quality-first** diacritic. It primarily encodes special vowel qualities—most often historical vowel shifts, diphthongizations, or r-coloring—that would otherwise be lost to vowel reduction in unstressed syllables. 

Whether a circumflex-marked vowel *also* indicates stress depends entirely on the grammatical gender of the word:
* **Masculine Nouns & Adjectives:** The circumflex marks **vowel quality only** (stress defaults to the first syllable).
* **Feminine Nouns & Adjectives:** The circumflex marks **both vowel quality and stress**.
* **Verbs:** As verbs have no gender, the circumflex marks vowel quality only. Stress remains governed by standard verb rules.

### Primary Phonetic Values and Examples
These values reflect historical vowel developments preserved in the orthography, regardless of whether the syllable carries the primary stress.

| Grapheme | Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- | :--- |
| **Â** | /eɪ/ | cri*â*te, loc*â*cion | create, location |
| **Ê** | /ər/ | conc*ê*ne, b*ê*ne | concern, burn |
| **Î** | /aɪ/ | f*î*nde, dec*î*de, *î*arne | find, decide, iron |
| **Ô** | /æʊ/ | r*ô*nd, h*ô*e, c*ô*e, v*ô*e | round, how, cow, vow |
| **Û** | /ʊ/ | c*û*cion | cushion |

### Contextual Pronunciations & Structural Rules

#### 1. The ⟨Ô⟩ Split (/æʊ/ vs. /ʊ/)
The grapheme **ô** explicitly splits based on its structural environment to prevent visual clustering. 
* **The Diphthong (/æʊ/):** This is the default value before **-n**, vowels, or in open terminal syllables (e.g., *round* → **rônd**, *power* → **pôuir**, *vowel* → **vôle**, *how* → **hôe**).
* **The Short Back Vowel (/ʊ/):** When preceding a hard **-c**, or when following a **u-** glide, it reduces to `/ʊ/` (e.g., *cook* → **côc**, *wood* → **uôde**, *wool* → **uôle**). 

#### 2. R-Coloring Absorption (Ê + Nasal)
The vowel **ê** natively represents the `/ər/` sound. However, when followed by a nasal consonant (**n** or **m**), the historical 'r' is completely absorbed by the vowel marker to prevent visual clutter. 
* **Rule:** `êr + {n, m} → ê`
* **Examples:** *earn* → **êne** (not êrne), *confirm* → **confême** (not confêrme).

#### 3. Reduced Diphthongs (AÎ and EÎ) and Stress Retention
In base verbs, stress is naturally pulled to the final syllable by the terminal silent 'e' (e.g., *compaire*, *beire*). However, adding a suffix threatens to shift that stress away. The circumflex steps in during derivation to act as a structural anchor. It signals to the reader that the primary spoken stress remains firmly locked exactly where it was on the root. 
* **AÎ (/eɪ/ or /ɛr/):** *compare* → compaire | *comparison* → comp**aî**rasson | *comparable* → comp**aî**rable
* **EÎ (/ɛr/):** *bear* → beire | *unbearable* → unb**eî**rable

#### 4. The Modal / Glide Alternations (OÛ / AÛ)
When combined with **o** or **a**, the circumflex helps map historical glides and modal verb anomalies without relying on the dead letter 'w' or 'l'. 
* **OÛ (/ʊ/ or /wʊ/):** Used heavily in anomalous modal verbs (e.g., *would, could, should* → **oû**d, c**oû**d, s**eû**d).
* **AÛ (/æʊ/):** Maps the open diphthong for specific historical shifts (e.g., *crowd* → cr**aû**de, *loud* → l**aû**d, *sour* → s**aû**re).

---

## 4. The Diaeresis ( ¨ )

### Overview
In Inglisce, the **diaeresis** is used on the letters **ü, ï,** and **ÿ**.

Unlike the acute, grave, and circumflex accents, the diaeresis does **not** primarily assign stress, nor does it change the inherent sound inventory of a vowel. Its sole function is to **disambiguate glide formation and vowel relationships** that would otherwise be misread under default orthographic rules. It alters *interpretation*, not vowel quality.

Because it serves a structural rather than a primary phonetic role, the diaeresis is the **only** diacritic that is exempt from the One-Mark Rule. It may legally co-occur with another accent in the same word.

### Grapheme Inventory and Structural Rules

#### 1. Glide Clarification ( Ü )
Inglisce eliminates the Germanic 'w', relying natively on the letter **u** to form the `/w/` glide. 
However, in environments where a `u` appears after another vowel, it risks being misread as a syllabic vowel. 
The **ü** explicitly locks the letter as a `/w/` glide, preserving correct syllabification and preventing accidental vowel fusion.

#### 2. Vowel Separation and Hiatus ( Ï )
The diaeresis on the **ï** performs one distinct structural job:
* **Explicit Hiatus Before Vowels:** Just as in French orthography, it explicitly separates the **i** from a following vowel, forcing a syllable break (hiatus). 
  * *nauseate* → naus*ï*ait (nau - sï - ait)
  * *geography* → g*ï*ographie (gï - o - graph - ie)

#### 3. Stress Clarification in Derived Forms ( Ÿ )
The **ÿ** is used to clarify stress-bearing high vowels in morphologically complex forms where default stress assignment would obscure the pronunciation. It prevents the `y` from being interpreted as a glide or a reduced vowel.
* **The ⟨-ing⟩ Derivation:** When verbs ending in **-íe** take the **-ing** suffix, the sequence collapses to **-ÿing** to explicitly maintain the stressed `/i/` sound (e.g., *agríe* + *ing* → **agrÿing**). 

### Reference Matrix and Examples

| Grapheme | Phonetic Value | Environment / Usage | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- | :--- | :--- |
| **Ü** | /w/ | Explicit glide | a*ü*arde, re*ü*arde | award, reward |
| **Ï** | /i/ | Before vowels | naus*ï*ait | nauseate |
| **Ÿ** | Stressed /i/ | Verbs derived with *-ing* | agr*ÿ*ing | agreeing |
| **Ÿ** | Stressed /ɪ/ | Before consonants in complex derivations | anal*ÿ*tical | analytical |

---

## 5. The Tilde ( ˜ )

### Overview
In Inglisce, the **tilde** is a consonantal diacritic used on the letters **c̃, m̃, ñ,** and **r̃**.

Unlike vowel diacritics, the tilde does not directly encode stress or vowel quality. Instead, it signals that a consonant has undergone a specific historical–phonological shift, forming a **single complex consonantal unit**. 

By using the tilde, Inglisce preserves historical realities—such as yod-coalescence (the addition of a `/j/` glide), palatalization, and silent consonant clusters—without cluttering the orthography with dead letters or ambiguous digraphs.

### Grapheme Inventory and Pronunciation Rules

#### 1. The Palatal Affricate ( C̃ and X̃ )
In Modern English, the `ch` digraph is ambiguous, representing `/tʃ/`, `/k/`, or `/ʃ/` depending on the word's origin. Inglisce reserves the **c̃** specifically for the palatal affricate.

**Standard Vocabulary**
| Modern English | Inglisce |
| :--- | :--- |
| chin | c̃ine |
| church | c̃urc̃e |
| choice | c̃oice |
| choose | c̃ouse |
| cheek | c̃iec |
| cherish | c̃erișe |
| much | moc̃ |
| such | soc̃ |

**Homophone Disambiguation ( X̃ )**
While **c̃** is the primary marker for the palatal affricate, Inglisce employs **x̃** to map the exact same sound in specific cases to visually differentiate homophones. This provides a distinct spelling for words that sound identical but have separate meanings.

| Modern English | Inglisce |
| :--- | :--- |
| which | uic̃ |
| witch | uix̃e |
| match (a pair / a game) | mac̃e |
| match (a lighter / stick) | max̃e |

#### 2. The Historical Rhotic ( R̃ )
In Old English, words beginning with the `wr-` cluster were pronounced exactly as written (with a distinct `/w/`). In modern speech, the `/w/` has fallen silent. Inglisce replaces the dead `wr-` cluster with the **r̃** to give the lost etymology a distinct visual identity while matching the modern spoken reality.

| Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- |
| /r/ | *r̃*aite, *r̃*oat, *r̃*itan, *r̃*ingue, *r̃*ong | write, wrote, written, wring, wrung |

#### 3. Palatalized Nasals ( M̃ and Ñ )
The **m̃** and **ñ** represent the consonantal units `/mj/` and `/nj/`, reflecting a development where a nasal consonant is immediately followed by a palatal glide (a *yod*). 

Writing these sequences as *my* or *ny* would falsely suggest a separate vowel sequence and interfere with the strict Inglisce stress assignment rules. The tilde preserves the presence of the yod while maintaining predictable stress behavior.

*(Note: In environments where these units occur before a reduced vowel, the unstressed `/ə/` is written as **o** after the nasal).*

| Grapheme | Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- | :--- |
| **M̃** | /mʲ/ | a*m̃*onicion, a*m̃*olet, *m̃*usíom | ammunition, amulet, museum |
| **Ñ** | /nʲ/ | a*ñ*ual, convi*ñ*ent, convi*ñ*ence | annual, convenient, convenience |

---

## 6. The Cedilla and Comma Below ( ¸ / ̦ )

### Overview
In Inglisce, the **cedilla** (and its typographic equivalent, the **comma below**) is used to represent specific consonant sounds consistently and transparently. It may appear only on the letters **c, d, s, t,** and **x**.

Unlike the acute, grave, or circumflex accents, the cedilla does **not** indicate stress, vowel quality, or syllable structure. Its primary purpose is to preserve **etymological continuity** while clearly marking predictable consonant softening and affrication that arise during English derivation. 

Unmarked consonants retain their default, hard phonetic values. The cedilla is never an optional stylistic marker; it explicitly encodes phonological information.

### Assibilation and Morphological Transparency
Assibilation is a regular phonological process where hard consonants (most commonly **t** and **d**) shift to sibilant or affricate sounds when followed by a high front vowel (like `/i/`) or a suffix like **-ion** or **-ure**.

Inglisce explicitly encodes the surface realization of this new sound *without* altering the underlying root consonant. By utilizing the cedilla, derived forms remain visibly connected to their bases (*juce* → **juçor**, *acte* → **acțual**) while guaranteeing absolute phonetic predictability.

### Grapheme Inventory and Pronunciation Rules

#### 1. The Soft C ( Ç )
The soft C dictates two distinct phonetic shifts depending on the vowel that immediately follows it.

| Environment | Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- | :--- |
| **Before a, o, u** | /s/ | fa*ç*ade, ju*ç*or, slî*ç*able, spâ*ç*or | facade, juicer, sliceable, spacer |
| **Before e, i** | /ʃ/ | aprí*ç*iait, asso*ç*iâcion, effi*ç*ent, sofi*ç*ent | appreciate, association, efficient, sufficient |

#### 2. The Soft D ( Ḑ )
The soft D indicates the affrication of the dental consonant into a heavy palatal sound. *(Note: The forms **d̦** and **ḑ** are orthographically equivalent and may be used interchangeably depending on font support).*

| Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- |
| /d͡ʒ/ | e*ḑ*ucait, gra*ḑ*uâcion, procí*ḑ*ure, indivi*ḑ*ual | educate, graduation, procedure, individual |

#### 3. The Soft S ( Ș )
The soft S is used primarily to map the `/ʃ/` sound. It most commonly appears in verbs derived from French stems ending in *-iss*, though it resolves some irregular Germanic shifts as well.

| Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- |
| /ʃ/ | aboli*ș*e, fini*ș*e, vani*ș*e, *ș*ute, *ș*ugre | abolish, finish, vanish, shut |

#### 4. The Soft T ( Ț )
The soft T explicitly maps the predictable assibilation of the 't' when followed by specific suffixes (like *-ure* or *-ual*). It carries two distinct values based on the preceding consonant structure.

| Environment | Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- | :--- |
| **Between Vowels** (or after *x/n*) | /t͡ʃ/ | nâ*ț*ure, fie*ț*ure, mix*ț*ure, den*ț*ure | nature, feature, mixture, denture |
| **After *c* or *p*** | /ʃ/ | ac*ț*ual, cap*ț*ure, pic*ț*ure, effec*ț*ual | actual, capture, picture, effectual |

#### 5. The Soft X ( X̦ )
The soft X explicitly marks the shift where the standard `/ks/` sound palatalizes into `/kʃ/`. 

| Phonetic Value | Inglisce Examples | Modern English Equivalent |
| :--- | :--- | :--- |
| /kʃ/ | se*x̦*ual | sexual |
