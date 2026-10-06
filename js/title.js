// Intro title over the planet: scrambles in, shimmers, and crumbles into falling particles on first interaction.
import { TITLE_TEXT, TITLE_SUB, TITLE_SUB_COLOR, TITLE_SUB_MS, TITLE_DECODE_MS, TITLE_SHIMMER, TITLE_SHIMMER_SPEED, TITLE_GRAVITY, TITLE_LIFE_S, TITLE_DECAY } from './params.js';
import { view } from './globe.js';

const FONT = {
  A: [' ### ', '#   #', '#####', '#   #', '#   #'], S: [' ####', '#    ', ' ### ', '    #', '#### '],
  C: [' ####', '#    ', '#    ', '#    ', ' ####'], I: ['###', ' # ', ' # ', ' # ', '###'],
  P: ['#### ', '#   #', '#### ', '#    ', '#    '], L: ['#    ', '#    ', '#    ', '#    ', '#####'],
  N: ['#   #', '##  #', '# # #', '#  ##', '#   #'], E: ['#####', '#    ', '#### ', '#    ', '#####'],
  T: ['#####', '  #  ', '  #  ', '  #  ', '  #  '], ' ': ['  ', '  ', '  ', '  ', '  '],
};
const NOISE = '!@#$%&*?/\\<>=+';

// title pixels as [x, y] in glyph units
const pixels = [];
let width = 0;
for (const ch of TITLE_TEXT) {
  const g = FONT[ch]; if (!g) continue;
  g.forEach((row, y) => [...row].forEach((c, x) => c === '#' && pixels.push([width + x, y])));
  width += g[0].length + 1;
}
width -= 1;

let t0 = null, particles = null;

export function dismissTitle(now) {
  if (particles) return;
  particles = [...layout(), ...subLayout()].map(([x, y]) => ({
    x, y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 8, life: TITLE_LIFE_S * (0.5 + Math.random()), t: now,
  }));
}

// screen cells of the title, scaled 2x horizontally when there's room
function layout() {
  const { cols, rows } = view, sx = cols >= width * 2 + 4 ? 2 : 1;
  const x0 = Math.floor((cols - width * sx) / 2), y0 = Math.floor(rows / 2 - 2.5);
  return pixels.flatMap(([x, y]) => Array.from({ length: sx }, (_, k) => [x0 + x * sx + k, y0 + y]));
}

// subtitle cells as [x, y, char], centered two rows under the title
function subLayout() {
  const { cols, rows } = view, x0 = Math.floor((cols - TITLE_SUB.length) / 2), y = Math.floor(rows / 2 - 2.5) + 7;
  return [...TITLE_SUB].map((c, i) => [x0 + i, y, c]).filter(([, , c]) => c !== ' ');
}

export function drawTitle(chars, colors, now) {
  const { cols, rows } = view;
  const put = (x, y, c, col) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < cols && y >= 0 && y < rows) { chars[y * cols + x] = c; colors[y * cols + x] = col; }
  };
  if (particles) {
    for (const p of particles) {
      const age = (now - p.t) / 1000, f = age / p.life; if (f >= 1) continue;
      const [c, col] = TITLE_DECAY[Math.floor(f * TITLE_DECAY.length)];
      put(p.x + p.vx * age, p.y + p.vy * age + TITLE_GRAVITY * age * age / 2, c, col);
    }
    return;
  }
  if (t0 === null) t0 = now;
  const cells = layout(), x0 = cells.length ? cells[0][0] : 0;
  for (const [x, y] of cells) put(x + 1, y + 1, ':', 8);  // drop shadow
  for (const [x, y] of cells) {
    const reveal = (x - x0) / (width * 2) * TITLE_DECODE_MS;  // decodes left to right
    if (now - t0 < reveal) { put(x, y, NOISE[Math.floor(Math.random() * NOISE.length)], 8); continue; }
    const w = Math.floor((x + y * 2) / 3 - (now - t0) / 1000 * TITLE_SHIMMER_SPEED);  // diagonal color wave
    put(x, y, '#', TITLE_SHIMMER[((w % TITLE_SHIMMER.length) + TITLE_SHIMMER.length) % TITLE_SHIMMER.length]);
  }
  for (const [x, y, c] of subLayout())  // types in once the title has decoded
    if (now - t0 > TITLE_DECODE_MS + (x - x0) * TITLE_SUB_MS) put(x, y, c, TITLE_SUB_COLOR);
}
