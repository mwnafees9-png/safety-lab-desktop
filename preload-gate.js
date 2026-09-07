// Safety Lab Aero — preload for the gate windows (onboarding + lock). Isolated, minimal surface.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gate', {
  getBootstrap: () => ipcRenderer.invoke('gate:getBootstrap'),
  checkLicense: (blob) => ipcRenderer.invoke('gate:checkLicense', blob),
  pickLicenseFile: () => ipcRenderer.invoke('gate:pickLicenseFile'),
  complete: (data) => ipcRenderer.invoke('gate:complete', data),
  unlock: (data) => ipcRenderer.invoke('gate:unlock', data),
  reactivate: () => ipcRenderer.send('gate:reactivate'),
  quit: () => ipcRenderer.send('gate:quit')
});
