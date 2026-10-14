#!/usr/bin/env node
/*
 * Regression: the desktop window asks the page before it closes or reloads (14 Oct 2026).
 * With autosave, a change still waiting for acknowledgement or an accepted change whose save has
 * not finished must never be lost by closing the window. close_guard.js decides; main.js wires it.
 * Run: node tests/regression_close_guard_20261014.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), EventEmitter = require('events');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' -- ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'close_guard.js'), 'utf8');

function load(src) { const m = { exports: {} }; new Function('module', 'exports', 'require', src)(m, m.exports, require); return m.exports; }
const G = load(SRC);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pageDeps(page, native) {
  const calls = { native: 0, request: 0 };
  return {
    calls,
    deps: {
      probeMs: 50,
      run: (js) => {
        if (js === G.PROBE_JS) return page.probe();
        if (js === G.REQUEST_JS) { calls.request++; return page.request(); }
        return Promise.reject(new Error('unexpected script'));
      },
      askNative: () => { calls.native++; return Promise.resolve(native); }
    }
  };
}

async function decideCases(G, label) {
  const out = {};
  let t = pageDeps({ probe: () => Promise.resolve('yes') }, false);
  out.cleanCloses = (await G.decide(t.deps)) === true && t.calls.request === 0 && t.calls.native === 0;
  t = pageDeps({ probe: () => Promise.resolve('none') }, false);
  out.noGuardCloses = (await G.decide(t.deps)) === true;
  t = pageDeps({ probe: () => Promise.resolve('no'), request: () => Promise.resolve(false) }, true);
  out.pageSaysStay = (await G.decide(t.deps)) === false && t.calls.request === 1 && t.calls.native === 0;
  t = pageDeps({ probe: () => Promise.resolve('no'), request: () => wait(120).then(() => true) }, false);
  out.waitsForPerson = (await G.decide(t.deps)) === true && t.calls.native === 0;
  t = pageDeps({ probe: () => new Promise(() => {}) }, false);
  out.hungAsksNativeStay = (await G.decide(t.deps)) === false && t.calls.native === 1;
  t = pageDeps({ probe: () => new Promise(() => {}) }, true);
  out.hungAsksNativeClose = (await G.decide(t.deps)) === true && t.calls.native === 1;
  t = pageDeps({ probe: () => Promise.reject(new Error('crashed')) }, false);
  out.crashedAsksNative = (await G.decide(t.deps)) === false && t.calls.native === 1;
  t = pageDeps({ probe: () => Promise.resolve('no'), request: () => Promise.resolve('true') }, false);
  out.onlyLiteralTrue = (await G.decide(t.deps)) === false;
  return out;
}

class FakeWC extends EventEmitter { constructor(page) { super(); this.page = page; this.reloads = 0; } executeJavaScript(js) { return js === G.PROBE_JS ? this.page.probe() : this.page.request(); } reload() { this.reloads++; setTimeout(() => this.emit('did-finish-load'), 5); } }
class FakeWin extends EventEmitter {
  constructor(page) { super(); this.webContents = new FakeWC(page); this.closed = 0; this.destroyed = false; }
  isDestroyed() { return this.destroyed; }
  close() { const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; this.emit('close', e); if (!e.defaultPrevented) { this.closed++; this.destroyed = true; } }
}

(async () => {
  console.log('\n[decide] the close decision');
  const d = await decideCases(G);
  check('a page with nothing pending closes at once, without asking', d.cleanCloses);
  check('a page without the guard (gate, lock, older bundle) closes', d.noGuardCloses);
  check('the page says stay: the window stays, no native question', d.pageSaysStay);
  check('the page waits for the person as long as they take', d.waitsForPerson);
  check('a hung page: a native question; Stay keeps the window', d.hungAsksNativeStay);
  check('a hung page: a native question; Close anyway closes', d.hungAsksNativeClose);
  check('a crashed page: the native question, never a silent close', d.crashedAsksNative);
  check('only a literal true from the page closes', d.onlyLiteralTrue);

  console.log('\n[install] wired to a window');
  {
    let release; const page = { probe: () => Promise.resolve('no'), request: () => new Promise((r) => { release = r; }) };
    const w = new FakeWin(page); let approvedCloses = 0;
    G.install(w, { askNative: () => Promise.resolve(false), probeMs: 50, onApprovedClose: () => approvedCloses++ });
    w.close(); await wait(20);
    check('a close while something is pending is held, not done', w.closed === 0);
    w.close(); await wait(20);
    check('a second close while asking does not ask twice', w.closed === 0);
    release(true); await wait(20);
    check('after the page approves, the window closes once', w.closed === 1 && approvedCloses === 1);
  }
  {
    const page = { probe: () => Promise.resolve('no'), request: () => Promise.resolve(false) };
    const w = new FakeWin(page); let stays = 0;
    G.install(w, { askNative: () => Promise.resolve(true), probeMs: 50, onStay: () => stays++ });
    w.close(); await wait(20);
    check('the person chooses Stay: the window stays and quit is called off', w.closed === 0 && stays === 1);
  }
  {
    const page = { probe: () => Promise.resolve('yes') };
    const w = new FakeWin(page); const h = G.install(w, { askNative: () => Promise.resolve(false), probeMs: 50 });
    const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    h.reload(); await wait(20);
    w.webContents.emit('will-prevent-unload', e);
    check('Settings reload asks first and then reloads, it never closes the window', w.webContents.reloads === 1 && w.closed === 0);
    await wait(20);
    check('after the reload finishes, the next close is asked about again', h._state().approved === false);
  }
  {
    const page = { probe: () => Promise.resolve('yes') };
    const w = new FakeWin(page); G.install(w, { askNative: () => Promise.resolve(false), probeMs: 50 });
    w.close(); await wait(20);
    const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    w.webContents.emit('will-prevent-unload', e);
    check('an approved close is not silently cancelled by the page', e.defaultPrevented === true);
  }

  console.log('\n[main.js] the main window uses it');
  const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('main.js requires close_guard.js', /require\('\.\/close_guard\.js'\)/.test(MAIN));
  check('the main window is guarded', /CG\.install\(mainWindow/.test(MAIN));
  check('Settings "apply and reload" goes through the guard', /_mainGuard[\s\S]{0,80}\.reload\(\)/.test(MAIN) && !/slab:applyAndReload[^\n]*mainWindow\.reload\(\)/.test(MAIN));
  check('quit continues after an approved close and is called off on Stay', /before-quit/.test(MAIN) && /_quitting/.test(MAIN));
  check('close_guard.js is packaged', (PKG.build.files || []).indexOf('close_guard.js') >= 0);
  check('no em dash in the new files', !/\u2014/.test(SRC) && !/\u2014/.test(fs.readFileSync(__filename, 'utf8')));

  console.log('\n[mutations] the checks catch a broken guard');
  const mut = async (from, to, key) => { const src = SRC.replace(from, to); if (src === SRC) return 'unchanged'; const M = load(src); const r = await decideCases(M); return r[key]; };
  check('M1 closing without asking the page is caught', (await mut("if (probe === 'yes' || probe === 'none') return true;", 'return true;', 'pageSaysStay')) === false);
  check('M2 a hung page closing silently is caught', (await mut("return !!(await deps.askNative());\n  // probe", "return true;\n  // probe", 'hungAsksNativeStay')) === false);
  check('M3 accepting any truthy answer is caught', (await mut("=== true; }", "? true : false; }", 'onlyLiteralTrue')) === false);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
