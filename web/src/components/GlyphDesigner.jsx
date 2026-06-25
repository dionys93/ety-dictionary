import { useState, useRef, useEffect, useCallback } from 'react';
import { REFERENCE_GLYPHS } from '../../glyphs/reference.js';

const CATEGORIES = [
  { id: 'Korean',         glyph: '한', label: 'Korean (isolated)' },
  { id: 'Korean_initial', glyph: '초', label: 'Korean initial (choseong)' },
  { id: 'Korean_medial',  glyph: '중', label: 'Korean medial (jungseong)' },
  { id: 'Korean_final',   glyph: '종', label: 'Korean final (jongseong)' },
  { id: 'Katakana',       glyph: 'ア', label: 'Katakana' },
  { id: 'Kanji',          glyph: '漢', label: 'Kanji' },
  { id: 'Radicals', glyph: '部', label: 'Radicals (部首)' },
  { id: 'Custom',         glyph: '✎', label: 'Custom' },
];

// ── Vector math ──────────────────────────────────────────────────────────────

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
  if (coords.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 250, cy: 250, w: 0, h: 0 };
  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
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

// Bake a transform { tx, ty, scaleX, scaleY, cx, cy } into path coordinates.
// Scale is applied around (cx, cy), then translate is applied.
const bakeTransform = (pathString, { tx, ty, scaleX, scaleY, cx, cy }) =>
  pathString.replace(/([MLQCZmlqczA])([^MLQCZmlqczA]*)/g, (_, command, args) => {
    if (command.toUpperCase() === 'Z') return command;
    const nums = args.trim().split(/\s+|,/).filter(n => n !== '').map(Number);
    if (nums.length === 0) return command;
    const isArc = command.toUpperCase() === 'A';
    const out = nums.map((num, i) => {
      if (isArc) {
        if (i % 7 === 5) return (num - cx) * scaleX + cx + tx;
        if (i % 7 === 6) return (num - cy) * scaleY + cy + ty;
        return num;
      }
      if (i % 2 === 0) return (num - cx) * scaleX + cx + tx;
      return (num - cy) * scaleY + cy + ty;
    });
    return `${command} ${out.join(' ')} `;
  }).trim();

const clientToSVG = (svgEl, clientX, clientY) => {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width)  * 500,
    y: ((clientY - rect.top)  / rect.height) * 500,
  };
};

// Build the SVG transform string from an entry's transform object
const svgTransformAttr = ({ tx, ty, scaleX, scaleY, cx, cy }) =>
  `translate(${cx + tx}, ${cy + ty}) scale(${scaleX}, ${scaleY}) translate(${-cx}, ${-cy})`;

// Compute the on-screen bounding box of a glyph entry after its transform
const transformedBBox = (entry) => {
  const { minX, minY, maxX, maxY } = getBoundingBox(entry.paths);
  const { tx, ty, scaleX, scaleY, cx, cy } = entry.transform;
  const pts = [
    { x: minX, y: minY }, { x: maxX, y: minY },
    { x: maxX, y: maxY }, { x: minX, y: maxY },
  ].map(p => ({
    x: (p.x - cx) * scaleX + cx + tx,
    y: (p.y - cy) * scaleY + cy + ty,
  }));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};

// The 8 handle definitions: id, position on bbox as [u, v] in [0,1], cursor
const HANDLES = [
  { id: 'nw', u: 0,   v: 0,   cursor: 'nwse-resize', scaleX: true,  scaleY: true,  anchorU: 1, anchorV: 1 },
  { id: 'n',  u: 0.5, v: 0,   cursor: 'ns-resize',   scaleX: false, scaleY: true,  anchorU: 0.5, anchorV: 1 },
  { id: 'ne', u: 1,   v: 0,   cursor: 'nesw-resize', scaleX: true,  scaleY: true,  anchorU: 0, anchorV: 1 },
  { id: 'e',  u: 1,   v: 0.5, cursor: 'ew-resize',   scaleX: true,  scaleY: false, anchorU: 0, anchorV: 0.5 },
  { id: 'se', u: 1,   v: 1,   cursor: 'nwse-resize', scaleX: true,  scaleY: true,  anchorU: 0, anchorV: 0 },
  { id: 's',  u: 0.5, v: 1,   cursor: 'ns-resize',   scaleX: false, scaleY: true,  anchorU: 0.5, anchorV: 0 },
  { id: 'sw', u: 0,   v: 1,   cursor: 'nesw-resize', scaleX: true,  scaleY: true,  anchorU: 1, anchorV: 0 },
  { id: 'w',  u: 0,   v: 0.5, cursor: 'ew-resize',   scaleX: true,  scaleY: false, anchorU: 1, anchorV: 0.5 },
];

const HANDLE_R = 5; // handle dot radius in SVG units

// ── Component ─────────────────────────────────────────────────────────────────

export default function GlyphDesigner() {
  // Entry shape:
  //   { type: 'stroke', d: string }
  //   { type: 'glyph',  paths: string[], transform: { tx, ty, scaleX, scaleY, cx, cy } }
  const [entries,     setEntries]     = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [glyphName,   setGlyphName]   = useState('');
  const [activeTab,   setActiveTab]   = useState(CATEGORIES[0].id);
  const [library,     setLibrary]     = useState([]);
  const [ghost,       setGhost]       = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null); // index into entries

  const isDrawing  = useRef(false);
  const isDragging = useRef(false);
  const svgRef     = useRef(null);
  const ghostRef   = useRef(null);

  const fetchLibrary = async () => {
    try {
      const res = await fetch('/api/get-glyphs.json');
      if (res.ok) setLibrary(await res.json());
    } catch (err) { console.error('Failed to load glyph library', err); }
  };
  useEffect(() => { fetchLibrary(); }, []);

  // ── Freehand drawing ─────────────────────────────────────────────────────────
  const startDrawing = (e) => {
    if (isDragging.current) return;
    // Deselect when clicking canvas background
    setSelectedIdx(null);
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

  // ── Sidebar card drag → ghost → place ────────────────────────────────────────
  const handleCardPointerDown = useCallback((e, glyphPaths) => {
    e.preventDefault();
    isDragging.current = true;
    setSelectedIdx(null);

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

      const rect = svgRef.current.getBoundingClientRect();
      const inside = ev.clientX >= rect.left && ev.clientX <= rect.right &&
                     ev.clientY >= rect.top  && ev.clientY <= rect.bottom;

      if (inside) {
        const drop = clientToSVG(svgRef.current, ev.clientX, ev.clientY);
        const { cx, cy, paths } = ghostRef.current;
        const tx = drop.x - cx;
        const ty = drop.y - cy;
        setEntries(prev => {
          const next = [...prev, {
            type: 'glyph',
            paths,
            transform: { tx, ty, scaleX: 1, scaleY: 1, cx, cy },
          }];
          // Auto-select the newly placed glyph
          setSelectedIdx(next.length - 1);
          return next;
        });
      }

      setGhost(null);
      ghostRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
  }, []);

  // ── Glyph body drag (move) ───────────────────────────────────────────────────
  const handleGlyphPointerDown = useCallback((e, entryIdx) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    setSelectedIdx(entryIdx);

    const startPt = clientToSVG(svgRef.current, e.clientX, e.clientY);
    let lastPt = startPt;

    const onMove = (ev) => {
      const pt = clientToSVG(svgRef.current, ev.clientX, ev.clientY);
      const ddx = pt.x - lastPt.x;
      const ddy = pt.y - lastPt.y;
      lastPt = pt;
      setEntries(prev => prev.map((entry, i) => {
        if (i !== entryIdx || entry.type !== 'glyph') return entry;
        return { ...entry, transform: { ...entry.transform, tx: entry.transform.tx + ddx, ty: entry.transform.ty + ddy } };
      }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
      isDragging.current = false;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
  }, []);

  // ── Scale handle drag ────────────────────────────────────────────────────────
  const handleScalePointerDown = useCallback((e, entryIdx, handle) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;

    // Snapshot the bbox at drag start so anchor point is stable
    const entry = entries[entryIdx]; // closure over current entries
    const bbox  = transformedBBox(entry);
    const bw = bbox.maxX - bbox.minX;
    const bh = bbox.maxY - bbox.minY;

    // Anchor point stays fixed; handle point moves with pointer
    const anchorX = bbox.minX + handle.anchorU * bw;
    const anchorY = bbox.minY + handle.anchorV * bh;

    const startPt = clientToSVG(svgRef.current, e.clientX, e.clientY);

    // Distance from anchor to start handle position
    const startHandleX = bbox.minX + handle.u * bw;
    const startHandleY = bbox.minY + handle.v * bh;
    const startDX = startHandleX - anchorX || 1; // avoid div/0
    const startDY = startHandleY - anchorY || 1;

    const onMove = (ev) => {
      const pt = clientToSVG(svgRef.current, ev.clientX, ev.clientY);
      const dx = pt.x - startPt.x;
      const dy = pt.y - startPt.y;

      const newHandleX = startHandleX + dx;
      const newHandleY = startHandleY + dy;

      const rawScaleX = handle.scaleX ? (newHandleX - anchorX) / startDX : 1;
      const rawScaleY = handle.scaleY ? (newHandleY - anchorY) / startDY : 1;

      // Clamp to avoid flip / near-zero
      const clampedSX = handle.scaleX ? Math.max(0.05, rawScaleX) : 1;
      const clampedSY = handle.scaleY ? Math.max(0.05, rawScaleY) : 1;

      setEntries(prev => prev.map((en, i) => {
        if (i !== entryIdx || en.type !== 'glyph') return en;
        const orig = getBoundingBox(en.paths);
        // New tx/ty so that the anchor world point doesn't move
        // anchor in original-path space:
        const origAnchorX = orig.minX + handle.anchorU * orig.w;
        const origAnchorY = orig.minY + handle.anchorV * orig.h;
        const newTX = anchorX - (origAnchorX - orig.cx) * clampedSX - orig.cx;
        const newTY = anchorY - (origAnchorY - orig.cy) * clampedSY - orig.cy;
        return { ...en, transform: { ...en.transform, scaleX: clampedSX, scaleY: clampedSY, tx: newTX, ty: newTY } };
      }));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
      isDragging.current = false;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
  }, [entries]);

  // ── Edit actions ─────────────────────────────────────────────────────────────
  const handleUndo = () => {
    setEntries(prev => {
      const next = prev.slice(0, -1);
      setSelectedIdx(si => (si !== null && si >= next.length) ? null : si);
      return next;
    });
  };

  const clearCanvas = () => { setEntries([]); setCurrentPath(''); setSelectedIdx(null); };

  const handleExport = async () => {
    if (entries.length === 0) return alert('Canvas is empty! Draw something first.');
    if (!glyphName.trim())    return alert('Please give your glyph a name before saving.');

    // Bake transforms into path coords before saving
    const flatPaths = entries.flatMap(entry => {
      if (entry.type === 'stroke') return [entry.d];
      return entry.paths.map(p => bakeTransform(p, entry.transform));
    });
    const glyphData = { name: glyphName.trim(), category: 'Custom', paths: flatPaths };

    try {
      const response = await fetch('/api/save-glyph.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(glyphData),
      });
      const rawText = await response.text();
      if (response.ok) { setGlyphName(''); fetchLibrary(); }
      else alert(`Error saving: ${JSON.parse(rawText).error}`);
    } catch {
      alert('Failed to reach the local server.');
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const activeReferences = REFERENCE_GLYPHS[activeTab] || [];
  const activeLocalFiles = library.filter(g =>
    g.category === activeTab || (!g.category && activeTab === 'Custom')
  );
  const ghostPaths = ghost
    ? ghost.paths.map(p => translatePath(p, ghost.x - ghost.cx, ghost.y - ghost.cy))
    : [];

  // Selection box + handles for the selected glyph
  const selEntry = selectedIdx !== null ? entries[selectedIdx] : null;
  const selBBox  = (selEntry && selEntry.type === 'glyph') ? transformedBBox(selEntry) : null;

  // ── Sidebar card ──────────────────────────────────────────────────────────────
  const renderCard = (glyph, key, cardStyle, pathColor) => (
    <div
      key={key}
      onPointerDown={(e) => handleCardPointerDown(e, glyph.paths)}
      style={{
        border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.5rem',
        cursor: 'grab', display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', userSelect: 'none', touchAction: 'none',
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
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
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
        >
          ↺ Undo
        </button>
        <button onClick={clearCanvas} style={{ padding: '0.5rem 1rem', cursor: 'pointer', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '4px' }}>
          Clear
        </button>
      </div>

      {/* Transform readout when a glyph is selected */}
      {selEntry && selEntry.type === 'glyph' && (
        <div style={{ fontSize: '0.75rem', color: '#6b7280', padding: '0.4rem 0.75rem', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', display: 'flex', gap: '1.5rem' }}>
          <span>scale X: <strong style={{ color: '#0369a1' }}>{selEntry.transform.scaleX.toFixed(2)}</strong></span>
          <span>scale Y: <strong style={{ color: '#0369a1' }}>{selEntry.transform.scaleY.toFixed(2)}</strong></span>
          <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>drag handles to resize · drag body to move · click canvas to deselect</span>
        </div>
      )}

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
            {activeReferences.map((glyph, i) => renderCard(glyph, `ref-${i}`, { backgroundColor: '#f3f4f6' }, '#374151'))}
            {activeLocalFiles.map((glyph, i) => renderCard(glyph, `user-${i}`, { backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }, '#1d4ed8'))}
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
            width="500" height="500" viewBox="0 0 500 500"
            style={{
              border: '2px solid #e5e7eb', borderRadius: '8px',
              cursor: ghost ? 'none' : 'crosshair',
              backgroundColor: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
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
            {entries.map((entry, index) => {
              if (entry.type === 'stroke') {
                return (
                  <path key={index} d={entry.d}
                    stroke="#111827" strokeWidth="12" fill="none"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                );
              }
              // Glyph entry: apply transform via SVG attribute
              const isSelected = index === selectedIdx;
              return (
                <g
                  key={index}
                  transform={svgTransformAttr(entry.transform)}
                  onPointerDown={(e) => handleGlyphPointerDown(e, index)}
                  style={{ cursor: 'move' }}
                >
                  {entry.paths.map((p, i) => (
                    <path key={i} d={p}
                      fill={isSelected ? '#1d4ed8' : '#111827'}
                      fillRule="evenodd"
                      stroke="none"
                    />
                  ))}
                </g>
              );
            })}

            {/* Live freehand stroke */}
            {currentPath && (
              <path d={currentPath} stroke="#111827" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* Selection box + handles */}
            {selBBox && (
              <g style={{ pointerEvents: 'none' }}>
                {/* Dashed bounding rect */}
                <rect
                  x={selBBox.minX - 4} y={selBBox.minY - 4}
                  width={selBBox.maxX - selBBox.minX + 8}
                  height={selBBox.maxY - selBBox.minY + 8}
                  fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 3"
                />
                {/* 8 scale handles — each re-enables pointer events */}
                {HANDLES.map(h => {
                  const hx = selBBox.minX + h.u * (selBBox.maxX - selBBox.minX);
                  const hy = selBBox.minY + h.v * (selBBox.maxY - selBBox.minY);
                  return (
                    <circle
                      key={h.id}
                      cx={hx} cy={hy} r={HANDLE_R}
                      fill="#ffffff" stroke="#3b82f6" strokeWidth="1.5"
                      style={{ pointerEvents: 'all', cursor: h.cursor }}
                      onPointerDown={(e) => handleScalePointerDown(e, selectedIdx, h)}
                    />
                  );
                })}
              </g>
            )}

            {/* Ghost preview while dragging from sidebar */}
            {ghost && (
              <g style={{ pointerEvents: 'none' }}>
                <line x1={ghost.x} y1={ghost.y - 14} x2={ghost.x} y2={ghost.y + 14} stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 2" />
                <line x1={ghost.x - 14} y1={ghost.y} x2={ghost.x + 14} y2={ghost.y} stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 2" />
                {ghostPaths.map((p, i) => (
                  <path key={i} d={p} fill="#3b82f6" fillRule="evenodd" stroke="none" opacity="0.4" />
                ))}
              </g>
            )}
          </svg>

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