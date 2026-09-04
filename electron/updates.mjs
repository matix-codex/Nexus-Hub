import { EventEmitter } from 'node:events';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

export const RELEASES = 'https://github.com/matix-codex/Nexus-Hub/releases';
export const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const stable = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
export function newerStable(candidate, current) {
  if (!stable(candidate) || !stable(current)) return false;
  const a = candidate.split('.').map(BigInt), b = current.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function updateFile(info, current) {
  if (!newerStable(info?.version, current)) throw new Error('Geen nieuwere stabiele Nexus-versie.');
  const file = info.files?.find(f => f.url === `Nexus-Hub-Setup-${info.version}.exe`);
  if (!file || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512) || !Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error('De GitHub-release bevat geen geldige Nexus-installer met checksum.');
  }
  return file;
}
export async function verifyInstaller(file, expected) {
  const hash = createHash('sha512'); let size = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); size += chunk.length; }
  if (size !== expected.size || hash.digest('base64') !== expected.sha512) throw new Error('De installer is gewijzigd of beschadigd. Download de update opnieuw.');
}

// The renderer can request actions, but never supplies a version, URL or executable path.
export class Updates extends EventEmitter {
  constructor({ engine, version, enabled, automatic = () => true, prepareInstall = async () => {}, installFailed = () => {}, verify = verifyInstaller }) {
    super();
    Object.assign(this, { engine, version, enabled, automatic, prepareInstall, installFailed, verify });
    this.state = { status: enabled ? 'idle' : 'disabled', currentVersion: version, version: null, progress: 0, checkedAt: null, error: null, retry: 'check', prompt: 0 };
    this.announced = new Set(); this.busy = null; this.info = null; this.installer = null;
    engine.autoDownload = false;
    engine.autoInstallOnAppQuit = false;
    engine.allowPrerelease = false;
    engine.allowDowngrade = false;
    engine.disableWebInstaller = true;
    engine.autoRunAppAfterInstall = true;
    engine.on('error', error => this.fail(error));
    engine.on('download-progress', progress => {
      if (this.state.status !== 'downloading') return;
      const percent = Math.max(0, Math.min(100, Math.floor(Number(progress.percent) || 0)));
      if (percent !== this.state.progress) this.set({ progress: percent });
    });
  }
  snapshot() { return { ...this.state }; }
  set(value) { Object.assign(this.state, value); this.emit('state', this.snapshot()); }
  prompt() { this.set({ prompt: this.state.prompt + 1 }); }
  fail(error, retry = this.state.retry) {
    const raw = String(error?.message || error);
    const message = /checksum|sha512|beschadigd|gewijzigd/i.test(raw) ? 'De installer kon niet worden gecontroleerd. Download de update opnieuw.'
      : /ENOSPC/i.test(raw) ? 'Er is onvoldoende schijfruimte voor de update.'
      : /ENOTFOUND|ERR_INTERNET_DISCONNECTED|ECONN|ETIMEDOUT|net::|timeout/i.test(raw) ? 'GitHub is niet bereikbaar. Controleer je internetverbinding en probeer opnieuw.'
      : /404|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/i.test(raw) ? 'De updatebestanden staan nog niet klaar op GitHub. Probeer het later opnieuw.'
      : retry === 'install' ? 'Installeren is niet gestart. Probeer opnieuw of download de update opnieuw.'
      : 'De update kon niet worden opgehaald. Probeer opnieuw of bekijk de release op GitHub.';
    this.set({ status: 'error', error: message, retry });
  }
  start() {
    if (!this.enabled || this.interval) return;
    const check = () => { if (this.automatic()) void this.check(); };
    this.startup = setTimeout(check, 15000); this.startup.unref?.();
    this.interval = setInterval(check, CHECK_INTERVAL); this.interval.unref?.();
  }
  stop() { clearTimeout(this.startup); clearInterval(this.interval); this.interval = null; }
  check() {
    if (!this.enabled || this.busy || ['downloaded', 'installing'].includes(this.state.status)) return this.busy || Promise.resolve(this.snapshot());
    this.set({ status: 'checking', error: null, retry: 'check' });
    this.busy = Promise.resolve().then(async () => {
      try {
        const result = await this.engine.checkForUpdates();
        if (!result?.updateInfo) throw new Error('Geen releasegegevens ontvangen.');
        this.set({ checkedAt: Date.now() });
        if (!newerStable(result.updateInfo.version, this.version) || result.isUpdateAvailable === false) {
          this.info = null; this.set({ status: 'current', version: null, progress: 0 });
        } else {
          updateFile(result.updateInfo, this.version);
          this.info = result.updateInfo;
          this.set({ status: 'available', version: this.info.version, progress: 0, retry: 'download' });
          if (!this.announced.has(this.info.version)) { this.announced.add(this.info.version); this.prompt(); this.emit('available', this.snapshot()); }
        }
      } catch (error) { this.fail(error, 'check'); }
      finally { this.busy = null; }
      return this.snapshot();
    });
    return this.busy;
  }
  download() {
    if (!this.enabled || this.busy) return this.busy || Promise.resolve(this.snapshot());
    if (!this.info || !['available', 'error'].includes(this.state.status)) return Promise.resolve(this.snapshot());
    this.installer = null;
    this.set({ status: 'downloading', progress: 0, error: null, retry: 'download' });
    this.busy = Promise.resolve().then(async () => {
      try {
        const expected = updateFile(this.info, this.version);
        const files = await this.engine.downloadUpdate();
        if (!files?.[0]) throw new Error('Geen installer ontvangen.');
        await this.verify(files[0], expected);
        this.installer = files[0];
        this.set({ status: 'downloaded', progress: 100, retry: 'install' });
        this.prompt();
      } catch (error) { this.fail(error, 'download'); }
      finally { this.busy = null; }
      return this.snapshot();
    });
    return this.busy;
  }
  install() {
    if (!this.enabled || this.busy) return this.busy || Promise.resolve(this.snapshot());
    if (!this.installer || !(this.state.status === 'downloaded' || (this.state.status === 'error' && this.state.retry === 'install'))) return Promise.resolve(this.snapshot());
    this.set({ status: 'installing', error: null, retry: 'install' });
    this.busy = Promise.resolve().then(async () => {
      try {
        // Re-check even after 'Later': the cached file may have changed since download.
        try { await this.verify(this.installer, updateFile(this.info, this.version)); }
        catch (error) { this.installer = null; this.fail(error, 'download'); return this.snapshot(); }
        await this.prepareInstall();
        this.engine.quitAndInstall(false, true);
        if (this.state.status === 'error') this.installFailed();
      } catch (error) { this.installFailed(); this.fail(error, 'install'); }
      finally { this.busy = null; }
      return this.snapshot();
    });
    return this.busy;
  }
  releaseUrl() { return this.info ? `${RELEASES}/tag/v${this.info.version}` : `${RELEASES}/latest`; }
}
