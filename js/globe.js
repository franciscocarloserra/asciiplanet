// Orthographic globe: view state, projection and the ASCII base layer.
import { LAND_W, LAND_H, LAND_B64 } from '../data/land.js';
import { DAY_MIN, TWILIGHT, TWILIGHT_LAND, TWILIGHT_OCEAN, NIGHT_LAND, NIGHT_OCEAN, NIGHT_LIGHTS, LAND_RAMP, OCEAN_RAMP, COAST_CHAR, ICE_LAT, LAND_COLORS, ICE_COLORS, OCEAN_COLORS, STAR_COLOR, ZOOM_START, ZOOM_MAX_X } from './params.js';
import { sunDir } from './sun.js';
import { lightAt } from './lights.js';
import { CITIES } from '../data/cities.js';

const landBits = Uint8Array.from(atob(LAND_B64), c => c.charCodeAt(0));
const bit = (x, y) => {
  const i = Math.max(0, Math.min(LAND_H - 1, y)) * LAND_W + ((x % LAND_W) + LAND_W) % LAND_W;
  return (landBits[i >> 3] >> (7 - (i & 7))) & 1;
};
// 0..1 land amount, bilinear between mask pixels so coasts stay smooth when zoomed in
export function landAt(lat, lon) {
  const fx = (lon + Math.PI) / (2 * Math.PI) * LAND_W - 0.5, fy = (Math.PI / 2 - lat) / Math.PI * LAND_H - 0.5;
  const x = Math.floor(fx), y = Math.floor(fy), u = fx - x, v = fy - y;
  return (bit(x, y) * (1 - u) + bit(x + 1, y) * u) * (1 - v) + (bit(x, y + 1) * (1 - u) + bit(x + 1, y + 1) * u) * v;
}
export const isLand = (lat, lon) => landAt(lat, lon) >= 0.5;

// land coverage of one char cell: 2x2 samples across its footprint
const SUB = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];
function coverage(vx, vy, cw, ch, R) {
  let f = 0;
  for (const [ox, oy] of SUB) {
    const sx = vx + ox * cw / R, sy = vy + oy * ch / R, d = Math.min(1, sx * sx + sy * sy);
    const [x, y, z] = toWorld(sx, sy, Math.sqrt(1 - d));
    f += landAt(Math.asin(y), Math.atan2(x, z));
  }
  return f / SUB.length;
}


// cw/ch: char size in px; R: globe radius in px
export const view = { lon0: 0, lat0: 0.2, zoom: ZOOM_START, cols: 0, rows: 0, cw: 0, ch: 0, R: 0 };

// start over the browser's timezone city; else longitude from the UTC offset
export function centerOnTimezone() {
  const city = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop();
  const c = CITIES.find(c => c[0] === city), rad = Math.PI / 180;
  if (c) { view.lat0 = c[1] * rad; view.lon0 = c[2] * rad; }
  else view.lon0 = -new Date().getTimezoneOffset() / 4 * rad;
}

export function measure(el) {
  const s = document.createElement('span'); s.textContent = 'M'.repeat(100);
  el.appendChild(s); const r = s.getBoundingClientRect(); s.remove();
  view.cw = r.width / 100; view.ch = parseFloat(getComputedStyle(el).lineHeight) || r.height;  // row pitch is the line height, not the glyph box
  view.cols = Math.floor(innerWidth / view.cw);
  view.rows = Math.floor(innerHeight / view.ch) - 1;  // last row is the status bar
}
export const zoomMax = () => ZOOM_START * ZOOM_MAX_X;

function toWorld(vx, vy, vz) {
  const cl = Math.cos(view.lat0), sl = Math.sin(view.lat0), co = Math.cos(view.lon0), so = Math.sin(view.lon0);
  const z1 = -vy * sl + vz * cl;
  return [vx * co + z1 * so, vy * cl + vz * sl, -vx * so + z1 * co];
}
export function toView(x, y, z) {
  const cl = Math.cos(view.lat0), sl = Math.sin(view.lat0), co = Math.cos(view.lon0), so = Math.sin(view.lon0);
  const z1 = x * so + z * co;
  return [x * co - z * so, y * cl - z1 * sl, y * sl + z1 * cl];
}

// lat/lon -> [col, row], or null if on the far side
export function project(lat, lon) {
  const { cols, rows, cw, ch, R } = view;
  const [vx, vy, vz] = toView(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  if (vz < 0.05) return null;
  return [Math.round(cols / 2 + vx * R / cw), Math.round(rows / 2 - vy * R / ch)];
}

// screen px -> [lat, lon], or null if off the globe
export function unproject(px, py) {
  const { cols, rows, cw, ch, R } = view;
  const vx = (px - cols * cw / 2) / R, vy = (rows * ch / 2 - py) / R, d = vx * vx + vy * vy;
  if (d > 1) return null;
  const [x, y, z] = toWorld(vx, vy, Math.sqrt(1 - d));
  return [Math.asin(y), Math.atan2(x, z)];
}

const pick = (arr, b) => arr[Math.min(arr.length - 1, Math.floor(b * arr.length))];

// Fills chars[]/colors[] for the whole screen: ocean, land, ice, night lights; sky[] = 1 off the globe.
export function drawGlobe(chars, colors, sky) {
  const { cols, rows, cw, ch } = view;
  const R = view.R = view.zoom * rows * ch / 2, S = sunDir();
  for (let j = 0; j < rows; j++) {
    const vy = (rows / 2 - j - 0.5) * ch / R;
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i, vx = (i + 0.5 - cols / 2) * cw / R, d = vx * vx + vy * vy;
      if (d > 1) {
        chars[k] = ' '; colors[k] = STAR_COLOR; sky[k] = 1;
        continue;
      }
      const vz = Math.sqrt(1 - d), [x, y, z] = toWorld(vx, vy, vz);
      const sun = x * S[0] + y * S[1] + z * S[2], lat = Math.asin(y), f = coverage(vx, vy, cw, ch, R), land = f >= 0.5;
      if (sun < -TWILIGHT) {
        [chars[k], colors[k]] = land ? NIGHT_LAND : NIGHT_OCEAN;
        const l = land ? lightAt(lat, Math.atan2(x, z)) : 0, hit = NIGHT_LIGHTS.find(n => l >= n[0]);
        if (hit) [, chars[k], colors[k]] = hit;
        continue;
      }
      if (sun < TWILIGHT) { [chars[k], colors[k]] = land ? TWILIGHT_LAND : TWILIGHT_OCEAN; continue; }
      const lit = DAY_MIN + (1 - DAY_MIN) * (sun - TWILIGHT) / (1 - TWILIGHT);
      const pal = Math.abs(lat) > ICE_LAT ? ICE_COLORS : LAND_COLORS;
      if (land) {  // partial cells on the coast get lighter glyphs
        chars[k] = pick(LAND_RAMP, lit * f); colors[k] = pick(pal, lit);
      } else if (f > 0.1) {
        chars[k] = COAST_CHAR; colors[k] = pal[0];
      } else {
        chars[k] = pick(OCEAN_RAMP, lit * lit); colors[k] = pick(OCEAN_COLORS, lit);
      }
    }
  }
}
