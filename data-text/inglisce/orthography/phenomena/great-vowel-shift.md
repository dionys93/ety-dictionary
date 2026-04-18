# The Great Vowel Shift and Phonetic Restoration

The Great Vowel Shift (GVS) was a systemic, centuries-long change in the pronunciation of English long vowels. While spoken English drifted significantly between the 1400s and 1800s—with the highest vowels breaking into diphthongs—the orthography remained largely frozen in its Middle English state. 

**Inglisce** addresses this phonetic drift by reverting vowel graphemes to their pre-shift (Continental) values. This ensures that a single character consistently represents the same sound, restoring transparency to the written language.

### Century-by-Century Phonetic Evolution

[cite_start]This table tracks the specific phonetic changes of the primary long vowels from late Middle English (c. 1400) through the stages of the shift, landing on the Modern Midwestern American English pronunciation. **Inglisce** targets the original Middle English phoneme as its primary spelling anchor.

| ME (c. 1400) | Early GVS (c. 1500) | Mid GVS (c. 1600) | Late GVS (c. 1700) | Modern IPA | Inglisce | Example |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **/iː/** | /əi/ | /ɛi/ | /aɪ/ | **/aɪ/** | **î** | time → **tîme** |
| **/eː/** | /iː/ | /iː/ | /iː/ | **/i/** | **ie** | fleece → **fliesse** |
| **/ɛː/** | /ɛː/ | /eː/ | /iː/ | **/i/** | **ie** | leak → **lieche** |
| **/aː/** | /æː/ | /ɛː/ | /eː/ | **/eɪ/** | **â** | make → **mâche** |
| **/uː/** | /əu/ | /ɔu/ | /aʊ/ | **/aʊ/** | **aû** | house → **haûse** |
| **/oː/** | /uː/ | /uː/ | /uː/ | **/u/** | **ou** | soon → **soun** |
| **/ɔː/** | /ɔː/ | /oː/ | /oʊ/ | **/oʊ/** | **o-e** | boat → **bote** |

[cite_start]*(Note: Modern IPA values reflect standard Midwestern American English. Historical transcriptions represent broad phonetic consensus.)*

### Resolving Modern Mergers

Because the shift caused several distinct historical sounds to merge into single modern phonemes, **Inglisce** utilizes spelling to preserve etymology rather than just modern sound. 

#### The /i/ Merger
[cite_start]Modern /i/ (as in *beat* ) results from multiple distinct sources. **Inglisce** pulls them apart:
* **Germanic Long /eː/:** Restored to **ie** (e.g., *fleece* → **fliesse**).
* **Germanic /ɛː/ (ea):** Restored to **i-e** (e.g., *meat* → **mite**).
* **Classical /oe/ & /ae/:** Restored to **í** to mark Latin/Greek strata (e.g., *phoenix* → **fínix**).


Needs clarification
#### The Diphthong Splits
Because stable long vowels "broke" into diphthongs, **Inglisce** uses diacritics to mark these restored relationships while maintaining the historical consonantal framework:
* [cite_start]**Front Shifted Vowels:** Modern **/eɪ/** (as in *bait* ) is restored to **â** to reflect its origin as a long /aː/ (e.g., *bake* → **bâche**).
* [cite_start]**Back Shifted Vowels:** Modern **/oʊ/** (as in *boat* ) is restored to **o-e** to reflect its origin as a long /ɔː/ (e.g., *boat* → **bote**). 

---

* **Phonetic Key:** See [IPA-key.txt](IPA-key.txt) for standard modern values.
* **Consonantal Logic:** The vowels often interacted with velar consonants; see the [rationale for CH and C̃](ch-and-c-tilde.md) for how Inglisce handles palatalization vs. velar stability.
* **Philosophy:** See [vowel-reversion.md](../core-principles/historical-rationale/vowel-reversion.md) for deeper historical justifications.
