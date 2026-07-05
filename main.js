// Safety Lab Aero — Electron main process.
// Thin native shell around the existing single-file SPA, with an OFFLINE licensing +
// onboarding gate. The main app window only opens after (a) a valid signed license key
// and (b) acceptance of the EULA + License Agreement. Unauthorized users never reach the app.
//
// SECURITY NOTE (v1): the MAIN APP window runs with contextIsolation:false because it loads
// only our own first-party bundle from disk. The GATE windows (onboarding/signin) run with
// contextIsolation:true. Harden the app window before customer ship.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateLicense } = require('./license.js');

const WEBSITE = 'https://safetylabaero.com';

// Optional auto-updater (electron-updater). Wrapped so a missing module never breaks the app.
// Feed is configured in package.json > build.publish (generic provider → your Cloudflare URL).
// NOTE: on macOS, updates only INSTALL once the app is code-signed + notarized. Until then this
// stays dormant — check errors are logged, never shown to the user (unless a manual check).
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (_) { autoUpdater = null; }
let _updaterWired = false, _manualCheck = false;
function initAutoUpdater(manual) {
  _manualCheck = !!manual;
  if (!autoUpdater) { if (manual) dialog.showMessageBox({ type: 'info', message: 'Updates unavailable', detail: 'The updater module is not installed in this build (run npm install).' }); return; }
  if (!app.isPackaged && !manual) return; // skip background checks during `npm start` dev runs
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    if (!_updaterWired) {
      _updaterWired = true;
      autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox({
          type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
          message: 'Update ready',
          detail: 'Safety Lab Aero ' + (info && info.version ? info.version : '') + ' has been downloaded. Restart to apply it.'
        }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
      });
      autoUpdater.on('update-not-available', () => { if (_manualCheck) dialog.showMessageBox({ type: 'info', message: "You're up to date", detail: 'No newer version is available right now.' }); });
      autoUpdater.on('error', (e) => { console.log('[updater]', (e && e.message) || e); if (_manualCheck) dialog.showMessageBox({ type: 'info', message: 'Update check failed', detail: 'Could not check for updates right now. (On macOS, auto-update activates once the app is code-signed.)' }); });
    }
    autoUpdater.checkForUpdates();
  } catch (e) { console.log('[updater] init failed:', e); }
}

// ---- paths + config --------------------------------------------------------------
function configPath() { return path.join(app.getPath('userData'), 'config.json'); }
function activationPath() { return path.join(app.getPath('userData'), 'activation.json'); }

const DEFAULT_CONFIG = {
  profileName: 'Desktop User',
  profileEmail: 'desktop@local',
  aiMode: 'cloud',          // 'cloud' | 'custom' | 'off'
  aiEndpoint: '',
  aiToken: '',
  aiModel: 'claude-sonnet-4-6',
  // Collaboration backend (auth + realtime co-authoring + the project store). 'cloud' = the hosted
  // Safety Lab Aero backend; 'custom' = a customer's own self-hosted Supabase (VPC / intranet), so
  // project data, presence, comments and CRDT history stay inside their boundary.
  collabMode: 'cloud',      // 'cloud' | 'custom'
  collabUrl: '',            // e.g. https://supabase.internal.electra.aero
  collabKey: ''             // that instance's publishable / anon key
};
function readConfig() {
  try { return Object.assign({}, DEFAULT_CONFIG, JSON.parse(fs.readFileSync(configPath(), 'utf8'))); }
  catch (_) { return Object.assign({}, DEFAULT_CONFIG); }
}
function writeConfig(c) {
  try { fs.mkdirSync(path.dirname(configPath()), { recursive: true }); fs.writeFileSync(configPath(), JSON.stringify(c, null, 2), 'utf8'); }
  catch (e) { console.error('[slab] config write failed:', e); }
}

// ---- activation state (license + profile + acceptances) --------------------------
function loadActivation() { try { return JSON.parse(fs.readFileSync(activationPath(), 'utf8')) || {}; } catch (_) { return {}; } }
function saveActivation(a) {
  try { fs.mkdirSync(path.dirname(activationPath()), { recursive: true }); fs.writeFileSync(activationPath(), JSON.stringify(a, null, 2), 'utf8'); }
  catch (e) { console.error('[slab] activation write failed:', e); }
}

// ---- agreements (read once from disk) --------------------------------------------
function readAgreement(name, def) { try { return fs.readFileSync(path.join(__dirname, 'agreements', name), 'utf8'); } catch (_) { return def || ''; } }
const AGREEMENTS = {
  eulaVersion: (readAgreement('eula.version', 'SL-EULA-0001-A') || '').trim(),
  eulaHtml: readAgreement('eula.html', '<p>EULA text unavailable.</p>'),
  licenseVersion: (readAgreement('license.version', 'SL-LICENSE-0001-A') || '').trim(),
  licenseHtml: readAgreement('license-agreement.html', '<p>License agreement text unavailable.</p>')
};

// ---- passcode (optional local lock) ----------------------------------------------
function hashPasscode(pw) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(String(pw), salt, 32); return salt.toString('hex') + ':' + h.toString('hex'); }
function verifyPasscode(pw, stored) {
  try { const [s, h] = String(stored).split(':'); const calc = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 32); return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex')); }
  catch (_) { return false; }
}
function sanitize(p) { return p ? { org: p.org, name: p.name, email: p.email, tier: p.tier, seats: p.seats, exp: p.exp, id: p.id } : null; }

// ---- window state ----------------------------------------------------------------
let mainWindow = null, settingsWindow = null, gateWindow = null, currentProjectPath = null;

// ---- startup routing -------------------------------------------------------------
function activationStatus() {
  const a = loadActivation();
  const lic = (a && a.licenseKey) ? validateLicense(a.licenseKey) : { ok: false };
  const okEula = a.acceptances && a.acceptances.eula && a.acceptances.eula.version === AGREEMENTS.eulaVersion;
  const okLic = a.acceptances && a.acceptances.license && a.acceptances.license.version === AGREEMENTS.licenseVersion;
  if (lic.ok && okEula && okLic && a.profile) return { state: 'signin', a, lic };
  return { state: 'onboard', a, lic };
}
function routeStartup() {
  if (mainWindow) { mainWindow.focus(); return; }
  const s = activationStatus();
  if (s.state === 'signin') openSignin(); else openOnboarding();
}

// ---- gate windows ----------------------------------------------------------------
function createGateWindow(file, w, h) {
  buildGateMenu();
  const win = new BrowserWindow({
    width: w, height: h, resizable: false, fullscreenable: false, maximizable: false,
    backgroundColor: '#0A1F44', title: 'Safety Lab Aero',
    icon: path.join(__dirname, 'build', 'icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-onboarding.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, file));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) { try { shell.openExternal(url); } catch (_) {} } return { action: 'deny' }; });
  return win;
}
function openOnboarding() { if (gateWindow) { gateWindow.focus(); return; } gateWindow = createGateWindow('onboarding.html', 920, 760); gateWindow.on('closed', () => { gateWindow = null; }); }
function openSignin() { if (gateWindow) { gateWindow.focus(); return; } gateWindow = createGateWindow('signin.html', 560, 640); gateWindow.on('closed', () => { gateWindow = null; }); }

// ---- main app window -------------------------------------------------------------
function openMainApp() {
  if (mainWindow) { mainWindow.focus(); return; }
  const st = activationStatus();
  const tier = (st.lic && st.lic.ok && st.lic.payload && st.lic.payload.tier) ? st.lic.payload.tier : 'pro-plus';
  buildMenu();
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680,
    backgroundColor: '#0A1F44', title: 'Safety Lab Aero',
    icon: path.join(__dirname, 'build', 'icon.png'), show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-app.js'),
      contextIsolation: false, nodeIntegration: false, sandbox: false, spellcheck: false,
      additionalArguments: ['--slab-config-path=' + configPath(), '--slab-tier=' + tier]
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (gateWindow) { const g = gateWindow; gateWindow = null; g.close(); }   // dismiss the gate once the app is up
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) { try { shell.openExternal(url); } catch (_) {} } return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); try { shell.openExternal(url); } catch (_) {} } });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- native project Save / Open --------------------------------------------------
function setProjectTitle() { if (mainWindow) mainWindow.setTitle('Safety Lab Aero' + (currentProjectPath ? ' — ' + path.basename(currentProjectPath) : '')); }

async function doSave(saveAs) {
  if (!mainWindow) return;
  let target = currentProjectPath;
  if (saveAs || !target) {
    const r = await dialog.showSaveDialog(mainWindow, { title: 'Save Safety Lab project', defaultPath: target || 'Untitled.slab', filters: [{ name: 'Safety Lab Project', extensions: ['slab'] }, { name: 'JSON', extensions: ['json'] }] });
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
  const r = await dialog.showOpenDialog(mainWindow, { title: 'Open Safety Lab project', properties: ['openFile'], filters: [{ name: 'Safety Lab Project', extensions: ['slab', 'json'] }] });
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

// ---- settings window -------------------------------------------------------------
function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 580, height: 680, parent: mainWindow || undefined, resizable: true, minimizable: false, maximizable: false,
    title: 'Safety Lab Aero — AI & Profile', backgroundColor: '#f6f8fc',
    webPreferences: { preload: path.join(__dirname, 'preload-settings.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}
ipcMain.handle('slab:getConfig', () => readConfig());
ipcMain.handle('slab:saveConfig', (_e, partial) => { const next = Object.assign({}, readConfig(), partial || {}); writeConfig(next); return next; });
ipcMain.on('slab:applyAndReload', () => { if (mainWindow) mainWindow.reload(); if (settingsWindow) settingsWindow.close(); });

// ---- gate IPC --------------------------------------------------------------------
ipcMain.handle('gate:getBootstrap', () => {
  const a = loadActivation();
  const lic = a.licenseKey ? validateLicense(a.licenseKey) : { ok: false };
  let licenseInfo = null;
  if (lic.ok) licenseInfo = sanitize(lic.payload);
  else if (lic.expired) licenseInfo = Object.assign({ expired: true }, sanitize(lic.payload));
  return { agreements: AGREEMENTS, existing: { profile: a.profile || null, hasPasscode: !!a.passcodeHash, licenseInfo } };
});
ipcMain.handle('gate:validateLicense', (_e, key) => {
  const r = validateLicense(key);
  return r.ok ? { ok: true, info: sanitize(r.payload) } : { ok: false, error: r.error, expired: !!r.expired };
});
ipcMain.handle('gate:pickLicenseFile', async () => {
  const win = gateWindow || BrowserWindow.getFocusedWindow();
  const r = await dialog.showOpenDialog(win, { title: 'Select your Safety Lab Aero license file', properties: ['openFile'], filters: [{ name: 'Safety Lab license', extensions: ['sllic', 'lic', 'txt'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  try { return { ok: true, key: fs.readFileSync(r.filePaths[0], 'utf8').trim() }; } catch (e) { return { ok: false, error: String(e) }; }
});
ipcMain.handle('gate:complete', (_e, data) => {
  data = data || {};
  const r = validateLicense(data.licenseKey);
  if (!r.ok) return { ok: false, error: r.error || 'License invalid.' };
  if (!data.acceptEula || !data.acceptLicense) return { ok: false, error: 'You must accept both agreements to continue.' };
  const prof = data.profile || {};
  const a = {
    licenseKey: data.licenseKey,
    license: sanitize(r.payload),
    profile: { name: String(prof.name || '').trim(), email: String(prof.email || '').trim(), org: String(prof.org || '').trim() },
    passcodeHash: data.passcode ? hashPasscode(data.passcode) : null,
    acceptances: {
      eula: { version: AGREEMENTS.eulaVersion, at: new Date().toISOString() },
      license: { version: AGREEMENTS.licenseVersion, at: new Date().toISOString() },
      acceptedBy: (prof.email || r.payload.email || '').toLowerCase()
    },
    activatedAt: new Date().toISOString()
  };
  saveActivation(a);
  const cfg = readConfig(); cfg.profileName = a.profile.name || cfg.profileName; cfg.profileEmail = a.profile.email || cfg.profileEmail; writeConfig(cfg);
  openMainApp();
  return { ok: true };
});
ipcMain.handle('gate:signin', (_e, data) => {
  data = data || {};
  const a = loadActivation();
  const r = a.licenseKey ? validateLicense(a.licenseKey) : { ok: false, error: 'No license on file.' };
  if (!r.ok) return { ok: false, relock: true, error: r.error || 'License invalid.' };
  if (a.passcodeHash && !verifyPasscode(data.passcode || '', a.passcodeHash)) return { ok: false, error: 'Incorrect passcode.' };
  openMainApp();
  return { ok: true };
});
ipcMain.on('gate:reactivate', () => { if (gateWindow) { const g = gateWindow; gateWindow = null; g.close(); } openOnboarding(); });
ipcMain.on('gate:quit', () => { app.quit(); });

// ---- menus -----------------------------------------------------------------------
function buildGateMenu() {
  const isMac = process.platform === 'darwin';
  const t = [];
  if (isMac) t.push({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'quit' }] });
  t.push({ label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];
  if (isMac) template.push({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'AI & Profile Settings…', accelerator: 'Cmd+,', click: openSettings }, { label: 'Check for Updates…', click: () => initAutoUpdater(true) }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] });
  template.push({ label: 'File', submenu: [
    { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => doOpen() },
    { label: 'Save Project', accelerator: 'CmdOrCtrl+S', click: () => doSave(false) },
    { label: 'Save Project As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => doSave(true) },
    { type: 'separator' },
    ...(isMac ? [] : [{ label: 'AI & Profile Settings…', accelerator: 'Ctrl+,', click: openSettings }, { type: 'separator' }]),
    isMac ? { role: 'close' } : { role: 'quit' }
  ] });
  template.push({ label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] });
  template.push({ label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] });
  template.push({ label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])] });
  template.push({ role: 'help', submenu: [
    { label: 'Check for Updates…', click: () => initAutoUpdater(true) },
    { type: 'separator' },
    { label: 'Safety Lab Aero on the web', click: () => { try { shell.openExternal(WEBSITE); } catch (_) {} } }
  ] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- lifecycle -------------------------------------------------------------------
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) { try { app.dock.setIcon(path.join(__dirname, 'build', 'icon.png')); } catch (_) {} }
  routeStartup();
  setTimeout(() => { try { initAutoUpdater(false); } catch (_) {} }, 4000);   // quiet background update check after launch
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) routeStartup(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
