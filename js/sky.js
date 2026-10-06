// Sky: fixed stars and the sun, projected in perspective so they rotate with the planet.
import { STAR_COUNT, STAR_FOV, SUN_RADIUS, SUN_GLOW, SUN_RAY, SUN_RAYS, FLARE, MOON_FROM_ANTISUN, MOON_RADIUS, MOON_SHADE } from './params.js';
import { view, toView } from './globe.js';
import { sunDir } from './sun.js';

// world direction -> fractional [col, row], or null if behind the camera (camera looks down -z)
function skyProject(x, y, z) {
  const { cols, rows, cw, ch } = view, f = cols * cw / 2 / Math.tan(STAR_FOV / 2);
  const [vx, vy, vz] = toView(x, y, z);
  if (vz >= 0) return null;
  return [cols / 2 + vx / -vz * f / cw, rows / 2 - vy / -vz * f / ch];
}

const stars = Array.from({ length: STAR_COUNT }, () => {
  const z = Math.random() * 2 - 1, a = Math.random() * 2 * Math.PI, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a), Math.random() < 0.1 ? '*' : '.'];
});
export function drawStars(chars, colors, sky) {
  const { cols, rows } = view;
  for (const [x, y, z, c] of stars) {
    const p = skyProject(x, y, z); if (!p) continue;
    const i = Math.round(p[0]), j = Math.round(p[1]);
    if (i < 0 || i >= cols || j < 0 || j >= rows) continue;
    const k = j * cols + i;
    if (chars[k] === ' ' && sky[k]) chars[k] = c;
  }
}

const RAY_CHARS = ['-', '\\', '|', '/'];  // by ray angle, y pointing down
const STEP = Math.PI * 2 / SUN_RAYS;

// Sun disk + glow + rays on the sky only (the planet occludes it); lens flare if the disk is visible.
export function drawSun(chars, colors, sky) {
  const p = skyProject(...sunDir()); if (!p) return;
  const { cols, rows, cw, ch } = view, [sx, sy] = p, asp = ch / cw;
  const ck = Math.round(sy) * cols + Math.round(sx);
  const visible = sx >= 0 && sx < cols && sy >= 0 && sy < rows && sky[ck];
  for (let j = Math.floor(sy - SUN_RAY / asp); j <= sy + SUN_RAY / asp; j++) {
    if (j < 0 || j >= rows) continue;
    for (let i = Math.floor(sx - SUN_RAY); i <= sx + SUN_RAY; i++) {
      if (i < 0 || i >= cols) continue;
      const k = j * cols + i; if (!sky[k]) continue;
      const dx = i - sx, dy = (j - sy) * asp, r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx), m = Math.round(a / STEP), off = Math.abs(a - m * STEP) * r;
      let c = null, col = 0;
      if (r < SUN_RADIUS * 0.6) { c = '@'; col = 15; }
      else if (r < SUN_RADIUS) { c = 'O'; col = 14; }
      else if (r < SUN_RAY && off < 0.5 && SUN_RAYS % 4 === 0) { c = RAY_CHARS[((m % 4) + 4) % 4]; col = r < SUN_GLOW ? 14 : 6; }
      else if (r < SUN_GLOW) { const q = (r - SUN_RADIUS) / (SUN_GLOW - SUN_RADIUS); [c, col] = q < 0.3 ? ['*', 14] : q < 0.6 ? ['+', 6] : ['.', 6]; }
      if (c) { chars[k] = c; colors[k] = col; }
    }
  }
  if (!visible) return;
  const cx = cols / 2, cy = rows / 2;
  for (const [t, s, col] of FLARE) {
    const x = Math.round(sx + (cx - sx) * t - s.length / 2), y = Math.round(sy + (cy - sy) * t);
    if (y < 0 || y >= rows) continue;
    for (let i = 0; i < s.length; i++) {
      if (x + i < 0 || x + i >= cols || s[i] === ' ') continue;
      chars[y * cols + x + i] = s[i]; colors[y * cols + x + i] = col;
    }
  }
}

export let moonAt = null;  // [col, row] of the moon's center this frame (maybe off screen), null when behind the camera

// Moon: roughly opposite the sun, tilted toward the north; each cell is shaded by its own sun angle, so the phase is right.
export function drawMoon(chars, colors, sky) {
  const S = sunDir(), up = [0, 1, 0];
  const n = Math.hypot(S[2], S[0]), perp = [-S[2] / n, 0, S[0] / n];  // horizontal, perpendicular to the sun
  const c = Math.cos(MOON_FROM_ANTISUN), s = Math.sin(MOON_FROM_ANTISUN);
  const M = [0, 1, 2].map(i => -S[i] * c + (perp[i] * 0.6 + up[i] * 0.8) * s);
  const p = moonAt = skyProject(...M); if (!p) return;
  const { cols, rows, cw, ch } = view, [mx, my] = p, asp = ch / cw, L = toView(...S);
  for (let j = Math.floor(my - MOON_RADIUS / asp); j <= my + MOON_RADIUS / asp; j++) {
    if (j < 0 || j >= rows) continue;
    for (let i = Math.floor(mx - MOON_RADIUS); i <= mx + MOON_RADIUS; i++) {
      if (i < 0 || i >= cols || !sky[j * cols + i]) continue;
      const nx = (i - mx) / MOON_RADIUS, ny = -(j - my) * asp / MOON_RADIUS, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const lit = nx * L[0] + ny * L[1] + Math.sqrt(1 - d) * L[2];  // moon surface normal faces the camera (+z)
      [, chars[j * cols + i], colors[j * cols + i]] = MOON_SHADE.find(m => lit >= m[0]);
    }
  }
}
