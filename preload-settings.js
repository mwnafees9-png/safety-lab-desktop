// Safety Lab Aero — preload for the settings window (isolated, minimal surface).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('slabSettings', {
  get: () => ipcRenderer.invoke('slab:getConfig'),
  save: (cfg) => ipcRenderer.invoke('slab:saveConfig', cfg),
  applyAndReload: () => ipcRenderer.send('slab:applyAndReload')
});
