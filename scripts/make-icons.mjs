// Generates the app icons (SVG + PNGs) from a tiny solved Nurikabe.
// No dependencies: PNGs are encoded by hand with node:zlib. Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// A valid 5×5 puzzle: digits are clues, '.' island, '#' wall.
const GRID = ['2.#1#', '#####', '#3.#2', '#.##.', '##1##'];
const N = GRID.length;
const BG = [0x2f, 0x6f, 0xdb];
const WALL = [0x22, 0x26, 0x2e];
const ISLAND = [0xf4, 0xf1, 0xea];
const INK = [0x1f, 0x23, 0x28];

// 3×5 bitmap digits
const DIGITS = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
};

/** Paint the icon into an RGB canvas; `pad` is the fraction of the edge left as background. */
function render(size, pad) {
  const px = new Uint8Array(size * size * 3);
  const fill = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(size, Math.round(y1)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(size, Math.round(x1)); x++) {
        const i = (y * size + x) * 3;
        px[i] = r;
        px[i + 1] = g;
        px[i + 2] = b;
      }
    }
  };
  fill(0, 0, size, size, BG);
  const board = size * (1 - 2 * pad);
  const cell = board / N;
  const gap = cell * 0.07;
  const origin = size * pad;
  const frame = cell * 0.12;
  fill(origin - frame, origin - frame, origin + board + frame, origin + board + frame, WALL);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const ch = GRID[r][c];
      if (ch === '#') continue;
      const x = origin + c * cell;
      const y = origin + r * cell;
      fill(x + gap, y + gap, x + cell - gap, y + cell - gap, ISLAND);
      const glyph = DIGITS[ch];
      if (!glyph) continue;
      const dot = cell * 0.11;
      const gx = x + (cell - 3 * dot) / 2;
      const gy = y + (cell - 5 * dot) / 2;
      glyph.forEach((row, j) =>
        [...row].forEach((on, i) => on === '#' && fill(gx + i * dot, gy + j * dot, gx + (i + 1) * dot, gy + (j + 1) * dot, INK)),
      );
    }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pad) {
  const px = render(size, pad);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg(pad) {
  const size = 100;
  const cell = (size * (1 - 2 * pad)) / N;
  const gap = cell * 0.07;
  const o = size * pad;
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const frame = cell * 0.12;
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="18" fill="${hex(BG)}"/>`;
  out += `<rect x="${(o - frame).toFixed(2)}" y="${(o - frame).toFixed(2)}" width="${(size - 2 * o + 2 * frame).toFixed(2)}" height="${(size - 2 * o + 2 * frame).toFixed(2)}" rx="3" fill="${hex(WALL)}"/>`;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const ch = GRID[r][c];
      if (ch === '#') continue;
      const x = o + c * cell;
      const y = o + r * cell;
      out += `<rect x="${(x + gap).toFixed(2)}" y="${(y + gap).toFixed(2)}" width="${(cell - 2 * gap).toFixed(2)}" height="${(cell - 2 * gap).toFixed(2)}" fill="${hex(ISLAND)}"/>`;
      if (DIGITS[ch]) {
        out += `<text x="${(x + cell / 2).toFixed(2)}" y="${(y + cell * 0.72).toFixed(2)}" font-family="system-ui,sans-serif" font-weight="700" font-size="${(cell * 0.6).toFixed(2)}" text-anchor="middle" fill="${hex(INK)}">${ch}</text>`;
      }
    }
  }
  return out + '</svg>\n';
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', svg(0.12));
writeFileSync('public/icons/icon-192.png', png(192, 0.12));
writeFileSync('public/icons/icon-512.png', png(512, 0.12));
// maskable: launchers crop to a circle/squircle, so keep the board inside the central safe zone
writeFileSync('public/icons/maskable-512.png', png(512, 0.2));
writeFileSync('public/icons/apple-touch-icon.png', png(180, 0.12));
console.log('icons written to public/icons');
