const { app, BrowserWindow, powerMonitor, screen } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const behavior = require('../src/pet-behavior');
const { footGeometry } = require('../src/surfaces');
// Keep the production event path, shortening only absence duration for this test.
const OriginalPresence = behavior.Presence;
behavior.Presence = class extends OriginalPresence { constructor() { super({ threshold: 250, cooldown: 100 }); } };
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-surfaces-'));
app.setPath('userData', directory);
// Window walking is enabled by default, including in desktopOnly mode.
fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({ displayMode: 'desktopOnly', launchAtLogin: false }));
process.env.COMTRIEVER_TEST_MODE = '1';
process.env.COMTRIEVER_TEST_SURFACES = '1';
require('../src/main');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await delay(40); }
  throw new Error(`Timed out: ${label}`);
}
let fixture;
let fixtureBounds;
const errors = [];
app.on('web-contents-created', (_e, contents) => contents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); }));

app.whenReady().then(async () => {
  try {
    await until(() => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().endsWith('/pet.html')), 'pet created');
    let pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
    const settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings.html'));
    const run = (source) => pet.webContents.executeJavaScript(source);
    const ui = (source) => settings.webContents.executeJavaScript(source);
    const nativeLayer = () => {
      const rows = JSON.parse(execFileSync(path.join(__dirname, '../build/native/window-surfaces'), ['0'], { input: 'snapshot\n', encoding: 'utf8' }));
      const b = pet.getBounds();
      return rows.find((w) => w.pid === process.pid && w.width === b.width && w.height === b.height)?.layer;
    };
    await until(() => run('typeof animator !== "undefined" && animator && animator.images.every(i => i.complete)').catch(() => false), 'sprites ready');
    await until(() => ui('window.comtriever.getState().then(s => s.windowTrackingStatus === "ready")').catch(() => false), 'native helper ready');
    assert.equal((await ui('window.comtriever.getState()')).windowWalking, true);
    assert.equal(pet.isVisibleOnAllWorkspaces(), false);
    assert.equal(nativeLayer(), -1, 'desktop mode stays below normal application windows');
    console.log('PASS window walking defaults on and tracks windows in desktop mode');
    settings.hide();
    pet.setIgnoreMouseEvents(true);
    await ui('window.comtriever.setWanderEnabled(false)');
    fixture = spawn(path.join(__dirname, '../build/native/window-fixture'), [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    fixture.stdout.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        fixtureBounds = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
    });
    fixture.on('error', (error) => errors.push(error.message));
    fixture.stderr.on('data', (data) => console.error('Fixture:', data.toString().trim()));
    const command = (input) => fixture.stdin.write(JSON.stringify(input) + '\n');
    await until(() => fixtureBounds, 'external fixture window');
    const area = screen.getPrimaryDisplay().workArea;
    command({ action: 'move', x: area.x + 120, y: area.y + 360 });
    await until(() => Math.abs(fixtureBounds.y - (area.y + 360)) < 2, 'fixture positioned');
    const foot = footGeometry(pet.getBounds(), 188);
    // Place close to this ledge so unrelated live windows above the fixture
    // cannot correctly catch the pet first during a long fall.
    const place = async (offset = 12, cancelled = false) => {
      await delay(450);
      const b = pet.getBounds();
      const x = fixtureBounds.x + 240 - (foot.left + foot.right) / 2;
      const y = fixtureBounds.y - foot.y + offset;
      await run(`window.comtriever.startPetDrag({screenX:${b.x + 100},screenY:${b.y + 100}})`);
      await until(() => nativeLayer() === 3, 'temporary elevation during drag');
      await run(`window.comtriever.movePetDrag({screenX:${x + 100},screenY:${y + 100}})`);
      await delay(160);
      await run(`window.comtriever.endPetDrag(${JSON.stringify(cancelled ? { screenX: 0, screenY: 0, cancelled: true } : { screenX: x + 100, screenY: y + 100 })})`);
      await until(() => run('pet.dataset.perched === "true" && !airborne'), 'land on external window');
      await until(() => run('!busy'), 'settled on ledge');
      assert.ok(Math.abs(pet.getBounds().y + foot.y - fixtureBounds.y) < 2);
      assert.equal(nativeLayer(), 3, 'perched pet floats above app windows');
    };
    // A gentle release slightly below the top used to fall through the ledge.
    await place(12);
    await place(12, true);
    console.log('PASS cancelled release preserves nearby window support without jumping to cancellation coordinates');
    assert.equal(nativeLayer(), 3, 'perching raises the actual macOS window level');
    assert.equal((await ui('window.comtriever.getState()')).displayMode, 'desktopOnly');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')).displayMode, 'desktopOnly', 'temporary elevation never persists as a preference');
    const switchMode = async (mode) => {
      const oldId = pet.id;
      await ui(`window.comtriever.setDisplayMode(${JSON.stringify(mode)})`);
      await until(() => BrowserWindow.getAllWindows().some((w) => w.id !== oldId && w.webContents.getURL().endsWith('/pet.html')), 'recreate explicit display mode');
      pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
      await until(() => run(`typeof companionState !== 'undefined' && companionState.displayMode === ${JSON.stringify(mode)} && animator?.image?.complete`).catch(() => false), 'mode applied');
    };
    await switchMode('alwaysOnTop');
    await until(() => run('pet.dataset.perched === "true"'), 'support restored in always-on-top mode');
    assert.equal(nativeLayer(), 3);
    await switchMode('desktopOnly');
    await until(() => run('pet.dataset.perched === "true"'), 'support restored in desktop mode');
    assert.equal(nativeLayer(), 3);
    assert.equal(pet.isVisibleOnAllWorkspaces(), false);

    // Taking the pet down restores its normal window level immediately on release.
    const onLedge = pet.getBounds();
    await run(`window.comtriever.startPetDrag({screenX:${onLedge.x + 100},screenY:${onLedge.y + 100}})`);
    await run(`window.comtriever.movePetDrag({screenX:${onLedge.x + 100},screenY:${onLedge.y + 180}})`);
    await delay(160);
    await run(`window.comtriever.endPetDrag({screenX:${onLedge.x + 100},screenY:${onLedge.y + 180}})`);
    await until(() => nativeLayer() === -1, 'taking pet down restores desktop level');
    await until(() => run('!airborne && !busy'), 'landing finishes even behind other windows');
    assert.equal(nativeLayer(), -1, 'taking down restores the level below normal app windows');
    await place();
    const original = pet.getBounds();
    command({ action: 'move', x: fixtureBounds.x + 100, y: fixtureBounds.y + 35 });
    await until(() => Math.abs(pet.getBounds().x - original.x - 100) < 4 && Math.abs(pet.getBounds().y + foot.y - fixtureBounds.y) < 2, 'ride moving window');
    await ui('window.comtriever.setWanderEnabled(true)');
    const walkStart = pet.getBounds().x;
    await until(() => Math.abs(pet.getBounds().x - walkStart) > 12, 'walk on ledge');
    assert.ok(pet.getBounds().x + foot.left >= fixtureBounds.x + 10);
    assert.ok(pet.getBounds().x + foot.right <= fixtureBounds.x + fixtureBounds.width - 10);
    assert.equal(nativeLayer(), 3, 'walking stays above the supporting window');
    await ui('window.comtriever.setWanderEnabled(false)');
    await delay(200);
    fs.writeFileSync(path.join(directory, 'perched.png'), (await pet.webContents.capturePage()).toPNG());
    command({ action: 'minimize' });
    await until(() => run('pet.dataset.perched === "false"'), 'minimize removes support');
    assert.equal(nativeLayer(), -1, 'minimize restores desktop level');
    await until(() => run('!airborne'), 'land after minimize');
    command({ action: 'show' });
    await place();
    await ui('window.comtriever.setCompanionOption("windowWalking", false)');
    await until(() => ui('window.comtriever.getState().then(s => s.windowTrackingStatus === "off")'), 'window tracking disabled');
    await until(() => run('pet.dataset.perched === "false" && !airborne && !busy'), 'disabling ledges releases support');
    assert.equal(nativeLayer(), -1, 'disabling the feature removes temporary elevation');
    await ui('window.comtriever.setCompanionOption("windowWalking", true)');
    await until(() => ui('window.comtriever.getState().then(s => s.windowTrackingStatus === "ready")'), 'window tracking reenabled');
    await place();
    command({ action: 'close' });
    await until(() => run('pet.dataset.perched === "false"'), 'close removes support');
    assert.equal(nativeLayer(), -1, 'closing the window restores desktop level');
    await until(() => run('!airborne && !busy'), 'land after close');
    console.log('PASS temporary elevation, saved-mode preservation, mode changes while perched, taking down, following, walking, minimize, close and feature toggle');

    await switchMode('alwaysOnTop');
    assert.equal(nativeLayer(), 3);
    await ui('window.comtriever.setCompanionOption("windowWalking", false)');
    await until(() => run('companionState.windowWalking === false'), 'window walking disabled in always-on-top mode');
    assert.equal(nativeLayer(), 3, 'explicit always-on-top preference still wins');
    await ui('window.comtriever.setCompanionOption("windowWalking", true)');

    const rect = JSON.parse(await run('JSON.stringify(pet.getBoundingClientRect().toJSON())'));
    const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
    const input = (event) => { const b = pet.getBounds(); pet.webContents.sendInputEvent({ globalX: b.x + event.x, globalY: b.y + event.y, ...event }); };
    input({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    await until(() => run('pet.dataset.heldMood === "comfy"'), 'comfortable held emotion');
    fs.writeFileSync(path.join(directory, 'held.png'), (await pet.webContents.capturePage()).toPNG());
    await until(() => run('pet.dataset.heldMood === "restless"'), 'long hold emotion', 10000);
    input({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await until(() => run('!pointerDrag && !heldMoodTimer && !pet.dataset.heldMood && !busy'), 'held cleanup');
    console.log('PASS held comfort, long-hold emotion and timer cleanup');

    await run('window.welcomeCount=0; window.comtriever.onWelcome(()=>window.welcomeCount++); void 0');
    powerMonitor.getSystemIdleTime = () => 0;
    // Emit app-local events; do not actually lock or suspend the Mac.
    powerMonitor.emit('lock-screen');
    powerMonitor.emit('suspend');
    await delay(350);
    powerMonitor.emit('resume');
    await delay(100);
    assert.equal(await run('window.welcomeCount'), 0);
    powerMonitor.emit('unlock-screen');
    await until(() => run('window.welcomeCount === 1'), 'welcome after unlocking');
    powerMonitor.emit('unlock-screen');
    await delay(150);
    assert.equal(await run('window.welcomeCount'), 1);
    fs.writeFileSync(path.join(directory, 'welcome.png'), (await pet.webContents.capturePage()).toPNG());
    await ui('window.comtriever.setCompanionOption("welcomeBack", false)');
    powerMonitor.emit('lock-screen');
    await delay(350);
    powerMonitor.emit('unlock-screen');
    await delay(700);
    assert.equal(await run('window.welcomeCount'), 1);
    await ui('window.comtriever.setCompanionOption("welcomeBack", true)');
    await delay(500);
    powerMonitor.getSystemIdleTime = () => 180;
    powerMonitor.emit('unlock-screen');
    const started = await ui('window.comtriever.startPlay("ball")');
    assert.equal(started.ok, true);
    powerMonitor.getSystemIdleTime = () => 0;
    powerMonitor.emit('unlock-screen');
    await delay(150);
    assert.equal(await run('window.welcomeCount'), 1, 'welcome should wait for play');
    await ui('window.comtriever.stopPlay()');
    await until(() => run('window.welcomeCount === 2'), 'deferred welcome after play');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(`PASS single welcome after lock/suspend, preference and deferral during play; screenshots: ${directory}`);
    app.quit();
  } catch (error) {
    console.error(error);
    console.error('Renderer errors:', errors, 'artifacts:', directory);
    for (const w of BrowserWindow.getAllWindows()) {
      try { fs.writeFileSync(path.join(directory, `failure-${w.id}.png`), (await w.webContents.capturePage()).toPNG()); } catch {}
    }
    app.on('will-quit', () => app.exit(1));
    app.quit();
  } finally { fixture?.kill(); }
});
