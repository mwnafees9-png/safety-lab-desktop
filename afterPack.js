// electron-builder afterPack hook — ad-hoc sign the macOS .app so a downloaded build opens on
// Apple Silicon instead of being rejected as "damaged". macOS refuses to run an unsigned arm64 app;
// an ad-hoc signature (`codesign --sign -`) satisfies that. The download-quarantine flag still shows
// a one-time "unidentified developer" prompt (right-click → Open), but no more "damaged".
//
// Superseded automatically when real Apple signing creds are present (CSC_LINK / CSC_NAME / APPLE_ID):
// in that case electron-builder + notarize.js sign properly, so we skip and never stomp that signature.
//
// 18 Oct 2026 (SEC-10): Electron fuses are set here first, on every platform, before any signature.
// Found by the runtime probe: the shipped app ran as a plain Node.js process when started with
// ELECTRON_RUN_AS_NODE=1, and took NODE_OPTIONS and --inspect from whoever launched it. A fuse is a bit
// in the Electron binary itself, so no environment variable or flag can turn these back on.
//   RunAsNode off                 ELECTRON_RUN_AS_NODE does nothing
//   NODE_OPTIONS off              no code injected through the environment
//   --inspect / --inspect-brk off no debugger attached from the command line
//   OnlyLoadAppFromAsar on        the app code comes from app.asar only, never a loose app/ folder beside it
// Left as Electron's defaults, on purpose: cookie encryption (one-way; would sign everyone out on update),
// embedded asar integrity (needs the integrity record electron-builder 24 does not write), and file://
// privileges (the app loads its pages with loadFile). The app never starts itself as Node.
// Proven by tests/fuses.test.js, which reads the fuses back out of the built binaries.
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const FUSES = {
  RunAsNode: false,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  OnlyLoadAppFromAsar: true,
};
exports.FUSES = FUSES;

function electronBinary(context) {
  const name = context.packager.appInfo.productFilename;
  if (context.electronPlatformName === 'darwin') return path.join(context.appOutDir, `${name}.app`, 'Contents', 'MacOS', name);
  if (context.electronPlatformName === 'win32') return path.join(context.appOutDir, `${name}.exe`);
  return path.join(context.appOutDir, context.packager.executableName || name);
}
exports.electronBinary = electronBinary;

async function setFuses(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
  // No re-sign here: flipping a bit breaks the Mac signature, and the ad-hoc signing below (or electron-builder's
  // real signing, when a certificate is configured) signs the finished .app right after, detritus cleared first.
  const opts = { version: FuseVersion.V1, resetAdHocDarwinSignature: false };
  for (const k of Object.keys(FUSES)) opts[FuseV1Options[k]] = FUSES[k];
  const bin = electronBinary(context);
  await flipFuses(bin, opts);
  console.log(`[fuses] set on ${bin}: ` + Object.keys(FUSES).map(k => k + '=' + FUSES[k]).join(', '));
}

exports.default = async function afterPack(context) {
  // No catch: a build whose fuses could not be set must fail, not ship open.
  await setFuses(context);
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
