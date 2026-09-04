const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('nexus', {
  rgbInstallMsi: invoke('rgb:install-msi'), chooseCover: invoke('games:cover'), radioSearch: invoke('radio:search'), radioFavorite: invoke('radio:favorite'), rgbStatus: invoke('rgb:status'), rgbApply: invoke('rgb:apply'), rgbOpen: invoke('rgb:open'),
  bootstrap: invoke('bootstrap'), scanGames: invoke('games:scan'), launchGame: invoke('games:launch'),
  addGame: invoke('games:add'), addStartApp: invoke('games:add-start'), removeGame: invoke('games:remove'), favorite: invoke('games:favorite'),
  settings: invoke('settings:save'), layout: invoke('layout:save'), notes: invoke('notes:save'), timer: invoke('timer:save'),
  webWidget: invoke('widgets:web'), removeWebWidget: invoke('widgets:remove'),
  window: invoke('window:action'), audio: invoke('audio:action'), media: invoke('media:action'),
  launcher: invoke('launcher:open'), service: invoke('service:action'), serviceBounds: invoke('service:bounds'),
  exportConfig: invoke('config:export'), importConfig: invoke('config:import'),
  onState(callback) { const listener = (_event, data) => callback(data); ipcRenderer.on('state', listener); return () => ipcRenderer.removeListener('state', listener); },
  onMetrics(callback) { const listener = (_event, data) => callback(data); ipcRenderer.on('metrics', listener); return () => ipcRenderer.removeListener('metrics', listener); },
  onService(callback) { const listener = (_event, data) => callback(data); ipcRenderer.on('service:status', listener); return () => ipcRenderer.removeListener('service:status', listener); },
  onShortcut(callback) { const listener = (_event, data) => callback(data); ipcRenderer.on('shortcut', listener); return () => ipcRenderer.removeListener('shortcut', listener); },
});
