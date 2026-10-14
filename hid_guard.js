'use strict';
// ============================================================================
// hid_guard.js: lets the app page use a 3Dconnexion SpaceMouse over WebHID (14 Oct 2026).
//
// The web app's site/spacemouse.js asks for a SpaceMouse with navigator.hid. Electron shows no
// device chooser, so the main process picks the device itself, and only ever a 3Dconnexion one:
// vendor 0x256f (any product), or Logitech 0x046d with a 3Dconnexion product ID. Every other HID
// device (Logitech mice and keyboards included) is refused. The list mirrors SLSpaceMouse.DEVICES
// in the web app; tests/regression_hid_guard_20261014.test.js checks both lists agree when the web
// repo sits next to this one.
// Only the app's own page (file://) may use HID; any other origin is refused.
// ============================================================================
const DEVICES = [
  { vendorId: 0x256f },                       // 3Dconnexion, any product
  { vendorId: 0x046d, productId: 0xc603 },    // SpaceMouse Plus XT (USB); source: FreeSpacenav (spacenavd) device table
  { vendorId: 0x046d, productId: 0xc623 },    // SpaceTraveler
  { vendorId: 0x046d, productId: 0xc625 },    // SpacePilot
  { vendorId: 0x046d, productId: 0xc626 },    // SpaceNavigator
  { vendorId: 0x046d, productId: 0xc627 },    // SpaceExplorer
  { vendorId: 0x046d, productId: 0xc628 },    // SpaceNavigator for Notebooks
  { vendorId: 0x046d, productId: 0xc629 },    // SpacePilot Pro
  { vendorId: 0x046d, productId: 0xc62b }     // SpaceMouse Pro
];

function isSpaceMouse(dev) {
  if (!dev) return false;
  const v = Number(dev.vendorId), p = Number(dev.productId);
  return DEVICES.some((f) => f.vendorId === v && (f.productId == null || f.productId === p));
}
function isAppOrigin(origin) { return typeof origin === 'string' && /^file:\/\//i.test(origin); }

// Pure decisions (tested without Electron).
function checkPermission(permission, origin) {
  if (permission === 'hid') return isAppOrigin(origin);
  return null; // not ours: keep Electron's default
}
function allowDevice(details) {
  return !!details && details.deviceType === 'hid' && isAppOrigin(details.origin) && isSpaceMouse(details.device);
}
function pickDevice(deviceList) {
  const d = (deviceList || []).find(isSpaceMouse);
  return d ? d.deviceId : '';
}

function install(ses) {
  ses.setPermissionCheckHandler((wc, permission, origin) => {
    const r = checkPermission(permission, origin);
    return r === null ? true : r; // Electron's default without a handler is to allow
  });
  ses.setDevicePermissionHandler((details) => allowDevice(details));
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    callback(pickDevice(details && details.deviceList));
  });
  ses.on('hid-device-added', () => {});
  ses.on('hid-device-removed', () => {});
}

module.exports = { DEVICES, isSpaceMouse, isAppOrigin, checkPermission, allowDevice, pickDevice, install };
