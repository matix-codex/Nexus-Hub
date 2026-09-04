import { PNG } from 'pngjs';
import pngToIco from 'png-to-ico';
import fs from 'node:fs/promises';
const size = 256;
const png = new PNG({ width: size, height: size });
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const i = (y * size + x) * 4;
  const radius = 52, cx = Math.max(radius, Math.min(size - radius, x)), cy = Math.max(radius, Math.min(size - radius, y));
  const inside = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  const vertical = ((x >= 58 && x <= 79) || (x >= 177 && x <= 198)) && y >= 60 && y <= 195;
  const diagonal = Math.abs(x - (70 + (y - 60) * 118 / 135)) < 13 && y >= 60 && y <= 195;
  const color = vertical || diagonal ? [167, 230, 199] : [17, 24 + Math.round(y / size * 6), 26 + Math.round(y / size * 4)];
  png.data[i] = color[0]; png.data[i + 1] = color[1]; png.data[i + 2] = color[2]; png.data[i + 3] = inside ? 255 : 0;
}
await fs.mkdir('assets', { recursive: true });
const data = PNG.sync.write(png);
await fs.writeFile('assets/icon.png', data);
await fs.writeFile('assets/icon.ico', await pngToIco(data));
