#!/usr/bin/env node
// Integration check: real browser storage (IndexedDB, localStorage, Storage API,
// CompressionStream) via headless Microsoft Edge + Chrome DevTools Protocol.
// No dependencies: Node's http server + global WebSocket (Node 22+).
//
//   npm run build && npm run test:integration
//
// Browser path: EDGE_PATH env var, else standard Edge/Chrome install locations.
// Exit code 0 = all checks passed.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TIMEOUT_MS = 30_000;

function fail(msg) {
  console.error(`[integration] ${msg}`);
  process.exitCode = 1;
}

function findBrowser() {
  const candidates = [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    const allowed = [join(ROOT, 'dist') + sep, join(ROOT, 'examples') + sep];
    if (!allowed.some((dir) => file.startsWith(dir)) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function waitFor(fn, what, timeout = TIMEOUT_MS) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();
  #listeners = [];

  static async connect(url) {
    const c = new Cdp();
    c.#ws = new WebSocket(url);
    await new Promise((ok, err) => {
      c.#ws.addEventListener('open', ok, { once: true });
      c.#ws.addEventListener('error', () => err(new Error('CDP websocket error')), { once: true });
    });
    c.#ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id !== undefined) {
        const p = c.#pending.get(msg.id);
        c.#pending.delete(msg.id);
        if (msg.error) p?.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else p?.resolve(msg.result);
      } else {
        for (const l of c.#listeners) l(msg);
      }
    });
    return c;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    this.#ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }

  on(fn) {
    this.#listeners.push(fn);
  }

  close() {
    this.#ws.close();
  }
}

async function runPhase(cdp, base, phase) {
  await cdp.send('Page.navigate', { url: `${base}/examples/browser-check.html?phase=${phase}` });
  const result = await waitFor(async () => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'window.__STATIC_KIT_RESULT && JSON.stringify(window.__STATIC_KIT_RESULT)',
      returnByValue: true,
    });
    return r.result?.value ? JSON.parse(r.result.value) : undefined;
  }, `phase "${phase}" result`);
  console.log(`\n[${phase}]`);
  for (const c of result.checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  return result.ok;
}

async function main() {
  if (typeof WebSocket !== 'function') return fail('Node 22+ is required (global WebSocket).');
  if (!existsSync(join(ROOT, 'dist', 'index.js'))) return fail('dist/ not found. Run `npm run build` first.');
  const browser = findBrowser();
  if (!browser) return fail('Edge/Chrome not found. Set EDGE_PATH to the browser executable.');

  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = mkdtempSync(join(tmpdir(), 'static-kit-cdp-'));
  const proc = spawn(
    browser,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  try {
    console.log(`[integration] browser: ${browser}`);
    const portFile = join(profile, 'DevToolsActivePort');
    const port = await waitFor(async () => existsSync(portFile) && readFileSync(portFile, 'utf8').split('\n')[0], 'DevToolsActivePort');
    const target = await waitFor(async () => {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      return list.find((t) => t.type === 'page');
    }, 'page target');
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    cdp.on((msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        console.error(`[page exception] ${d.exception?.description ?? d.text}`);
      }
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const ok1 = await runPhase(cdp, base, 'write');
    const ok2 = await runPhase(cdp, base, 'verify'); // fresh navigation: storage must persist
    if (ok1 && ok2) console.log('\n[integration] RESULT=OK');
    else fail('RESULT=FAIL');
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  } finally {
    cdp?.close();
    proc.kill();
    server.close();
    await new Promise((r) => setTimeout(r, 500));
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* profile cleanup is best-effort (browser may still hold files briefly) */
    }
  }
}

await main();
