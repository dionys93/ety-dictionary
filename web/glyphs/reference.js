// web/src/glyphs/reference.js
// Korean paths extracted from Noto Sans CJK KR (NotoSansCJK-Regular.ttc)
// Three positional variants per consonant:
//   isolated  — standalone / compatibility jamo (U+3131–U+3163)
//   initial   — choseong, consonant at TOP of syllable block (U+1100–U+1112)
//   final     — jongseong, consonant at BOTTOM of syllable block (U+11A8–U+11C2)
// One variant for vowels:
//   medial    — jungseong, vowel in MIDDLE of syllable block (U+1161–U+1175)
import { KOREAN } from "./korean";
import { JAPANESE } from "./japanese";
import { CHINESE } from "./chinese";


export const REFERENCE_GLYPHS = {
  // Isolated jamo — use these for standalone reference / freeform drawing
  'Korean': KOREAN.isolates,

  // Initial (choseong) — consonant sits in top portion of syllable block,
  // drawn wider and flatter to leave room for the vowel below/right
  'Korean_initial': KOREAN.initial,

  // Medial (jungseong) — vowel sits in the right/bottom portion of the block,
  // drawn narrower/shorter than the isolated form
  'Korean_medial': KOREAN.medial,

  // Final (jongseong) — consonant sits in bottom portion of syllable block,
  // drawn smaller and lower than the initial form
  'Korean_final': KOREAN.final,

  'Katakana': JAPANESE.katakana,
  'Kanji': JAPANESE.kanji,
  'Radicals': CHINESE.radicals,
};