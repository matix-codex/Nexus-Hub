import { Client } from 'openrgb-sdk';
import { NativeBridge, runPowerShell } from './native.mjs';
import { shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
export function rgbColor(value) {
  if (!/^#[a-f0-9]{6}$/i.test(value?.color) || !Number.isFinite(value.brightness) || value.brightness < 0 || value.brightness > 100 || !Array.isArray(value.ids) || !value.ids.length || value.ids.length > 256 || value.ids.some(id => typeof id !== 'string')) throw new Error('Kies apparaten, een kleur en een helderheid tussen 0 en 100.');
  return [1, 3, 5].map(index => Math.round(parseInt(value.color.slice(index, index + 2), 16) * value.brightness / 100));
}
const deadline = (promise, ms = 6000) => new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('RGB-verbinding reageert niet op tijd.')), ms); promise.then(resolve, reject).finally(() => clearTimeout(timeout)); });
export class RGB {
  constructor(directory, dataDirectory) { this.directory = directory; this.sdkDirectory = path.join(dataDirectory, 'rgb-sdk'); this.sdkFile = path.join(this.sdkDirectory, 'MysticLight_SDK_x64.dll'); this.bridges = Object.fromEntries(['msi', 'icue'].map(id => [id, new NativeBridge(directory, 'rgb.ps1', ['-Provider', id, '-SdkPath', this.sdkFile], 25000)])); this.devices = []; this.openDevices = new Map(); this.busy = false; }
  async installMsi() {
    if (this.busy) throw new Error('Wacht totdat apparaten zoeken klaar is.'); this.busy = true;
    try {
      const response = await fetch('https://download.msi.com/uti_exe/Mystic_light_SDK.zip', { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('De officiële MSI-download is niet bereikbaar.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== '799f06c8cbaba8854d6b30883c3e15c2d992c0a86130427fdc7df5f5f2dc7307') throw new Error('De MSI-download is gewijzigd. Deze Nexus-versie verwacht SDK 1.0.0.08.');
      await fs.mkdir(this.sdkDirectory, { recursive: true }); const archive = path.join(this.sdkDirectory, 'msi.zip'); await fs.writeFile(archive, bytes);
      const previous = this.bridges.msi; previous.stop();
      if (previous.child && previous.child.exitCode == null) await deadline(new Promise(resolve => previous.child.once('exit', resolve)), 8000).catch(() => {});
      await runPowerShell(path.join(this.directory, 'extract-msi-sdk.ps1'), ['-Archive', archive, '-Destination', this.sdkFile]);
      const dll = await fs.readFile(this.sdkFile); if (crypto.createHash('sha256').update(dll).digest('hex') !== 'ad1bd5a464c120f086839631cf9cb7a56e8e7373209158e66c628a89be06d166') throw new Error('MSI SDK-controle mislukt.');
      this.bridges.msi = new NativeBridge(this.directory, 'rgb.ps1', ['-Provider', 'msi', '-SdkPath', this.sdkFile], 25000);
      return true;
    } finally { this.busy = false; }
  }
  async ready(bridge) {
    if (bridge.ready) return;
    if (!bridge.child || bridge.stopped) { bridge.stopped = false; bridge.start(); }
    return deadline(new Promise(resolve => bridge.once('ready', resolve)), 15000);
  }
  async status() {
    if (this.busy) throw new Error('RGB wordt al bijgewerkt.'); this.busy = true;
    try {
      const responses = await Promise.all(Object.entries(this.bridges).map(async ([id, bridge]) => {
        try { await this.ready(bridge); return await bridge.request('status'); }
        catch (error) { return { devices: [], providers: [{ id, name: id === 'msi' ? 'MSI Mystic Light' : 'Corsair iCUE', available: false, detail: error.message }] }; }
      }));
      const native = { devices: responses.flatMap(r => r.devices), providers: responses.flatMap(r => r.providers) };
      this.openDevices.clear(); this.client?.socket?.destroy();
      const client = new Client('Nexus Hub', 6742, '127.0.0.1'); this.client = client;
      client.on('error', () => { if (this.client === client) this.client = null; });
      let openProvider;
      try {
        await deadline(client.connect()); const count = await deadline(client.getControllerCount());
        for (let i = 0; i < Math.min(count, 128); i++) {
          const device = await deadline(client.getControllerData(i));
          if (!device.colors?.length || !device.modes?.some(mode => /^direct$/i.test(mode.name))) continue;
          this.openDevices.set(`openrgb:${i}`, { ...device, index: i });
        }
        openProvider = { id: 'openrgb', name: 'GIGABYTE / OpenRGB', available: true, detail: `${this.openDevices.size} apparaten via lokale SDK-server. Gebruik per apparaat één RGB-controller.` };
      } catch { client.socket?.destroy(); this.client = null; openProvider = { id: 'openrgb', name: 'GIGABYTE / OpenRGB', available: false, detail: 'Start OpenRGB en zet SDK Server aan op 127.0.0.1:6742. Ondersteunde GIGABYTE-, MSI- en Corsair-apparaten verschijnen hier.' }; }
      this.devices = [...native.devices, ...[...this.openDevices].map(([id, device]) => ({ id, name: device.name, provider: device.vendor || 'OpenRGB', leds: device.colors.length }))];
      return { devices: this.devices, providers: [...native.providers, openProvider] };
    } finally { this.busy = false; }
  }
  async apply(value) {
    const [r, g, b] = rgbColor(value);
    if (this.busy) throw new Error('RGB wordt al bijgewerkt.');
    if (value.ids.some(id => !this.devices.some(device => device.id === id))) throw new Error('Apparaten zijn veranderd. Zoek ze opnieuw.');
    this.busy = true; const results = [];
    try {
      for (const id of [...new Set(value.ids)]) {
        try {
          if (id.startsWith('openrgb:')) {
            const device = this.openDevices.get(id); if (!this.client || !device) throw new Error('OpenRGB is niet verbonden.');
            const mode = device.modes.find(mode => /^direct$/i.test(mode.name));
            await deadline(this.client.updateMode(device.index, mode.name));
            await deadline(this.client.updateLeds(device.index, Array.from({ length: device.colors.length }, () => ({ red: r, green: g, blue: b }))));
            results.push({ id, ok: true, detail: 'Naar OpenRGB verstuurd' });
          } else { await this.bridges[id.split(':')[0]].request('apply', { id, r, g, b }); results.push({ id, ok: true, detail: 'Door SDK bevestigd' }); }
        } catch (error) { results.push({ id, ok: false, detail: error.message }); }
      }
      return results;
    } finally { this.busy = false; }
  }
  async open(id) {
    if (id === 'openrgb') return shell.openExternal('https://openrgb.org/');
    if (id === 'msi') return new Promise((resolve, reject) => { const child = spawn(path.join(process.env.SystemRoot, 'explorer.exe'), ['shell:AppsFolder\\9426MICRO-STARINTERNATION.MSICenter_kzh8wxbdkxb8p!App'], { detached: true, stdio: 'ignore', windowsHide: true }); child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); }); });
    const pf = process.env.ProgramFiles;
    const file = id === 'icue' ? path.join(pf, 'Corsair', 'Corsair iCUE5 Software', 'iCUE.exe') : id === 'gigabyte' ? path.join(pf, 'GIGABYTE', 'Control Center', 'LaunchGCC.exe') : null;
    if (!file) throw new Error('Onbekende RGB-app.'); await fs.access(file);
    const error = await shell.openPath(file); if (error) throw new Error(error);
  }
  stop() { Object.values(this.bridges).forEach(bridge => bridge.stop()); this.client?.socket?.destroy(); }
}
