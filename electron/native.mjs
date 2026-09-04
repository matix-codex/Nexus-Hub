import { spawn, execFile } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';

export const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
export function runPowerShell(file, args = []) {
  return new Promise((resolve, reject) => execFile(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { windowsHide: true, timeout: 45000, maxBuffer: 12 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout.replace(/^\uFEFF/, ''))));
}
export class NativeBridge extends EventEmitter {
  constructor(directory) { super(); this.directory = directory; this.pending = new Map(); this.nextId = 0; this.stopped = false; this.ready = false; }
  start() {
    if (process.platform !== 'win32') return;
    this.child = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(this.directory, 'bridge.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      try {
        const message = JSON.parse(line);
        if (message.ready) { this.ready = true; this.emit('ready'); return; }
        const item = this.pending.get(message.id);
        if (item) { clearTimeout(item.timeout); this.pending.delete(message.id); message.error ? item.reject(new Error(message.error)) : item.resolve(message.result); }
      } catch { /* Ignore PowerShell compiler diagnostics, which aren't protocol messages. */ }
    });
    this.child.stderr.on('data', data => this.emit('diagnostic', String(data).slice(0, 600)));
    this.child.on('error', error => this.emit('diagnostic', error.message));
    this.child.on('exit', () => {
      this.ready = false;
      for (const item of this.pending.values()) { clearTimeout(item.timeout); item.reject(new Error('Windows-verbinding is opnieuw gestart.')); }
      this.pending.clear();
      if (!this.stopped) this.retry = setTimeout(() => this.start(), 5000);
    });
  }
  request(action, value) {
    if (!this.ready) return Promise.reject(new Error('Windows-verbinding wordt gestart. Probeer het zo opnieuw.'));
    if (this.pending.size > 5) return Promise.reject(new Error('Windows is nog bezig.'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('Windows reageerde niet op tijd.')); this.child?.kill(); }, 10000);
      this.pending.set(id, { resolve, reject, timeout });
      this.child.stdin.write(JSON.stringify({ id, action, value }) + '\n');
    });
  }
  stop() { this.stopped = true; clearTimeout(this.retry); this.child?.kill(); }
}

let lastCpu = null;
export function basicStats() {
  const cpus = os.cpus();
  const totals = cpus.reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + Object.values(c.times).reduce((x, y) => x + y, 0) }), { idle: 0, total: 0 });
  const delta = lastCpu ? totals.total - lastCpu.total : 0;
  const cpu = delta > 0 ? Math.min(100, Math.max(0, 100 * (1 - (totals.idle - lastCpu.idle) / delta))) : null;
  lastCpu = totals;
  return { cpu, cpuName: cpus[0]?.model || 'Processor', cores: cpus.length, ramUsed: os.totalmem() - os.freemem(), ramTotal: os.totalmem(), uptime: os.uptime(), timestamp: Date.now() };
}
export function gpuStats() {
  return new Promise(resolve => execFile('nvidia-smi', ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 3500 }, (err, output) => {
    if (err) return resolve(null);
    const [name, usage, temperature, used, total] = output.trim().split('\n')[0].split(',').map(s => s.trim());
    resolve({ name, usage: Number.isFinite(+usage) ? +usage : null, temperature: Number.isFinite(+temperature) ? +temperature : null, memoryUsed: +used, memoryTotal: +total });
  }));
}
