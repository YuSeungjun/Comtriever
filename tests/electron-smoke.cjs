// Run with: npm run test:electron. Uses an isolated save folder and no system watchers.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const directory = process.env.COMTRIEVER_SMOKE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-smoke-'));
app.setPath('userData', directory);
const retiredOptions = ['throwEnabled', 'smoothMotion', 'heldReactions'];
if (process.env.COMTRIEVER_SMOKE_RESTORE !== '1') {
  fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify(Object.fromEntries(retiredOptions.map((key) => [key, false]))));
}
process.env.COMTRIEVER_TEST_MODE = '1';
require('../src/main');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await delay(40);
  }
  throw new Error(`Timed out: ${label}`);
}
const errors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
});

app.whenReady().then(async () => {
  try {
    await until(() => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().endsWith('/pet.html')), 'pet created');
    let pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
    const settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings.html'));
    const run = (source) => pet.webContents.executeJavaScript(source);
    const ui = (source) => settings.webContents.executeJavaScript(source);
    const input = (event) => {
      const bounds = pet.getBounds();
      pet.webContents.sendInputEvent({ globalX: bounds.x + event.x, globalY: bounds.y + event.y, ...event });
    };
    // Keep physical mouse activity out of this isolated automation window.
    pet.setIgnoreMouseEvents(true);
    settings.setIgnoreMouseEvents(true);
    await until(() => run('typeof animator !== "undefined" && animator && animator.images.every(i => i.complete)').catch(() => false), 'sprites decoded');
    await until(() => ui('typeof latestState !== "undefined" && Boolean(latestState)').catch(() => false), 'settings ready');
    // Old saves and old IPC calls cannot disable the built-in interactions.
    for (const key of retiredOptions) await ui(`window.comtriever.setCompanionOption(${JSON.stringify(key)}, false)`);
    const current = await ui('window.comtriever.getState()');
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'));
    for (const key of retiredOptions) {
      assert.equal(Object.hasOwn(current, key), false, `${key} is no longer a preference`);
      assert.equal(Object.hasOwn(saved, key), false, `${key} removed from saved settings`);
    }
    assert.equal(await ui('document.querySelectorAll("#throwToggle, #smoothToggle, #heldToggle").length'), 0);
    console.log('PASS legacy opt-outs removed, old toggle calls ignored and settings controls absent');
    if (process.env.COMTRIEVER_SMOKE_RESTORE === '1') {
      const restored = await ui('window.comtriever.getState()');
      assert.equal(restored.bond.counts.pet, 1);
      assert.equal(restored.bond.counts.reminder, 1);
      assert.equal(restored.wanderEnabled, false);
      await until(() => ui('window.comtriever.getState().then(s => s.reminders.some(r => r.title === "재시작 후 알림" && r.status === "due"))'), 'missed reminder restored');
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log('PASS process restart restores bond, preferences and missed reminders');
      app.exit(0);
      return;
    }
    await ui('window.comtriever.setWanderEnabled(false)');
    await until(() => pet.isVisible(), 'pet shown');
    await delay(200);
    assert.equal(await ui('document.querySelector("#bondTitle").textContent'), '첫 만남');

    // Real renderer mouse events distinguish a rub from a held drag.
    const rect = await run('JSON.stringify(pet.getBoundingClientRect().toJSON())').then(JSON.parse);
    const y = Math.round(rect.y + rect.height * 0.3);
    const x = Math.round(rect.x + rect.width * 0.5);
    input({ type: 'mouseMove', x, y });
    input({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    for (let i = 0; i < 8; i++) {
      await delay(25);
      input({ type: 'mouseMove', x: x + (i % 2 ? 30 : -30), y, button: 'left', modifiers: ['leftButtonDown'] });
    }
    input({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await until(() => ui('window.comtriever.getState().then(s => s.bond.counts.pet > 0)'), 'petting reward');
    console.log('PASS petting and bond');

    // Drive the same IPC path as held dragging, with screen coordinates.
    const start = pet.getBounds();
    await run(`window.comtriever.startPetDrag({screenX:${start.x + 80},screenY:${start.y + 80}})`);
    for (let i = 1; i <= 5; i++) {
      await delay(20);
      await run(`window.comtriever.movePetDrag({screenX:${start.x + 80 + i * 20},screenY:${start.y + 80 - i * 12}})`);
    }
    await run(`window.comtriever.endPetDrag({screenX:${start.x + 180},screenY:${start.y + 20}})`);
    await until(() => run('airborne'), 'flight started');
    await until(() => run('!airborne'), 'flight landed');
    assert.ok(pet.getBounds().y >= start.y);
    console.log('PASS throw and landing');
    await delay(800);

    await run('window.feedingEvents=[]; window.comtriever.onPlay(p => { if (p.kind === "snack" && p.fullnessChange) window.feedingEvents.push(p.fullnessChange); }); void 0');
    assert.equal(await run('fullnessGauge.hidden'), true, 'no gauge before eating');
    assert.equal((await ui('window.comtriever.startPlay("snack")')).ok, true);
    await ui('window.comtriever.stopPlay()');
    await until(() => run('!playingWithToy && !busy'), 'cancel uneaten snack');
    assert.equal(await run('fullnessGauge.hidden && window.feedingEvents.length === 0'), true, 'cancelled snack does not show a gain');
    await ui('document.querySelector("#giveSnackButton").click()');
    await until(() => ui('window.comtriever.getState().then(s => s.bond.counts.snack > 0)'), 'snack consumed', 20000);
    await until(() => run('!fullnessGauge.hidden && window.feedingEvents.length === 1'), 'gauge appears on consumption');
    const feeding = await run('window.feedingEvents[0]');
    assert.ok(Math.abs(feeding.to - feeding.from - 22) < 1e-9, 'gauge receives the actual feeding gain');
    await until(() => run('Number(fullnessMeter.getAttribute("aria-valuenow")) > Math.round(window.feedingEvents[0].from) && Number(fullnessMeter.getAttribute("aria-valuenow")) < Math.round(window.feedingEvents[0].to)'), 'gauge animates through intermediate values', 1200);
    assert.equal(await run('getComputedStyle(fullnessGauge).pointerEvents'), 'none');
    assert.equal(await run('hitTest.hit({x:fullnessGauge.offsetLeft,y:fullnessGauge.offsetTop + 8})'), false, 'gauge does not block clicks');
    await delay(250);
    fs.writeFileSync(path.join(directory, 'feeding-gauge.png'), (await pet.webContents.capturePage()).toPNG());
    await until(() => run(`fullnessValue.textContent === '${Math.round(feeding.to)}%'`), 'gauge reaches restored fullness');
    assert.equal(await run('fullnessGauge.hidden'), false, 'final value stays visible briefly');
    await until(() => run('fullnessGauge.hidden && fullnessFrame === null && fullnessTimer === null && fullnessHideTimer === null'), 'gauge fades and cleans up');
    console.log('PASS snack chase, cancelled feeding, animated fullness gauge, click passthrough and cleanup');
    await ui('document.querySelector("#playBallButton").click()');
    await until(() => ui('window.comtriever.getState().then(s => s.bond.counts.ball > 0)'), 'ball returned', 20000);
    await delay(800);
    assert.equal(BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith('/toy.html')).length, 1);
    await ui('document.querySelector("#stopCompanionButton").click()');
    await until(() => run('!playingWithToy && !airborne && !busy'), 'stop continuing ball play');
    assert.equal(BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith('/toy.html')).length, 0);
    console.log('PASS ball fetch, waiting with ball and stop cleanup');

    const result = await ui(`window.comtriever.addReminder({title:'스트레칭 테스트', at:Date.now()+1300, repeat:'daily'})`);
    assert.equal(result.ok, true);
    await until(() => ui('window.comtriever.getState().then(s => s.reminders.some(r => r.status === "due"))'), 'reminder due');
    await until(() => run('!document.querySelector("#reminderCard").hidden'), 'pet reminder card');
    await run('document.querySelector("#reminderSnooze").click()');
    await until(() => ui('window.comtriever.getState().then(s => s.reminders[0].status === "scheduled")'), 'snoozed');
    const repeat = await ui('window.comtriever.getState().then(s => s.reminders[0])');
    assert.ok(repeat.at - Date.now() > 9 * 60000);
    const second = await ui(`window.comtriever.addReminder({title:'완료 테스트',at:Date.now()+1100,repeat:'none'})`);
    await until(() => run('reminders.some(r => r.title === "완료 테스트")'), 'second reminder');
    await run('document.querySelector("#reminderDone").click()');
    await until(() => ui('window.comtriever.getState().then(s => s.bond.counts.reminder === 1)'), 'completed reward');
    const duplicate = await ui(`window.comtriever.reminderAction(${JSON.stringify(second.reminder.id)}, 'complete')`);
    assert.equal(duplicate.ok, false);
    console.log('PASS reminders, snooze, repeat anchor and duplicate completion');

    await ui('document.querySelector("[data-tab=today]").click()');
    await delay(500);
    fs.writeFileSync(path.join(directory, 'settings.png'), (await settings.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(directory, 'pet.png'), (await pet.webContents.capturePage()).toPNG());
    await ui('document.querySelector("[data-tab=reminders]").click()');
    await delay(150);
    fs.writeFileSync(path.join(directory, 'reminders.png'), (await settings.webContents.capturePage()).toPNG());

    // Interruption paths must leave no toy windows or stuck held/walk states.
    await ui('window.comtriever.startPlay("ball")');
    await ui('window.comtriever.setPetSize("small")');
    await until(() => run('!airborne && !playingWithToy'), 'resize interrupts play');
    assert.equal(BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith('/toy.html')).length, 0);
    assert.equal(pet.getBounds().width, 222);
    const small = JSON.parse(await run('JSON.stringify(pet.getBoundingClientRect().toJSON())'));
    const sx = Math.round(small.x + small.width / 2), sy = Math.round(small.y + small.height / 2);
    input({ type: 'mouseDown', x: sx, y: sy, button: 'left', clickCount: 1 });
    await until(() => run('pointerDrag?.longPressed === true'), 'held drag threshold');
    await until(() => run('pet.dataset.heldMood === "comfy"'), 'held emotion despite legacy opt-out');
    input({ type: 'mouseMove', x: sx + 20, y: sy - 65, button: 'left', modifiers: ['leftButtonDown'] });
    await until(() => run('pointerDrag?.dragging === true'), 'held drag movement');
    input({ type: 'mouseUp', x: sx + 20, y: sy - 65, button: 'left', clickCount: 1 });
    await until(() => run('airborne'), 'release always starts physics');
    await until(() => run('!pointerDrag && !airborne && !busy'), 'release lands with built-in physics');
    assert.notEqual(await run('getComputedStyle(document.querySelector("#spriteMotion")).transform'), 'none', 'smooth body motion stays active');
    await ui('window.comtriever.startPlay("ball")');
    await ui('window.comtriever.sendHome()');
    await until(() => ui('window.comtriever.getState().then(s => !s.petVisible)'), 'go home during play');
    assert.equal(BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith('/toy.html')).length, 0);
    await ui('window.comtriever.callBack()');
    await until(() => run('!busy && companionState.petVisible'), 'call back after play');
    await ui('window.comtriever.startPlay("ball")');
    const oldPetId = pet.id;
    await ui('window.comtriever.setDisplayMode("desktopOnly")');
    await until(() => BrowserWindow.getAllWindows().some((w) => w.id !== oldPetId && w.webContents.getURL().endsWith('/pet.html')), 'recreated explicit display mode');
    pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
    await until(() => run('typeof companionState !== "undefined" && companionState.displayMode === "desktopOnly" && !busy && !playingWithToy').catch(() => false), 'new pet idle');
    if (process.platform === 'darwin') {
      await until(() => {
        const windows = JSON.parse(execFileSync(path.join(__dirname, '../build/native/window-surfaces'), ['0'], { input: 'snapshot\n', encoding: 'utf8' }));
        const b = pet.getBounds();
        return windows.find((w) => w.pid === process.pid && w.width === b.width && w.height === b.height)?.layer === -1;
      }, 'native desktop window shown below apps');
    } else assert.equal(pet.isAlwaysOnTop(), false);
    assert.equal(BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith('/toy.html')).length, 0);
    console.log('PASS built-in held emotion, smooth motion, release physics, resize, home and display-mode interruptions');

    await settings.webContents.reload();
    await until(() => ui('typeof latestState !== "undefined" && latestState && latestState.bond.counts.reminder === 1').catch(() => false), 'settings reloaded');
    const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'));
    assert.equal(persisted.progress.counts.reminder, 1);
    assert.equal(persisted.reminders.length, 2);
    assert.equal(errors.length, 0, errors.join('\n'));
    await ui('window.comtriever.addReminder({title:"재시작 후 알림",at:Date.now()+1500})');
    console.log(`PASS persistence and renderer errors; screenshots: ${directory}`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    console.error('Renderer errors:', errors);
    console.error('Test data:', directory);
    for (const w of BrowserWindow.getAllWindows()) {
      try { fs.writeFileSync(path.join(directory, `failure-${w.id}.png`), (await w.webContents.capturePage()).toPNG()); } catch {}
    }
    app.exit(1);
  }
});
