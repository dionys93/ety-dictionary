// web/src/glyphs/reference.js

export const REFERENCE_GLYPHS = {
  'Korean': [
    // --- CONSONANTS ---
    // Notice the inward sweeping tail on the vertical drop
    { name: 'giyeok (ㄱ)', isRef: true, paths: ["M 120 120 Q 250 110 380 120 Q 390 250 300 400"] },
    
    // Sharp left corner transitioning into a smooth horizontal bow
    { name: 'nieun (ㄴ)', isRef: true, paths: ["M 150 100 Q 140 250 150 350 Q 150 380 180 380 Q 280 390 400 380"] },
    
    { name: 'digeut (ㄷ)', isRef: true, paths: ["M 150 120 Q 250 110 380 120", "M 150 120 Q 140 250 150 350 Q 150 380 180 380 Q 280 390 380 380"] },
    { name: 'rieul (ㄹ)', isRef: true, paths: ["M 150 120 Q 250 110 350 120 Q 360 180 330 240", "M 150 240 Q 250 230 330 240", "M 150 240 Q 140 310 150 350 Q 150 380 180 380 Q 260 390 350 380"] },
    
    // Slightly bulging square for a natural handwritten feel
    { name: 'mieum (ㅁ)', isRef: true, paths: ["M 150 120 Q 250 110 350 120 Q 360 250 350 380 Q 250 390 150 380 Q 140 250 150 120 Z"] },
    
    // Pillars bow slightly outward
    { name: 'bieup (ㅂ)', isRef: true, paths: ["M 180 120 Q 170 250 180 380", "M 320 120 Q 330 250 320 380", "M 175 220 Q 250 210 325 220", "M 175 300 Q 250 290 325 300"] },
    
    // --- THE SIOT FAMILY (True Branching Curves) ---
    // Left sweeps convexly, Right attaches lower and sweeps concavely
    { name: 'siot (ㅅ)', isRef: true, paths: ["M 250 100 Q 260 220 100 400", "M 225 180 Q 320 280 400 400"] },
    { name: 'jieut (ㅈ)', isRef: true, paths: ["M 100 120 Q 250 100 400 120", "M 250 120 Q 260 240 100 400", "M 220 200 Q 320 300 400 400"] },
    { name: 'chieut (ㅊ)', isRef: true, paths: ["M 250 40 Q 270 60 250 90", "M 100 120 Q 250 100 400 120", "M 250 120 Q 260 240 100 400", "M 220 200 Q 320 300 400 400"] },
    
    // Perfectly smooth circular rendering using Arc algorithms
    { name: 'ieung (ㅇ)', isRef: true, paths: ["M 250 120 A 130 130 0 1 0 250 380 A 130 130 0 1 0 250 120"] },
    
    { name: 'kieuk (ㅋ)', isRef: true, paths: ["M 120 120 Q 250 110 380 120 Q 390 250 300 400", "M 120 250 Q 250 240 350 250"] },
    { name: 'tieut (ㅌ)', isRef: true, paths: ["M 150 120 Q 250 110 380 120", "M 150 230 Q 250 220 360 230", "M 150 120 Q 140 250 150 350 Q 150 380 180 380 Q 280 390 380 380"] },
    { name: 'pieup (ㅍ)', isRef: true, paths: ["M 150 120 Q 250 110 350 120", "M 150 380 Q 250 390 350 380", "M 200 120 Q 190 250 200 380", "M 300 120 Q 310 250 300 380"] },
    { name: 'hieut (ㅎ)', isRef: true, paths: ["M 250 40 Q 270 60 250 90", "M 150 140 Q 250 130 350 140", "M 250 190 A 100 100 0 1 0 250 390 A 100 100 0 1 0 250 190"] },

    // --- VOWELS ---
    { name: 'a (ㅏ)', isRef: true, paths: ["M 250 100 Q 240 250 250 400", "M 250 250 Q 300 240 380 250"] },
    { name: 'ya (ㅑ)', isRef: true, paths: ["M 250 100 Q 240 250 250 400", "M 250 200 Q 300 190 380 200", "M 250 300 Q 300 290 380 300"] },
    { name: 'eo (ㅓ)', isRef: true, paths: ["M 250 100 Q 240 250 250 400", "M 120 250 Q 200 240 250 250"] },
    { name: 'yeo (ㅕ)', isRef: true, paths: ["M 250 100 Q 240 250 250 400", "M 120 200 Q 200 190 250 200", "M 120 300 Q 200 290 250 300"] },
    { name: 'o (ㅗ)', isRef: true, paths: ["M 100 300 Q 250 310 400 300", "M 250 120 Q 240 225 250 300"] },
    { name: 'yo (ㅛ)', isRef: true, paths: ["M 100 300 Q 250 310 400 300", "M 180 120 Q 170 225 180 300", "M 320 120 Q 310 225 320 300"] },
    { name: 'u (ㅜ)', isRef: true, paths: ["M 100 200 Q 250 190 400 200", "M 250 200 Q 240 275 250 380"] },
    { name: 'yu (ㅠ)', isRef: true, paths: ["M 100 200 Q 250 190 400 200", "M 180 200 Q 170 275 180 380", "M 320 200 Q 310 275 320 380"] },
    { name: 'eu (ㅡ)', isRef: true, paths: ["M 100 250 Q 250 260 400 250"] },
    { name: 'i (ㅣ)', isRef: true, paths: ["M 250 100 Q 240 250 250 400"] }
  ],
  'Katakana': [
    { name: 'a (ア)', isRef: true, paths: ["M 100 150 Q 200 140 300 150", "M 200 150 Q 150 250 100 350", "M 200 220 Q 190 300 200 380"] },
    { name: 'ka (カ)', isRef: true, paths: ["M 100 150 Q 200 140 300 150 Q 280 300 200 380", "M 200 100 Q 190 180 200 250"] },
    { name: 'ki (キ)', isRef: true, paths: ["M 100 150 Q 200 140 300 150", "M 100 200 Q 200 190 300 200", "M 150 100 Q 200 225 250 350"] }
  ],
  'Kanji': [
    { name: 'sun (日)', isRef: true, paths: ["M 150 100 Q 140 250 150 400 M 150 100 Q 250 90 350 100 Q 360 250 350 400", "M 150 250 Q 250 240 350 250", "M 150 400 Q 250 390 350 400"] },
    { name: 'moon (月)', isRef: true, paths: ["M 150 100 Q 150 250 100 400 M 150 100 Q 250 90 350 100 Q 360 250 350 400 M 150 200 Q 250 190 350 200", "M 150 300 Q 250 290 350 300"] }
  ]
};