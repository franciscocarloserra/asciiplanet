// Composes the frame: globe layer, messages, draft, status bar.
import { RENDER_FPS, AUTO_SPIN, IDLE_RESUME_S, CURSOR_BLINK_MS, LONG_FRAME_MS, ZOOM_START, ZOOM_MIN, CURSOR_CHAR, CURSOR_COLOR, ME_COLOR, BAD_COLOR, MSG_FADE, CLUSTER, STACK_MAX, SHADOW_DIM, BAD_SHAKE_MS, SEND_ROWS, GITHUB_URL, FEEDBACK_URL, EDGE_COLOR, EDGE_RIM, HINT, HINT_TOUCH, HINT_COLOR, NUDGE_ROWS, MSG_TTL_S, MOON_RADIUS, MSG_DECAY_START, DECAY_WAVE, BLIP_NEAR, PLAYER_MARK, CHAT_W, CHAT_COLOR, CHAT_TITLE, CHAT_EMPTY } from './params.js';
import { tlog } from './telemetry.js';
import { view, measure, drawGlobe, project, toView, centerOnTimezone, zoomMax } from './globe.js';
import { drawStars, drawSun, drawMoon, moonAt } from './sky.js';
import { msgs, chat, players, visibleText, sendProgress, expire, syncPos, connStatus, sentAny } from './messages.js';
import { me, bindInput } from './input.js';
import { drawTitle, dismissTitle } from './title.js';
import { initSound, startMusic, blipSound, whoosh } from './sound.js';

const screen = document.getElementById('screen');
const bar = document.getElementById('bar');

const esc = c => c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c;

// writes text into the grid at a lat/lon, padded with a space so it reads over the land.
// occ marks cells taken by earlier text this frame; we try rows 0, -1, +1, -2, ... to avoid them.
function stamp(chars, colors, occ, text, lat, lon, color, dy = 0, dx = 0, p = project(lat, lon)) {
  if (!p) return;
  const { cols, rows } = view, s = ' ' + text + ' ', x0 = p[0] - 1 + dx;
  const free = y => {
    if (y < 0 || y >= rows) return false;
    for (let x = Math.max(0, x0); x < Math.min(cols, x0 + s.length); x++) if (occ[y * cols + x] === 1) return false;
    return true;
  };
  let y0 = p[1] + dy;
  for (let r = 1; r <= 2 * NUDGE_ROWS && !free(y0); r++) {
    const y = p[1] + dy + (r % 2 ? -1 : 1) * Math.ceil(r / 2);
    if (free(y)) y0 = y;
  }
  if (y0 < 0 || y0 >= rows) return;
  for (let i = 0; i < s.length; i++) {
    const x = x0 + i; if (x < 0 || x >= cols) continue;
    chars[y0 * cols + x] = s[i]; colors[y0 * cols + x] = typeof color === 'number' ? color : color[i - 1] ?? 0; occ[y0 * cols + x] = 1;
  }
  // shadow: a one-cell ring around the text where the background shows one step dimmer (never over text, never twice)
  for (let y = y0 - 1; y <= y0 + 1; y++) for (let x = x0 - 1; x <= x0 + s.length; x++) {
    const k = y * cols + x;
    if (y >= 0 && y < rows && x >= 0 && x < cols && !occ[k]) { colors[k] = SHADOW_DIM[colors[k]] ?? 0; occ[k] = 2; }
  }
}

// where a message of len chars goes: its point if visible, else the nearest edge in its direction
// (globe rim for the far side, screen border when zoomed in). Returns [[col, row], atEdge].
function place(lat, lon, len) {
  const { cols, rows, cw, ch, R } = view;
  const [vx, vy, vz] = toView(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
  const back = vz < 0.05, k = back ? EDGE_RIM / (Math.hypot(vx, vy) || 1) : 1;
  const x = Math.round(cols / 2 + vx * k * R / cw), y = Math.round(rows / 2 - vy * k * R / ch);
  const cx = Math.max(1, Math.min(cols - len - 2, x)), cy = Math.max(0, Math.min(rows - 1, y));
  return [[cx, cy], back || cx !== x || cy !== y];
}

// moon messages sit just right of the moon, pinned to the screen border when it's off screen. Same return as place().
function moonSpot(len) {
  if (!moonAt) return [null, false];
  const { cols, rows } = view, x = Math.round(moonAt[0] + MOON_RADIUS + 2), y = Math.round(moonAt[1]);
  const cx = Math.max(1, Math.min(cols - len - 2, x)), cy = Math.max(0, Math.min(rows - 1, y));
  return [[cx, cy], cx !== x || cy !== y];
}

// colors[] holds EGA palette indices; style.css maps them to .c0-.c15
function onScreen(lat, lon) {
  const p = project(lat, lon);
  return p && p[0] >= 0 && p[0] < view.cols && p[1] >= 0 && p[1] < view.rows;
}

function toHtml(chars, colors) {
  const { cols, rows } = view;
  let html = '';
  for (let j = 0; j < rows; j++) {
    let run = '', rc = colors[j * cols];
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (colors[k] !== rc) { html += `<span class=c${rc}>${run}</span>`; run = ''; rc = colors[k]; }
      run += esc(chars[k]);
    }
    html += `<span class=c${rc}>${run}</span>\n`;
  }
  return html;
}

let lastBar = '';
function drawBar() {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const right = 'FEEDBACK  GITHUB ', [conn, cc] = connStatus();
  const left = ` ASCII PLANET  ${time} | ${msgs.length} live | zoom ${(view.zoom / ZOOM_START).toFixed(1)}x`.slice(0, Math.max(0, view.cols - right.length - conn.length - 3));  // narrow screens: one row anyway
  const mid = Math.max(left.length + 2, Math.floor((view.cols - conn.length) / 2));
  const html = `${left.padEnd(mid)}<span class=c${cc}>${conn}</span>${''.padEnd(view.cols - right.length - mid - conn.length)}<a href="${FEEDBACK_URL}" target="_blank" rel="noopener">FEEDBACK</a>  <a href="${GITHUB_URL}" target="_blank" rel="noopener">GITHUB</a> `;
  if (html !== lastBar) bar.innerHTML = lastBar = html;  // rewriting every frame swaps the links mid-click
}

let lastLon = 0, lastLat = 0, prev = performance.now(), lastDraw = 0, lastSlowLog = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (now - lastDraw < 1000 / RENDER_FPS) return;
  const dt = (now - prev) / 1000; prev = now; lastDraw = now;
  // whoosh follows user turning only (measured before auto-spin moves the view)
  whoosh(Math.hypot((view.lon0 - lastLon) * Math.cos(view.lat0), view.lat0 - lastLat) / Math.max(dt, 1e-3));
  if (now - me.lastInput > IDLE_RESUME_S * 1000 && !me.pin && !me.moon) view.lon0 += AUTO_SPIN * dt;
  lastLon = view.lon0; lastLat = view.lat0;
  expire(now);
  syncPos(me.pin, now);

  const t0 = performance.now();
  const n = view.cols * view.rows, chars = new Array(n), colors = new Array(n);
  const sky = new Uint8Array(n);
  drawGlobe(chars, colors, sky);
  drawStars(chars, colors, sky);
  drawSun(chars, colors, sky);
  drawMoon(chars, colors, sky);
  for (const [lat, lon] of players) {  // others' pins, under all text
    const p = project(lat, lon);
    if (p && p[0] >= 0 && p[0] < view.cols && p[1] >= 0 && p[1] < view.rows) [chars[p[1] * view.cols + p[0]], colors[p[1] * view.cols + p[0]]] = PLAYER_MARK;
  }
  const occ = new Uint8Array(n);
  if (me.pin || me.moon) {  // first, so it never moves; then paint the blinking block after the draft
    const p = me.moon ? moonSpot(me.draft.length + 1)[0] : project(...me.pin), x = p && p[0] + me.draft.length;
    if (p) stamp(chars, colors, occ, me.draft + ' ', 0, 0, ME_COLOR, 0, 0, p);
    if (p && Math.floor(now / CURSOR_BLINK_MS) % 2 && x >= 0 && x < view.cols && p[1] >= 0 && p[1] < view.rows) {
      chars[p[1] * view.cols + x] = CURSOR_CHAR; colors[p[1] * view.cols + x] = CURSOR_COLOR;
    }
  }
  // messages close together stack in a column (CLUSTER, STACK_MAX), grayer the farther they are from where you
  // stand (cursor, or screen center)
  const placed = [];
  for (const m of [...msgs].sort((a, b) => a.t - b.t)) {
    if (now < m.t) continue;  // incoming ones may start a bit later
    const [p, edge] = m.moon ? moonSpot(m.text.length) : m.mine ? [project(m.lat, m.lon), false] : place(m.lat, m.lon, m.text.length);
    if (p) placed.push({ m, p, edge });
  }
  const clusters = [], [ccx, ccy] = CLUSTER;
  for (const it of placed) {
    if (it.m.mine && (it.m.bad || sendProgress(it.m, now) < 1)) continue;  // still animating: drawn where it is
    const c = clusters.find(c => Math.abs(c.p[0] - it.p[0]) <= ccx && Math.abs(c.p[1] - it.p[1]) <= ccy);
    if (c) c.items.push(it); else clusters.push({ p: it.p, items: [it] });
  }
  for (const c of clusters) {  // one column at the group's first spot: newest on that row, older ones above
    c.items.splice(0, c.items.length - STACK_MAX).forEach(it => it.hidden = true);
    c.items.forEach((it, i) => it.p = [c.p[0], c.p[1] - (c.items.length - 1 - i)]);
  }
  const fp = (me.moon && moonSpot(0)[0]) || (me.pin && project(...me.pin)) || [view.cols / 2, view.rows / 2];
  for (const { m, p, edge, hidden } of placed) {
    if (hidden) continue;
    const k = sendProgress(m, now);  // own messages rise from the cursor in your color, ease-out
    const dy = Math.round(SEND_ROWS * (1 - k) ** 2);
    const dx = m.bad && now - m.t < BAD_SHAKE_MS ? Math.round(Math.sin((now - m.t) / 25)) : 0;  // filtered: shakes no
    const far = Math.hypot((p[0] - fp[0]) / (view.cols / 2), (p[1] - fp[1]) / (view.rows / 2));
    if (!m.heard && !m.mine) { m.heard = true; if (far < BLIP_NEAR && (m.moon ? !edge : onScreen(m.lat, m.lon))) blipSound(Math.log(view.zoom / ZOOM_MIN) / Math.log(zoomMax() / ZOOM_MIN)); }  // new message near you
    let color = m.bad ? BAD_COLOR : k < 1 ? ME_COLOR : edge ? EDGE_COLOR : MSG_FADE.find(([d]) => far < d)[1];
    // dying: letters step down their own dim chain (white -> gray -> dark gray -> gone), a wave from right to left
    let text = visibleText(m, now);
    const decay = ((now - m.t) / 1000 / (m.ttl || MSG_TTL_S) - MSG_DECAY_START) / (1 - MSG_DECAY_START);
    if (!m.bad && decay > 0) {
      const chain = []; for (let c = color; c; c = SHADOW_DIM[c]) chain.push(c);
      const n = text.length, cs = [];
      text = Array.from(text, (c, i) => {
        const local = (decay - (n - 1 - i) / Math.max(1, n - 1) * DECAY_WAVE) / (1 - DECAY_WAVE);
        cs.push(chain[Math.max(0, Math.floor(local * chain.length))]);
        return cs[i] ? c : ' ';
      }).join('');
      color = cs;
    }
    stamp(chars, colors, occ, text, m.lat, m.lon, color, dy, dx, p);
  }
  if (!sentAny) {  // say-hi hint, bottom center
    const h = !me.pin && !me.moon && matchMedia('(pointer: coarse)').matches ? HINT_TOUCH : HINT[me.pin || me.moon ? 1 : 0], y = view.rows - Math.max(1, chat.length) - 3, x0 = Math.floor((view.cols - h.length) / 2);
    for (let i = 0; i < h.length; i++) if (x0 + i >= 0 && x0 + i < view.cols && y >= 0) { chars[y * view.cols + x0 + i] = h[i]; colors[y * view.cols + x0 + i] = HINT_COLOR; }
  }
  {  // global chat, bottom right, always shown: title, then messages (or a placeholder), left-aligned in its box
    const lines = [CHAT_TITLE, ...(chat.length ? chat.map(c => [c.text, c.mine ? ME_COLOR : CHAT_COLOR]) : [[CHAT_EMPTY, CHAT_TITLE[1]]])];
    const w = Math.min(CHAT_W, Math.floor(view.cols / 2), Math.max(...lines.map(l => l[0].length))), x0 = view.cols - w - 1;  // phones: at most half the width
    lines.forEach(([text, color], i) => {
      const y = view.rows - lines.length + i, t = text.slice(0, w);
      for (let k = 0; k < t.length; k++) if (x0 + k >= 0 && y >= 0) { chars[y * view.cols + x0 + k] = t[k]; colors[y * view.cols + x0 + k] = color; }
    });
  }
  if (me.lastInput > 0) dismissTitle(now);  // first interaction
  drawTitle(chars, colors, now);
  screen.innerHTML = toHtml(chars, colors);
  drawBar();
  const ms = performance.now() - t0;
  if (ms > LONG_FRAME_MS && now - lastSlowLog > 5000) { tlog('slowframe', { ms: Math.round(ms), cols: view.cols, rows: view.rows }); lastSlowLog = now; }
}

measure(screen);
centerOnTimezone();
initSound();
startMusic();
addEventListener('resize', () => measure(screen));
bindInput(screen);
requestAnimationFrame(frame);
