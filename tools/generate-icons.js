'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Minimal PNG writer in pure Node.js using zlib
function createPng(width, height, getPixel) {
  const rowSize = width * 4 + 1; // 1 filter byte per row
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);

    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);

    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Draw a serene Buddhist lotus / temple emblem on warm paper background
function templePixel(x, y, width, height, isMaskable) {
  const cx = width / 2;
  const cy = height / 2;
  const r = width / 2;
  const dx = (x - cx) / r;
  const dy = (y - cy) / r;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background: warm sage/cream temple tone (#f6f1e7 to #e9dfcd gradient)
  let bgR = Math.round(246 - (y / height) * 15);
  let bgG = Math.round(241 - (y / height) * 18);
  let bgB = Math.round(231 - (y / height) * 20);

  // Safe margin for maskable icon: keep graphics inside central 75%
  const scale = isMaskable ? 0.72 : 0.85;
  const sx = (x - cx) / (r * scale);
  const sy = (y - cy) / (r * scale);
  const sdist = Math.sqrt(sx * sx + sy * sy);

  // Outer decorative circle (temple seal)
  if (sdist < 0.95 && sdist > 0.88) {
    return [181, 100, 60, 255]; // Terracotta / temple vermilion (#b5643c)
  }
  if (sdist < 0.88 && sdist > 0.82) {
    return [201, 162, 74, 255]; // Gold (#c9a24a)
  }

  // Inner lotus flower petals pattern
  // Petals via polar curve
  const angle = Math.atan2(sy + 0.05, sx);
  const petalR = 0.52 * (1 + 0.28 * Math.cos(8 * angle));
  const innerPetalR = 0.32 * (1 + 0.22 * Math.cos(8 * (angle + Math.PI / 8)));

  if (sdist < petalR && sdist >= innerPetalR) {
    // Lotus pink / coral shading (#d98a8a to #b5643c)
    const factor = (sdist - innerPetalR) / (petalR - innerPetalR);
    const pr = Math.round(217 - factor * 36);
    const pg = Math.round(138 - factor * 38);
    const pb = Math.round(138 - factor * 78);
    return [pr, pg, pb, 255];
  }

  if (sdist < innerPetalR && sdist >= 0.12) {
    // Lotus center golden heart (#c9a24a)
    return [201, 162, 74, 255];
  }

  if (sdist < 0.12) {
    // Pearl jewel center (#ffffff)
    return [255, 253, 248, 255];
  }

  return [bgR, bgG, bgB, 255];
}

const root = path.join(__dirname, '..');

const icons = [
  { file: 'pwa-192x192.png', size: 192, maskable: false },
  { file: 'pwa-512x512.png', size: 512, maskable: false },
  { file: 'pwa-maskable-512x512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false }
];

icons.forEach(({ file, size, maskable }) => {
  const pngBuf = createPng(size, size, (x, y, w, h) => templePixel(x, y, w, h, maskable));
  const target = path.join(root, file);
  fs.writeFileSync(target, pngBuf);
  console.log(`Generated ${file} (${size}x${size}, ${pngBuf.length} bytes)`);
});
