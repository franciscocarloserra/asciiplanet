// Ephemeral message store, synced through relay.js.
import { CHAT_LINES, MSG_TTL_S, BAD_CRUMBLE_START, WS_URL, WS_IDLE_S, POS_SEND_MS, MSG_PER_MIN, TYPE_CPS, DOT_TTL_FRAC, SEND_MS, BAD_TTL_S, INTRO_QUIET_S, INTRO_RAMP_S, MSG_JITTER_S } from './params.js';
import { isBlocked } from './filter.js';

export const msgs = [];
export let sentAny = false;  // hides the say-hi hint
export const chat = [];      // { text, mine } for the global chat box, last CHAT_LINES
const toChat = (text, mine) => { chat.push({ text, mine }); if (chat.length > CHAT_LINES) chat.shift(); };
export const players = [];   // [lat, lon] of others' pins, from the relay
let lastPos, lastPosT = -1e9;  // what we last sent, to skip ourselves and repeats
let ws = null, sends = [], asleep = false, lastActive = performance.now();
const online = () => ws && ws.readyState === WebSocket.OPEN;
let failed = false;  // last attempt closed on its own (we keep retrying every 2 s)
// for the status bar: [text, EGA color]
export const connStatus = () => online() ? ['ONLINE', 10] : asleep ? ['IDLE', 8] : failed ? ['FAILED TO CONNECT', 12] : ['CONNECTING', 14];

function connect() {
  ws = new WebSocket(WS_URL); lastPos = undefined;
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (Array.isArray(m?.players)) {
      players.length = 0;
      for (const p of m.players.slice(0, 200))
        if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && String(p) !== String(lastPos)) players.push(p);
      return;
    }
    if (Array.isArray(m?.history)) {  // relay's recent messages, on connect
      chat.length = 0;
      for (const t of m.history.slice(-CHAT_LINES)) if (typeof t === 'string' && /^[a-zA-Z0-9!?.,: ]{1,100}$/.test(t)) toChat(t, false);
      return;
    }
    if (typeof m.text !== 'string' || !/^[a-zA-Z0-9!?.,: ]{1,100}$/.test(m.text) || !isFinite(m.lat) || !isFinite(m.lon)) return;
    toChat(m.text, false);  // the chat gets everything, even what the intro holds back
    const age = performance.now() / 1000;
    if (Math.random() > (age - INTRO_QUIET_S) / INTRO_RAMP_S) return;  // intro: quiet at first, then ramps up
    msgs.push({ ...make(m.text, m.lat, m.lon), moon: m.moon === true, t: performance.now() + Math.random() * MSG_JITTER_S * 1000 });
  };
  ws.onopen = () => { failed = false; };
  ws.onclose = () => { players.length = 0; failed = !asleep; if (!asleep) setTimeout(connect, 2000); };
}
connect();

// idle tabs drop their socket after WS_IDLE_S without input and reconnect on the next one
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel'])
  addEventListener(ev, () => { lastActive = performance.now(); if (asleep) { asleep = false; connect(); } }, { passive: true });
setInterval(() => {
  if (!asleep && performance.now() - lastActive > WS_IDLE_S * 1000) { asleep = true; ws.close(); }
}, 1000);

// tell the relay where our pin is (rounded like relay.js does, so we can spot ourselves in the list)
export function syncPos(pin, now) {
  const pos = pin && pin.map(v => Math.round(v * 1000) / 1000);
  if (!online() || now - lastPosT < POS_SEND_MS || String(pos) === String(lastPos)) return;
  lastPos = pos; lastPosT = now; ws.send(JSON.stringify({ pos }));
}

// own message: already typed, so no type-in; it plays the send animation instead.
// Curse words and messages over the rate limit never leave the page: the message shakes and crumbles fast. Returns false then.
export function send(text, lat, lon, moon = false) {
  const now = performance.now(); sends = sends.filter(t => now - t < 60000);
  const limited = !localStorage.unlimited && (sends.length >= MSG_PER_MIN || now - (sends.at(-1) || -1e9) < 1000);  // unlimited: only for IPs the relay allows, else it ignores the extras
  if (isBlocked(text) || limited) { msgs.push({ ...make(text, lat, lon), mine: true, moon, bad: true, ttl: BAD_TTL_S }); return false; }
  sends.push(now); sentAny = true; toChat(text, true);
  msgs.push({ ...make(text, lat, lon), mine: true, moon });
  if (online()) ws.send(JSON.stringify(moon ? { text, lat, lon, moon } : { text, lat, lon }));
  return true;
}

function make(text, lat, lon) {
  // each letter gets a random moment to drop out; only filtered messages crumble, the rest dim (main.js)
  const drop = Array.from(text, () => BAD_CRUMBLE_START + Math.random() * (1 - BAD_CRUMBLE_START));
  return { text, lat, lon, t: performance.now(), drop };
}

// text as it should look now: types in with a '_' head; filtered ones crumble to '.' then vanish
export function visibleText(m, now) {
  const age = (now - m.t) / 1000 / (m.ttl || MSG_TTL_S), typed = m.mine ? Infinity : (now - m.t) / 1000 * TYPE_CPS;
  return Array.from(m.text, (c, i) =>
    i > typed ? ' ' : i > typed - 1 ? '_' : !m.bad || age < m.drop[i] ? c : age < m.drop[i] + DOT_TTL_FRAC ? '.' : ' ').join('');
}

// send animation progress, 0 -> 1 (1 when done or not an own message)
export const sendProgress = (m, now) => m.mine && !m.bad ? Math.min(1, (now - m.t) / SEND_MS) : 1;

export function expire(now) {
  for (let i = msgs.length; i--;) if (now - msgs[i].t > (msgs[i].ttl || MSG_TTL_S) * 1000) msgs.splice(i, 1);
}
