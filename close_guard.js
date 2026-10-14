'use strict';
// ============================================================================
// close_guard.js: the desktop window's close and reload decision (14 Oct 2026).
//
// WHY. With autosave (web save_state.js, 13 Oct), an accepted change is saved the moment it is
// acknowledged. Two things can still be pending when the window closes: a change still waiting
// for acknowledgement (or collected moves), and an accepted change whose save has not finished.
// The page knows both and asks about them through window.__slabRequestClose(), which resolves
// true when it is safe to close. Before this module the main process never asked: Electron
// silently cancelled the close when the page's beforeunload objected, and the page then had to
// close the window itself, which also turned a Settings "apply and reload" into a window close.
//
// THE RULE (pure, so it is tested without Electron):
//   1. Ask the page window.__slabCanClose() (answers at once). If true, close.
//   2. If the page does not answer within PROBE_MS (hung, still loading, crashed), the main
//      process asks natively: "Close anyway" or "Stay". Nothing is ever lost silently, and a
//      hung page can still be closed.
//   3. If the page says no, call window.__slabRequestClose() and wait as long as the person
//      takes (it shows the acknowledgement and "Not saved yet" dialogs). Close only on true.
//   4. A page without these functions (gate, lock screen, older bundle) closes normally.
//   5. One question at a time: a second close while asking is ignored.
// The same decision guards reload (Settings "apply and reload").
// ============================================================================
const PROBE_MS = 3000;

const PROBE_JS = "(typeof window.__slabCanClose === 'function') ? (window.__slabCanClose() ? 'yes' : 'no') : 'none'";
const REQUEST_JS = "(typeof window.__slabRequestClose === 'function') ? window.__slabRequestClose() : true";

function withTimeout(p, ms, onTimeout) {
  let t;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(t)),
    new Promise((resolve) => { t = setTimeout(() => resolve(onTimeout), ms); })
  ]);
}

// deps: { run(js) -> Promise<any>, askNative() -> Promise<boolean>, probeMs? }
// Resolves true when the window may close (or reload), false to stay.
async function decide(deps) {
  const ms = deps.probeMs || PROBE_MS;
  let probe;
  try { probe = await withTimeout(deps.run(PROBE_JS), ms, 'timeout'); }
  catch (_) { probe = 'error'; }
  if (probe === 'yes' || probe === 'none') return true;
  if (probe === 'timeout' || probe === 'error') return !!(await deps.askNative());
  // probe === 'no': the page asks the person; wait as long as they take
  try { return (await deps.run(REQUEST_JS)) === true; }
  catch (_) { return !!(await deps.askNative()); }
}

// Wires one BrowserWindow. getQuitting/onApprovedQuit let app quit continue after approval.
function install(win, opts) {
  opts = opts || {};
  let approved = false, asking = false;
  const deps = {
    run: (js) => win.webContents.executeJavaScript(js, true),
    askNative: opts.askNative,
    probeMs: opts.probeMs
  };
  function guard(then) {
    if (asking) return;
    asking = true;
    decide(deps).then((ok) => {
      asking = false;
      if (ok) then(); else if (opts.onStay) opts.onStay();
    }, () => { asking = false; });
  }
  win.on('close', (e) => {
    if (approved || win.isDestroyed()) return;
    e.preventDefault();
    guard(() => { approved = true; win.close(); if (opts.onApprovedClose) opts.onApprovedClose(); });
  });
  // The page's own beforeunload must never silently cancel a close or reload we approved.
  win.webContents.on('will-prevent-unload', (e) => { if (approved) e.preventDefault(); });
  return {
    reload() {
      guard(() => { approved = true; win.webContents.reload(); win.webContents.once('did-finish-load', () => { approved = false; }); });
    },
    _state: () => ({ approved, asking })
  };
}

module.exports = { decide, install, PROBE_MS, PROBE_JS, REQUEST_JS };
