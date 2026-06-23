import { useState, useRef, useEffect } from 'react';

const CATEGORIES = [
  { id: 'Korean', glyph: '한' },
  { id: 'Katakana', glyph: 'ア' },
  { id: 'Kanji', glyph: '漢' },
  { id: 'Custom', glyph: '✎' } 
];

// --- NEW: BUILT-IN REFERENCE LIBRARY ---
// These are hardcoded starter vectors that will always be available to drag and drop!
const REFERENCE_GLYPHS = {
  'Korean': [
    // --- CONSONANTS ---
    { name: 'giyeok (ㄱ)', isRef: true, paths: ["M 150 150 L 350 150 L 350 350"] },
    { name: 'nieun (ㄴ)', isRef: true, paths: ["M 150 150 L 150 350 L 350 350"] },
    { name: 'digeut (ㄷ)', isRef: true, paths: ["M 150 150 L 350 150 M 150 150 L 150 350 L 350 350"] },
    { name: 'rieul (ㄹ)', isRef: true, paths: ["M 150 150 L 350 150 L 350 250 L 150 250 L 150 350 L 350 350"] },
    { name: 'mieum (ㅁ)', isRef: true, paths: ["M 150 150 L 350 150 L 350 350 L 150 350 Z"] },
    { name: 'bieup (ㅂ)', isRef: true, paths: ["M 175 150 L 175 350 M 325 150 L 325 350 M 175 250 L 325 250 M 175 350 L 325 350"] },
    { name: 'siot (ㅅ)', isRef: true, paths: ["M 250 150 L 150 350 M 250 150 L 350 350"] },
    { name: 'ieung (ㅇ)', isRef: true, paths: ["M 250 150 A 100 100 0 1 0 250 350 A 100 100 0 1 0 250 150"] },
    { name: 'jieut (ㅈ)', isRef: true, paths: ["M 150 150 L 350 150 M 250 150 L 150 350 M 250 150 L 350 350"] },
    { name: 'chieut (ㅊ)', isRef: true, paths: ["M 200 100 L 300 100 M 150 150 L 350 150 M 250 150 L 150 350 M 250 150 L 350 350"] },
    { name: 'kieuk (ㅋ)', isRef: true, paths: ["M 150 150 L 350 150 L 350 350 M 150 250 L 350 250"] },
    { name: 'tieut (ㅌ)', isRef: true, paths: ["M 150 150 L 350 150 M 150 250 L 350 250 M 150 150 L 150 350 L 350 350"] },
    { name: 'pieup (ㅍ)', isRef: true, paths: ["M 150 150 L 350 150 M 150 350 L 350 350 M 200 150 L 200 350 M 300 150 L 300 350"] },
    { name: 'hieut (ㅎ)', isRef: true, paths: ["M 225 100 L 275 100 M 175 150 L 325 150 M 250 200 A 75 75 0 1 0 250 350 A 75 75 0 1 0 250 200"] },

    // --- VOWELS ---
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
    { name: 'a (ア)', isRef: true, paths: ["M 100 150 L 300 150", "M 200 150 Q 150 250 100 350", "M 200 220 L 200 380"] },
    { name: 'ka (カ)', isRef: true, paths: ["M 100 150 L 300 150 Q 280 300 200 380", "M 200 100 L 200 250"] },
    { name: 'ki (キ)', isRef: true, paths: ["M 100 150 L 300 150", "M 100 200 L 300 200", "M 150 100 L 250 350"] }
  ],
  'Kanji': [
    { name: 'sun (日)', isRef: true, paths: ["M 150 100 L 150 400 M 150 100 L 350 100 L 350 400", "M 150 250 L 350 250", "M 150 400 L 350 400"] },
    { name: 'moon (月)', isRef: true, paths: ["M 150 100 Q 150 300 100 400 M 150 100 L 350 100 L 350 400 M 150 200 L 350 200", "M 150 300 L 350 300"] }
  ]
};

export default function GlyphDesigner() {
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [glyphName, setGlyphName] = useState('');
  
  const [glyphCategory, setGlyphCategory] = useState(CATEGORIES[0].id);
  const [activeTab, setActiveTab] = useState(CATEGORIES[0].id); 
  
  const [library, setLibrary] = useState([]); 
  const isDrawing = useRef(false);

  const fetchLibrary = async () => {
    try {
      const res = await fetch('/api/get-glyphs.json');
      if (res.ok) {
        const data = await res.json();
        setLibrary(data);
      }
    } catch (err) {
      console.error("Failed to load glyph library", err);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const startDrawing = (e) => {
    isDrawing.current = true;
    const { nativeEvent } = e;
    setCurrentPath(`M ${nativeEvent.offsetX} ${nativeEvent.offsetY}`);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const { nativeEvent } = e;
    setCurrentPath((prev) => `${prev} L ${nativeEvent.offsetX} ${nativeEvent.offsetY}`);
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentPath) {
      setPaths([...paths, currentPath]);
      setCurrentPath('');
    }
  };

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath('');
  };

  const handleExport = async () => {
    if (paths.length === 0) return alert("Canvas is empty! Draw something first.");
    if (!glyphName.trim()) return alert("Please give your glyph a name before saving.");

    const glyphData = { name: glyphName.trim(), category: glyphCategory, paths };

    try {
      const response = await fetch('/api/save-glyph.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(glyphData),
      });
      
      const rawText = await response.text();
      if (response.ok) {
        setGlyphName('');
        setActiveTab(glyphCategory);
        fetchLibrary(); 
      } else {
        alert(`Error saving: ${JSON.parse(rawText).error}`);
      }
    } catch (err) {
      alert("Failed to reach the local server.");
    }
  };
  
  const handleDragStart = (e, glyphPaths) => {
    e.dataTransfer.setData("application/json", JSON.stringify(glyphPaths));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (data) {
      const droppedPaths = JSON.parse(data);
      setPaths((prev) => [...prev, ...droppedPaths]);
    }
  };

  // --- NEW: Merge references with local saved files for the active tab ---
  const activeReferences = REFERENCE_GLYPHS[activeTab] || [];
  const activeLocalFiles = library.filter(glyph => (glyph.category === activeTab) || (!glyph.category && activeTab === 'Custom'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      
      {/* TOOLBAR */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <select 
          value={glyphCategory} 
          onChange={(e) => setGlyphCategory(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#fff', fontSize: '1rem' }}
        >
          {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.glyph} {cat.id}</option>)}
        </select>

        <input 
          type="text" 
          placeholder="Enter glyph name..." 
          value={glyphName}
          onChange={(e) => setGlyphName(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', flexGrow: 1, maxWidth: '300px' }}
        />
        
        <button onClick={handleExport} style={{ padding: '0.5rem 1.5rem', cursor: 'pointer', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
          Save to Library
        </button>
        <button onClick={clearCanvas} style={{ padding: '0.5rem 1rem', cursor: 'pointer', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '4px', marginLeft: 'auto' }}>
          Clear Canvas
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* SIDEBAR: LIBRARY & TABS */}
        <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#374151' }}>Library</h3>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                title={cat.id}
                style={{
                  width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: activeTab === cat.id ? '#374151' : '#ffffff',
                  color: activeTab === cat.id ? '#ffffff' : '#4b5563',
                  border: activeTab === cat.id ? '1px solid #374151' : '1px solid #d1d5db',
                  borderRadius: '8px', fontSize: '1.25rem', fontWeight: 'bold', cursor: 'pointer',
                  boxShadow: activeTab === cat.id ? 'inset 0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                {cat.glyph}
              </button>
            ))}
          </div>

          <hr style={{ borderTop: '1px solid #e5e7eb', margin: '0' }} />

          {/* RENDER LIBRARY (References + User Saved) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
            
            {/* 1. Map through standard Base References */}
            {activeReferences.map((glyph, index) => (
              <div 
                key={`ref-${index}`}
                draggable 
                onDragStart={(e) => handleDragStart(e, glyph.paths)}
                style={{ 
                  border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.5rem', 
                  backgroundColor: '#f3f4f6', cursor: 'grab', display: 'flex', flexDirection: 'column', alignItems: 'center',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
                title={`${glyph.name} (Base Reference)`}
              >
                <svg width="100%" height="50" viewBox="0 0 500 500" style={{ pointerEvents: 'none' }}>
                  {glyph.paths.map((p, i) => (
                    <path key={i} d={p} stroke="#374151" strokeWidth="20" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                </svg>
                <span style={{ fontSize: '0.65rem', color: '#4b5563', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
                  {glyph.name}
                </span>
              </div>
            ))}

            {/* 2. Map through User Saved Glyphs */}
            {activeLocalFiles.map((glyph, index) => (
                <div 
                  key={`user-${index}`}
                  draggable 
                  onDragStart={(e) => handleDragStart(e, glyph.paths)}
                  style={{ 
                    border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.5rem', 
                    backgroundColor: '#eff6ff', cursor: 'grab', display: 'flex', flexDirection: 'column', alignItems: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                  title={`${glyph.name} (Your Library)`}
                >
                  <svg width="100%" height="50" viewBox="0 0 500 500" style={{ pointerEvents: 'none' }}>
                    {glyph.paths.map((p, i) => (
                      <path key={i} d={p} stroke="#1d4ed8" strokeWidth="20" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                  </svg>
                  <span style={{ fontSize: '0.65rem', color: '#1e40af', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
                    {glyph.name}
                  </span>
                </div>
            ))}
            
            {activeReferences.length === 0 && activeLocalFiles.length === 0 && (
              <div style={{ gridColumn: 'span 2', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '1rem 0' }}>
                No items in this category.
              </div>
            )}
          </div>
        </div>

        {/* MAIN CANVAS */}
        <div>
          <svg
            width="500"
            height="500"
            style={{ 
              border: '2px solid #e5e7eb', borderRadius: '8px', cursor: 'crosshair', backgroundColor: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            onDragOver={handleDragOver} 
            onDrop={handleDrop}         
          >
            <g stroke="#f3f4f6" strokeWidth="2">
              <line x1="250" y1="0" x2="250" y2="500" />
              <line x1="0" y1="250" x2="500" y2="250" />
            </g>

            {paths.map((path, index) => (
              <path key={index} d={path} stroke="#111827" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {currentPath && (
              <path d={currentPath} stroke="#111827" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </div>

      </div>
    </div>
  );
}