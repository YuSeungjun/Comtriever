// Use real landing, chase and renderer IPC to catch backwards walking at edges.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-play-direction-'));
app.setPath('userData', directory);
fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({
  wanderEnabled: false, windowWalking: false, launchAtLogin: false,
  progress: { fullness: 30, fedAt: Date.now() },
}));
process.env.COMTRIEVER_TEST_MODE = '1';
const controllerModule = require('../src/companion-controller');
const OriginalController = controllerModule.CompanionController;
let controller;
controllerModule.CompanionController = class extends OriginalController {
  constructor(host) { super(host); controller = this; }
};
require('../src/main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
const errors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
});

app.whenReady().then(async () => {
  let pet;
  try {
    let settings;
    await until(() => {
      pet = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/pet.html'));
      settings = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/settings.html'));
      return pet && settings;
    }, 'windows created');
    const run = source => pet.webContents.executeJavaScript(source);
    const ui = source => settings.webContents.executeJavaScript(source);
    await until(() => run('typeof animator !== "undefined" && animator?.images.every(i => i.complete) && !busy').catch(() => false), 'pet ready');
    settings.hide();
    pet.setIgnoreMouseEvents(true);
    const area = screen.getPrimaryDisplay().workArea;
    for (const size of ['medium', 'small', 'large']) {
      await ui(`window.comtriever.setPetSize('${size}')`);
      await until(() => run(`companionState.petSize === '${size}' && !busy`), 'size applied');
      const cases = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
      // Balls share the same landing/chase transition as snacks.
      for (const kind of ['snack', 'ball']) for (const corner of cases) {
        if (kind === 'ball' && size !== 'medium') continue;
        const b = pet.getBounds();
        const left = corner.endsWith('left');
        const x = left ? area.x : area.x + area.width - b.width;
        const y = corner.startsWith('top') ? area.y : area.y + area.height - b.height;
        pet.setPosition(x, y);
        // Reset only this isolated fixture's energy between complete snacks.
        Object.assign(controller.host.state().progress, { fullness: 30, fedAt: Date.now() });
        assert.equal((await ui(`window.comtriever.startPlay('${kind}')`)).ok, true);
        await until(() => !controller.flight && Math.abs(pet.getBounds().x - x) > 35, 'dog walks inward after landing');
        const moved = pet.getBounds().x - x;
        assert.ok(left ? moved > 0 : moved < 0, 'dog approaches the snack/ball inside the screen');
        const expected = left ? 'right' : 'left';
        await until(() => run('!airborne && animator.currentName === "walk"'), 'walking renderer');
        // Give the renderer one display frame to consume the movement IPC.
        await delay(40);
        const facing = await run('spriteWrap.classList.contains("direction-left") ? "left" : "right"');
        assert.equal(facing, expected, `${size} ${kind} ${corner}: facing matches actual movement after landing`);
        await until(() => kind === 'snack' ? !controller.play : controller.play?.stage === 'waiting', 'play reaches the toy', 15000);
        if (kind === 'snack') assert.ok(controller.host.state().progress.fullness > 50, 'snack is consumed');
        await until(() => run('!airborne && animator.currentName !== "walk"'), 'finished chasing');
        assert.equal(await run('spriteWrap.classList.contains("direction-left") ? "left" : "right"'), expected, 'facing stays consistent at the toy');
        console.log('PASS', size, kind, corner, 'walks forward, reaches toy and keeps facing');
        await ui('window.comtriever.stopPlay()');
        await until(() => run('!playingWithToy && !busy'), 'ready for next play');
      }
    }
    assert.deepEqual(errors, []);
    console.log('Play direction artifacts:', directory);
    app.exit(0);
  } catch (error) {
    if (pet && !pet.isDestroyed()) fs.writeFileSync(path.join(directory, 'failure.png'), (await pet.webContents.capturePage()).toPNG());
    console.error(error, errors, 'Artifacts:', directory);
    app.exit(1);
  }
});
