import si from 'systeminformation';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { runPowerShell } from './native.mjs';
export const sensorNumber = value => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
export function parseNvidia(output) {
  return output.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [name, id, usage, temperature, used, total, power, powerLimit, clock, memoryClock, fan] = line.split(',').map(value => value.trim());
    return { name, id, source: 'NVIDIA NVML', usage: sensorNumber(usage), temperature: sensorNumber(temperature), memoryUsed: sensorNumber(used), memoryTotal: sensorNumber(total), power: sensorNumber(power), powerLimit: sensorNumber(powerLimit), clock: sensorNumber(clock), memoryClock: sensorNumber(memoryClock), fan: sensorNumber(fan) };
  });
}
export function windowsAdapters(data = {}) {
  const adapters = new Map();
  for (const counter of data.engines || []) {
    const match = counter.Name?.match(/luid_(.+?)_phys_(\d+)_eng_(\d+)_engtype_(.+)$/);
    if (!match) continue;
    const id = `${match[1]}_${match[2]}`;
    const adapter = adapters.get(id) || { id, engines: {} };
    const key = `${match[3]} ${match[4]}`;
    adapter.engines[key] = Math.min(100, (adapter.engines[key] || 0) + (sensorNumber(counter.UtilizationPercentage) || 0));
    adapters.set(id, adapter);
  }
  for (const counter of data.memory || []) {
    const match = counter.Name?.match(/luid_(.+?)_phys_(\d+)$/); if (!match) continue;
    const id = `${match[1]}_${match[2]}`;
    adapters.set(id, { ...(adapters.get(id) || { id, engines: {} }), dedicated: sensorNumber(counter.DedicatedUsage), shared: sensorNumber(counter.SharedUsage) });
  }
  return [...adapters.values()].map(adapter => ({ ...adapter, usage: Math.max(0, ...Object.values(adapter.engines)) }));
}
function nvidia() { return new Promise(resolve => execFile('nvidia-smi', ['--query-gpu=name,uuid,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,power.limit,clocks.gr,clocks.mem,fan.speed', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 5000 }, (error, stdout) => resolve(error ? [] : parseNvidia(stdout)))); }
const bounded = (fn, fallback) => Promise.race([fn().catch(() => fallback), new Promise(resolve => { const timer = setTimeout(() => resolve(fallback), 9000); timer.unref(); })]);
export class Hardware {
  constructor(directory) { this.directory = directory; this.info = {}; this.busy = false; }
  async init() {
    const entries = await Promise.all(Object.entries({ cpu: si.cpu, board: si.baseboard, memory: si.memLayout, graphics: si.graphics, storage: si.diskLayout }).map(async ([key, fn]) => [key, await bounded(fn, null)]));
    this.info = Object.fromEntries(entries);
    // No serial numbers, MAC addresses or machine identifiers are sent to the renderer.
    if (this.info.board) this.info.board = { manufacturer: this.info.board.manufacturer, model: this.info.board.model };
    this.info.memory = this.info.memory?.map(m => ({ size: m.size, type: m.type, clock: m.clockSpeed, manufacturer: m.manufacturer, bank: m.bank }));
    this.info.storage = this.info.storage?.map(d => ({ name: d.name, type: d.type, size: d.size, interface: d.interfaceType, temperature: d.temperature, smartStatus: d.smartStatus }));
  }
  async snapshot() {
    const [gpus, load, clock, cpuTemp, disks, io, networks, extra, driverGraphics] = await Promise.all([
      nvidia(), bounded(si.currentLoad, null), bounded(si.cpuCurrentSpeed, null), bounded(si.cpuTemperature, null), bounded(si.fsSize, []), bounded(si.disksIO, null), bounded(si.networkStats, []),
      runPowerShell(path.join(this.directory, 'sensors.ps1')).then(JSON.parse).catch(() => ({ sources: [{ name: 'Windows sensoren', available: false, detail: 'Bron reageert niet.' }] })),
      this.info.graphics?.controllers.some(gpu => !/nvidia/i.test(gpu.vendor || gpu.model)) ? bounded(si.graphics, null) : null,
    ]);
    const controllers = driverGraphics?.controllers || this.info.graphics?.controllers || [];
    const remaining = [...gpus];
    const graphics = controllers.map(gpu => {
      const found = remaining.findIndex(value => value.name.toLowerCase().includes(gpu.model?.toLowerCase()));
      if (found >= 0) return { ...remaining.splice(found, 1)[0], driver: gpu.driverVersion };
      return { name: gpu.model, source: 'Windows / driver', memoryTotal: gpu.vram || null, driver: gpu.driverVersion, usage: sensorNumber(gpu.utilizationGpu), temperature: sensorNumber(gpu.temperatureGpu) };
    });
    graphics.push(...remaining);
    const adapters = windowsAdapters(extra);
    if (graphics.length === 1 && adapters.length === 1 && graphics[0].usage == null) { graphics[0].usage = adapters[0].usage; graphics[0].source = 'Windows GPU-tellers'; }
    return {
      at: Date.now(), info: this.info, gpus: graphics, adapters,
      cpu: { usage: load?.currentLoad ?? null, cores: load?.cpus?.map(c => c.load) || [], speed: clock?.avg || null, temperature: cpuTemp?.main > 0 ? cpuTemp.main : null },
      disks: disks.filter(d => d.size > 0).map(d => ({ name: d.mount, size: d.size, used: d.used, percent: d.use })),
      io: io ? { read: io.rIO_sec, write: io.wIO_sec } : null,
      networks: networks.map(n => ({ name: n.iface, state: n.operstate, down: n.rx_sec, up: n.tx_sec })), sensors: extra.sensors || [],
      sources: [{ name: 'Windows / systeminformation', available: true, detail: 'CPU, RAM, opslag en netwerk' }, { name: 'NVIDIA NVML', available: gpus.length > 0, detail: gpus.length ? `${gpus.length} GPU(s): temperatuur, vermogen, klok, ventilator en VRAM` : 'Geen ondersteunde NVIDIA-driver gevonden.' }, ...(extra.sources || [])],
    };
  }
}
