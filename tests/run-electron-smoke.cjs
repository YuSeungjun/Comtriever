const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (process.platform === 'darwin') {
  const trayTest = spawnSync(require('electron'), [path.join(__dirname, 'electron-tray.cjs')], {
    stdio: 'inherit', timeout: 30000, killSignal: 'SIGKILL',
  });
  if (trayTest.error || trayTest.signal || trayTest.status !== 0) {
    console.error('Tray smoke failed:', trayTest.error?.message ?? trayTest.signal ?? trayTest.status);
    process.exit(1);
  }
}
const homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-home-rest-'));
for (const restore of ['0', '1']) {
  const homeTest = spawnSync(require('electron'), [path.join(__dirname, 'electron-home-rest.cjs')], {
    stdio: 'inherit', timeout: 60000, killSignal: 'SIGKILL',
    env: { ...process.env, COMTRIEVER_HOME_DIR: homeDirectory, COMTRIEVER_HOME_RESTORE: restore },
  });
  if (homeTest.error || homeTest.signal || homeTest.status !== 0) {
    console.error('Home resting smoke failed:', homeTest.error?.message ?? homeTest.signal ?? homeTest.status);
    process.exit(1);
  }
}
const directionTest = spawnSync(require('electron'), [path.join(__dirname, 'electron-play-direction.cjs')], {
  stdio: 'inherit', timeout: 120000, killSignal: 'SIGKILL',
});
if (directionTest.error || directionTest.signal || directionTest.status !== 0) {
  console.error('Play direction smoke failed:', directionTest.error?.message ?? directionTest.signal ?? directionTest.status);
  process.exit(1);
}
const fetchTest = spawnSync(require('electron'), [path.join(__dirname, 'electron-fetch.cjs')], {
  stdio: 'inherit', timeout: 90000, killSignal: 'SIGKILL',
});
if (fetchTest.error || fetchTest.signal || fetchTest.status !== 0) {
  console.error('Repeated fetch smoke failed:', fetchTest.error?.message ?? fetchTest.signal ?? fetchTest.status);
  process.exit(1);
}
const releaseTest = spawnSync(require('electron'), [path.join(__dirname, 'electron-release.cjs')], {
  stdio: 'inherit', timeout: 60000, killSignal: 'SIGKILL',
});
if (releaseTest.error || releaseTest.signal || releaseTest.status !== 0) {
  console.error('Release physics smoke failed:', releaseTest.error?.message ?? releaseTest.signal ?? releaseTest.status);
  process.exit(1);
}
const hitTest = spawnSync(require('electron'), [path.join(__dirname, 'electron-hit-test.cjs')], {
  stdio: 'inherit', timeout: 60000, killSignal: 'SIGKILL',
});
if (hitTest.error || hitTest.signal || hitTest.status !== 0) {
  console.error('Mouse passthrough smoke failed:', hitTest.error?.message ?? hitTest.signal ?? hitTest.status);
  process.exit(1);
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-smoke-'));
for (const restore of ['0', '1']) {
  const result = spawnSync(require('electron'), [path.join(__dirname, 'electron-smoke.cjs')], {
    stdio: 'inherit',
    env: { ...process.env, COMTRIEVER_SMOKE_DIR: directory, COMTRIEVER_SMOKE_RESTORE: restore },
    timeout: 120000,
  });
  if (result.error || result.signal || result.status !== 0) {
    console.error(`Electron smoke failed: ${result.error?.message ?? result.signal ?? result.status}; artifacts: ${directory}`);
    process.exit(1);
  }
}
if (process.platform === 'darwin') {
  const fixture = path.join(__dirname, '../build/native/window-fixture');
  execFileSync('xcrun', ['clang', '-fobjc-arc', '-framework', 'Cocoa', '-framework', 'CoreGraphics', path.join(__dirname, 'native-window-fixture.m'), '-o', fixture], { stdio: 'inherit' });
  for (const mode of ['alwaysOnTop', 'desktopOnly']) {
    const toy = spawnSync(require('electron'), [path.join(__dirname, 'electron-toy-native.cjs')], {
      stdio: 'inherit', timeout: 60000, env: { ...process.env, COMTRIEVER_TOY_MODE: mode },
    });
    if (toy.error || toy.signal || toy.status !== 0) {
      console.error('Native toy smoke failed:', toy.error?.message ?? toy.signal ?? toy.status);
      process.exit(1);
    }
  }
  const result = spawnSync(require('electron'), [path.join(__dirname, 'electron-surfaces.cjs')], { stdio: 'inherit', timeout: 90000 });
  if (result.error || result.signal || result.status !== 0) {
    console.error('Native window/behavior smoke failed:', result.error?.message ?? result.signal ?? result.status);
    process.exit(1);
  }
}
