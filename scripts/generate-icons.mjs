import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const SIZES = [16, 32, 48, 128, 256, 512];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function drawIcon(size) {
  const rowLength = size * 4 + 1;
  const raw = Buffer.alloc(rowLength * size);
  const radius = size * 0.2;
  const center = size / 2;

  for (let y = 0; y < size; y += 1) {
    raw[y * rowLength] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = y * rowLength + 1 + x * 4;
      const cornerDistance =
        Math.max(Math.abs(x + 0.5 - center), Math.abs(y + 0.5 - center)) - (center - radius);
      const alpha = cornerDistance <= 0 ? 255 : Math.max(0, 255 - Math.round(cornerDistance * 255));
      const diagonal = Math.abs(y - x * 0.65 - size * 0.14) < Math.max(1.5, size * 0.055);
      const lowerDiagonal = Math.abs(y - x * 0.65 - size * 0.42) < Math.max(1.2, size * 0.042);
      const glow = Math.max(0, 1 - Math.hypot(x - size * 0.62, y - size * 0.35) / size);

      raw[offset] = diagonal || lowerDiagonal ? 246 : Math.round(28 + glow * 50);
      raw[offset + 1] = diagonal ? 249 : Math.round(63 + glow * 80);
      raw[offset + 2] = diagonal || lowerDiagonal ? 255 : Math.round(130 + glow * 100);
      raw[offset + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

export async function generateIcons(extensionRoot) {
  const iconDir = path.join(extensionRoot, "icons");
  await mkdir(iconDir, { recursive: true });
  await Promise.all(
    SIZES.map((size) => writeFile(path.join(iconDir, `icon-${size}.png`), drawIcon(size)))
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const extensionRoot = process.argv[2] ?? path.resolve("extension");
  await generateIcons(extensionRoot);
}
