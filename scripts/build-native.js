const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform === 'darwin') {
  const source = path.join(__dirname, '../src/native/window-surfaces.m');
  const output = path.join(__dirname, '../build/native/window-surfaces');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (!fs.existsSync(output) || fs.statSync(source).mtimeMs > fs.statSync(output).mtimeMs) {
    execFileSync('xcrun', ['clang', '-fobjc-arc', '-O2', '-arch', 'arm64', '-arch', 'x86_64',
      '-mmacosx-version-min=11.0', '-framework', 'Foundation', '-framework', 'AppKit', '-framework', 'CoreGraphics', source, '-o', output], { stdio: 'inherit' });
    execFileSync('codesign', ['--force', '--sign', '-', output], { stdio: 'inherit' });
    console.log('Built universal macOS window geometry helper.');
  }
}
