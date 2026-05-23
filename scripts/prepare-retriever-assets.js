const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SOURCE_ROOT = path.join(__dirname, '..', 'new_img');
const SOURCE_DIR_NAME = '무제 폴더';
const INTERACTION_SOURCE_DIR_NAME = '무제 폴더 2';
const OUT_DIR = path.join(__dirname, '..', 'src', 'assets', 'retriever');

const sheets = [
  { key: 'idle', file: 'retriever-idle-Photoroom.png', outputBase: 'retriever-idle', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 6, loop: true },
  { key: 'walk', file: 'retriever-walk-Photoroom.png', outputBase: 'retriever-walk', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 10, loop: true },
  { key: 'goHome', file: 'retriever-go-home-Photoroom.png', outputBase: 'retriever-go-home', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 10, loop: true },
  { key: 'popIn', file: 'retriever-pop-in-Photoroom.png', outputBase: 'retriever-pop-in', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 13, loop: false },
  { key: 'happy', file: 'retriever-happy-Photoroom.png', outputBase: 'retriever-happy', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 8, loop: false },
  { key: 'sleep', file: 'retriever-sleep-Photoroom.png', outputBase: 'retriever-sleep', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 4, loop: true },
  { key: 'tailWag', file: 'retriever-tail-wag-Photoroom.png', outputBase: 'retriever-tail-wag', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 10, loop: false },
  { key: 'yawn', file: 'retriever-yawn-Photoroom.png', outputBase: 'retriever-yawn', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 8, loop: false },
  {
    key: 'pressed',
    file: 'retriever-pressed-Photoroom.png',
    outputBase: 'retriever-pressed',
    frameWidth: 724,
    frameHeight: 724,
    frameCount: 3,
    fps: 1,
    loop: true,
    align: false,
    stateAnimations: ['pressedHold', 'pressedLeft', 'pressedRight'],
  },
  { key: 'retrieveCopy', file: '1-Photoroom.png', outputBase: 'retriever-retrieve-copy', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 9, loop: false, sourceDirName: INTERACTION_SOURCE_DIR_NAME },
  { key: 'headTilt', file: '2-Photoroom.png', outputBase: 'retriever-head-tilt', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 8, loop: false, sourceDirName: INTERACTION_SOURCE_DIR_NAME },
  { key: 'cheerSit', file: '3-Photoroom.png', outputBase: 'retriever-cheer-sit', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 7, loop: false, sourceDirName: INTERACTION_SOURCE_DIR_NAME },
  { key: 'nod', file: '4-Photoroom.png', outputBase: 'retriever-nod', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 8, loop: false, sourceDirName: INTERACTION_SOURCE_DIR_NAME },
  { key: 'celebrate', file: '5-Photoroom.png', outputBase: 'retriever-celebrate', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 9, loop: false, sourceDirName: INTERACTION_SOURCE_DIR_NAME },
  { key: 'sniffSearch', file: '6-Photoroom.png', outputBase: 'retriever-sniff-search', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 8, loop: false, sourceDirName: INTERACTION_SOURCE_DIR_NAME },
  { key: 'trashPickup', file: '7.png', outputBase: 'retriever-trash-pickup', frameWidth: 600, frameHeight: 600, frameCount: 4, fps: 8, loop: false, sourceDirName: INTERACTION_SOURCE_DIR_NAME },
];

function findSourceDir(sourceDirName = SOURCE_DIR_NAME) {
  const candidates = fs.readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const directory = candidates.find((name) => name.normalize('NFC') === sourceDirName);
  if (!directory) {
    throw new Error('Missing source directory ' + path.join(SOURCE_ROOT, sourceDirName) + '.');
  }
  return path.join(SOURCE_ROOT, directory);
}

function readPng(filePath) {
  const input = fs.readFileSync(filePath);
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(filePath + ' is not a PNG file.');
  }

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlaceMethod;
  const idatChunks = [];

  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('ascii', offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlaceMethod = data[12];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlaceMethod !== 0) {
    throw new Error(filePath + ' must be a non-interlaced 8-bit RGB or RGBA PNG.');
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  let targetOffset = 0;
  let previousRow = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.alloc(stride);

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset];
      sourceOffset += 1;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previousRow[x];
      const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] : 0;
      row[x] = unfilterByte(filter, raw, left, up, upLeft);
    }

    row.copy(pixels, targetOffset);
    targetOffset += stride;
    previousRow = row;
  }

  return { width, height, colorType, pixels };
}

function unfilterByte(filter, raw, left, up, upLeft) {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + paethPredictor(left, up, upLeft)) & 0xff;
  throw new Error('Unsupported PNG filter type ' + filter + '.');
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);

  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  return distanceUp <= distanceUpLeft ? up : upLeft;
}

function toRgbaImage(image) {
  if (image.colorType === 6) {
    return {
      width: image.width,
      height: image.height,
      pixels: Buffer.from(image.pixels),
      transparentCount: countTransparentPixels(image),
    };
  }

  return removeCheckerBackground(image);
}

function countTransparentPixels(image) {
  let count = 0;
  for (let index = 3; index < image.pixels.length; index += 4) {
    if (image.pixels[index] === 0) count += 1;
  }
  return count;
}

function removeCheckerBackground(image) {
  const { width, height, pixels } = image;
  const rgba = Buffer.alloc(width * height * 4);
  const transparent = new Uint8Array(width * height);
  const queue = [];

  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba[j] = pixels[i];
    rgba[j + 1] = pixels[i + 1];
    rgba[j + 2] = pixels[i + 2];
    rgba[j + 3] = 255;
  }

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (transparent[index] || !isCheckerPixel(pixels, index)) return;
    transparent[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  for (let index = 0; index < transparent.length; index += 1) {
    if (transparent[index]) rgba[index * 4 + 3] = 0;
  }

  return { width, height, pixels: rgba, transparentCount: queue.length };
}

function isCheckerPixel(pixels, index) {
  const offset = index * 3;
  const r = pixels[offset];
  const g = pixels[offset + 1];
  const b = pixels[offset + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  return min >= 235 && max - min <= 16;
}

function writePng(filePath, image) {
  const { width, height, pixels } = image;
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1);
    raw[rawOffset] = 0;
    pixels.copy(raw, rawOffset + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const output = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(filePath, output);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function buildManifest() {
  const animations = {};

  for (const sheet of sheets) {
    if (sheet.stateAnimations) {
      for (let index = 0; index < sheet.stateAnimations.length; index += 1) {
        animations[sheet.stateAnimations[index]] = {
          frames: ['./assets/retriever/' + sheet.outputBase + '-' + (index + 1) + '.png'],
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
          frameCount: 1,
          fps: sheet.fps,
          loop: true,
        };
      }
      continue;
    }

    animations[sheet.key] = {
      frames: Array.from({ length: sheet.frameCount }, (_, index) => './assets/retriever/' + sheet.outputBase + '-' + (index + 1) + '.png'),
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      frameCount: sheet.frameCount,
      fps: sheet.fps,
      loop: sheet.loop,
    };
  }

  return {
    frameWidth: 600,
    frameHeight: 600,
    frameCount: 4,
    defaultAnimation: 'idle',
    style: 'photoroom-png-retriever',
    animations,
  };
}

function cropFrame(image, frameIndex, sheet) {
  const sourceX = frameIndex * sheet.frameWidth;
  const output = Buffer.alloc(sheet.frameWidth * sheet.frameHeight * 4);

  for (let y = 0; y < sheet.frameHeight; y += 1) {
    const sourceOffset = (y * image.width + sourceX) * 4;
    const targetOffset = y * sheet.frameWidth * 4;
    image.pixels.copy(output, targetOffset, sourceOffset, sourceOffset + sheet.frameWidth * 4);
  }

  return {
    width: sheet.frameWidth,
    height: sheet.frameHeight,
    pixels: output,
  };
}

function prepare() {
  const inputDirs = new Map();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const file of fs.readdirSync(OUT_DIR)) {
    if (/^retriever-.+\.png$/.test(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
    }
  }

  for (const sheet of sheets) {
    const sourceDirName = sheet.sourceDirName ?? SOURCE_DIR_NAME;
    if (!inputDirs.has(sourceDirName)) inputDirs.set(sourceDirName, findSourceDir(sourceDirName));
    const inputDir = inputDirs.get(sourceDirName);
    const sourcePath = path.join(inputDir, sheet.file);
    const image = toRgbaImage(readPng(sourcePath));

    if (image.width !== sheet.frameWidth * sheet.frameCount || image.height !== sheet.frameHeight) {
      throw new Error(sheet.file + ' must be ' + (sheet.frameWidth * sheet.frameCount) + ' x ' + sheet.frameHeight + '; got ' + image.width + ' x ' + image.height + '.');
    }

    const frames = [];
    for (let frame = 0; frame < sheet.frameCount; frame += 1) {
      const croppedFrame = cropFrame(image, frame, sheet);
      removeEdgeSlivers(croppedFrame);
      frames.push(croppedFrame);
    }

    if (sheet.align !== false) alignFramesHorizontally(frames);

    for (let frame = 0; frame < sheet.frameCount; frame += 1) {
      writePng(path.join(OUT_DIR, sheet.outputBase + '-' + (frame + 1) + '.png'), frames[frame]);
    }

    console.log('prepared ' + sheet.file + ' (' + image.transparentCount + ' transparent pixels, ' + sheet.frameCount + ' frames)');
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(buildManifest(), null, 2) + '\n');
}

prepare();

function alignFramesHorizontally(frames) {
  const boxes = frames.map(getAlphaBounds).filter(Boolean);
  if (boxes.length === 0) return;

  const targetCenterX = Math.round(
    boxes.reduce((sum, box) => sum + Math.round((box.minX + box.maxX) / 2), 0) / boxes.length,
  );

  for (let index = 0; index < frames.length; index += 1) {
    const box = getAlphaBounds(frames[index]);
    if (!box) continue;
    const centerX = Math.round((box.minX + box.maxX) / 2);
    const dx = targetCenterX - centerX;
    if (dx !== 0) translateFrame(frames[index], dx, 0);
  }
}

function getAlphaBounds(image) {
  const { width, height, pixels } = image;
  const bounds = {
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  return bounds.maxX === -1 ? null : bounds;
}

function translateFrame(image, dx, dy) {
  const { width, height, pixels } = image;
  const translated = Buffer.alloc(pixels.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = x + dx;
      const targetY = y + dy;
      if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;

      const sourceOffset = (y * width + x) * 4;
      const targetOffset = (targetY * width + targetX) * 4;
      pixels.copy(translated, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }

  image.pixels = translated;
}

function removeEdgeSlivers(image) {
  const { width, height, pixels } = image;
  const visited = new Uint8Array(width * height);
  const edgeSliverLimit = Math.round(width * height * 0.03);

  for (let y = 0; y < height; y += 1) {
    removeSmallEdgeComponent(0, y);
    removeSmallEdgeComponent(width - 1, y);
  }

  function removeSmallEdgeComponent(startX, startY) {
    const startIndex = startY * width + startX;
    if (visited[startIndex] || pixels[startIndex * 4 + 3] === 0) return;

    const queue = [startIndex];
    const component = [];
    visited[startIndex] = 1;

    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      const x = index % width;
      const y = Math.floor(index / width);
      component.push(index);

      enqueue(x - 1, y);
      enqueue(x + 1, y);
      enqueue(x, y - 1);
      enqueue(x, y + 1);
    }

    if (component.length > edgeSliverLimit) return;

    for (const index of component) {
      pixels[index * 4 + 3] = 0;
    }

    function enqueue(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = y * width + x;
      if (visited[index] || pixels[index * 4 + 3] === 0) return;
      visited[index] = 1;
      queue.push(index);
    }
  }
}
