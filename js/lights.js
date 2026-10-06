// Fake night lights: glow around major cities plus scattered small towns, on a 0.5 deg grid.
import { CITIES } from '../data/cities.js';
import { LIGHT_RADIUS_DEG, TOWN_DENSITY } from './params.js';

const W = 720, H = 360, grid = new Float32Array(W * H);
for (const [, lat, lon, size] of CITIES) {
  const r = LIGHT_RADIUS_DEG * size, cx = (lon + 180) * 2, cy = (90 - lat) * 2;
  for (let y = Math.floor(cy - r * 2); y <= cy + r * 2; y++) {
    if (y < 0 || y >= H) continue;
    for (let x = Math.floor(cx - r * 2); x <= cx + r * 2; x++) {
      const d = Math.hypot(x - cx, y - cy) / 2 / r; if (d > 1) continue;
      const xi = (x + W) % W, h = Math.sin(xi * 12.9898 + y * 78.233) * 43758.5453;
      grid[y * W + xi] = Math.max(grid[y * W + xi], (1 - d) * (0.5 + 0.5 * (h - Math.floor(h))));  // speckled falloff
    }
  }
}
for (let i = 0; i < W * H; i++) if (!grid[i] && Math.random() < TOWN_DENSITY) grid[i] = 0.2;

// 0..1 brightness at a point (radians)
export function lightAt(lat, lon) {
  const x = Math.min(W - 1, Math.floor((lon + Math.PI) / (2 * Math.PI) * W));
  const y = Math.min(H - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * H));
  return grid[y * W + x];
}
