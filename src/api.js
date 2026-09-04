import { DEFAULTS, SERVICES, LAUNCHERS } from '../electron/config.mjs';

// Browser preview deliberately exposes no fabricated hardware or installed games.
const previewKey = 'nexus-preview-v1';
let preview = structuredClone(DEFAULTS);
try { preview = { ...preview, ...JSON.parse(localStorage.getItem(previewKey) || '{}') }; } catch {}
const listeners = new Set();
const state = () => ({ ...preview, preview: true, library: { games: [], startApps: [], warnings: [], scanning: false }, displays: [], services: SERVICES, launchers: LAUNCHERS, version: '1.0.0' });
function save() { localStorage.setItem(previewKey, JSON.stringify(preview)); const data = state(); listeners.forEach(fn => fn(data)); return Promise.resolve(data); }
const desktop = () => Promise.reject(new Error('Open de Nexus Hub-desktopapp voor deze Windows-functie.'));
export const api = window.nexus || {
  updateCheck: desktop, updateDownload: desktop, updateInstall: desktop, updateRelease: desktop, onUpdate: () => () => {},
  rgbInstallMsi: desktop, chooseCover: desktop, radioSearch: desktop, radioFavorite: desktop, rgbStatus: desktop, rgbApply: desktop, rgbOpen: desktop,
  bootstrap: async () => ({ state: state(), metrics: {} }),
  onState: fn => { listeners.add(fn); return () => listeners.delete(fn); }, onMetrics: () => () => {}, onService: () => () => {}, onShortcut: () => () => {},
  settings: value => { Object.assign(preview.settings, value); return save(); },
  layout: (profile, widgets, sizes) => { preview.layouts[profile] = widgets; if (sizes) Object.assign(preview.sizes, sizes); return save(); },
  notes: value => { preview.notes = value; return save(); },
  timer: value => { preview.timer = { ...value, endsAt: value.running ? Date.now() + value.remaining * 1000 : null }; return save(); },
  webWidget: value => { const w = { ...value, id: `web-${crypto.randomUUID()}` }; preview.webWidgets.push(w); preview.layouts[preview.settings.profile].push(w.id); return save(); },
  removeWebWidget: id => { preview.webWidgets = preview.webWidgets.filter(w => w.id !== id); for (const p in preview.layouts) preview.layouts[p] = preview.layouts[p].filter(w => w !== id); return save(); },
  serviceBounds: async () => {}, service: action => action === 'hide' ? Promise.resolve() : desktop(),
  window: async action => { if (action === 'exit-fullscreen') { if (document.fullscreenElement) await document.exitFullscreen(); } else if (action === 'fullscreen') { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } else await desktop(); },
  scanGames: desktop, launchGame: desktop, addGame: desktop, addStartApp: desktop, removeGame: desktop, favorite: desktop,
  audio: desktop, media: desktop, launcher: desktop, exportConfig: desktop, importConfig: desktop,
};
