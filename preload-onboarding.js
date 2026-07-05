// Safety Lab Aero — preload for the gate windows (onboarding + sign-in). Minimal surface.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gate', {
  getBootstrap: () => ipcRenderer.invoke('gate:getBootstrap'),
  validateLicense: (key) => ipcRenderer.invoke('gate:validateLicense', key),
  pickLicenseFile: () => ipcRenderer.invoke('gate:pickLicenseFile'),
  complete: (data) => ipcRenderer.invoke('gate:complete', data),
  signin: (data) => ipcRenderer.invoke('gate:signin', data),
  reactivate: () => ipcRenderer.send('gate:reactivate'),
  quit: () => ipcRenderer.send('gate:quit')
});
