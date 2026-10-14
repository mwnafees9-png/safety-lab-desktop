#!/usr/bin/env node
/*
 * Regression: the desktop app lets the page use a 3Dconnexion SpaceMouse and nothing else over HID (14 Oct 2026).
 * Run: node tests/regression_hid_guard_20261014.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), EventEmitter = require('events');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' -- ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'hid_guard.js'), 'utf8');
function load(src) { const m = { exports: {} }; new Function('module', 'exports', 'require', src)(m, m.exports, require); return m.exports; }
const H = load(SRC);
const APP = 'file://';

function cases(H) {
  const o = {};
  o.navigator = H.isSpaceMouse({ vendorId: 0x046d, productId: 0xc626 });
  o.pro = H.isSpaceMouse({ vendorId: 0x046d, productId: 0xc62b });
  o.any256f = H.isSpaceMouse({ vendorId: 0x256f, productId: 0xc635 });
  o.mouseRejected = !H.isSpaceMouse({ vendorId: 0x046d, productId: 0xc52b });
  o.keyboardRejected = !H.isSpaceMouse({ vendorId: 0x046d, productId: 0xc31c });
  o.otherRejected = !H.isSpaceMouse({ vendorId: 0x05ac, productId: 0x0250 });
  o.allowApp = H.allowDevice({ deviceType: 'hid', origin: APP, device: { vendorId: 0x256f, productId: 0xc635 } }) === true;
  o.denyWeb = H.allowDevice({ deviceType: 'hid', origin: 'https://example.com', device: { vendorId: 0x256f, productId: 0xc635 } }) === false;
  o.denyMouse = H.allowDevice({ deviceType: 'hid', origin: APP, device: { vendorId: 0x046d, productId: 0xc52b } }) === false;
  o.denyUsb = H.allowDevice({ deviceType: 'usb', origin: APP, device: { vendorId: 0x256f, productId: 0xc635 } }) === false;
  o.pick = H.pickDevice([{ deviceId: 'm', vendorId: 0x046d, productId: 0xc52b }, { deviceId: 's', vendorId: 0x256f, productId: 0xc635 }]) === 's';
  o.pickNone = H.pickDevice([{ deviceId: 'm', vendorId: 0x046d, productId: 0xc52b }]) === '';
  o.checkHidApp = H.checkPermission('hid', APP) === true;
  o.checkHidWeb = H.checkPermission('hid', 'https://example.com') === false;
  o.checkOtherDefault = H.checkPermission('clipboard-read', APP) === null;
  return o;
}

console.log('\n[rules]');
const c = cases(H);
check('a SpaceNavigator and a SpaceMouse Pro (Logitech vendor, 3Dconnexion products) are accepted', c.navigator && c.pro);
check('any 3Dconnexion-vendor device is accepted', c.any256f);
check('a Logitech mouse, a Logitech keyboard and another vendor are refused', c.mouseRejected && c.keyboardRejected && c.otherRejected);
check('device permission: the app page gets a SpaceMouse; a web origin, a mouse and a non-HID device are refused', c.allowApp && c.denyWeb && c.denyMouse && c.denyUsb);
check('the device chosen for the page is the SpaceMouse, or none', c.pick && c.pickNone);
check('HID permission only for the app page; other permissions keep the default', c.checkHidApp && c.checkHidWeb && c.checkOtherDefault);

console.log('\n[install] wired to a session');
{
  class FakeSession extends EventEmitter { setPermissionCheckHandler(f) { this.check = f; } setDevicePermissionHandler(f) { this.dev = f; } }
  const s = new FakeSession(); H.install(s);
  let picked = null, prevented = false;
  s.emit('select-hid-device', { preventDefault() { prevented = true; } }, { deviceList: [{ deviceId: 'k', vendorId: 0x046d, productId: 0xc31c }, { deviceId: 'sm', vendorId: 0x046d, productId: 0xc626 }] }, (id) => { picked = id; });
  check('select-hid-device: no chooser, the SpaceMouse is picked', prevented && picked === 'sm');
  check('the session permission handlers are the guarded ones', s.check(null, 'hid', 'https://x.example') === false && s.check(null, 'notifications', APP) === true && s.dev({ deviceType: 'hid', origin: APP, device: { vendorId: 0x046d, productId: 0xc52b } }) === false);
}

console.log('\n[main.js and packaging]');
const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('main.js installs the guard on the app session', /require\('\.\/hid_guard\.js'\)/.test(MAIN) && /HID\.install\(part\)/.test(MAIN));
check('hid_guard.js is packaged', (PKG.build.files || []).indexOf('hid_guard.js') >= 0);
const EM = String.fromCharCode(0x2014);
check('no em dash in the new files', SRC.indexOf(EM) < 0 && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);

console.log('\n[web app] the list matches SLSpaceMouse.DEVICES');
const WEB = path.join(ROOT, '..', 'safety-lab-deploy', 'site', 'spacemouse.js');
if (fs.existsSync(WEB)) {
  const w = fs.readFileSync(WEB, 'utf8'); const grab = (t) => (t.match(/productId:\s*0x[0-9a-f]+|vendorId:\s*0x[0-9a-f]+(?!\s*,\s*productId)/gi) || []).map((x) => x.replace(/\s+/g, '').toLowerCase()).sort().join(',');
  check('the desktop list and the web list name the same devices', grab(w) === grab(SRC), grab(w) + ' vs ' + grab(SRC));
} else console.log('  SKIP  web repo not next to this one');

console.log('\n[mutations]');
const mut = (from, to, key) => { const s2 = SRC.replace(from, to); if (s2 === SRC) return 'unchanged'; return cases(load(s2))[key]; };
check('M1 accepting all of Logitech is caught', mut('(f.productId == null || f.productId === p)', 'true', 'mouseRejected') === false);
check('M2 allowing any origin is caught', mut("isAppOrigin(details.origin) && ", '', 'denyWeb') === false);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
