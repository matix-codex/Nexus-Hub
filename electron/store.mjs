import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS } from './config.mjs';
export class Store {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, 'nexus.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* First start or interrupted external edit. */ }
    this.data = { ...structuredClone(DEFAULTS), ...saved, settings: { ...DEFAULTS.settings, ...saved.settings }, layouts: { ...DEFAULTS.layouts, ...saved.layouts } };
  }
  save() {
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temp, this.file);
    return this.data;
  }
}
