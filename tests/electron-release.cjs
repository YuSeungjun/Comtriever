// Regression coverage for releases that previously left the pet suspended.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-release-'));
app.setPath('userData', directory);
fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({
  wanderEnabled: false, windowWalking: false, launchAtLogin: false, petSize: 'small',
}));
process.env.COMTRIEVER_TEST_MODE = '1';
require('../src/main');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = Date.now() + 6000;
  while (Date.now() < end) { if (await fn()) return; await delay(25); }
  throw new Error(`Timed out: ${label}`);
}
const errors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
});

app.whenReady().then(async () => {
  try {
    let pet;
    await until(() => {
      pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
      return pet;
    }, 'pet created');
    const run = (source) => pet.webContents.executeJavaScript(source);
    await until(() => run('typeof animator !== "undefined" && animator?.image?.complete').catch(() => false), 'sprites ready');
    BrowserWindow.getAllWindows().filter((w) => w !== pet).forEach((w) => w.hide());
    pet.setIgnoreMouseEvents(true);
    const area = screen.getPrimaryDisplay().workArea;
    const base = { x: area.x + 120, y: area.y + 180 };
    const floorY = area.y + area.height - pet.getBounds().height;
    const reset = async () => {
      await until(() => run('!airborne && !busy && !pointerDrag'), 'ready for next release');
      pet.setPosition(base.x, base.y);
    };
    const landed = async () => {
      await until(() => run('!airborne && !busy && !pointerDrag'), 'released pet landed');
      assert.equal(pet.getBounds().y, floorY, 'pet reaches the desktop floor');
      assert.equal(await run('heldMoodTimer === null && !pet.dataset.heldMood'), true);
    };
    const input = async (type, dx = 0, dy = 0) => {
      const point = await run('(() => { const r=pet.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()');
      const b = pet.getBounds();
      const x = point.x + dx, y = point.y + dy;
      pet.webContents.sendInputEvent({ type, x, y, globalX: b.x + x, globalY: b.y + y,
        button: 'left', clickCount: 1, ...(type === 'mouseMove' ? { modifiers: ['leftButtonDown'] } : {}) });
    };
    const dropFromAir = async () => {
      const b = pet.getBounds();
      await run(`window.comtriever.startPetDrag({screenX:${b.x + 80},screenY:${b.y + 80}})`);
      await run('window.comtriever.endPetDrag({screenX:0,screenY:0,cancelled:true})');
      await until(() => run('airborne'), 'zero velocity fall starts');
    };

    await reset();
    await dropFromAir();
    await delay(80);
    assert.equal(pet.getBounds().x, base.x, 'cancel coordinates never move the pet sideways');
    assert.ok(pet.getBounds().y > base.y, 'cancelled release falls from its last valid position');
    await landed();
    console.log('PASS cancelled IPC release ignores invalid event coordinates and lands');

    for (const kind of ['pointercancel', 'lostpointercapture', 'Escape']) {
      await reset();
      await input('mouseDown');
      await until(() => run('pointerDrag?.longPressed === true'), 'long press');
      await input('mouseMove', 18, -45);
      await until(() => run('pointerDrag?.dragging === true'), 'held drag');
      const released = pet.getBounds();
      if (kind === 'Escape') await run('document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true}))');
      else await run(`pet.dispatchEvent(new PointerEvent(${JSON.stringify(kind)}, {pointerId:pointerDrag.pointerId,screenX:0,screenY:0,bubbles:true}))`);
      await until(() => run('airborne && !pointerDrag'), `${kind} starts gravity`);
      await input('mouseUp');
      await delay(80);
      assert.equal(pet.getBounds().x, released.x, `${kind} has no horizontal throwing impulse`);
      assert.ok(pet.getBounds().y >= released.y, `${kind} does not jump upwards`);
      await landed();
      console.log(`PASS ${kind} during a held drag resumes gravity and clears capture`);
    }

    for (const holdMs of [100, 550]) {
      await reset();
      await dropFromAir();
      await input('mouseDown');
      await until(() => run('pointerDrag?.interruptedFlight === true && !airborne'), 'catch falling pet');
      await delay(60);
      const heldY = pet.getBounds().y;
      await delay(holdMs);
      assert.equal(pet.getBounds().y, heldY, 'caught pet stays in the hand');
      await input('mouseUp');
      await until(() => run('airborne && !pointerDrag'), 'stationary release resumes gravity');
      await landed();
      console.log(`PASS catch and stationary release after ${holdMs}ms`);
    }

    await reset();
    const pointer = { screenX: base.x + 80, screenY: base.y + 80 };
    await run(`window.comtriever.startPetDrag(${JSON.stringify(pointer)})`);
    for (let i = 1; i <= 4; i++) {
      await delay(25);
      await run(`window.comtriever.movePetDrag(${JSON.stringify({ ...pointer, screenY: pointer.screenY - i * 12 })})`);
    }
    const releasedY = pet.getBounds().y;
    await run(`window.comtriever.endPetDrag(${JSON.stringify({ ...pointer, screenY: pointer.screenY - 48 })})`);
    await delay(80);
    assert.ok(pet.getBounds().y < releasedY, 'deliberate upward throws still have an arc');
    await landed();
    assert.deepEqual(errors, []);
    console.log('PASS upward throwing arc and landing, with no renderer errors');
    app.exit(0);
  } catch (error) {
    console.error(error, errors);
    console.error('Release test data:', directory);
    app.exit(1);
  }
});
