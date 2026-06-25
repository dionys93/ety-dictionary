import { useState, useRef, useEffect, useCallback } from 'react';
import { REFERENCE_GLYPHS } from '../../glyphs/reference.js';

const CATEGORIES = [
  { id: 'Korean',         glyph: '한', label: 'Korean (isolated)' },
  { id: 'Korean_initial', glyph: '초', label: 'Korean initial (choseong)' },
  { id: 'Korean_medial',  glyph: '중', label: 'Korean medial (jungseong)' },
  { id: 'Korean_final',   glyph: '종', label: 'Korean final (jongseong)' },
  { id: 'Katakana',       glyph: 'ア', label: 'Katakana' },
  { id: 'Kanji',          glyph: '漢', label: 'Kanji' },
  { id: 'Custom',         glyph: '✎', label: 'Custom' },
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

const getBoundingBox = (paths) => {
  const coords = paths.flatMap(extractCoordinates);
  if (coords.length === 0) return { cx: 250, cy: 250, w: 0, h: 0 };
  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

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

// Converts a client-space point to SVG viewBox-space (500x500)
const clientToSVG = (svgEl, clientX, clientY) => {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width)  * 500,
    y: ((clientY - rect.top)  / rect.height) * 500,
  };
}

export default function GlyphDesigner() {
  // Each entry: { type: 'stroke', d: string } | { type: 'glyph', paths: string[] }
  const [entries, setEntries] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [glyphName, setGlyphName] = useState('');

  // glyphCategory is always the active sidebar tab — no separate state needed
  const [activeTab, setActiveTab] = useState(CATEGORIES[0].id);

  const [library, setLibrary] = useState([]);

  // Ghost state: paths being dragged + their current SVG cursor position
  const [ghost, setGhost] = useState(null); // { paths, cx, cy, x, y } | null

  const isDrawing   = useRef(false);
  const isDragging  = useRef(false);
  const svgRef      = useRef(null);
  const ghostRef    = useRef(null); // mirrors ghost state for use inside event listeners

  const fetchLibrary = async () => {
    try {
      const res = await fetch('/api/get-glyphs.json');
      if (res.ok) setLibrary(await res.json());
    } catch (err) {
      console.error('Failed to load glyph library', err);
    }
  };

  useEffect(() => { fetchLibrary(); }, []);

  // ── Freehand drawing ────────────────────────────────────────────────────────
  const startDrawing = (e) => {
    if (isDragging.current) return;
    isDrawing.current = true;
    const { offsetX, offsetY } = e.nativeEvent;
    setCurrentPath(`M ${offsetX} ${offsetY}`);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const { offsetX, offsetY } = e.nativeEvent;
    setCurrentPath(prev => `${prev} L ${offsetX} ${offsetY}`);
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentPath) {
      setEntries(prev => [...prev, { type: 'stroke', d: currentPath }]);
      setCurrentPath('');
    }
  };

  // ── Custom drag: pointer events so we can show a live ghost ─────────────────
  const handleCardPointerDown = useCallback((e, glyphPaths) => {
    e.preventDefault();
    isDragging.current = true;

    const { cx, cy } = getBoundingBox(glyphPaths);
    const svgPt = clientToSVG(svgRef.current, e.clientX, e.clientY);

    const ghostState = { paths: glyphPaths, cx, cy, x: svgPt.x, y: svgPt.y };
    ghostRef.current = ghostState;
    setGhost(ghostState);

    const onMove = (ev) => {
      if (!svgRef.current) return;
      const pt = clientToSVG(svgRef.current, ev.clientX, ev.clientY);
      const next = { ...ghostRef.current, x: pt.x, y: pt.y };
      ghostRef.current = next;
      setGhost(next);
    };

    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
      isDragging.current = false;

      if (!svgRef.current) { setGhost(null); ghostRef.current = null; return; }

      // Only commit if the pointer was released over the SVG canvas
      const rect = svgRef.current.getBoundingClientRect();
      const insideSVG =
        ev.clientX >= rect.left && ev.clientX <= rect.right &&
        ev.clientY >= rect.top  && ev.clientY <= rect.bottom;

      if (insideSVG) {
        const drop = clientToSVG(svgRef.current, ev.clientX, ev.clientY);
        const { cx, cy, paths } = ghostRef.current;
        const dx = drop.x - cx;
        const dy = drop.y - cy;
        const shifted = paths.map(p => translatePath(p, dx, dy));
        setEntries(prev => [...prev, { type: 'glyph', paths: shifted }]);
      }

      setGhost(null);
      ghostRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
  }, []);

  // ── Edit actions ────────────────────────────────────────────────────────────
  const handleUndo = () => setEntries(prev => prev.slice(0, -1));

  const clearCanvas = () => { setEntries([]); setCurrentPath(''); };

  const handleExport = async () => {
    if (entries.length === 0) return alert('Canvas is empty! Draw something first.');
    if (!glyphName.trim())    return alert('Please give your glyph a name before saving.');

    const flatPaths = entries.flatMap(e => e.type === 'stroke' ? [e.d] : e.paths);
    const glyphData = { name: glyphName.trim(), category: 'Custom', paths: flatPaths };

    try {
      const response = await fetch('/api/save-glyph.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(glyphData),
      });
      const rawText = await response.text();
      if (response.ok) {
        setGlyphName('');
        fetchLibrary();
      } else {
        alert(`Error saving: ${JSON.parse(rawText).error}`);
      }
    } catch {
      alert('Failed to reach the local server.');
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────────
  const activeReferences = REFERENCE_GLYPHS[activeTab] || [];
  const activeLocalFiles = library.filter(g =>
    g.category === activeTab || (!g.category && activeTab === 'Custom')
  );

  // Ghost rendering: translate paths to cursor position
  const ghostPaths = ghost
    ? ghost.paths.map(p => translatePath(p, ghost.x - ghost.cx, ghost.y - ghost.cy))
    : [];

  // ── Sidebar card renderer (shared for ref + user glyphs) ───────────────────
  const renderCard = (glyph, key, cardStyle, pathColor) => (
    <div
      key={key}
      onPointerDown={(e) => handleCardPointerDown(e, glyph.paths)}
      style={{
        border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.5rem',
        cursor: 'grab', display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', userSelect: 'none',
        touchAction: 'none',
        ...cardStyle,
      }}
      title={glyph.name}
    >
      <svg width="100%" height="50" viewBox="0 0 500 500" style={{ pointerEvents: 'none' }}>
        {glyph.paths.map((p, i) => (
          <path key={i} d={p} fill={pathColor} fillRule="evenodd" stroke="none" />
        ))}
      </svg>
      <span style={{ fontSize: '0.65rem', color: '#4b5563', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
        {glyph.name}
      </span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
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
        <span style={{ fontSize: '0.75rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
          → <strong style={{ color: '#374151' }}>Custom</strong>
        </span>

        <button
          onClick={handleUndo}
          disabled={entries.length === 0}
          style={{ padding: '0.5rem 1rem', cursor: entries.length === 0 ? 'not-allowed' : 'pointer', backgroundColor: entries.length === 0 ? '#f3f4f6' : '#fef3c7', border: entries.length === 0 ? '1px solid #e5e7eb' : '1px solid #fcd34d', color: entries.length === 0 ? '#9ca3af' : '#b45309', borderRadius: '4px', marginLeft: 'auto', fontWeight: 'bold' }}
          title="Remove last stroke (or dropped component)"
        >
          ↺ Undo
        </button>

        <button onClick={clearCanvas} style={{ padding: '0.5rem 1rem', cursor: 'pointer', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '4px' }}>
          Clear
        </button>
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>

        {/* SIDEBAR */}
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
                  boxShadow: activeTab === cat.id ? 'inset 0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>{cat.glyph}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
              </button>
            ))}
          </div>

          <hr style={{ borderTop: '1px solid #e5e7eb', margin: 0 }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
            {activeReferences.map((glyph, i) =>
              renderCard(glyph, `ref-${i}`, { backgroundColor: '#f3f4f6' }, '#374151')
            )}
            {activeLocalFiles.map((glyph, i) =>
              renderCard(glyph, `user-${i}`, { backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }, '#1d4ed8')
            )}
            {activeReferences.length === 0 && activeLocalFiles.length === 0 && (
              <div style={{ gridColumn: 'span 2', fontSize: '0.8rem', color: '#9ca3af', textAlign: 'center', padding: '1rem 0' }}>
                No items in this category.
              </div>
            )}
          </div>
        </div>

        {/* MAIN CANVAS */}
        <div style={{ position: 'relative' }}>
          <svg
            ref={svgRef}
            width="500"
            height="500"
            viewBox="0 0 500 500"
            style={{
              border: '2px solid #e5e7eb', borderRadius: '8px',
              cursor: ghost ? 'none' : 'crosshair',
              backgroundColor: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              // Prevent the browser from firing its own drag behavior over the SVG
              userSelect: 'none',
            }}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
          >
            {/* Grid guides */}
            <g stroke="#f3f4f6" strokeWidth="1">
              <line x1="250" y1="0" x2="250" y2="500" />
              <line x1="0" y1="250" x2="500" y2="250" />
            </g>

            {/* Committed entries */}
            {entries.map((entry, index) =>
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

            {/* Live freehand stroke */}
            {currentPath && (
              <path d={currentPath} stroke="#111827" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Ghost preview while dragging */}
            {ghost && (
              <g style={{ pointerEvents: 'none' }}>
                {/* Bounding box crosshair */}
                <line
                  x1={ghost.x} y1={ghost.y - 14}
                  x2={ghost.x} y2={ghost.y + 14}
                  stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 2"
                />
                <line
                  x1={ghost.x - 14} y1={ghost.y}
                  x2={ghost.x + 14} y2={ghost.y}
                  stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 2"
                />
                {/* Ghost glyph at 40% opacity */}
                {ghostPaths.map((p, i) => (
                  <path key={i} d={p} fill="#3b82f6" fillRule="evenodd" stroke="none" opacity="0.4" />
                ))}
              </g>
            )}
          </svg>

          {/* Drop hint label */}
          {ghost && (
            <div style={{
              position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
              backgroundColor: '#1e40af', color: '#fff',
              fontSize: '0.7rem', padding: '2px 10px', borderRadius: '99px',
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              release to place
            </div>
          )}
        </div>

      </div>
    </div>
  );
}