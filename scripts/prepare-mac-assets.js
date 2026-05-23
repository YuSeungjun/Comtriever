const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const png2icons = require('png2icons');

const ROOT_DIR = path.join(__dirname, '..');
const LOGO_DIR = path.join(ROOT_DIR, 'logo');
const BUILD_DIR = path.join(ROOT_DIR, 'build');
const APP_ICON_SOURCE = path.join(LOGO_DIR, 'AppIcon_RetrieverFace.png');
const TRAY_ICON_SOURCE = path.join(LOGO_DIR, 'MenuBarIcon_RetrieverFace.png');
const TRAY_ICON_SIZES = [
  ['trayTemplate.png', 18],
  ['trayTemplate@2x.png', 36],
];

function main() {
  assertDarwin();
  assertFile(APP_ICON_SOURCE);
  assertFile(TRAY_ICON_SOURCE);

  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.rmSync(path.join(BUILD_DIR, 'icon.iconset'), { recursive: true, force: true });
  writeIcns(APP_ICON_SOURCE, path.join(BUILD_DIR, 'icon.icns'));

  for (const [filename, size] of TRAY_ICON_SIZES) {
    resizePng(TRAY_ICON_SOURCE, path.join(BUILD_DIR, filename), size);
  }
}

function assertDarwin() {
  if (process.platform !== 'darwin') {
    throw new Error('macOS asset preparation requires sips and iconutil on macOS.');
  }
}

function assertFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required logo file: ${path.relative(ROOT_DIR, filePath)}`);
  }
}

function resizePng(source, destination, size) {
  execFileSync('sips', ['-z', String(size), String(size), source, '--out', destination], {
    stdio: 'ignore',
  });
}

function writeIcns(source, destination) {
  const input = fs.readFileSync(source);
  const output = png2icons.createICNS(input, png2icons.BICUBIC, 0);
  if (!output) throw new Error('Failed to create build/icon.icns from app logo.');
  fs.writeFileSync(destination, output);
}

main();
