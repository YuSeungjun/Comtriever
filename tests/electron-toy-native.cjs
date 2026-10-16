// Native clicks are essential here: sendInputEvent bypasses AppKit activation.
const { app, BrowserWindow, screen } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const mode = process.env.COMTRIEVER_TOY_MODE || 'alwaysOnTop';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-toy-native-'));
app.setPath('userData', directory);
fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({
  displayMode: mode, wanderEnabled: false, windowWalking: false, launchAtLogin: false,
  progress: { fullness: 90, fedAt: Date.now() },
}));
process.env.COMTRIEVER_TEST_MODE = '1';
const mod = require('../src/companion-controller');
const Original = mod.CompanionController;
let controller, fixture, fixtureState, revision = 0;
mod.CompanionController = class extends Original {
  constructor(host) { super(host); controller = this; }
};
require('../src/main');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
const command = async (input) => {
  const before = revision;
  fixture.stdin.write(JSON.stringify(input) + '\n');
  await until(() => revision > before, `fixture ${input.action}`, 3000);
};
const windows = () => JSON.parse(execFileSync(path.join(__dirname, '../build/native/window-surfaces'), ['0'], { input: 'snapshot\n', encoding: 'utf8' }));
app.on('before-quit', () => fixture?.kill());
app.whenReady().then(async () => {
  try {
    let pet, settings;
    await until(() => {
      pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
      settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings.html'));
      return pet && settings;
    }, 'windows');
    await until(() => pet.webContents.executeJavaScript('typeof animator !== "undefined" && animator?.images.every(i => i.complete) && !busy').catch(() => false), 'pet ready');
    const area = screen.getPrimaryDisplay().workArea;
    pet.setPosition(area.x + 120, area.y + area.height - pet.getBounds().height);
    settings.hide();
    assert.equal((await controller.startPlay('ball')).ok, true);
    await until(() => controller.play?.stage === 'waiting', 'caught ball');
    const session = controller.play, toy = session.window;
    const center = () => { const b = toy.getBounds(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    assert.equal(toy.isVisibleOnAllWorkspaces(), mode === 'alwaysOnTop', 'display mode keeps its Spaces behavior');
    assert.equal(toy.getBounds().width, 128);
    const shape = await toy.webContents.executeJavaScript('({width:shape.offsetWidth,height:shape.offsetHeight})');
    assert.deepEqual(shape, { width: 36, height: 36 }, 'visible ball size is unchanged');

    fixture = spawn(path.join(__dirname, '../build/native/window-fixture'), [], { stdio: ['pipe', 'pipe', 'inherit'] });
    let buffer = '';
    fixture.stdout.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        fixtureState = JSON.parse(buffer.slice(0, end));
        revision++;
        buffer = buffer.slice(end + 1);
      }
    });
    await until(() => fixtureState, 'native fixture');
    if (!fixtureState.postEventsAllowed) {
      console.log(`SKIP ${mode} native mouse checks: macOS event-posting permission unavailable`);
      fixture.kill(); app.exit(0); return;
    }
    // The pet now stays at the catch. Put the working/settings windows on
    // the opposite side so the held ball stays exposed in desktop mode too.
    const fixtureX = center().x < area.x + area.width / 2 ? area.x + area.width - 650 : area.x;
    settings.setPosition(fixtureX + 40, area.y);
    await command({ action: 'move', x: fixtureX, y: area.y + 170 });
    settings.show(); settings.focus();
    await until(() => settings.isFocused(), 'settings initially focused');
    await command({ action: 'focus' });
    await until(() => !settings.isFocused(), 'external window active');
    let settingsFocuses = 0;
    settings.on('focus', () => settingsFocuses++);
    const settingsID = Number(settings.getMediaSourceId().split(':')[1]);
    const settingsBehind = () => {
      const rows = windows();
      const settingIndex = rows.findIndex((r) => r.id === settingsID);
      const fixtureIndex = rows.findIndex((r) => r.id === fixtureState.id);
      return fixtureIndex >= 0 && settingIndex > fixtureIndex;
    };
    await until(settingsBehind, 'settings behind the working app');
    await command({ action: 'move-pointer', ...center() });
    await until(() => session.ignored === false, 'ball accepts clicks');
    await command({ action: 'click', ...center() });
    await until(() => session.stage === 'waiting' && session.rounds === 2, 'native click picks up and releases caught ball');
    assert.equal(settingsFocuses, 0, 'clicking the ball must not focus settings');
    assert.ok(settingsBehind(), 'settings stays behind the working app');

    settings.hide();
    await command({ action: 'focus' });
    await command({ action: 'click', ...center() });
    await until(() => session.stage === 'waiting' && session.rounds === 3, 'second native click');
    assert.equal(settings.isVisible(), false, 'hidden settings stays hidden');
    assert.equal(settingsFocuses, 0);

    // Position the working window under the toy's padding. The click must
    // reach it rather than the toy or dog, without starting another throw.
    const b = toy.getBounds(), padding = { x: b.x + 5, y: b.y + 5 };
    await command({ action: 'move', x: padding.x - 10, y: padding.y - 50 });
    await command({ action: 'focus' });
    await command({ action: 'move-pointer', ...padding });
    await until(() => session.ignored === true, 'transparent padding ignores mouse');
    const beforeClicks = fixtureState.clickCount;
    await command({ action: 'click', ...padding });
    await delay(250);
    await command({ action: 'state' });
    assert.equal(fixtureState.clickCount, beforeClicks + 1, 'padding click reaches the window underneath');
    assert.equal(session.stage, 'waiting');
    assert.equal(session.rounds, 3);
    controller.stop();
    fixture.kill();
    console.log(`PASS ${mode}: native ball clicks keep settings behind/hidden; transparent padding passes clicks through`);
    app.exit(0);
  } catch (error) {
    console.error(error, { mode, stage: controller?.play?.stage, directory });
    fixture?.kill(); app.exit(1);
  }
});
