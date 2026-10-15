const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sanadDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: '1.0.0',
  sendMessage: (channel, data) => ipcRenderer.send(channel, data),
  onMessage: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
});
