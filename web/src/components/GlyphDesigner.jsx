import { useState, useRef, useEffect, useCallback } from 'react';
import { REFERENCE_GLYPHS } from '../../glyphs/reference.js';
import {
  CANVAS_SIZE,
  getBoundingBox,
  translatePath,
  bakeTransform,
  clientToSVG,
  svgTransformAttr,
  transformedBBox,
} from '../utils/svgPath.js';
import {
  eraseRectFromGlyphPaths,
  eraseRectFromStroke,
  rectsOverlap,
  normalizeRect,
} from '../utils/pathClip.js';
import { usePointerDrag } from '../hooks/usePointerDrag.js';

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
const MIN_ERASE_SIZE = 2; // ignore accidental no-drag clicks while in erase mode

export default function GlyphDesigner() {
  // Entry shape:
  //   { type: 'stroke', d: string }
  //   { type: 'glyph',  paths: string[], transform: { tx, ty, scaleX, scaleY, cx, cy } }
  const [entries,       setEntries]       = useState([]);
  const [currentPath,   setCurrentPath]   = useState('');
  const [glyphName,     setGlyphName]     = useState('');
  const [activeTab,     setActiveTab]     = useState(CATEGORIES[0].id);
  const [library,       setLibrary]       = useState([]);
  const [ghost,         setGhost]         = useState(null);
  const [selectedIdx,   setSelectedIdx]   = useState(null); // index into entries
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'error'|'success', text }
  const [mode,          setMode]          = useState('draw'); // 'draw' | 'erase'
  const [eraseBox,      setEraseBox]      = useState(null); // { x0, y0, x1, y1 } in SVG coords, live while dragging

  const isDrawing  = useRef(false);
  const isDragging = useRef(false);
  const svgRef     = useRef(null);
  const ghostRef   = useRef(null);
  const eraseBoxRef = useRef(null);

  const startPointerDrag = usePointerDrag();

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

  // ── Erase-area marquee ───────────────────────────────────────────────────────
  const applyErase = (eraseRect) => {
    if (eraseRect.maxX - eraseRect.minX < MIN_ERASE_SIZE || eraseRect.maxY - eraseRect.minY < MIN_ERASE_SIZE) return;

    let changed = false;
    const next = [];

    for (const entry of entries) {
      if (entry.type === 'stroke') {
        const bbox = getBoundingBox([entry.d]);
        if (!rectsOverlap(bbox, eraseRect)) { next.push(entry); continue; }

        changed = true;
        eraseRectFromStroke(entry.d, eraseRect).forEach(d => next.push({ type: 'stroke', d }));
        continue;
      }

      // Glyph entry: bake its current transform into absolute coordinates
      // before erasing, then reset to an identity transform centered on
      // whatever remains — so it's still fully draggable/resizable after.
      const bbox = transformedBBox(entry);
      if (!rectsOverlap(bbox, eraseRect)) { next.push(entry); continue; }

      const bakedPaths = entry.paths.map(p => bakeTransform(p, entry.transform));
      const survivingPaths = eraseRectFromGlyphPaths(bakedPaths, eraseRect);
      changed = true;

      if (survivingPaths.length === 0) continue; // fully erased — dropped

      const newBBox = getBoundingBox(survivingPaths);
      next.push({
        type: 'glyph',
        paths: survivingPaths,
        transform: { tx: 0, ty: 0, scaleX: 1, scaleY: 1, cx: newBBox.cx, cy: newBBox.cy },
      });
    }

    if (changed) {
      setEntries(next);
      setSelectedIdx(null);
    }
  };

  const startErase = (e) => {
    setSelectedIdx(null);
    const pt = clientToSVG(svgRef.current, e.clientX, e.clientY);
    const box = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
    eraseBoxRef.current = box;
    setEraseBox(box);

    startPointerDrag(e, {
      isDraggingRef: isDragging,
      onMove: (ev) => {
        const p = clientToSVG(svgRef.current, ev.clientX, ev.clientY);
        const next = { ...eraseBoxRef.current, x1: p.x, y1: p.y };
        eraseBoxRef.current = next;
        setEraseBox(next);
      },
      onEnd: () => {
        const finishedBox = eraseBoxRef.current;
        eraseBoxRef.current = null;
        setEraseBox(null);
        if (finishedBox) applyErase(normalizeRect(finishedBox));
      },
    });
  };

  // Canvas-level dispatch: pen-drawing and the erase marquee share the same
  // pointer events on the <svg>, so route based on the active tool.
  const handleCanvasPointerDown = (e) => {
    if (mode === 'erase') startErase(e);
    else startDrawing(e);
  };
  const handleCanvasPointerMove = (e) => {
    if (mode === 'draw') draw(e);
  };
  const handleCanvasPointerUp = () => {
    if (mode === 'draw') stopDrawing();
  };
  const handleCanvasPointerLeave = () => {
    if (mode === 'draw') stopDrawing();
  };

  // ── Sidebar card drag → ghost → place ────────────────────────────────────────
  const handleCardPointerDown = useCallback((e, glyphPaths) => {
    setSelectedIdx(null);

    const { cx, cy } = getBoundingBox(glyphPaths);
    const svgPt = clientToSVG(svgRef.current, e.clientX, e.clientY);
    const ghostState = { paths: glyphPaths, cx, cy, x: svgPt.x, y: svgPt.y };
    ghostRef.current = ghostState;
    setGhost(ghostState);

    startPointerDrag(e, {
      isDraggingRef: isDragging,
      onMove: (ev) => {
        if (!svgRef.current) return;
        const pt = clientToSVG(svgRef.current, ev.clientX, ev.clientY);
        const next = { ...ghostRef.current, x: pt.x, y: pt.y };
        ghostRef.current = next;
        setGhost(next);
      },
      onEnd: (ev) => {
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
      },
    });
  }, [startPointerDrag]);

  // ── Glyph body drag (move) ───────────────────────────────────────────────────
  const handleGlyphPointerDown = useCallback((e, entryIdx) => {
    if (mode !== 'draw') return; // let it bubble up to the canvas-level erase marquee
    e.stopPropagation();
    setSelectedIdx(entryIdx);

    let lastPt = clientToSVG(svgRef.current, e.clientX, e.clientY);

    startPointerDrag(e, {
      isDraggingRef: isDragging,
      onMove: (ev) => {
        const pt = clientToSVG(svgRef.current, ev.clientX, ev.clientY);
        const ddx = pt.x - lastPt.x;
        const ddy = pt.y - lastPt.y;
        lastPt = pt;
        setEntries(prev => prev.map((entry, i) => {
          if (i !== entryIdx || entry.type !== 'glyph') return entry;
          return { ...entry, transform: { ...entry.transform, tx: entry.transform.tx + ddx, ty: entry.transform.ty + ddy } };
        }));
      },
    });
  }, [startPointerDrag, mode]);

  // ── Scale handle drag ────────────────────────────────────────────────────────
  const handleScalePointerDown = useCallback((e, entryIdx, handle) => {
    if (mode !== 'draw') return;
    e.stopPropagation();

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

    startPointerDrag(e, {
      isDraggingRef: isDragging,
      onMove: (ev) => {
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
          const origAnchorX = orig.minX + handle.anchorU * orig.w;
          const origAnchorY = orig.minY + handle.anchorV * orig.h;
          const newTX = anchorX - (origAnchorX - orig.cx) * clampedSX - orig.cx;
          const newTY = anchorY - (origAnchorY - orig.cy) * clampedSY - orig.cy;
          return { ...en, transform: { ...en.transform, scaleX: clampedSX, scaleY: clampedSY, tx: newTX, ty: newTY } };
        }));
      },
    });
  }, [entries, startPointerDrag, mode]);

  // ── Edit actions ─────────────────────────────────────────────────────────────
  const handleUndo = () => {
    setEntries(prev => {
      const next = prev.slice(0, -1);
      setSelectedIdx(si => (si !== null && si >= next.length) ? null : si);
      return next;
    });
  };

  const clearCanvas = () => {
    setEntries([]);
    setCurrentPath('');
    setSelectedIdx(null);
    setStatusMessage(null);
  };

  const handleExport = async () => {
    if (entries.length === 0) {
      setStatusMessage({ type: 'error', text: 'Canvas is empty! Draw something first.' });
      return;
    }
    if (!glyphName.trim()) {
      setStatusMessage({ type: 'error', text: 'Please give your glyph a name before saving.' });
      return;
    }

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
      if (response.ok) {
        setGlyphName('');
        setStatusMessage({ type: 'success', text: `Saved "${glyphData.name}" to the library.` });
        fetchLibrary();
      } else {
        setStatusMessage({ type: 'error', text: `Error saving: ${JSON.parse(rawText).error}` });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to reach the local server.' });
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
      <svg width="100%" height="50" viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`} style={{ pointerEvents: 'none' }}>
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
        <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: '#ffffff', padding: '0.25rem', borderRadius: '6px', border: '1px solid #d1d5db' }}>
          <button
            onClick={() => setMode('draw')}
            style={{
              padding: '0.4rem 0.75rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem',
              backgroundColor: mode === 'draw' ? '#374151' : 'transparent',
              color: mode === 'draw' ? '#ffffff' : '#4b5563',
            }}
          >
            ✏️ Draw
          </button>
          <button
            onClick={() => { setMode('erase'); setSelectedIdx(null); }}
            style={{
              padding: '0.4rem 0.75rem', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem',
              backgroundColor: mode === 'erase' ? '#991b1b' : 'transparent',
              color: mode === 'erase' ? '#ffffff' : '#4b5563',
            }}
          >
            ⬚ Erase Area
          </button>
        </div>
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

      {/* Save feedback — replaces the old alert() calls */}
      {statusMessage && (
        <div style={{
          fontSize: '0.8rem',
          padding: '0.5rem 0.75rem',
          borderRadius: '6px',
          backgroundColor: statusMessage.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: statusMessage.type === 'error' ? '1px solid #fca5a5' : '1px solid #86efac',
          color: statusMessage.type === 'error' ? '#991b1b' : '#166534',
        }}>
          {statusMessage.text}
        </div>
      )}

      {/* Transform readout when a glyph is selected (draw mode) or an erase-mode hint */}
      {mode === 'draw' && selEntry && selEntry.type === 'glyph' && (
        <div style={{ fontSize: '0.75rem', color: '#6b7280', padding: '0.4rem 0.75rem', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', display: 'flex', gap: '1.5rem' }}>
          <span>scale X: <strong style={{ color: '#0369a1' }}>{selEntry.transform.scaleX.toFixed(2)}</strong></span>
          <span>scale Y: <strong style={{ color: '#0369a1' }}>{selEntry.transform.scaleY.toFixed(2)}</strong></span>
          <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>drag handles to resize · drag body to move · click canvas to deselect</span>
        </div>
      )}
      {mode === 'erase' && (
        <div style={{ fontSize: '0.75rem', color: '#991b1b', padding: '0.4rem 0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px' }}>
          Drag a box over the canvas to erase everything inside it — strokes get cut, glyphs stay draggable and resizable afterward.
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
            width={CANVAS_SIZE} height={CANVAS_SIZE} viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            style={{
              border: '2px solid #e5e7eb', borderRadius: '8px',
              cursor: ghost ? 'none' : 'crosshair',
              backgroundColor: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              userSelect: 'none',
            }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerLeave}
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

            {/* Selection box + handles (draw mode only) */}
            {mode === 'draw' && selBBox && (
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

            {/* Erase marquee (erase mode only, while dragging) */}
            {mode === 'erase' && eraseBox && (
              <rect
                x={Math.min(eraseBox.x0, eraseBox.x1)}
                y={Math.min(eraseBox.y0, eraseBox.y1)}
                width={Math.abs(eraseBox.x1 - eraseBox.x0)}
                height={Math.abs(eraseBox.y1 - eraseBox.y0)}
                fill="rgba(239, 68, 68, 0.15)"
                stroke="#ef4444"
                strokeWidth="1"
                strokeDasharray="4 3"
                style={{ pointerEvents: 'none' }}
              />
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