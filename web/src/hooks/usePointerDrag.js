// web/src/hooks/usePointerDrag.js
import { useCallback } from 'react';

/**
 * Wires up a window-level pointer drag from a pointerdown handler: attaches
 * `pointermove`/`pointerup` listeners on window, calls `onMove` on every
 * move, calls `onEnd` once on release, then removes both listeners. This is
 * the capture → track → cleanup pattern every drag interaction in the glyph
 * designer needs (moving a glyph, resizing one, dragging a new glyph in
 * from the sidebar) — each caller only supplies what's different about
 * *their* drag.
 *
 * `isDraggingRef`, if passed, is set to true for the duration of the drag —
 * useful when a sibling handler (e.g. canvas click-to-deselect) needs to
 * ignore clicks that are really the tail end of a drag.
 */
export function usePointerDrag() {
  return useCallback((e, { onMove, onEnd, isDraggingRef } = {}) => {
    e.preventDefault();
    if (isDraggingRef) isDraggingRef.current = true;

    const handleMove = (ev) => onMove?.(ev);
    const handleUp = (ev) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (isDraggingRef) isDraggingRef.current = false;
      onEnd?.(ev);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, []);
}