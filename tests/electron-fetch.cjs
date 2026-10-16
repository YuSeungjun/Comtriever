// Exercise repeated fetch through the real pet/settings/toy renderers and IPC.
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const model = require('../src/companion-model');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-fetch-'));
app.setPath('userData', directory);
fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({
  wanderEnabled: false, windowWalking: false, launchAtLogin: false,
  progress: { fullness: 18, fedAt: Date.now() },
}));
process.env.COMTRIEVER_TEST_MODE = '1';
// Observe the production controller without adding test IPC to the app.
const controllerModule = require('../src/companion-controller');
const OriginalController = controllerModule.CompanionController;
let controller;
const catches = [];
controllerModule.CompanionController = class extends OriginalController {
  constructor(host) { super(host); controller = this; }
  catchBall(session) {
    const position = this.host.pet().getBounds();
    super.catchBall(session);
    catches.push({ session, round: session.rounds, position });
  }
};
let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;
require('../src/main');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, timeout = 15000) {
  const end = realNow() + timeout;
  while (realNow() < end) { if (await fn()) return; await delay(30); }
  throw new Error(`Timed out: ${label}`);
}
const errors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
});

app.whenReady().then(async () => {
  try {
    let pet, settings;
    await until(() => {
      pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
      settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings.html'));
      return pet && settings;
    }, 'windows created');
    const run = (source) => pet.webContents.executeJavaScript(source);
    const ui = (source) => settings.webContents.executeJavaScript(source);
    await until(() => run('typeof animator !== "undefined" && animator?.images.every(i => i.complete) && !busy').catch(() => false), 'pet ready');
    await until(() => ui('typeof latestState !== "undefined" && Boolean(latestState)').catch(() => false), 'settings ready');
    settings.hide();
    pet.setIgnoreMouseEvents(true);
    const area = screen.getPrimaryDisplay().workArea;
    pet.setPosition(area.x + 120, area.y + area.height - pet.getBounds().height);
    const origin = pet.getBounds();
    await run('window.playEvents=[]; window.comtriever.onPlay(p => window.playEvents.push(p)); void 0');
    const state = () => controller.host.state();
    const buttonsLocked = async () => {
      await until(() => run('document.querySelector("#snackButton").disabled && document.querySelector("#ballButton").disabled && !document.querySelector("#stopPlayButton").disabled'), 'pet controls locked');
      await until(() => ui('document.querySelector("#giveSnackButton").disabled && document.querySelector("#playBallButton").disabled && !document.querySelector("#stopCompanionButton").disabled'), 'settings controls locked');
    };
    const waitForCatch = async (round) => {
      await until(() => controller.play?.stage === 'waiting' && controller.play.rounds === round, `catch ${round} waits in place`);
      await until(() => run('playingWithToy && animator.currentName === "idle"'), 'dog waits with ball');
      const caught = catches.at(-1);
      assert.equal(caught.session, controller.play);
      assert.equal(caught.round, round);
      assert.deepEqual(pet.getBounds(), caught.position, 'dog stays exactly where it picked up the ball');
      await buttonsLocked();
    };
    const checkLossGauge = async (round) => {
      await until(() => run(`window.playEvents.filter(p => p.kind === 'ball' && p.fullnessChange).length === ${round} && !fullnessGauge.hidden`), 'one gauge event per catch');
      const change = await run("window.playEvents.filter(p => p.kind === 'ball' && p.fullnessChange).at(-1).fullnessChange");
      assert.ok(Math.abs(change.to - Math.max(0, change.from - 5)) < 1e-9);
      assert.equal(await run('fullnessGauge.dataset.direction'), 'loss');
      const position = pet.getBounds();
      await until(() => run(`(() => { const value = new DOMMatrix(getComputedStyle(fullnessFill).transform).d; return value < ${change.from / 100} && value > ${change.to / 100}; })()`), 'gauge visibly moves downward', 1200);
      assert.ok(await run('fullnessGauge.getBoundingClientRect().top > bubble.getBoundingClientRect().bottom + 7'), 'gauge stays clear of the speech bubble and its tail');
      assert.equal(await run('hitTest.hit({x:fullnessGauge.offsetLeft,y:fullnessGauge.offsetTop + 8})'), false, 'gauge passes clicks through');
      await delay(250);
      fs.writeFileSync(path.join(directory, `energy-${round}.png`), (await pet.webContents.capturePage()).toPNG());
      await until(() => run(`Math.abs(new DOMMatrix(getComputedStyle(fullnessFill).transform).d - ${change.to / 100}) < 0.000001`), 'gauge reaches remaining fullness');
      assert.equal(await run('fullnessValue.textContent'), `${Math.round(change.to)}%`);
      assert.deepEqual(pet.getBounds(), position, 'waiting dog does not drift back while the gauge animates');
    };
    const beforeFirst = structuredClone(state().progress);
    await ui('document.querySelector("#playBallButton").click()');
    await buttonsLocked();
    await waitForCatch(1);
    assert.ok(Math.abs(pet.getBounds().x - origin.x) > 60, 'first catch is away from the starting place');
    const session = controller.play;
    const toy = session.window;
    const toyRun = (source) => toy.webContents.executeJavaScript(source);
    await until(() => toyRun('toy.dataset.stage === "waiting" && carried && canPickUp'), 'caught ball is pickable');
    assert.equal(toy.getBounds().width, 128, 'native surface avoids the macOS small transparent window bug');
    assert.ok(Math.abs(state().progress.fullness - Math.max(0, model.fullness(beforeFirst, state().progress.fedAt) - 5)) < 1e-9);
    const firstReward = state().progress.xp;
    await checkLossGauge(1);
    await run('petTools.classList.add("pinned")');
    await delay(150);
    fs.writeFileSync(path.join(directory, 'waiting-pet.png'), (await pet.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(directory, 'waiting-ball.png'), (await toy.webContents.capturePage()).toPNG());
    const waitingPosition = pet.getBounds();
    clockOffset += 61000;
    await delay(250);
    assert.equal(controller.play, session, 'waiting does not expire after one minute');
    assert.deepEqual(pet.getBounds(), waitingPosition, 'waiting dog stays still');
    assert.equal(session.rounds, 1, 'waiting does not consume another round');
    for (const kind of ['ball', 'snack']) {
      assert.equal((await ui(`window.comtriever.startPlay(${JSON.stringify(kind)})`)).ok, false);
      assert.equal(controller.play, session, 'another play request cannot replace the current ball');
    }
    console.log('PASS first fetch, stationary waiting beyond one minute, pickable ball and locked controls');

    const input = (type, x = 64, y = 64) => {
      const b = toy.getBounds();
      toy.webContents.sendInputEvent({ type, x, y, globalX: b.x + x, globalY: b.y + y,
        button: 'left', clickCount: 1, ...(type === 'mouseMove' ? { modifiers: ['leftButtonDown'] } : {}) });
    };
    for (const round of [2, 3, 4]) {
      const before = structuredClone(state().progress);
      input('mouseDown');
      await until(() => controller.play?.stage === 'aim' && session.dragging && toyRun('held !== null'), 'pick up held ball');
      const stationary = pet.getBounds();
      await delay(100);
      assert.deepEqual(pet.getBounds(), stationary, 'dog waits while user holds the ball');
      assert.equal(state().progress.fullness, before.fullness, 'holding the ball does not charge energy');
      await buttonsLocked();
      if (round === 3) {
        const lastPosition = toy.getBounds();
        await toyRun('toy.dispatchEvent(new PointerEvent("pointercancel", {pointerId:held,screenX:0,screenY:0,bubbles:true}))');
        input('mouseUp');
        assert.ok(Math.abs(toy.getBounds().x - lastPosition.x) < 2, 'cancel keeps the last ball position');
      } else {
        for (let i = 0; i < 5; i++) { input('mouseMove', 80, 54); await delay(25); }
        input('mouseUp', 80, 54);
      }
      if (round < 4) {
        await waitForCatch(round);
        assert.equal(controller.play.window.id, toy.id, 'same ball survives repeated throws');
      } else await until(() => !controller.play && toy.isDestroyed(), 'hunger ends fourth fetch');
      await checkLossGauge(round);
      assert.ok(Math.abs(state().progress.fullness - Math.max(0, model.fullness(before, state().progress.fedAt) - 5)) < 1e-9,
        'one five-point cost per completed fetch, preserving elapsed hunger');
      if (round === 2) assert.ok(state().progress.xp > firstReward, 'new reward after cooldown');
      if (round === 3) assert.equal(state().progress.xp, model.normalizeProgress(before).xp, 'energy still spent during reward cooldown');
    }
    await until(() => run('!playingWithToy && !document.querySelector("#snackButton").disabled && document.querySelector("#ballButton").disabled && document.querySelector("#stopPlayButton").disabled'), 'hungry pet controls');
    await until(() => ui('!document.querySelector("#giveSnackButton").disabled && document.querySelector("#playBallButton").disabled && document.querySelector("#stopCompanionButton").disabled'), 'hungry settings controls');
    const phases = await run('window.playEvents.map(p => p.phase)');
    for (const phase of ['start', 'waiting', 'aim', 'thrown', 'hungry']) assert.ok(phases.includes(phase));
    assert.ok(await run('window.playEvents.find(p => p.phase === "hungry").message.includes("배고파")'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')).progress.fullness, 0);
    assert.equal((await ui('window.comtriever.startPlay("ball")')).ok, false);
    console.log('PASS waiting at each catch, repeated throws, downward gauge every round through zero, cancel recovery, five-point costs and automatic stop');

    await until(() => run('!busy'), 'hunger reaction ends');
    assert.equal((await ui('window.comtriever.startPlay("snack")')).ok, true);
    await until(() => !controller.play && model.fullness(state().progress) > 20, 'snack restores energy');
    await until(() => ui('!document.querySelector("#playBallButton").disabled'), 'ball available after snack');
    assert.equal((await ui('window.comtriever.startPlay("ball")')).ok, true);
    await waitForCatch(1);
    await ui('document.querySelector("#stopCompanionButton").click()');
    await until(() => !controller.busy && !BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().endsWith('/toy.html')), 'stop removes waiting ball');
    await until(() => run('!playingWithToy && !busy'), 'stop restores pet');
    assert.equal((await ui('window.comtriever.startPlay("ball")')).ok, true);
    await waitForCatch(1);
    clockOffset += 20 * 60000;
    await until(() => !controller.play && !controller.busy, 'natural hunger also stops a waiting session');
    await until(() => run('!playingWithToy && !busy'), 'natural hunger reaction ends');
    assert.deepEqual(errors, []);
    console.log(`PASS feeding permits replay, Stop cleans up and natural hunger ends waiting; artifacts: ${directory}`);
    app.exit(0);
  } catch (error) {
    console.error(error, 'Session:', controller?.play?.stage, 'Progress:', controller?.host.state().progress);
    console.error('Renderer errors:', errors, 'Test data:', directory);
    for (const w of BrowserWindow.getAllWindows()) {
      try { fs.writeFileSync(path.join(directory, `failure-${w.id}.png`), (await w.webContents.capturePage()).toPNG()); } catch {}
    }
    app.exit(1);
  }
});
