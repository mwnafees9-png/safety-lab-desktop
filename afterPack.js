// electron-builder afterPack hook — ad-hoc sign the macOS .app so a downloaded build opens on
// Apple Silicon instead of being rejected as "damaged". macOS refuses to run an unsigned arm64 app;
// an ad-hoc signature (`codesign --sign -`) satisfies that. The download-quarantine flag still shows
// a one-time "unidentified developer" prompt (right-click → Open), but no more "damaged".
//
// Superseded automatically when real Apple signing creds are present (CSC_LINK / CSC_NAME / APPLE_ID):
// in that case electron-builder + notarize.js sign properly, so we skip and never stomp that signature.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME || process.env.APPLE_ID) return; // real signing configured — leave it alone
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  try {
    console.log(`[adhoc-sign] ad-hoc signing ${appPath}`);
    // Strip extended-attribute detritus first, else codesign errors "resource fork, Finder
    // information, or similar detritus not allowed" (seen on the arm64 slice).
    try { execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' }); } catch (_) {}
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
    console.log('[adhoc-sign] done — opens on Apple Silicon (first launch: right-click → Open once).');
  } catch (e) {
    console.warn('[adhoc-sign] failed (build continues, app will be unsigned):', e && e.message);
  }
};
