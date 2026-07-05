// electron-builder afterSign hook. Notarizes the macOS app ONLY when Apple credentials are
// present in the environment; otherwise it skips cleanly so unsigned builds (Mac and Windows)
// still succeed. When your Apple Developer cert is ready, set these env vars and it activates
// automatically — no config changes needed:
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
'use strict';
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return; // notarization is macOS-only
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('[notarize] skipped — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID to enable.');
    return;
  }
  const appName = context.packager.appInfo.productFilename;
  console.log('[notarize] notarizing ' + appName + '.app …');
  await notarize({
    appBundleId: 'com.safetylabaero.desktop',
    appPath: appOutDir + '/' + appName + '.app',
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  });
  console.log('[notarize] done.');
};
