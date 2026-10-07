// Open a URL in the running headless Chrome and print the value of a JS expression.
//   node evalpage.mjs <url> "<expression>" [waitMs]
const [url, expr, waitMs = '4000'] = process.argv.slice(2);
const j = async (p, m = 'GET') => (await fetch(`http://127.0.0.1:9334${p}`, { method: m })).json();
const t = await j('/json/new?about:blank', 'PUT');
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, +waitMs));
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result.value ?? r.result, null, 1));
await fetch(`http://127.0.0.1:9334/json/close/${t.id}`).catch(() => {});
process.exit(0);
