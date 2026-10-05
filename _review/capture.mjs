// Screenshots of the Falakposh prototype through the Chrome DevTools Protocol.
//   node capture.mjs <outDir> [page.html ...] [--dark] [--sections]
// Captures the first screen at desktop (1440x900) and phone (390x844, real mobile emulation),
// and with --sections, a screenshot every viewport-height down the page so scroll moments run.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.argv.slice(2);
const OUT = args[0];
const dark = args.includes('--dark');
const sections = args.includes('--sections');
const only = args.find((a) => a.startsWith('--size='))?.slice(7);
const PAGES = args.slice(1).filter((a) => !a.startsWith('--'));
if (!PAGES.length) PAGES.push('index.html');
const BASE = 'http://127.0.0.1:8190/';
const PORT = 9334;
const SIZES = [['desktop', 1440, 900, false, 1], ['mobile', 390, 844, true, 2]].filter((s) => !only || s[0] === only);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
let running = false;
try { running = !!(await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()); } catch {}
const chrome = running ? null : spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, '..', 'cdp-profile')}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

async function http(path, method = 'GET') {
  for (let i = 0; i < 80; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json(); } catch { await sleep(250); }
  }
  throw new Error('Chrome did not open its debugging port');
}
function connect(url) {
  const ws = new WebSocket(url);
  let id = 0; const pending = new Map(); const waiters = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) for (const w of [...waiters]) if (w.method === m.method) { waiters.splice(waiters.indexOf(w), 1); w.res(m.params); }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener('error', reject);
    ws.addEventListener('open', () => resolve({
      send: (method, params = {}) => { const n = ++id; ws.send(JSON.stringify({ id: n, method, params })); return new Promise((res, rej) => pending.set(n, { res, rej })); },
      once: (method) => new Promise((res) => waiters.push({ method, res })),
      close: () => ws.close(),
    }));
  });
}

await http('/json/version');
const page = await connect((await http('/json/new?about:blank', 'PUT')).webSocketDebuggerUrl);
await page.send('Page.enable');
await page.send('Runtime.enable');
const errors = [];
page.send('Log.enable');
const js = async (expression) => (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] });

for (const file of PAGES) {
  for (const [size, width, height, mobile, scale] of SIZES) {
    const name = `${file.replace(/\.html.*$/, '')}-${size}${dark ? '-dark' : ''}`;
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    const loaded = page.once('Page.loadEventFired');
    await page.send('Page.navigate', { url: `${BASE}${file}${file.includes('?') ? '&' : '?'}t=${Date.now()}` });
    await loaded;
    await js('document.fonts.ready.then(() => true)');
    await sleep(3200);
    const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    writeFileSync(join(OUT, `${name}-0.jpg`), Buffer.from(shot.data, 'base64'));
    if (sections) {
      const h = await js('document.documentElement.scrollHeight');
      let i = 1;
      for (let y = height * 0.9; y < h - 10; y += height * 0.9, i++) {
        await js(`window.scrollTo(0, ${Math.round(y)}); true`);
        await sleep(1400);
        const s = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 78 });
        writeFileSync(join(OUT, `${name}-${i}.jpg`), Buffer.from(s.data, 'base64'));
      }
    }
    console.log('captured', name);
  }
}
page.close();
if (chrome) chrome.kill();
process.exit(0);
