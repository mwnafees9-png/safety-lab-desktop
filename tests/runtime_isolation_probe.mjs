// SEC-8 (S25), 18 Oct 2026: prove contextIsolation in a RUNNING shell, not only in main.js's source.
// Starts the packaged app (dist/mac-arm64 by default, or SLAB_APP=<path to the executable>) with Playwright's
// Electron driver and checks, in every window the app opens:
//   - the main process says the window was created with contextIsolation on, nodeIntegration off;
//   - page code (the main world) cannot reach require, process, Buffer or Electron's ipcRenderer;
//   - the bridge the preload exposes is the only door, and it is frozen (the page cannot swap its functions).
// Run: NODE_PATH=~/dev/.node-tools/node_modules node tests/runtime_isolation_probe.mjs
// Not part of the desktop wall: it needs a built app and a display. Its result is recorded in OPEN_ITEMS.md.
// 18 Oct 2026 (SEC-10): a build with its fuses set refuses --inspect, which Playwright's Electron driver needs. Such a
// build is probed over the Chrome DevTools port instead (SLAB_CDP=1, automatic when the fuse is off): the page-side
// checks run unchanged; the main process cannot be asked for its window settings that way, so those two checks run
// against the source (SLAB_APP_DIR), where main.js is the same file.
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { _electron, chromium } = require(process.env.NODE_PATH ? path.join(process.env.NODE_PATH, 'playwright') : 'playwright');
import cp from 'child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
const exe = process.env.SLAB_APP || path.join(here, '..', 'dist', 'mac-arm64', 'Safety Lab Aero.app', 'Contents', 'MacOS', 'Safety Lab Aero');
if (!fs.existsSync(exe)) { console.log('No built app at ' + exe + '. Build it first (./release.sh).'); process.exit(2); }
// The doors the preloads open, read from their source (named bridges) and from shell_rules.overridesFor (the settings
// handed to the page): only these are the preloads'; the web app's own globals are not bridges.
const BRIDGES = new Set();
for (const f of ['preload-app.js', 'preload-gate.js', 'preload-settings.js']) for (const m of fs.readFileSync(path.join(here, '..', f), 'utf8').matchAll(/exposeInMainWorld\('([A-Za-z_$]+)'/g)) BRIDGES.add(m[1]);
{ const R = require(path.join(here, '..', 'shell_rules.js')); for (const c of [{ backend: 'safetylab', ai: 'safetylab' }, { backend: 'own', ai: 'own' }]) try { for (const k of Object.keys(R.overridesFor(c, null, '0'))) BRIDGES.add(k); } catch (e) {} }
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
// a throwaway profile, so the probe never touches the person's own settings or licence
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-probe-'));
// SLAB_PROFILE_SEED=<a profile folder>: start from a COPY of it (licence and settings), so the app opens its main window;
// the original is never opened or changed
if (process.env.SLAB_PROFILE_SEED) for (const f of ['config.json', 'activation.json', 'Local Storage', 'IndexedDB', 'Preferences', 'Cookies'])
  { const src = path.join(process.env.SLAB_PROFILE_SEED, f); if (fs.existsSync(src)) fs.cpSync(src, path.join(profile, f), { recursive: true }); }
// SLAB_APP_DIR=<desktop source folder>: run the unpackaged source with Electron instead (the mutation proof uses it)
let CDP = process.env.SLAB_CDP === '1';
if (!CDP && !process.env.SLAB_APP_DIR) {
  try {
    const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
    CDP = (await getCurrentFuseWire(exe))[FuseV1Options.EnableNodeCliInspectArguments] === 48;   // 48 = disabled
  } catch (e) {}
}
let app, child, browser;
if (CDP) {
  child = cp.spawn(exe, ['--user-data-dir=' + profile, '--remote-debugging-port=0'], { stdio: 'ignore', env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' } });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 120 && !fs.existsSync(portFile); i++) await new Promise(r => setTimeout(r, 250));
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  console.log('  note  fused build: probed over the DevTools port; the window settings checks run on the source (SLAB_APP_DIR)');
} else {
  app = await _electron.launch({ executablePath: exe, args: [...(process.env.SLAB_APP_DIR ? [process.env.SLAB_APP_DIR] : []), '--user-data-dir=' + profile], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' }, timeout: 60000 });
}
const windows = () => CDP ? browser.contexts().flatMap(c => c.pages()) : app.windows();
try {
  if (CDP) { for (let i = 0; i < 120 && !windows().length; i++) await new Promise(r => setTimeout(r, 250)); await new Promise(r => setTimeout(r, 4000)); }
  else { await app.firstWindow({ timeout: 60000 }); await new Promise(r => setTimeout(r, 2500)); }
  check('the running app opened at least one window', windows().length >= 1);
  if (!CDP) {
  // what the main process says about every window it made
  const prefs = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => {
    const p = w.webContents.getLastWebPreferences ? w.webContents.getLastWebPreferences() : {};
    return { url: w.webContents.getURL(), contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox, preload: p.preload ? path.basename(p.preload) : '' };
  }));
  for (const w of prefs) {
    const name = (w.url.split('/').pop() || w.url).split('?')[0] + ' (' + w.preload + ')';
    check(name + ': created with contextIsolation on', w.contextIsolation === true, JSON.stringify(w));
    check(name + ': created with nodeIntegration off', w.nodeIntegration === false || w.nodeIntegration === undefined, JSON.stringify(w));
  }
  }
  for (const page of windows()) {
    const url = page.url(), name = (url.split('/').pop() || url).split('?')[0];
    const r = await page.evaluate(names => {
      const bridges = names.filter(k => k in window && window[k] && typeof window[k] === 'object');
      const frozen = bridges.map(k => { const o = window[k]; const before = Object.keys(o).map(f => o[f]); let swapped = false; try { for (const f of Object.keys(o)) { o[f] = 'x'; if (o[f] === 'x') swapped = true; } } catch (e) {} const same = Object.keys(o).every((f, i) => o[f] === before[i]); return { k, frozen: !swapped && same, keys: Object.keys(o).length }; });
      return { require: typeof window.require, process: typeof window.process, buffer: typeof window.Buffer, module: typeof window.module,
        ipc: (() => { try { return typeof window.require === 'function' && !!window.require('electron').ipcRenderer; } catch (e) { return false; } })(),
        electronGlobal: typeof window.electron, bridges: frozen };
    }, [...BRIDGES]);
    check(name + ': page code cannot reach require, process, Buffer or module', r.require === 'undefined' && r.process === 'undefined' && r.buffer === 'undefined' && r.module === 'undefined', JSON.stringify(r));
    check(name + ': page code cannot reach Electron ipcRenderer', r.ipc === false, JSON.stringify(r));
    check(name + ': every bridge the preload exposes is frozen (the page cannot swap its functions)', r.bridges.every(b => b.frozen), JSON.stringify(r.bridges));
    console.log('        bridges in ' + name + ': ' + (r.bridges.map(b => b.k + ' (' + b.keys + ' functions)').join(', ') || 'none'));
  }
} catch (e) {
  check('the probe ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 6).join(' '));
} finally {
  if (app) await app.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (child) { try { child.kill('SIGKILL'); } catch (e) {} }
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
