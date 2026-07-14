// web/src/utils/proceduralTextures.js
//
// Small procedurally-generated canvas textures — no external image assets
// needed. Draws onto an offscreen <canvas> and returns a ready-to-use
// THREE.CanvasTexture. Browser-only (uses `document`), which is fine since
// HouseExplorer is mounted with client:only="react".

import * as THREE from 'three';

function shadeColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0x00ff) + amt;
  let b = (num & 0x0000ff) + amt;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// A staggered shingle/shake pattern in the given base color, with alternating
// rows shaded slightly darker for tonal variation, like a real roof.
export function createShingleTexture(baseColor, { rows = 6, cols = 8, size = 256 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cellW = size / cols;
  const cellH = size / rows;
  const darker = shadeColor(baseColor, -10);

  for (let row = 0; row < rows; row++) {
    ctx.fillStyle = row % 2 === 0 ? baseColor : darker;
    ctx.fillRect(0, row * cellH, size, cellH);
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;
  for (let row = 0; row < rows; row++) {
    const offset = (row % 2) * (cellW / 2); // stagger alternate rows like real shingles
    for (let col = -1; col <= cols; col++) {
      ctx.strokeRect(col * cellW + offset, row * cellH, cellW, cellH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  return texture;
}