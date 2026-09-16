// Safety Lab Aero — Electron main process. REBUILT 6 Sep 2026 (desktop parity, "works like Office").
//
// The shell does FOUR things and nothing else:
//   1. GATE — the app window opens only after a signed LICENSE FILE verifies (the SAME verifier
//      the web app ships, app/slab_license.js, loaded here in Node) and the EULA + License
//      Agreement are accepted. No profile step: identity comes from the real sign-in inside the
//      app, exactly as on the web. An optional local passcode is a SCREEN LOCK, not an identity.
//   2. CONFIG — hands the web bundle its backend/AI/web addresses and the license through the
//      ONE config surface (window.__SLAB_* overrides read by app/slab_config.js). It never seeds
//      a tier, a token, or a name: the license and the sign-in decide those.
//   3. EGRESS — enforces at the network layer what slab_config.js decides at boot: the app
//      window may only reach the hosts its configuration names. A customer install cannot
//      contact Safety Lab even if a script tried (Waqas: "not on our cloud, at any point").
//   4. LINKS — registers safetylab:// so "Open in desktop" from the web and the SSO return
//      address work; offers "Open on the web" for the current cloud project.
//
// What is GONE from the previous shell (deleted, not disabled): license.js (a second, older
// license format with its own key), the seeded 'Desktop User'/'desktop@local' identity, the
// seeded 'pro-plus' tier + 'desktop-local' token, the profile step, DevTools in packaged builds.
//
// SECURITY NOTE: the app window still runs with contextIsolation:false because the bundle is
// ~230 classic scripts sharing window globals and the preload must set window.__SLAB_* before
// they run. It loads only our own first-party bundle from disk; the egress allowlist below
// bounds what that bundle can reach. Gate/lock/settings windows are isolated.

'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session, safeStorage } = require('electron');
const secrets = require('./secrets.js');
const bridgeMain = require('./bridge_main.js');
secrets.init(app, safeStorage);
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const R = require('./shell_rules.js');   // the pure rules (egress, config sanity, overrides, verifier loader, deep links)

const WEBSITE = 'https://safetylabaero.com';
const HOSTED_WEB_APP = 'https://safetylabaero.com/app';
const PROTOCOL = 'safetylab';

// ---- V8 heap ceiling (measured engineering — kept verbatim in spirit from the 7 Aug work) ----
// Sized from real system memory, applied before the app becomes ready (a js-flags switch set after ready
// is silently ignored). Capped at 4096 because Chromium builds V8 with pointer compression, which
// reserves a ~4 GB heap cage — asking for more than the cage buys nothing. The GRANTED ceiling is
// MEASURED in the renderer (reportHeapCeiling) rather than assumed. SLAB_HEAP_MB=<n> overrides, 0 skips.
//
// CORRECTION, recorded so a false measured claim never outlives the truth: the 4096 cap is
// PRECAUTIONARY, NOT a measured failure threshold. The 7 Aug `Electron exited with signal SIGKILL`
// on launch was macOS XProtect blocking the Electron binary ("Malware Blocked"), NOT this switch —
// the bisect (SLAB_HEAP_MB=0) failed identically. Do not read 4096 as a crash boundary.
const HEAP_ENV = process.env.SLAB_HEAP_MB;
const HEAP_MB = HEAP_ENV != null && HEAP_ENV !== ''
  ? Math.max(0, parseInt(HEAP_ENV, 10) || 0)
  : Math.max(2048, Math.min(4096, Math.floor((os.totalmem() / 1048576) * 0.6)));
// ---- V8 call-stack size — THE one thing a browser tab cannot do, and the whole desktop scale story.
// Measured 7 Aug: memory is NOT the wall on a large tree (peak heap at 2,000,000 basic events was
// ~1.4 GB of the ~4 GB cage). STACK DEPTH is: the fault-tree walk and the BDD apply are recursive,
// so at V8's default (~1 MB) a tree of roughly 400,000 basic events dies with `RangeError: Maximum
// call stack size exceeded`. A 4000 KB stack cleared it and carried 2,000,000 events /
// ~3,000,000 canvas nodes to an exact answer. This single flag IS the browser-vs-desktop ceiling
// gap the scalability assessment quotes (~300,000 events in a browser tab against >= 2,000,000 on
// the desktop) — a browser tab cannot set it, so it cannot close that gap by any means.
// SLAB_STACK_KB=<n> overrides, 0 skips.
const STACK_ENV = process.env.SLAB_STACK_KB;
const STACK_KB = STACK_ENV != null && STACK_ENV !== '' ? Math.max(0, parseInt(STACK_ENV, 10) || 0) : 4000;
// ONE js-flags switch (appendSwitch twice REPLACES, it does not concatenate).
const JS_FLAGS = [];
if (HEAP_MB > 0) JS_FLAGS.push('--max-old-space-size=' + HEAP_MB);
if (STACK_KB > 0) JS_FLAGS.push('--stack-size=' + STACK_KB);
if (JS_FLAGS.length) app.commandLine.appendSwitch('js-flags', JS_FLAGS.join(' '));
console.log('[slab] js-flags → ' + (JS_FLAGS.join(' ') || '(none)'));

function reportHeapCeiling(win) {
  if (!win || !win.webContents) return;
  win.webContents.executeJavaScript('(function(){try{var m=performance&&performance.memory;return m?Math.round(m.jsHeapSizeLimit/1048576):null;}catch(e){return null;}})()')
    .then(function (mb) { console.log('[slab] heap ceiling — requested ' + HEAP_MB + ' MB, renderer reports ' + (mb == null ? 'unknown' : mb + ' MB') + ' · stack ' + (STACK_KB > 0 ? STACK_KB + ' KB' : 'V8 default') + ' · RAM ' + Math.round(os.totalmem() / 1073741824) + ' GB'); })
    .catch(function () {});
}

// ---- paths + config ----------------------------------------------------------------------
function configPath() { return path.join(app.getPath('userData'), 'config.json'); }
function activationPath() { return path.join(app.getPath('userData'), 'activation.json'); }

// The desktop's THREE backend cases map onto the web's config modes:
//   'safetylab' → Safety Lab's demo cloud (TRIAL / demo / internal ONLY; the trial license is bound to it)
//   'own'       → the customer's own server (mode self-hosted; the leak check applies)
//   'files'     → files only, no backend at all (mode browser-only)
const DEFAULT_CONFIG = {
  backend: 'safetylab',      // 'safetylab' | 'own' | 'files'
  backendUrl: '',            // own: https://<their supabase host>
  backendKey: '',            // own: that server's publishable (anon) key
  ai: 'safetylab',           // 'safetylab' | 'own' | 'off'   (own = the customer's AI endpoint: Claude/Bedrock, Azure or their own LLM behind the packaged proxy)
  aiEndpoint: '',            // own: https://<their AI proxy>/v1/ai
  webAppUrl: '',             // own: where "Open on the web" goes (blank = hidden); safetylab: our site
  passcodeHash: null         // optional screen lock (scrypt salt:hash)
};
function readConfig() {
  try { return Object.assign({}, DEFAULT_CONFIG, JSON.parse(fs.readFileSync(configPath(), 'utf8'))); }
  catch (_) { return Object.assign({}, DEFAULT_CONFIG); }
}
function writeConfig(c) {
  try { fs.mkdirSync(path.dirname(configPath()), { recursive: true }); fs.writeFileSync(configPath(), JSON.stringify(c, null, 2), 'utf8'); }
  catch (e) { console.error('[slab] config write failed:', e); }
}
// activation.json: { license: <blob>, acceptances: {eula:{version,at}, license:{version,at}}, maxIssuedSeen, activatedAt }
function loadActivation() { try { return JSON.parse(fs.readFileSync(activationPath(), 'utf8')) || {}; } catch (_) { return {}; } }
function saveActivation(a) {
  try { fs.mkdirSync(path.dirname(activationPath()), { recursive: true }); fs.writeFileSync(activationPath(), JSON.stringify(a, null, 2), 'utf8'); }
  catch (e) { console.error('[slab] activation write failed:', e); }
}

// ---- agreement -------------------------------------------------------------------------
// ONE agreement since 15 Sep 2026: SL-LICENSE-0001 was withdrawn and folded into SL-EULA-0004.
// agreements/eula.html + eula.version are GENERATED from safety-lab-deploy/legal/SL-EULA-0004.html
// by legal/build_agreement.mjs (pull-web.sh re-runs it on every sync) -- never hand-edit them.
// A missing file yields a sentinel version that can never match a recorded acceptance, so the app
// fails CLOSED into onboarding rather than silently treating an unread agreement as accepted.
function readAgreement(name, def) { try { return fs.readFileSync(path.join(__dirname, 'agreements', name), 'utf8'); } catch (_) { return def || ''; } }
const AGREEMENTS = {
  eulaVersion: (readAgreement('eula.version', 'SL-EULA-UNAVAILABLE') || 'SL-EULA-UNAVAILABLE').trim(),
  eulaHtml: readAgreement('eula.html', '<p>Agreement text unavailable. Please reinstall Safety Lab Aero.</p>')
};

// ---- the ONE license verifier: app/slab_license.js, loaded in Node (see shell_rules.loadVerifier) ----
let _verifier = null;
function verifier() { if (!_verifier) _verifier = R.loadVerifier(path.join(__dirname, 'app')); return _verifier; }
// Verify the stored (or a candidate) license against THIS install's backend. Email/tenant are
// checked again by the app at sign-in (auth_gate → SLLicenseCheckIdentity); here we bind to the
// backend and the clock only.
async function verifyLicense(blob, cfg) {
  const a = loadActivation();
  return R.verifyLicenseBlob(verifier(), blob, cfg || readConfig(), a.maxIssuedSeen);
}
function licenseSummary(r) {
  if (!r || !r.valid) return null;
  return { customer: r.customer, tier: r.tier, seats: r.seats, trial: !!r.trial, daysLeft: r.daysLeft, expiresAt: r.expiresAt, id: r.id, bind: r.bind };
}

// ---- passcode (optional screen lock) --------------------------------------------------------
function hashPasscode(pw) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(String(pw), salt, 32); return salt.toString('hex') + ':' + h.toString('hex'); }
function verifyPasscode(pw, stored) {
  try { const [s, h] = String(stored).split(':'); const calc = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 32); return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex')); }
  catch (_) { return false; }
}

// ---- egress allowlist + config sanity: shell_rules.js (pure, executed by the desktop test wall) ----
const { allowedHosts, egressAllowed, configProblem, backendHostFor, hostOf } = R;

// ---- window state -------------------------------------------------------------------------
let mainWindow = null, settingsWindow = null, gateWindow = null, currentProjectPath = null;
let _pendingDeepLink = null;

// ---- startup routing ----------------------------------------------------------------------
async function activationStatus() {
  const a = loadActivation(), cfg = readConfig();
  const lic = a.license ? await verifyLicense(a.license, cfg) : { valid: false, reason: 'no license', plain: 'No license has been loaded on this computer yet.' };
  const okEula = a.acceptances && a.acceptances.eula && a.acceptances.eula.version === AGREEMENTS.eulaVersion;
  if (lic.valid && okEula) return { state: cfg.passcodeHash ? 'lock' : 'app', a, lic, cfg };
  return { state: 'onboard', a, lic, cfg };
}
async function routeStartup() {
  if (mainWindow) { mainWindow.focus(); return; }
  const s = await activationStatus();
  if (s.state === 'app') openMainApp();
  else if (s.state === 'lock') openLock();
  else openOnboarding();
}

// ---- gate windows (isolated) ----------------------------------------------------------------
function createGateWindow(file, w, h) {
  buildGateMenu();
  const win = new BrowserWindow({
    width: w, height: h, resizable: false, fullscreenable: false, maximizable: false,
    backgroundColor: '#0A1F44', title: 'Safety Lab Aero', icon: path.join(__dirname, 'build', 'icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-gate.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, file));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) { try { shell.openExternal(url); } catch (_) {} } return { action: 'deny' }; });
  return win;
}
function openOnboarding() { if (gateWindow) { gateWindow.focus(); return; } gateWindow = createGateWindow('onboarding.html', 920, 760); gateWindow.on('closed', () => { gateWindow = null; }); }
function openLock() { if (gateWindow) { gateWindow.focus(); return; } gateWindow = createGateWindow('lock.html', 520, 460); gateWindow.on('closed', () => { gateWindow = null; }); }

// ---- main app window -----------------------------------------------------------------------
function openMainApp() {
  if (mainWindow) { mainWindow.focus(); return; }
  const cfg = readConfig();
  const problem = configProblem(cfg);
  if (problem) {
    dialog.showMessageBoxSync({ type: 'error', message: 'Safety Lab Aero cannot start with this configuration', detail: problem + '\n\nOpen Settings to correct it.' });
    openSettings(); return;
  }
  buildMenu();
  const part = session.fromPartition('persist:slab-app');
  installEgressGuard(part, cfg);
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    backgroundColor: '#0A1F44', title: 'Safety Lab Aero', icon: path.join(__dirname, 'build', 'icon.png'), show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-app.js'),
      contextIsolation: false, nodeIntegration: false, sandbox: false, spellcheck: false,
      partition: 'persist:slab-app',
      devTools: !app.isPackaged,
      additionalArguments: ['--slab-config-path=' + configPath(), '--slab-activation-path=' + activationPath(), '--slab-version=' + app.getVersion()]
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    reportHeapCeiling(mainWindow);
    if (gateWindow) { const g = gateWindow; gateWindow = null; g.close(); }
    if (_pendingDeepLink) { const u = _pendingDeepLink; _pendingDeepLink = null; setTimeout(() => handleDeepLink(u), 1500); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) { try { shell.openExternal(url); } catch (_) {} } return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https:\/\//i.test(url)) { try { shell.openExternal(url); } catch (_) {} } } });
  mainWindow.webContents.on('will-attach-webview', (e) => { e.preventDefault(); });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Network-layer egress guard for the app partition. Refuses (and logs) any request whose host
// is not on the allowlist derived from the configuration. Belt and braces with slab_config.js.
const _egressGuarded = new WeakSet();
function installEgressGuard(part, cfg) {
  if (_egressGuarded.has(part)) return;
  _egressGuarded.add(part);
  const blocked = new Map();
  part.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    const live = readConfig();   // re-read so a settings change applies on reload without restart
    if (egressAllowed(details.url, live)) return cb({});
    const h = hostOf(details.url) || details.url.slice(0, 60);
    blocked.set(h, (blocked.get(h) || 0) + 1);
    if (blocked.get(h) === 1) console.warn('[slab egress] refused ' + h + ' (not in this install\'s allowlist: ' + Array.from(allowedHosts(live)).join(', ') + ')');
    cb({ cancel: true });
  });
}

// ---- deep links: safetylab://open?project=<id>&backend=<host> · safetylab://auth-callback?... ----
function handleDeepLink(raw) {
  const link = R.parseDeepLink(raw);
  if (!link) return;
  if (!mainWindow) { _pendingDeepLink = raw; routeStartup(); return; }
  const cfg = readConfig();
  if (link.kind === 'open') {
    const mine = backendHostFor(cfg);
    if (link.backend && mine && link.backend !== mine) {
      dialog.showMessageBox(mainWindow, { type: 'warning', message: 'This link is for a different server', detail: 'The project link points at ' + link.backend + ', but this install uses ' + mine + '. Open it on that installation instead.' });
      return;
    }
    mainWindow.focus();
    mainWindow.webContents.executeJavaScript('(window.__slabOpenCloudProject ? window.__slabOpenCloudProject(' + JSON.stringify(link.id) + ') : false)').catch(() => {});
  } else if (link.kind === 'auth') {
    mainWindow.focus();
    mainWindow.webContents.executeJavaScript('(window.__slabAuthCallback ? window.__slabAuthCallback(' + JSON.stringify(link.url) + ') : false)').catch(() => {});
  }
}

// ---- native project Save / Open (.sl project files on the user's disk) -----------------------
// 16 Sep 2026 — the extension is .sl, matching what the web app has always saved. This shell
// defaulted to .slab and filtered its Open dialog on slab/json with no All Files escape, so a
// project saved in the browser DID NOT APPEAR in the desktop's file picker, and vice versa: the
// web's file input accepts .sl/.json, so a .slab was not selectable there either. Same JSON in
// both; three letters were the whole problem. Both sides now write .sl and open all three, and
// the Open dialog carries an All Files filter so a picker can never again hide someone's file.
function setProjectTitle() { if (mainWindow) mainWindow.setTitle('Safety Lab Aero' + (currentProjectPath ? ' — ' + path.basename(currentProjectPath) : '')); }
async function doSave(saveAs) {
  if (!mainWindow) return;
  let target = currentProjectPath;
  if (saveAs || !target) {
    const r = await dialog.showSaveDialog(mainWindow, { title: 'Save Safety Lab project', defaultPath: target || 'Untitled.sl', filters: [{ name: 'Safety Lab Project', extensions: ['sl', 'slab'] }, { name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return;
    target = r.filePath;
  }
  let json;
  try { json = await mainWindow.webContents.executeJavaScript('(window.__slabGetProjectJSON ? window.__slabGetProjectJSON() : null)'); }
  catch (e) { dialog.showErrorBox('Save failed', String(e)); return; }
  if (!json) { dialog.showErrorBox('Save failed', 'The app did not return any project data (is it finished loading?).'); return; }
  try { fs.writeFileSync(target, json, 'utf8'); currentProjectPath = target; setProjectTitle(); }
  catch (e) { dialog.showErrorBox('Save failed', String(e)); }
}
async function doOpen() {
  if (!mainWindow) return;
  const r = await dialog.showOpenDialog(mainWindow, { title: 'Open Safety Lab project', properties: ['openFile'], filters: [{ name: 'Safety Lab Project', extensions: ['sl', 'slab', 'json'] }, { name: 'All Files', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return;
  const p = r.filePaths[0];
  let contents;
  try { contents = fs.readFileSync(p, 'utf8'); } catch (e) { dialog.showErrorBox('Open failed', String(e)); return; }
  try {
    const ok = await mainWindow.webContents.executeJavaScript('(window.__slabLoadProjectJSON ? window.__slabLoadProjectJSON(' + JSON.stringify(contents) + ') : false)');
    if (ok === false) { dialog.showErrorBox('Open failed', 'The app could not parse this project file.'); return; }
    currentProjectPath = p; setProjectTitle();
  } catch (e) { dialog.showErrorBox('Open failed', String(e)); }
}
async function openOnWeb() {
  if (!mainWindow) return;
  let href = '';
  try { href = await mainWindow.webContents.executeJavaScript('(window.openInWebLink ? window.openInWebLink() : "")'); } catch (_) {}
  if (!href) { dialog.showMessageBox(mainWindow, { type: 'info', message: 'Nothing to open on the web yet', detail: 'Open a project from your workspace first (and, on your organization\'s server, set the web address in Settings).' }); return; }
  try { shell.openExternal(href); } catch (_) {}
}

// ---- settings window (isolated) --------------------------------------------------------------
function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 620, height: 760, parent: mainWindow || undefined, resizable: true, minimizable: false, maximizable: false,
    title: 'Safety Lab Aero — Settings', backgroundColor: '#f6f8fc',
    webPreferences: { preload: path.join(__dirname, 'preload-settings.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}
// ---- secrets: OS keychain, write-only from the page (16 Sep 2026) -----------------------
// The renderer may store a credential and ask whether one is stored. It can never read one
// back -- there is deliberately no 'slab:getSecret'. Only the main process decrypts, and only
// to put the credential on the outbound request in bridge_main.js.
ipcMain.handle('slab:secretsAvailable', () => ({ ok: secrets.available() }));
ipcMain.handle('slab:secretsStatus', () => { try { return { ok: true, secrets: secrets.status() }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; } });
ipcMain.handle('slab:saveSecret', (_e, payload) => {
  try {
    const kind = payload && payload.kind;
    if (!kind) return { ok: false, error: 'a secret needs a kind' };
    return { ok: true, secrets: secrets.save(kind, payload.value, payload.meta) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('slab:deleteSecret', (_e, kind) => {
  try { return { ok: true, secrets: secrets.remove(kind) }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// ---- the ALM live bridge's outbound GET, run out here where the egress fence does not
// apply and the credential never reaches the page. See bridge_main.js for why.
ipcMain.handle('slab:bridgeGet', async (_e, targetUrl) => {
  try { return await bridgeMain.get(targetUrl); }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('slab:getConfig', () => { const c = readConfig(); return Object.assign({}, c, { hasPasscode: !!c.passcodeHash, passcodeHash: undefined }); });
ipcMain.handle('slab:saveConfig', (_e, partial) => {
  const cur = readConfig(); const next = Object.assign({}, cur);
  for (const k of ['backend', 'backendUrl', 'backendKey', 'ai', 'aiEndpoint', 'webAppUrl']) if (partial && partial[k] != null) next[k] = String(partial[k]).trim();
  if (partial && partial.passcode !== undefined) next.passcodeHash = partial.passcode ? hashPasscode(partial.passcode) : null;
  const problem = configProblem(next);
  if (problem) return { ok: false, error: problem };
  writeConfig(next);
  return { ok: true };
});
ipcMain.handle('slab:licenseInfo', async () => {
  const a = loadActivation(); if (!a.license) return { valid: false, plain: 'No license has been loaded on this computer yet.' };
  const r = await verifyLicense(a.license, readConfig());
  return Object.assign({ valid: r.valid, plain: r.plain }, licenseSummary(r) || {});
});
ipcMain.handle('slab:replaceLicense', async () => {
  const win = settingsWindow || gateWindow || BrowserWindow.getFocusedWindow();
  const r = await dialog.showOpenDialog(win, { title: 'Choose your Safety Lab Aero license file', properties: ['openFile'], filters: [{ name: 'Safety Lab license', extensions: ['lic', 'txt'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  let blob; try { blob = fs.readFileSync(r.filePaths[0], 'utf8').trim(); } catch (e) { return { ok: false, error: String(e) }; }
  return installLicense(blob);
});
async function installLicense(blob) {
  const v = await verifyLicense(blob, readConfig());
  if (!v.valid) return { ok: false, error: v.plain };
  const a = loadActivation();
  a.license = blob; a.maxIssuedSeen = Math.max(Number(a.maxIssuedSeen || 0) || 0, v.maxSeenNext || 0); a.activatedAt = a.activatedAt || new Date().toISOString();
  saveActivation(a);
  return { ok: true, info: licenseSummary(v) };
}
ipcMain.on('slab:applyAndReload', () => { if (settingsWindow) settingsWindow.close(); if (mainWindow) mainWindow.reload(); else routeStartup(); });
ipcMain.handle('slab:version', () => ({ app: app.getVersion(), web: readBuildInfo() }));
function readBuildInfo() { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'app', 'BUILD_INFO.json'), 'utf8')); } catch (_) { return null; } }

// ---- gate IPC ----------------------------------------------------------------------------------
ipcMain.handle('gate:getBootstrap', async () => {
  const a = loadActivation();
  const lic = a.license ? await verifyLicense(a.license, readConfig()) : null;
  return { agreements: AGREEMENTS, existing: { hasPasscode: !!readConfig().passcodeHash, license: lic ? Object.assign({ valid: lic.valid, plain: lic.plain }, licenseSummary(lic) || {}) : null } };
});
ipcMain.handle('gate:checkLicense', async (_e, blob) => {
  const v = await verifyLicense(String(blob || '').trim(), readConfig());
  return v.valid ? { ok: true, info: licenseSummary(v) } : { ok: false, error: v.plain };
});
ipcMain.handle('gate:pickLicenseFile', async () => {
  const win = gateWindow || BrowserWindow.getFocusedWindow();
  const r = await dialog.showOpenDialog(win, { title: 'Choose your Safety Lab Aero license file', properties: ['openFile'], filters: [{ name: 'Safety Lab license', extensions: ['lic', 'txt'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try { return { ok: true, blob: fs.readFileSync(r.filePaths[0], 'utf8').trim() }; } catch (e) { return { ok: false, error: String(e) }; }
});
ipcMain.handle('gate:complete', async (_e, data) => {
  data = data || {};
  const inst = await installLicense(String(data.license || '').trim());
  if (!inst.ok) return { ok: false, error: inst.error || 'License invalid.' };
  if (!data.acceptEula) return { ok: false, error: 'You must accept the agreement to continue.' };
  const a = loadActivation();
  a.acceptances = { eula: { version: AGREEMENTS.eulaVersion, at: new Date().toISOString() } };
  saveActivation(a);
  if (data.passcode !== undefined) { const cfg = readConfig(); cfg.passcodeHash = data.passcode ? hashPasscode(data.passcode) : null; writeConfig(cfg); }
  openMainApp();
  return { ok: true };
});
ipcMain.handle('gate:unlock', async (_e, data) => {
  const cfg = readConfig();
  if (cfg.passcodeHash && !verifyPasscode((data && data.passcode) || '', cfg.passcodeHash)) return { ok: false, error: 'Incorrect passcode.' };
  const s = await activationStatus();
  if (s.state === 'onboard') return { ok: false, relock: true, error: s.lic.plain || 'License invalid.' };
  openMainApp();
  return { ok: true };
});
ipcMain.on('gate:reactivate', () => { if (gateWindow) { const g = gateWindow; gateWindow = null; g.close(); } openOnboarding(); });
ipcMain.on('gate:quit', () => { app.quit(); });

// ---- menus ----------------------------------------------------------------------------------------
function buildGateMenu() {
  const isMac = process.platform === 'darwin'; const t = [];
  if (isMac) t.push({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }] });
  t.push({ label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}
function buildMenu() {
  const isMac = process.platform === 'darwin'; const template = [];
  const settingsItem = { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings };
  if (isMac) template.push({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, settingsItem, { label: 'Check for Updates…', click: () => initAutoUpdater(true) }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] });
  template.push({ label: 'File', submenu: [
    { label: 'Open Project File…', accelerator: 'CmdOrCtrl+O', click: () => doOpen() },
    { label: 'Save Project File', accelerator: 'CmdOrCtrl+S', click: () => doSave(false) },
    { label: 'Save Project File As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => doSave(true) },
    { type: 'separator' },
    { label: 'Open This Project on the Web', click: () => openOnWeb() },
    { type: 'separator' },
    ...(isMac ? [] : [settingsItem, { type: 'separator' }]),
    isMac ? { role: 'close' } : { role: 'quit' }
  ] });
  template.push({ label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] });
  const view = [{ role: 'reload' }, { role: 'forceReload' }];
  if (!app.isPackaged) view.push({ role: 'toggleDevTools' });
  view.push({ type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' });
  template.push({ label: 'View', submenu: view });
  template.push({ label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])] });
  template.push({ role: 'help', submenu: [
    { label: 'Check for Updates…', click: () => initAutoUpdater(true) },
    { label: 'About This Build', click: () => { const b = readBuildInfo(); dialog.showMessageBox({ type: 'info', message: 'Safety Lab Aero ' + app.getVersion(), detail: b ? ('Web build ' + (b.webCommit || '?').slice(0, 10) + ' · pulled ' + (b.pulledAt || '?') + ' · ' + (b.fileCount || '?') + ' files') : 'No build info (app/ was not pulled by pull-web.sh).' }); } },
    { type: 'separator' },
    { label: 'Safety Lab Aero on the web', click: () => { try { shell.openExternal(WEBSITE); } catch (_) {} } }
  ] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- updater ----------------------------------------------------------------------------------------
// electron-updater against https://updates.safetylabaero.com/desktop/. Two independent locks decide
// whether an update is ever believed or applied (14 Sep 2026, S24):
//
//   AUTO_UPDATE_MANIFEST_VERIFIED — ON now, no certificate needed. Safety Lab signs the update
//     manifest (latest-*.yml) with an ECDSA P-256 key whose private half never leaves Waqas's Mac;
//     update_verify.js checks that signature against the PUBLIC key baked into this build BEFORE it
//     believes the manifest. A host that served a forged manifest cannot produce a valid signature,
//     so it cannot announce, hide, or (when the native path is on) push an update. Until a real
//     public key is pasted into update_verify.js the check is fail-closed: nothing is offered.
//
//   UPDATE_POLICY — whether this build may download and install on its own (shell_rules.autoUpdatePolicy).
//     Windows: ON. electron-updater checks the installer's SHA-512 against latest.yml, and we have
//     already verified latest.yml against our own key, so the chain is our key -> manifest -> hash ->
//     payload. No certificate needed for integrity; Authenticode only removes the SmartScreen notice.
//     macOS: ON only when the build is code-signed (BUILD_INFO.codeSigned.mac, stamped by release.sh
//     from CSC_LINK). electron-updater refuses to update an unsigned Mac app; that is Apple's rule.
//     Where the policy is OFF, updates are MANUAL: the app tells the user a verified newer version
//     exists and opens the download page; nothing downloads or installs silently.
//   The download is PINNED to the verified manifest (shell_rules.updateMatchesVerified): electron-
//   updater re-fetches latest-*.yml on its own, so before it may download, the update it reports must
//   match the version and payload hashes in the manifest we verified. Closes the window between the
//   two fetches.
const UPDATE_POLICY = R.autoUpdatePolicy(process.platform, readBuildInfo());
const AUTO_UPDATE_MANIFEST_VERIFIED = true;
const UPDATE_FEED = 'https://updates.safetylabaero.com/desktop/';
const UV = require('./update_verify.js');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (_) { autoUpdater = null; }
let _updaterWired = false, _manualCheck = false, _lastVerified = null;

function updateManifestName() { return process.platform === 'win32' ? 'latest.yml' : (process.platform === 'linux' ? 'latest-linux.yml' : 'latest-mac.yml'); }

// Small https GET for the manifest + its .sig (main process; the app window's egress guard does not
// apply here). Caps the body so a hostile host cannot stream forever.
function _httpsGet(url) {
  return new Promise((resolve, reject) => {
    let https; try { https = require('https'); } catch (e) { return reject(e); }
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let data = ''; res.setEncoding('utf8');
      res.on('data', (c) => { data += c; if (data.length > 1000000) { req.destroy(); reject(new Error('manifest too large')); } });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function _tellUpdateAvailable(version) {
  return dialog.showMessageBox({ type: 'info', buttons: ['Open download page', 'Later'], defaultId: 0, cancelId: 1, message: 'A newer version is available', detail: 'Safety Lab Aero ' + (version || '') + ' is available. This build installs updates manually: download the installer from the website and run it.' })
    .then((r) => { if (r.response === 0) { try { shell.openExternal(WEBSITE + '/download'); } catch (_) {} } });
}

async function initAutoUpdater(manual) {
  _manualCheck = !!manual;
  // Lock 1: verify the manifest against our own key before trusting a single field of it.
  let verified = { status: 'skipped' };
  if (AUTO_UPDATE_MANIFEST_VERIFIED) {
    try { verified = await UV.checkForVerifiedUpdate({ feedUrl: UPDATE_FEED + updateManifestName(), currentVersion: app.getVersion(), keys: UV.PUBLIC_KEYS, fetchText: _httpsGet }); }
    catch (e) { verified = { status: 'error', reason: (e && e.message) || String(e) }; }
    console.log('[updater] manifest ' + verified.status + ' ' + (verified.version || verified.reason || ''));
  }

  // Policy OFF on this platform/build: never download. Act on the verified result only, and never in
  // the background.
  if (!UPDATE_POLICY.auto) {
    if (!manual) return;
    if (verified.status === 'update') return _tellUpdateAvailable(verified.version);
    if (verified.status === 'current') return void dialog.showMessageBox({ type: 'info', message: "You're up to date", detail: 'No newer version is available right now.' });
    if (verified.status === 'unverified') return void dialog.showMessageBox({ type: 'warning', message: 'Could not verify the update', detail: 'The update details could not be confirmed as authentic, so nothing will be offered. If you need the latest version, download the installer directly from ' + WEBSITE + '/download.' });
    return void dialog.showMessageBox({ type: 'info', message: 'Update check failed', detail: 'Could not check for updates right now.' });
  }

  // Policy ON: electron-updater may download and apply. Lock 2 stacks on lock 1 — refuse to proceed if
  // the manifest did not verify, and refuse to download unless what electron-updater reports matches
  // the manifest we verified.
  if (!autoUpdater) { if (manual) dialog.showMessageBox({ type: 'info', message: 'Updates unavailable', detail: 'The updater module is not installed in this build.' }); return; }
  if (AUTO_UPDATE_MANIFEST_VERIFIED && verified.status === 'unverified') {
    console.log('[updater] refusing auto-update: manifest unverified (' + verified.reason + ')');
    if (manual) dialog.showMessageBox({ type: 'warning', message: 'Update not applied', detail: 'The update could not be verified as authentic and was not downloaded.' });
    return;
  }
  try {
    autoUpdater.autoDownload = false;          // we decide, after pinning to the verified manifest
    autoUpdater.autoInstallOnAppQuit = true;
    _lastVerified = verified;
    if (!_updaterWired) {
      _updaterWired = true;
      autoUpdater.on('update-available', (info) => {
        if (R.updateMatchesVerified(info, _lastVerified)) {
          console.log('[updater] update ' + info.version + ' matches the verified manifest; downloading');
          autoUpdater.downloadUpdate().catch((e) => console.log('[updater] download failed:', (e && e.message) || e));
        } else {
          console.log('[updater] REFUSED: electron-updater reported ' + (info && info.version) + ' but it does not match the verified manifest');
          if (_manualCheck) dialog.showMessageBox({ type: 'warning', message: 'Update not applied', detail: 'The update offered by the server did not match the signed release manifest and was not downloaded.' });
        }
      });
      autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox({ type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, message: 'Update ready', detail: 'Safety Lab Aero ' + (info && info.version ? info.version : '') + ' has been downloaded. Restart to apply it.' })
          .then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
      });
      autoUpdater.on('update-not-available', () => { if (_manualCheck) dialog.showMessageBox({ type: 'info', message: "You're up to date", detail: 'No newer version is available right now.' }); });
      autoUpdater.on('error', (e) => { console.log('[updater]', (e && e.message) || e); if (_manualCheck) dialog.showMessageBox({ type: 'info', message: 'Update check failed', detail: 'Could not check for updates right now.' }); });
    }
    autoUpdater.checkForUpdates();
  } catch (e) { console.log('[updater] init failed:', e); }
}

// ---- lifecycle --------------------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => { const link = (argv || []).find(a => typeof a === 'string' && a.startsWith(PROTOCOL + '://')); if (link) handleDeepLink(link); else if (mainWindow) mainWindow.focus(); });
  app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url); });
  app.whenReady().then(() => {
    try { app.setAsDefaultProtocolClient(PROTOCOL); } catch (_) {}
    if (process.platform === 'darwin' && app.dock) { try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch (_) {} }
    const link = process.argv.find(a => typeof a === 'string' && a.startsWith(PROTOCOL + '://'));
    if (link) _pendingDeepLink = link;
    routeStartup();
    if (UPDATE_POLICY.auto) setTimeout(() => { try { initAutoUpdater(false); } catch (_) {} }, 4000);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) routeStartup(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
