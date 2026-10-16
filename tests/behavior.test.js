const test = require('node:test');
const assert = require('node:assert/strict');
const { HeldMood, Presence } = require('../src/pet-behavior');
const { exposedSurfaces, footGeometry, surfaceLimits } = require('../src/surfaces');
const { stepBody } = require('../src/physics');
const { WindowSurfaces } = require('../src/window-surfaces');
const { WindowPerch } = require('../src/window-perch');
const area = { x: 0, y: 24, width: 1440, height: 876 };
const win = (id, x, y, width, height, layer = 0) => ({ id, x, y, width, height, layer });

test('held emotions distinguish gentle motion, shaking, recovery and long holds', () => {
  const mood = new HeldMood(0, 0, 0);
  mood.move(200, 30, 0);
  assert.equal(mood.mood(1300), 'comfy');
  mood.move(1400, 100, 0);
  mood.move(1500, -10, 0);
  mood.move(1600, 100, 0);
  assert.equal(mood.mood(1700), 'startled');
  assert.equal(mood.mood(3100), 'comfy');
  assert.equal(mood.mood(8100), 'restless');
  assert.equal(new HeldMood(9000, 0, 0).mood(9000), 'held');
});

test('presence ignores brief inactivity and greets once after a real absence', () => {
  const p = new Presence();
  assert.equal(p.sample(60, 60000), null);
  assert.equal(p.sample(0, 61000), null);
  p.sample(130, 200000);
  assert.equal(p.sample(0, 201000).seconds, 131);
  assert.equal(p.sample(0, 202000), null);
});

test('suspend and screen lock combine into one welcome only after unlocking', () => {
  const p = new Presence();
  p.pause('locked', 1000);
  p.pause('suspended', 5000);
  p.resume('suspended');
  assert.equal(p.sample(0, 300000), null);
  p.resume('locked');
  assert.equal(p.sample(0, 300000).seconds, 299);
  p.resume('locked');
  assert.equal(p.sample(0, 300001), null);
});

test('clock moving backwards and short unlocks do not cause greetings', () => {
  const p = new Presence();
  p.pause('locked', 100000);
  p.resume('locked');
  assert.equal(p.sample(0, 90000), null);
  p.pause('locked', 100000);
  p.resume('locked');
  assert.equal(p.sample(0, 110000), null);
});

test('only exposed top-edge segments become platforms, preserving window order', () => {
  const result = exposedSurfaces([win(1, 400, 100, 200, 500), win(2, 100, 400, 800, 300)], [area]);
  const back = result.filter((s) => s.id === 2);
  assert.deepEqual(back.map((s) => [s.left, s.right]), [[112, 400], [600, 888]]);
  assert.equal(exposedSurfaces([win(1, 0, 24, 1440, 876), win(2, 100, 400, 800, 300)], [area]).length, 0);
});

test('floating windows block a ledge but cannot become platforms', () => {
  const result = exposedSurfaces([win(1, 0, 200, 1000, 500, 3), win(2, 100, 400, 800, 300)], [area]);
  assert.equal(result.length, 0);
});

test('the screen-sized transparent Dock overlay does not hide real application ledges', () => {
  const overlay = { ...win(7, 0, 0, 1440, 900, 20), isDock: true };
  const appWindow = win(2, 100, 400, 800, 300);
  const result = exposedSurfaces([overlay, appWindow], [area]);
  assert.deepEqual(result.map((s) => [s.id, s.left, s.right, s.y]), [[2, 112, 888, 400]]);
  // Never infer transparency from screen coverage or window level alone.
  assert.deepEqual(exposedSurfaces([{ ...overlay, isDock: false }, appWindow], [area]), []);
  // A real Dock or switcher rectangle still blocks the portion it covers.
  const dockBar = { ...win(8, 0, 300, 200, 600, 20), isDock: true };
  assert.deepEqual(exposedSurfaces([dockBar, appWindow], [area]).map((s) => [s.left, s.right]), [[200, 888]]);
});

test('Dock overlays on negative-origin displays are ignored without ignoring app occlusion', () => {
  const monitor = { x: -1440, y: -176, width: 1440, height: 876 };
  const overlay = { ...win(7, -1440, -200, 1440, 900, 20), isDock: true };
  const front = win(1, -900, -100, 200, 500);
  const back = win(2, -1300, 200, 900, 300);
  const segments = exposedSurfaces([overlay, front, back], [monitor]).filter((s) => s.id === 2);
  assert.deepEqual(segments.map((s) => [s.left, s.right]), [[-1288, -900], [-700, -412]]);
});

test('negative-origin monitor surfaces are clipped to usable screen space', () => {
  const result = exposedSurfaces([win(2, -1500, 0, 900, 300)], [{ x: -1440, y: -200, width: 1440, height: 900 }]);
  assert.deepEqual([result[0].left, result[0].right, result[0].y], [-1440, -612, 0]);
});

test('a fast descending pet lands on the first ledge without tunnelling', () => {
  const foot = footGeometry({ height: 262 }, 188);
  const surfaces = [{ id: 1, left: 100, right: 800, y: 450 }, { id: 2, left: 100, right: 800, y: 600 }];
  const bounds = { left: 0, right: 1186, top: 24, bottom: 638 };
  const next = stepBody({ x: 200, y: 100, vx: 0, vy: 2000 }, bounds, 0.1, { surfaces, foot });
  assert.equal(next.support.id, 1);
  assert.equal(next.y + foot.y, 450);
  assert.equal(next.settled, true);
  assert.equal(next.vy, 0);
  assert.equal(stepBody({ x: 200, y: 250, vx: 0, vy: -1500 }, bounds, 0.04, { surfaces, foot }).support, undefined);
});

test('narrow or head-clipping ledges are ignored', () => {
  const foot = footGeometry({ height: 262 }, 188);
  const bounds = { left: 0, right: 1186, top: 24, bottom: 638 };
  const next = stepBody({ x: 200, y: 100, vx: 0, vy: 2000 }, bounds, 0.1, { surfaces: [{ id: 1, left: 320, right: 340, y: 450 }], foot });
  assert.equal(next.support, undefined);
  assert.ok(surfaceLimits({ left: 100, right: 800, y: 100 }, foot, bounds).y < bounds.top);
});

test('a supported pet follows window movement, then falls once when it disappears', () => {
  let b = { x: 250, y: 168.92, width: 254, height: 262 };
  let surfaces = [{ id: 1, left: 112, right: 788, y: 400, windowX: 100, windowY: 400 }];
  let falls = 0;
  const host = { tracker: {}, enabled: () => true, blocked: () => false, bounds: () => b, petSize: () => 188,
    surfaces: () => surfaces, screenBounds: () => ({ left: 0, right: 1186, top: 24, bottom: 638 }),
    move: (x, y) => { b = { ...b, x, y }; }, send() {}, save() {}, interruptWander() {}, fall() { falls++; } };
  const perch = new WindowPerch(host);
  perch.attach(surfaces[0]);
  surfaces = [{ ...surfaces[0], left: 212, right: 888, y: 440, windowX: 200, windowY: 440 }];
  for (let i = 0; i < 40; i++) { perch.lastTick = performance.now() - 16; perch.tick(); }
  assert.ok(Math.abs(b.x - 350) < 1);
  assert.ok(Math.abs(b.y + footGeometry(b, 188).y - 440) < 1);
  surfaces = [];
  perch.tick(); perch.tick();
  assert.equal(falls, 1);
  assert.equal(perch.timer, null);
});

test('missing native helper fails closed and does not leave a polling timer', { skip: process.platform !== 'darwin' }, async () => {
  const tracker = new WindowSurfaces('/nonexistent/comtriever-helper');
  const failed = new Promise((resolve) => tracker.on('change', () => { if (tracker.status === 'unavailable') resolve(); }));
  tracker.start();
  await failed;
  assert.deepEqual(tracker.windows, []);
  assert.equal(tracker.timer, null);
  assert.equal(tracker.child, null);
});
