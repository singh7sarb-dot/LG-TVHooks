const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function createPNG(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 2; // Color type: RGB
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace
  
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    const body = Buffer.concat([typeBuf, data]);
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < body.length; i++) {
      crc ^= body[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    crcBuf.writeInt32BE((crc ^ 0xFFFFFFFF), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // Raw image data with filter byte 0 at start of each scanline
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    raw[rowOffset] = 0; // Filter none
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      // Nice indigo purple gradient with dark border
      const isBorder = (x < 3 || x >= width - 3 || y < 3 || y >= height - 3);
      if (isBorder) {
        raw[pxOffset] = 79;
        raw[pxOffset + 1] = 70;
        raw[pxOffset + 2] = 229;
      } else {
        const factor = (x + y) / (width + height);
        raw[pxOffset] = Math.min(255, Math.round(r * (0.8 + 0.4 * factor)));
        raw[pxOffset + 1] = Math.min(255, Math.round(g * (0.8 + 0.4 * factor)));
        raw[pxOffset + 2] = Math.min(255, Math.round(b * (0.8 + 0.4 * factor)));
      }
    }
  }

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

const appDir = path.join(__dirname, '..', 'app');
fs.writeFileSync(path.join(appDir, "icon.png"), createPNG(80, 80, 99, 102, 241));
fs.writeFileSync(path.join(appDir, "largeIcon.png"), createPNG(130, 130, 99, 102, 241));
console.log("App icons generated successfully!");
