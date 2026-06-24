import { useState, useRef, useEffect } from 'react';
import { REFERENCE_GLYPHS } from '../../glyphs/reference.js';

const CATEGORIES = [
  { id: 'Korean',         glyph: '한',  label: 'Korean (isolated)' },
  { id: 'Korean_initial', glyph: '초',  label: 'Korean initial (choseong)' },
  { id: 'Korean_medial',  glyph: '중',  label: 'Korean medial (jungseong)' },
  { id: 'Korean_final',   glyph: '종',  label: 'Korean final (jongseong)' },
  { id: 'Katakana',       glyph: 'ア',  label: 'Katakana' },
  { id: 'Kanji',          glyph: '漢',  label: 'Kanji' },
  { id: 'Custom',         glyph: '✎',  label: 'Custom' },
];

// --- PURE FUNCTIONAL VECTOR MATH UTILITIES ---
const extractCoordinates = (pathString) =>
  (pathString.match(/([MLQCZmlqczA])([^MLQCZmlqczA]*)/g) || [])
    .filter(cmd => cmd[0].toUpperCase() !== 'Z')
    .flatMap(cmd => {
      const letter = cmd[0].toUpperCase();
      const nums = cmd.slice(1).trim().split(/\s+|,/).filter(n => n !== '').map(Number);
      return letter === 'A'
        ? nums.reduce((acc, _, i) => (i % 7 === 5 && nums[i + 1] !== undefined) ? [...acc, { x: nums[i], y: nums[i + 1] }] : acc, [])
        : nums.reduce((acc, _, i) => (i % 2 === 0 && nums[i + 1] !== undefined) ? [...acc, { x: nums[i], y: nums[i + 1] }] : acc, []);
    });

const getBoundingBoxCenter = (paths) => {
  const coords = paths.flatMap(extractCoordinates);
  if (coords.length === 0) return { cx: 250, cy: 250 };
  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

const translatePath = (pathString, dx, dy) =>
  pathString.replace(/([MLQCZmlqczA])([^MLQCZmlqczA]*)/g, (_, command, args) => {
    if (command.toUpperCase() === 'Z') return command;
    const nums = args.trim().split(/\s+|,/).filter(n => n !== '').map(Number);
    if (nums.length === 0) return command;
    const isArc = command.toUpperCase() === 'A';
    const shifted = nums.map((num, i) => 
      isArc ? (i % 7 === 5 ? num + dx : (i % 7 === 6 ? num + dy : num)) : (i % 2 === 0 ? num + dx : num + dy)
    );
    return `${command} ${shifted.join(' ')} `;
  }).trim();

export default function GlyphDesigner() {
  // Each entry: { type: 'stroke', d: string } | { type: 'glyph', paths: string[] }
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
    // We use a gentle bezier curve for the live drawing as well, so your strokes look natural!
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
      setPaths((prev) => [...prev, { type: 'stroke', d: currentPath }]);
      setCurrentPath('');
    }
  };

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath('');
  };

  // --- NEW: UNDO LOGIC ---
  const handleUndo = () => {
    // Pure functional state update: slice off the last element of the paths array
    setPaths((prev) => prev.slice(0, -1));
  };

  const handleExport = async () => {
    if (paths.length === 0) return alert("Canvas is empty! Draw something first.");
    if (!glyphName.trim()) return alert("Please give your glyph a name before saving.");

    // Flatten all entries into a plain array of path strings for storage
    const flatPaths = paths.flatMap(entry =>
      entry.type === 'stroke' ? [entry.d] : entry.paths
    );
    const glyphData = { name: glyphName.trim(), category: glyphCategory, paths: flatPaths };

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
      const svgRect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - svgRect.left;
      const dropY = e.clientY - svgRect.top;
      const { cx, cy } = getBoundingBoxCenter(droppedPaths);
      const dx = dropX - cx;
      const dy = dropY - cy;
      const shiftedPaths = droppedPaths.map(p => translatePath(p, dx, dy));
      setPaths((prev) => [...prev, { type: 'glyph', paths: shiftedPaths }]);
    }
  };

  const activeReferences = REFERENCE_GLYPHS[activeTab] || [];
  const activeLocalFiles = library.filter(glyph =>
    glyph.category === activeTab || (!glyph.category && activeTab === 'Custom')
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      
      {/* TOOLBAR */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <select 
          value={glyphCategory} 
          onChange={(e) => setGlyphCategory(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#fff', fontSize: '1rem' }}
        >
          {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.glyph} {cat.label}</option>)}
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

        {/* --- NEW: UNDO BUTTON --- */}
        <button 
          onClick={handleUndo} 
          disabled={paths.length === 0}
          style={{ padding: '0.5rem 1rem', cursor: paths.length === 0 ? 'not-allowed' : 'pointer', backgroundColor: paths.length === 0 ? '#f3f4f6' : '#fef3c7', border: paths.length === 0 ? '1px solid #e5e7eb' : '1px solid #fcd34d', color: paths.length === 0 ? '#9ca3af' : '#b45309', borderRadius: '4px', marginLeft: 'auto', fontWeight: 'bold' }}
          title="Remove last stroke (or dropped component)"
        >
          ↺ Undo
        </button>

        <button onClick={clearCanvas} style={{ padding: '0.5rem 1rem', cursor: 'pointer', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '4px' }}>
          Clear
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* SIDEBAR: LIBRARY & TABS */}
        <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#374151' }}>Library</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveTab(cat.id)}
                title={cat.label}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.375rem 0.625rem',
                  backgroundColor: activeTab === cat.id ? '#374151' : '#ffffff',
                  color: activeTab === cat.id ? '#ffffff' : '#4b5563',
                  border: activeTab === cat.id ? '1px solid #374151' : '1px solid #d1d5db',
                  borderRadius: '6px', fontSize: '0.8rem', fontWeight: activeTab === cat.id ? 'bold' : 'normal',
                  cursor: 'pointer', textAlign: 'left',
                  boxShadow: activeTab === cat.id ? 'inset 0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>{cat.glyph}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
              </button>
            ))}
          </div>

          <hr style={{ borderTop: '1px solid #e5e7eb', margin: '0' }} />

          {/* RENDER LIBRARY (References + User Saved) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
            
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
                    <path key={i} d={p} fill="#374151" fillRule="evenodd" stroke="none" />
                  ))}
                </svg>
                <span style={{ fontSize: '0.65rem', color: '#4b5563', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
                  {glyph.name}
                </span>
              </div>
            ))}

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
                      <path key={i} d={p} fill="#1d4ed8" fillRule="evenodd" stroke="none" />
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

            {paths.map((entry, index) =>
              entry.type === 'stroke' ? (
                <path key={index} d={entry.d} stroke="#111827" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <g key={index}>
                  {entry.paths.map((p, i) => (
                    <path key={i} d={p} fill="#111827" fillRule="evenodd" stroke="none" />
                  ))}
                </g>
              )
            )}
            {currentPath && (
              <path d={currentPath} stroke="#111827" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </div>

      </div>
    </div>
  );
}