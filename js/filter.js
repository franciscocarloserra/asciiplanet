// Curse word filter, shared by the page and relay.js. Text goes through the same normalization as the list in
// make_curses.py (accents and leetspeak undone, punctuation to spaces, repeated letters collapsed), then one regex:
// INFIX curses match anywhere ("asdfuckasd"), WHOLE ones only as whole words. Single letters split by spaces or dots
// ("p u t a", "f.u.c.k") are joined and checked for any curse.
import { INFIX, WHOLE } from '../data/curses.js';

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[013457@$]/g, c => LEET[c])
  .replace(/[^a-z]+/g, ' ').replace(/(.)\1+/g, '$1').trim();
const RE = new RegExp(`${INFIX.join('|')}|(?<![a-z])(?:${WHOLE.join('|')})(?![a-z])`);
const ANY = new RegExp([...INFIX, ...WHOLE].join('|'));  // inside a run of spaced letters any curse counts
const runs = s => (s.match(/\b[a-z](?: [a-z]\b)+/g) || []).map(r => r.replace(/ /g, ''));

export const isBlocked = text => { const t = norm(text); return RE.test(t) || runs(t).some(r => ANY.test(r)); };
