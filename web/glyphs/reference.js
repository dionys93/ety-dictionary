// web/src/glyphs/reference.js

export const REFERENCE_GLYPHS = {
  'Korean': [
    // --- CONSONANTS (Literal, blocky, geometric straight lines) ---
    { name: 'giyeok (ㄱ)', isRef: true, paths: ["M 150 150 L 350 150 L 350 350"] },
    { name: 'nieun (ㄴ)', isRef: true, paths: ["M 150 150 L 150 350 L 350 350"] },
    { name: 'digeut (ㄷ)', isRef: true, paths: ["M 150 150 L 350 150 M 150 150 L 150 350 L 350 350"] },
    { name: 'rieul (ㄹ)', isRef: true, paths: ["M 150 150 L 350 150 L 350 250 L 150 250 L 150 350 L 350 350"] },
    { name: 'mieum (ㅁ)', isRef: true, paths: ["M 150 150 L 350 150 L 350 350 L 150 350 Z"] },
    { name: 'bieup (ㅂ)', isRef: true, paths: ["M 175 150 L 175 350 M 325 150 L 325 350 M 175 216 L 325 216 M 175 283 L 325 283"] },
    
    // The exact intersection/branching coordinates you approved
    { name: 'siot (ㅅ)', isRef: true, paths: ["M 250 100 L 120 380", "M 210 186 L 380 380"] },
    { name: 'jieut (ㅈ)', isRef: true, paths: ["M 120 120 L 380 120", "M 250 120 L 120 380", "M 210 200 L 380 380"] },
    { name: 'chieut (ㅊ)', isRef: true, paths: ["M 250 50 L 250 90", "M 120 120 L 380 120", "M 250 120 L 120 380", "M 210 200 L 380 380"] },
    
    // Perfect circles using Arcs
    { name: 'ieung (ㅇ)', isRef: true, paths: ["M 250 150 A 100 100 0 1 0 250 350 A 100 100 0 1 0 250 150"] },
    
    { name: 'kieuk (ㅋ)', isRef: true, paths: ["M 150 150 L 350 150 L 350 350 M 150 250 L 350 250"] },
    { name: 'tieut (ㅌ)', isRef: true, paths: ["M 150 150 L 350 150 M 150 250 L 350 250 M 150 150 L 150 350 L 350 350"] },
    { name: 'pieup (ㅍ)', isRef: true, paths: ["M 150 150 L 350 150 M 150 350 L 350 350 M 200 150 L 200 350 M 300 150 L 300 350"] },
    { name: 'hieut (ㅎ)', isRef: true, paths: ["M 250 60 L 250 100", "M 150 140 L 350 140", "M 250 180 A 85 85 0 1 0 250 350 A 85 85 0 1 0 250 180"] },

    // --- VOWELS (Literal straight intersecting lines) ---
    { name: 'a (ㅏ)', isRef: true, paths: ["M 250 100 L 250 400 M 250 250 L 350 250"] },
    { name: 'ya (ㅑ)', isRef: true, paths: ["M 250 100 L 250 400 M 250 200 L 350 200 M 250 300 L 350 300"] },
    { name: 'eo (ㅓ)', isRef: true, paths: ["M 250 100 L 250 400 M 150 250 L 250 250"] },
    { name: 'yeo (ㅕ)', isRef: true, paths: ["M 250 100 L 250 400 M 150 200 L 250 200 M 150 300 L 250 300"] },
    { name: 'o (ㅗ)', isRef: true, paths: ["M 100 300 L 400 300 M 250 150 L 250 300"] },
    { name: 'yo (ㅛ)', isRef: true, paths: ["M 100 300 L 400 300 M 200 150 L 200 300 M 300 150 L 300 300"] },
    { name: 'u (ㅜ)', isRef: true, paths: ["M 100 200 L 400 200 M 250 200 L 250 350"] },
    { name: 'yu (ㅠ)', isRef: true, paths: ["M 100 200 L 400 200 M 200 200 L 200 350 M 300 200 L 300 350"] },
    { name: 'eu (ㅡ)', isRef: true, paths: ["M 100 250 L 400 250"] },
    { name: 'i (ㅣ)', isRef: true, paths: ["M 250 100 L 250 400"] }
  ],
  'Katakana': [
    // Literal, blocky Japanese
    { name: 'a (ア)', isRef: true, paths: ["M 100 150 L 300 150", "M 200 150 L 100 350", "M 200 220 L 200 380"] },
    { name: 'ka (カ)', isRef: true, paths: ["M 100 150 L 300 150 L 200 380", "M 200 100 L 200 250"] },
    { name: 'ki (キ)', isRef: true, paths: ["M 100 150 L 300 150", "M 100 200 L 300 200", "M 150 100 L 250 350"] }
  ],
  'Kanji': [
    { name: 'sun (日)', isRef: true, paths: ["M 150 100 L 150 400 M 150 100 L 350 100 L 350 400", "M 150 250 L 350 250", "M 150 400 L 350 400"] },
    { name: 'moon (月)', isRef: true, paths: ["M 150 100 L 100 400 M 150 100 L 350 100 L 350 400 M 150 200 L 350 200", "M 150 300 L 350 300"] }
  ]
};