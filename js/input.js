// Mouse/keyboard -> view state and the user's draft message.
import { MOON_RADIUS, MOON_HIT, MSG_MAX, TAP_SLOP_PX, ZOOM_MIN, ZOOM_WHEEL, ZOOM_KEY, ARROW_STEP_CHARS, ARROW_FAST, CURSOR_MARGIN, PAGE_STEP, SEND_ROWS } from './params.js';
import { view, project, unproject, zoomMax } from './globe.js';
import { send } from './messages.js';
import { moonAt } from './sky.js';
import { initSound, sendSound, rejectSound, clickSound, zoomSound, stepSound } from './sound.js';

export const me = { pin: null, moon: false, draft: '', lastInput: -1e9 };  // moon: writing on the moon instead of at pin
const touch = () => { me.lastInput = performance.now(); initSound(); };
const center = () => unproject(view.cols * view.cw / 2, view.rows * view.ch / 2);
// key -> [x, y] direction and step in chars; page keys jump like in a text editor (Home/End sideways)
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
const PAGES = { Home: [-1, 0], End: [1, 0], PageUp: [0, 1], PageDown: [0, -1] };
const moveKey = k => ARROWS[k] ? [...ARROWS[k], ARROW_STEP_CHARS, ARROW_STEP_CHARS]
  : PAGES[k] ? [...PAGES[k], view.cols * PAGE_STEP, view.rows * PAGE_STEP] : null;

function rotate(dx, dy) {
  view.lon0 -= dx / view.R;
  view.lat0 = Math.max(-1.5, Math.min(1.5, view.lat0 + dy / view.R));
}

function zoomBy(f) {
  view.zoom = Math.max(ZOOM_MIN, Math.min(zoomMax(), view.zoom * f));
  zoomSound(f > 1);
}

// arrows move the cursor over the planet; near the screen edge (CURSOR_MARGIN) or the globe's rim the planet turns under it instead
function moveCursor(ax, ay, sx, sy) {
  me.moon = false;
  const p = me.pin && project(...me.pin);
  if (p) {
    const x = p[0] + ax * sx, y = p[1] - ay * sy;
    const [mx, my] = CURSOR_MARGIN;
    const q = x >= mx && x < view.cols - mx && y >= my && y < view.rows - my && unproject(x * view.cw, y * view.ch);
    if (q) { me.pin = q; return; }
    rotate(-ax * sx * view.cw, ay * sy * view.ch);
    me.pin = unproject(p[0] * view.cw, p[1] * view.ch) || center();
  } else { rotate(-ax * sx * view.cw, ay * sy * view.ch); me.pin = center(); }
}

const kbd = document.getElementById('kbd');
const ALLOWED = /[^a-zA-Z0-9!?.,: ]/g;
export const setDraft = s => { me.draft = s; if (kbd.value !== s) kbd.value = s; };  // the phone keyboard field mirrors the draft

function enter() {  // send: message settles SEND_ROWS above the cursor, cursor stays put
  const ok = !me.draft.trim() ? null : me.moon ? send(me.draft.trim(), 0, 0, true) : send(me.draft.trim(), me.pin[0] + SEND_ROWS * view.ch / view.R, me.pin[1]);
  if (ok !== null) (ok ? sendSound : rejectSound)();
  setDraft('');
}

export function bindInput(el) {
  const ptrs = new Map();  // active pointers: one drags, two pinch
  let pinch = 0, moved = 0;
  const spread = () => { const [a, b] = ptrs.values(); return Math.hypot(a.x - b.x, a.y - b.y); };
  el.addEventListener('pointerdown', e => {  // the cursor jumps to where you grab, then rides the planet under the pointer
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture(e.pointerId); touch();
    if (ptrs.size === 2) { pinch = spread(); return; }
    moved = 0;
    // the moon only counts where the planet doesn't cover it
    const onMoon = moonAt && !unproject(e.clientX, e.clientY) && Math.hypot(e.clientX / view.cw - moonAt[0], (e.clientY / view.ch - moonAt[1]) * view.ch / view.cw) <= MOON_RADIUS + MOON_HIT;
    const p = !onMoon && unproject(e.clientX, e.clientY);
    if (onMoon) { me.moon = true; me.pin = null; clickSound(); } else if (p) { me.moon = false; me.pin = p; clickSound(); }
  });
  el.addEventListener('pointermove', e => {
    const d = ptrs.get(e.pointerId); if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY; moved += Math.hypot(dx, dy);
    if (ptrs.size === 2) { const s = spread(); if (pinch && s) view.zoom = Math.max(ZOOM_MIN, Math.min(zoomMax(), view.zoom * s / pinch)); pinch = s; }
    else rotate(dx, dy);
    touch();
  });
  const up = e => {
    if (!ptrs.delete(e.pointerId)) return;
    // a touch tap opens the phone keyboard (focus has to happen inside the gesture)
    if (e.type === 'pointerup' && e.pointerType === 'touch' && !ptrs.size && moved < TAP_SLOP_PX && (me.pin || me.moon)) kbd.focus();
    if (ptrs.size < 2) pinch = 0;
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  // phone keyboards often send no usable keydown (key 'Unidentified'), so the field's value is the source of truth
  kbd.addEventListener('input', () => { touch(); setDraft(kbd.value.replace(ALLOWED, '').slice(0, MSG_MAX)); });
  addEventListener('wheel', e => {
    zoomBy(Math.exp(-e.deltaY * ZOOM_WHEEL));
    touch();
  }, { passive: true });
  addEventListener('keydown', e => {
    const fast = e.ctrlKey && ARROWS[e.key];  // Ctrl+arrow = bigger steps
    if ((e.ctrlKey && !fast) || e.metaKey || e.altKey) return;
    touch();
    if (e.key === 'Escape') { setDraft(''); me.pin = null; me.moon = false; kbd.blur(); return; }
    if (e.target === kbd && e.key !== 'Enter') return;  // typed text arrives through the input event
    const mv = moveKey(e.key);
    if (mv) { const [ax, ay, sx, sy] = mv, f = fast ? ARROW_FAST : 1; moveCursor(ax, ay, sx * f, sy * f); stepSound(); e.preventDefault(); return; }
    if ((e.key === '+' || e.key === '-') && !me.draft) { zoomBy(e.key === '+' ? ZOOM_KEY : 1 / ZOOM_KEY); e.preventDefault(); return; }
    if (!me.pin && !me.moon) me.pin = center();
    if (!me.pin && !me.moon) return;
    if (e.key === 'Enter') enter();
    else if (e.key === 'Backspace') setDraft(me.draft.slice(0, -1));
    else if (/^[a-z0-9!?.,: ]$/i.test(e.key) && me.draft.length < MSG_MAX) setDraft(me.draft + e.key);
    else return;
    e.preventDefault();
  });
}
