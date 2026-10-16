// Compare hit testing against rendered PNG alpha, then exercise native mouse
// passthrough, controls and captured drags using the production IPC path.
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-hit-')));
process.env.COMTRIEVER_TEST_MODE = '1';
const ignored = new Map();
const original = BrowserWindow.prototype.setIgnoreMouseEvents;
BrowserWindow.prototype.setIgnoreMouseEvents = function (value, options) {
  ignored.set(this.id, value);
  return original.call(this, value, options);
};
require('../src/main');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (await fn()) return; await delay(35); }
  throw new Error(`Timed out: ${label}`);
}
const errors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
});
app.whenReady().then(async () => {
  try {
    let cursor = { x: -10000, y: -10000 };
    screen.getCursorScreenPoint = () => cursor;
    await until(() => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().endsWith('/pet.html')), 'pet created');
    let pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
    const settings = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings.html'));
    const run = (source) => pet.webContents.executeJavaScript(source);
    const ui = (source) => settings.webContents.executeJavaScript(source);
    await until(() => run('typeof animator !== "undefined" && animator?.image?.complete').catch(() => false), 'sprites ready');
    settings.hide();
    await ui('window.comtriever.setWanderEnabled(false)');
    await delay(150);
    const area = screen.getPrimaryDisplay().workArea;
    pet.setPosition(area.x + 100, area.y + 100);
    await run('clearIdleTimers(); hideBubble(); pet.className="pet"; home.classList.remove("visible");');

    let solid;
    let transparent;
    for (const [size, name, left, angle] of [
      ['small', 'idle', false, 0], ['medium', 'walk', true, 0],
      ['large', 'pressedHold', false, 13], ['medium', 'sleep', true, -9],
    ]) {
      await ui(`window.comtriever.setPetSize(${JSON.stringify(size)})`);
      await delay(150);
      await run(`clearIdleTimers(); hideBubble(); pet.className='pet'; animator.play(${JSON.stringify(name)}); animator.stop(); setDirection(${JSON.stringify(left ? 'left' : 'right')}); document.querySelector('#spriteMotion').style.transform='rotate(${angle}deg) scaleY(1.03)';`);
      await delay(80);
      const points = await run(`(() => {
        const points=[];
        for(let y=4;y<innerHeight-30;y+=5) for(let x=4;x<innerWidth-4;x+=5) points.push({x,y,hit:hitTest.spriteContains({x,y})});
        return points;
      })()`);
      const capture = await pet.webContents.capturePage();
      const bitmap = capture.toBitmap();
      const imageSize = capture.getSize();
      const bounds = pet.getContentBounds();
      const scale = imageSize.width / bounds.width;
      const alpha = (x, y) => bitmap[(Math.floor(y * scale) * imageSize.width + Math.floor(x * scale)) * 4 + 3];
      let solidCount = 0, clearCount = 0;
      for (const point of points) {
        const neighbors = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => alpha(point.x + dx, point.y + dy)));
        if (neighbors.every((a) => a > 200)) {
          assert.equal(point.hit, true, `${size}/${name}: visible pixel ${point.x},${point.y}`);
          solidCount++;
          solid = point;
        } else if (neighbors.every((a) => a === 0)) {
          assert.equal(point.hit, false, `${size}/${name}: transparent pixel ${point.x},${point.y}`);
          clearCount++;
          transparent = point;
        }
      }
      assert.ok(solidCount > 40 && clearCount > 200);
    }
    console.log('PASS rendered sprite alpha matches hit areas across sizes, mirroring, rotation and animation states');

    const move = (point) => {
      const b = pet.getContentBounds();
      cursor = { x: b.x + point.x, y: b.y + point.y };
    };
    move(transparent);
    await until(() => ignored.get(pet.id) === true, 'transparent padding passes through');
    move(solid);
    await until(() => ignored.get(pet.id) === false, 'dog receives mouse');
    pet.setPosition(pet.getBounds().x + 320, pet.getBounds().y);
    await until(() => ignored.get(pet.id) === true, 'moving away from stationary cursor releases clicks');
    move(solid);
    await until(() => ignored.get(pet.id) === false, 'moved dog remains clickable');
    const input = (type, point) => {
      const b = pet.getBounds();
      pet.webContents.sendInputEvent({ type, x: point.x, y: point.y, globalX: b.x + point.x, globalY: b.y + point.y, button: 'left', clickCount: 1 });
    };
    input('mouseDown', solid);
    await until(() => run('Boolean(pointerDrag)'), 'dog press');
    move({ x: -50, y: -50 });
    await delay(100);
    assert.equal(ignored.get(pet.id), false, 'hold keeps mouse capture beyond sprite');
    // sendInputEvent only dispatches points inside the web contents; release
    // over transparent padding after verifying the out-of-window hold.
    move({ x: 3, y: 3 });
    input('mouseUp', { x: 3, y: 3 });
    await until(() => ignored.get(pet.id) === true, 'release restores pass through');
    console.log('PASS mouse passthrough and captured release');
    await run('clearClickTimer(); clearIdleTimers(); playIdle(); clearIdleTimers(); petTools.classList.add("pinned");');
    assert.deepEqual(await run('[...petTools.querySelectorAll("button")].map(b => b.textContent)'), ['간식', '공놀이', '그만']);
    const button = await run('(() => {const r=document.querySelector("#ballButton").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
    move(button);
    await until(() => ignored.get(pet.id) === false, 'visible toolbar receives clicks');
    input('mouseDown', button); input('mouseUp', button);
    await until(() => run('playingWithToy'), 'toolbar starts ball play');
    await run('window.comtriever.stopPlay()');
    await until(() => run('!playingWithToy && !airborne && !busy'), 'toolbar play stopped and pet landed');
    console.log('PASS toolbar click and home button removed');
    await run('petTools.classList.remove("pinned");');
    move({ x: 3, y: 3 });
    await until(() => ignored.get(pet.id) === true, 'empty corner passes through');
    await ui('window.comtriever.setHitResult(true)');
    await delay(80);
    assert.equal(ignored.get(pet.id), true, 'other renderer cannot alter pet hit testing');
    await run('showFileMenu([{path:"/tmp/test",name:"test"}]);');
    move({ x: 25, y: 25 });
    await until(() => ignored.get(pet.id) === false, 'file menu remains clickable');
    console.log('PASS file menu');
    await run('endFileInteraction();');
    await ui('window.comtriever.addReminder({title:"hit test",at:Date.now()+1100})');
    await until(() => run('!reminderCard.hidden'), 'reminder shown');
    await until(() => ignored.get(pet.id) === false, 'reminder card receives clicks');
    move({ x: 3, y: 3 });
    await until(() => ignored.get(pet.id) === true, 'space around reminder still passes through');
    console.log('PASS reminder card');
    const oldId = pet.id;
    await ui('window.comtriever.setDisplayMode("desktopOnly")');
    await until(() => BrowserWindow.getAllWindows().some((w) => w.id !== oldId && w.webContents.getURL().endsWith('/pet.html')), 'explicit mode switch recreated window');
    pet = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/pet.html'));
    await until(() => run('typeof hitTest !== "undefined"').catch(() => false), 'new hit tester');
    move({ x: 3, y: 3 });
    await until(() => ignored.get(pet.id) === true, 'transparent area still passes through after mode switch');
    assert.equal(ipcMain.listenerCount('pet:hitResult'), 1, 'no duplicate hit listeners');
    assert.deepEqual(errors, []);
    console.log('PASS native passthrough state, stationary cursor, captured hold, toolbar, file menu, reminders, IPC ownership and mode changes');
    app.exit(0);
  } catch (error) {
    console.error(error);
    for (const w of BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith('/pet.html'))) {
      console.error('Hit state:', await w.webContents.executeJavaScript('({pointerDrag, pressed:[...hitTest.pressed], point:hitTest.point, interactive:hitTest.lastInteractive, stopped:hitTest.stopped})'));
    }
    console.error('Renderer errors:', errors);
    app.exit(1);
  }
});
