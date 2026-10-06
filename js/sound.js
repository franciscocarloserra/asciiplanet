// PC-speaker style sounds: square-wave beeps, plus a filtered-noise whoosh while the planet turns.
import { SOUND_VOL, BLIP_VOL, BLIP_FAR, STEP_VOL, WHOOSH_VOL, WHOOSH_SMOOTH_S, WHOOSH_HZ, WHOOSH_FULL_SPEED, ZOOM_BEEP_MS, MUSIC_VOL, MUSIC_BAR_S, MUSIC_LOOPS } from './params.js';

let ac = null, master, whooshGain, whooshFilter;

// Called at load (context may start suspended) and on every input; browsers only start audio after a gesture.
export function initSound() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new AudioContext();
  master = ac.createGain(); master.gain.value = SOUND_VOL; master.connect(ac.destination);
  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
  whooshFilter = ac.createBiquadFilter(); whooshFilter.type = 'lowpass'; whooshFilter.Q.value = 0.5;
  whooshGain = ac.createGain(); whooshGain.gain.value = 0;
  src.connect(whooshFilter).connect(whooshGain).connect(master); src.start();
}

// notes: [[freq Hz, ms], ...] played back to back
function beep(notes, vol = 1, type = 'square') {
  if (!ac) return;
  let t = ac.currentTime;
  for (const [f, ms] of notes) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol * 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.connect(g).connect(master); o.start(t); o.stop(t + ms / 1000);
    t += ms / 1000;
  }
}

export const sendSound = () => beep([[523, 50], [784, 50], [1047, 90]]);
export const rejectSound = () => beep([[180, 90], [120, 160]]);  // low buzz: message filtered
export const clickSound = () => beep([[1200, 15]]);
export const stepSound = () => beep([[1800, 8]], STEP_VOL);  // tiny haptic-like tick
// k = 0..1 closeness (zoom); far away messages are barely audible
export const blipSound = k => beep([[880 + Math.random() * 440, 40]], BLIP_VOL * (BLIP_FAR + (1 - BLIP_FAR) * k), 'triangle');

let lastZoom = 0;
export function zoomSound(zoomIn) {
  const now = performance.now(); if (now - lastZoom < ZOOM_BEEP_MS) return; lastZoom = now;
  beep([[zoomIn ? 660 : 440, 20], [zoomIn ? 880 : 330, 20]], 0.6);
}

// called every frame with the planet's turn speed (rad/s)
export function whoosh(speed) {
  if (!ac) return;
  const k = Math.min(1, speed / WHOOSH_FULL_SPEED), t = ac.currentTime;
  whooshGain.gain.setTargetAtTime(k * k * WHOOSH_VOL, t, WHOOSH_SMOOTH_S);
  whooshFilter.frequency.setTargetAtTime(WHOOSH_HZ[0] + k * (WHOOSH_HZ[1] - WHOOSH_HZ[0]), t, WHOOSH_SMOOTH_S);
}

// Intro music: slow minor arpeggio loop with a Tristan chord, quiet and filtered. Scheduled at load;
// Browsers keep audio suspended until the first gesture; then it starts from the top and plays through.
const mtof = m => 440 * 2 ** ((m - 69) / 12);
const BARS = [  // [bass, arpeggio notes] in MIDI
  [45, [57, 60, 64, 69]],  // A minor
  [41, [53, 57, 60, 65]],  // F major
  [41, [53, 59, 63, 68]],  // Tristan chord F-B-D#-G#
  [40, [52, 56, 59, 64]],  // E major, pulls back to A minor
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 1];
let music = null;

export function startMusic() {
  if (!ac || music) return;
  music = ac.createGain(); music.gain.value = MUSIC_VOL;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  music.connect(lp).connect(master);
  const tone = (type, f, t, dur, vol) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(music); o.start(t); o.stop(t + dur);
  };
  let t = ac.currentTime + 0.1;
  for (let l = 0; l < MUSIC_LOOPS; l++) for (const [bass, notes] of BARS) {
    tone('triangle', mtof(bass - 12), t, MUSIC_BAR_S * 1.1, 0.5);
    tone('triangle', mtof(bass), t, MUSIC_BAR_S, 0.25);
    const step = MUSIC_BAR_S / ARP.length;
    ARP.forEach((n, i) => tone('square', mtof(notes[n]), t + i * step, step * 0.9, 0.08));
    t += MUSIC_BAR_S;
  }
  // resolve on a held A minor chord
  for (const n of [33, 45, 57, 60, 64]) tone('triangle', mtof(n), t, MUSIC_BAR_S * 1.5, 0.2);
}

