// One screenshot of any URL through an already-running headless Chrome (port 9334).
//   node shot.mjs <url> <out.png> [width] [height] [scale] [--full] [--dark]
import { writeFileSync } from 'node:fs';
const [url, out, w = '1300', h = '900', s = '1'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const full = process.argv.includes('--full');
const dark = process.argv.includes('--dark');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:9334${p}`, { method: m })).json();
const target = await j('/json/new?about:blank', 'PUT');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const wait = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  else if (m.method) for (const x of [...wait]) if (x.m === m.method) { wait.splice(wait.indexOf(x), 1); x.r(m.params); }
});
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const once = (m) => new Promise((r) => wait.push({ m, r }));
await send('Page.enable');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +s, mobile: +w < 600 });
const loaded = once('Page.loadEventFired');
await send('Page.navigate', { url });
await loaded;
await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>true)', awaitPromise: true });
await sleep(+(process.argv.find((a) => a.startsWith('--wait='))?.slice(7) || 2500));
let clip;
if (full) {
  const r = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
  clip = { x: 0, y: 0, width: +w, height: r.result.value, scale: 1 };
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
await fetch(`http://127.0.0.1:9334/json/close/${target.id}`).catch(() => {});
console.log('saved', out);
process.exit(0);
