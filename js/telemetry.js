import { LOG_URL } from './params.js';

export const tlog = (type, data) => navigator.sendBeacon(LOG_URL, JSON.stringify({ t: Date.now(), type, ...data }));

addEventListener('error', e => tlog('error', { msg: e.message, src: e.filename, line: e.lineno }));
addEventListener('unhandledrejection', e => tlog('rejection', { msg: String(e.reason) }));
for (const k of ['error', 'warn']) {
  const f = console[k];
  console[k] = (...a) => { tlog(k, { msg: a.join(' ') }); f(...a); };
}
try {
  new PerformanceObserver(l => l.getEntries().forEach(e => tlog('longtask', { ms: Math.round(e.duration) })))
    .observe({ type: 'longtask' });
} catch {}
