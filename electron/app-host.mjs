import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export class AppHost extends EventEmitter {
  constructor(directory, parent, profile, testing = false) {
    super(); this.pending = new Map(); this.sequence = 0; this.ready = false;
    this.child = spawn(path.join(directory, 'webview2', 'Nexus.AppHost.exe'), [parent, profile, ...(testing ? ['--test'] : [])], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.started = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('Spotify reageert niet. Installeer Microsoft Edge WebView2 Runtime of probeer opnieuw.')); this.stop(); }, 30000);
      this.once('ready', () => { clearTimeout(timeout); resolve(); });
      this.once('fatal', message => { clearTimeout(timeout); reject(new Error(message)); });
    });
    readline.createInterface({ input: this.child.stdout }).on('line', line => {
      let data; try { data = JSON.parse(line); } catch { return; }
      if (data.ready) { this.ready = true; this.emit('ready', data); }
      if (data.fatal) this.emit('fatal', data.error);
      if (data.id != null) {
        const item = this.pending.get(data.id);
        if (item) { clearTimeout(item.timeout); this.pending.delete(data.id); data.error ? item.reject(new Error(data.error)) : item.resolve(data.result); }
      } else this.emit('status', data);
    });
    this.child.stderr.on('data', () => {});
    this.child.stdin.on('error', () => {});
    this.child.on('error', error => this.emit('fatal', error.message));
    this.child.on('exit', () => {
      clearTimeout(this.stopTimer);
      this.ready = false;
      const error = new Error('De lokale app is gestopt. Klik op opnieuw laden.');
      this.emit('fatal', error.message);
      for (const item of this.pending.values()) { clearTimeout(item.timeout); item.reject(error); }
      this.pending.clear(); this.emit('exit');
    });
  }
  async request(action, value) {
    await this.started;
    if (!this.ready) throw new Error('De lokale app is nog niet beschikbaar.');
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('De app reageerde niet op tijd.')); }, 20000);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(JSON.stringify({ id, action, value }) + '\n');
    });
  }
  stop() { this.child.stdin.end(); this.stopTimer = setTimeout(() => this.child.kill(), 5000); this.stopTimer.unref(); }
}
