// Safety Lab Aero — preload for the settings window. Isolated, minimal surface.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('slabSettings', {
  get: () => ipcRenderer.invoke('slab:getConfig'),
  save: (cfg) => ipcRenderer.invoke('slab:saveConfig', cfg),
  licenseInfo: () => ipcRenderer.invoke('slab:licenseInfo'),
  replaceLicense: () => ipcRenderer.invoke('slab:replaceLicense'),
  version: () => ipcRenderer.invoke('slab:version'),
  applyAndReload: () => ipcRenderer.send('slab:applyAndReload')
});
