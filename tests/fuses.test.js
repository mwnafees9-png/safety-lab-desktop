#!/usr/bin/env node
/*
 * Regression — SEC-10: the shipped app's Electron fuses (18 Oct 2026).
 *
 * Found by tests/runtime_isolation_probe.mjs (SEC-8): the shipped 0.20.3 ran as a plain Node.js process
 * when started with ELECTRON_RUN_AS_NODE=1, and accepted NODE_OPTIONS and --inspect from whoever started
 * it. Anyone who can start the app could run code with its identity (its keychain entries, its signature).
 * afterPack.js now sets the fuses, bits in the Electron binary itself, before any signature.
 *
 *   [A] afterPack.js: the four fuses, set first, on every platform, with no catch around them
 *   [B] on a real Electron binary (a copy of node_modules/electron): set them, read them back, and
 *       start it with ELECTRON_RUN_AS_NODE=1, NODE_OPTIONS and --inspect: none of them works after
 *   [C] the built apps in dist/, when present: their fuses read back as set
 *
 * Run: node tests/fuses.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const AP = path.join(ROOT, 'afterPack.js');
const src = fs.readFileSync(AP, 'utf8');
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const FuseState = require('@electron/fuses/dist/constants').FuseState;   // not re-exported by 1.8.0

(async () => {
  console.log('\n[A] afterPack.js');
  const ap = require(AP);
  check('the four fuses: RunAsNode, NODE_OPTIONS and --inspect off; app code from app.asar only',
    JSON.stringify(ap.FUSES) === JSON.stringify({ RunAsNode: false, EnableNodeOptionsEnvironmentVariable: false, EnableNodeCliInspectArguments: false, OnlyLoadAppFromAsar: true }), JSON.stringify(ap.FUSES));
  const body = src.slice(src.indexOf('exports.default'));
  check('they are set first, before the platform check, so Windows gets them too', /exports\.default = async function afterPack\(context\) \{\n(\s*\/\/[^\n]*\n)*\s*await setFuses\(context\);\n\s*if \(context\.electronPlatformName !== 'darwin'\) return;/.test(body));
  check('...before the ad-hoc signature', body.indexOf('await setFuses(context)') < body.indexOf("execFileSync('codesign'"));
  check('a failure to set them fails the build (no catch around it)', !/try \{[^}]*setFuses/.test(src));
  check('the binary path: inside the .app on a Mac, the .exe on Windows',
    ap.electronBinary({ electronPlatformName: 'darwin', appOutDir: '/o', packager: { appInfo: { productFilename: 'Safety Lab Aero' } } }) === '/o/Safety Lab Aero.app/Contents/MacOS/Safety Lab Aero' &&
    ap.electronBinary({ electronPlatformName: 'win32', appOutDir: 'C:/o', packager: { appInfo: { productFilename: 'Safety Lab Aero' } } }) === path.join('C:/o', 'Safety Lab Aero.exe'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('@electron/fuses is pinned to an exact version', /^\d+\.\d+\.\d+$/.test((pkg.devDependencies || {})['@electron/fuses'] || ''), (pkg.devDependencies || {})['@electron/fuses']);
  check('afterPack.js is the build\'s afterPack hook', pkg.build && pkg.build.afterPack === 'afterPack.js');

  const want = b => {
    const w = b.wire || b;
    return {
      runAsNode: w[FuseV1Options.RunAsNode] === FuseState.DISABLE,
      nodeOptions: w[FuseV1Options.EnableNodeOptionsEnvironmentVariable] === FuseState.DISABLE,
      inspect: w[FuseV1Options.EnableNodeCliInspectArguments] === FuseState.DISABLE,
      asarOnly: w[FuseV1Options.OnlyLoadAppFromAsar] === FuseState.ENABLE,
    };
  };
  const allSet = f => f.runAsNode && f.nodeOptions && f.inspect && f.asarOnly;

  console.log('\n[B] on a real Electron binary');
  if (process.platform !== 'darwin') { console.log('  note  [B] runs on a Mac only (it starts the binary)'); }
  else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-fuses-'));
    try {
      cp.execFileSync('cp', ['-cR', path.join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app'), tmp]);
      const bin = path.join(tmp, 'Electron.app', 'Contents', 'MacOS', 'Electron');
      const runNode = (env, args) => {
        const r = cp.spawnSync(bin, args || ['-e', 'console.log("RAN-AS-NODE " + process.versions.node)'], { env: Object.assign({}, process.env, env), timeout: 8000, encoding: 'utf8', killSignal: 'SIGKILL' });
        return String(r.stdout || '') + String(r.stderr || '');
      };
      // a tiny app, packed as an asar, that says it ran and quits: the same app before and after
      const appDir = path.join(tmp, 'tiny');
      fs.mkdirSync(appDir);
      fs.writeFileSync(path.join(appDir, 'package.json'), '{"name":"tiny","main":"main.js"}');
      fs.writeFileSync(path.join(appDir, 'main.js'), 'const { app } = require("electron"); console.log("APP-RAN"); app.whenReady().then(() => setTimeout(() => app.quit(), 300));');
      // as Resources/app.asar, where the real app's code lives (OnlyLoadAppFromAsar loads only from there)
      const asar = path.join(tmp, 'Electron.app', 'Contents', 'Resources', 'app.asar');
      await require('@electron/asar').createPackage(appDir, asar);
      const marker = path.join(tmp, 'injected.js'); fs.writeFileSync(marker, 'console.log("NODE-OPTIONS-INJECTED")');
      const before = runNode({ ELECTRON_RUN_AS_NODE: '1' });
      check('before: ELECTRON_RUN_AS_NODE=1 runs it as Node.js (the hole)', /RAN-AS-NODE/.test(before), before.slice(0, 120));
      const injB = runNode({ NODE_OPTIONS: '--require ' + marker }, []);
      check('before: NODE_OPTIONS injects code into it (the hole)', /NODE-OPTIONS-INJECTED/.test(injB) && /APP-RAN/.test(injB), injB.slice(0, 200));
      const inspB = runNode({}, ['--inspect=0']);
      check('before: --inspect opens a debugger on it (the hole)', /Debugger listening/.test(inspB), inspB.slice(0, 200));
      await ap.default({ electronPlatformName: 'darwin', appOutDir: tmp, packager: { appInfo: { productFilename: 'Electron' } } }).catch(e => { throw e; });
      const f = want(await getCurrentFuseWire(bin));
      check('after: the fuses read back as set', allSet(f), JSON.stringify(f));
      check('after: the binary still has a valid signature (it starts on Apple Silicon)', (() => { try { cp.execFileSync('codesign', ['--verify', path.join(tmp, 'Electron.app')], { stdio: 'pipe' }); return true; } catch (e) { return false; } })());
      const after = runNode({ ELECTRON_RUN_AS_NODE: '1' });
      check('after: ELECTRON_RUN_AS_NODE=1 no longer runs it as Node.js', !/RAN-AS-NODE/.test(after), after.slice(0, 200));
      const inj = runNode({ NODE_OPTIONS: '--require ' + marker }, []);
      check('after: the app still runs, and NODE_OPTIONS cannot inject code', /APP-RAN/.test(inj) && !/NODE-OPTIONS-INJECTED/.test(inj), inj.slice(0, 200));
      const insp = runNode({}, ['--inspect=0']);
      check('after: --inspect does not open a debugger', /APP-RAN/.test(insp) && !/Debugger listening/.test(insp), insp.slice(0, 200));
      // a loose app/ folder in place of app.asar (how a tampered install would swap the code) is not loaded
      fs.renameSync(asar, asar + '.off');
      const loose = path.join(tmp, 'Electron.app', 'Contents', 'Resources', 'app');
      fs.mkdirSync(loose); fs.writeFileSync(path.join(loose, 'package.json'), '{"name":"loose","main":"main.js"}');
      fs.writeFileSync(path.join(loose, 'main.js'), 'console.log("LOOSE-RAN"); require("electron").app.quit();');
      const lo = runNode({}, []);
      check('after: a loose app/ folder in place of app.asar is not run', !/LOOSE-RAN/.test(lo), lo.slice(0, 200));
    } catch (e) { check('[B] finished', false, String(e && e.stack || e)); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  console.log('\n[C] the built apps in dist/');
  const built = [
    path.join(ROOT, 'dist', 'mac-arm64', 'Safety Lab Aero.app', 'Contents', 'MacOS', 'Safety Lab Aero'),
    path.join(ROOT, 'dist', 'mac', 'Safety Lab Aero.app', 'Contents', 'MacOS', 'Safety Lab Aero'),
    path.join(ROOT, 'dist', 'win-unpacked', 'Safety Lab Aero.exe'),
  ].filter(p => fs.existsSync(p) && fs.statSync(p).mtimeMs > fs.statSync(AP).mtimeMs);
  if (!built.length) console.log('  note  no build newer than afterPack.js in dist/: [C] runs after the next release build');
  for (const b of built) { const f = want(await getCurrentFuseWire(b)); check(path.relative(ROOT, b) + ': fuses set', allSet(f), JSON.stringify(f)); }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
