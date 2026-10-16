// Optional manual integration check against an existing real application window.
// COMTRIEVER_LIVE_WINDOW_ID=<CGWindowID> electron tests/electron-live-window.cjs
// Does not move, resize, capture, or read the contents of the target window.
const { app, BrowserWindow, screen } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { exposedSurfaces, footGeometry, surfaceLimits } = require('../src/surfaces');
const { movementBounds } = require('../src/physics');
const targetID = Number(process.env.COMTRIEVER_LIVE_WINDOW_ID);
if (!Number.isInteger(targetID) || targetID <= 0) throw new Error('Set COMTRIEVER_LIVE_WINDOW_ID to an existing application window ID');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-live-window-'));
app.setPath('userData', directory);
fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({ displayMode: 'desktopOnly', petSize: 'large', wanderEnabled: false, launchAtLogin: false }));
process.env.COMTRIEVER_TEST_MODE = '1';
process.env.COMTRIEVER_TEST_SURFACES = '1';
require('../src/main');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await fn()) return; await delay(40); }
  throw new Error(`Timed out: ${label}`);
}
const deadline = setTimeout(() => { console.error('Live window test exceeded 30 seconds'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  try {
    await until(() => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().endsWith('/pet.html')), 'pet created');
    const pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
    const settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings.html'));
    const run = (source) => pet.webContents.executeJavaScript(source);
    const nativeWindows = () => JSON.parse(execFileSync(path.join(__dirname, '../build/native/window-surfaces'), ['0'], { input: 'snapshot\n', encoding: 'utf8' }));
    const nativeLayer = () => nativeWindows().find((w) => w.pid === process.pid && w.width === pet.getBounds().width && w.height === pet.getBounds().height)?.layer;
    await until(() => run('typeof animator !== "undefined" && animator?.image?.complete').catch(() => false), 'pet ready');
    await until(() => run('companionState.windowTrackingStatus === "ready"'), 'window tracker ready');
    assert.equal(nativeLayer(), -1, 'desktop mode starts below normal app windows');
    settings.hide();
    await delay(400);
    const windows = JSON.parse(execFileSync(path.join(__dirname, '../build/native/window-surfaces'), [String(process.pid)], { input: 'snapshot\n', encoding: 'utf8' }));
    const areas = screen.getAllDisplays().map((d) => d.workArea);
    const bounds = pet.getBounds();
    const foot = footGeometry(bounds, 220);
    const surface = exposedSurfaces(windows, areas).find((s) => s.id === targetID);
    assert.ok(surface, `Existing app window ${targetID} must have an exposed top edge`);
    const area = areas.find((a) => surface.left >= a.x && surface.left < a.x + a.width && surface.y >= a.y && surface.y < a.y + a.height);
    const limits = surfaceLimits(surface, foot, movementBounds(area, bounds.width, bounds.height));
    assert.ok(limits.left <= limits.right && limits.y >= area.y, 'Enough room for the large pet');
    const x = Math.round((limits.left + limits.right) / 2);
    const y = Math.round(limits.y + 12);
    const initial = pet.getBounds();
    const grab = await run(`(() => {
      const r = sprite.getBoundingClientRect();
      for (let y = Math.round(r.y + r.height * .5); y < r.bottom - 30; y += 3)
        for (let x = Math.round(r.x + r.width * .5); x < r.right - 30; x += 3)
          if (hitTest.spriteContains({x,y})) return {x,y};
      return null;
    })()`);
    assert.ok(grab, 'Visible dog pixel for pointer press');
    const input = (type, globalX, globalY) => {
      const b = pet.getBounds();
      pet.webContents.sendInputEvent({ type, x: Math.round(globalX - b.x), y: Math.round(globalY - b.y),
        globalX: Math.round(globalX), globalY: Math.round(globalY), button: 'left', clickCount: 1,
        ...(type === 'mouseMove' ? { modifiers: ['leftButtonDown'] } : {}),
      });
    };
    input('mouseDown', initial.x + grab.x, initial.y + grab.y);
    await until(() => run('pointerDrag?.longPressed === true'), 'held using renderer mouse input');
    for (let i = 1; i <= 10; i++) {
      input('mouseMove', initial.x + grab.x + (x - initial.x) * i / 10, initial.y + grab.y + (y - initial.y) * i / 10);
      await delay(35);
    }
    await until(() => run('pointerDrag?.dragging === true'), 'renderer drag started');
    assert.equal(nativeLayer(), 3, 'dragging lifts the pet above the real app');
    await delay(180);
    input('mouseUp', x + grab.x, y + grab.y);
    await until(() => run('pet.dataset.perched === "true" && !airborne && !busy'), 'perched on real application');
    await delay(1200);
    assert.equal(await run('pet.dataset.perched'), 'true', 'Support stays attached');
    assert.equal(nativeLayer(), 3, 'perching keeps temporary elevation');
    assert.equal(await run('companionState.displayMode'), 'desktopOnly', 'saved mode stays unchanged');
    assert.ok(Math.abs(pet.getBounds().y + foot.y - surface.y) < 2);
    fs.writeFileSync(path.join(directory, 'pet.png'), (await pet.webContents.capturePage()).toPNG());
    const perched = pet.getBounds();
    await run(`window.comtriever.startPetDrag({screenX:${perched.x + 100},screenY:${perched.y + 100}})`);
    await run(`window.comtriever.movePetDrag({screenX:${perched.x + 100},screenY:${perched.y + 180}})`);
    await delay(160);
    await run(`window.comtriever.endPetDrag({screenX:${perched.x + 100},screenY:${perched.y + 180}})`);
    await until(() => nativeLayer() === -1, 'taking down restores desktop mode');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')).displayMode, 'desktopOnly');
    const restoredWindows = nativeWindows();
    const petIndex = restoredWindows.findIndex((w) => w.pid === process.pid && w.width === bounds.width && w.height === bounds.height);
    const targetIndex = restoredWindows.findIndex((w) => w.id === targetID);
    assert.ok(petIndex > targetIndex && targetIndex >= 0, 'taking down puts the pet behind the real application window');
    console.log(`PASS real application window ${targetID}: renderer press/drag/release, large pet supported at y=${surface.y}, temporary elevation and restoration`);
    console.log(`Dock overlay present: ${windows.some((w) => w.isDock)}; pet-only capture: ${directory}/pet.png`);
    clearTimeout(deadline);
    app.exit(0);
  } catch (error) {
    console.error(error);
    clearTimeout(deadline);
    app.exit(1);
  }
});
