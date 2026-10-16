const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/companion-model');
const { stepBody, throwVelocity, movementBounds } = require('../src/physics');

test('old and damaged saves migrate to usable progress and reminders', () => {
  const progress = model.normalizeProgress({ xp: -10, fullness: Infinity, counts: { pet: NaN } }, 1000);
  assert.equal(progress.xp, 0);
  assert.equal(progress.fullness, 30);
  assert.equal(progress.counts.pet, 0);
  const reminder = model.createReminder({ title: ' 물 마시기 ', at: 2000 }, 1000);
  const result = model.normalizeReminders([null, {}, reminder, reminder, { ...reminder, id: 'bad', at: NaN }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, '물 마시기');
});

test('petting has a persisted reward cooldown and advances bond levels', () => {
  const p = model.normalizeProgress({}, 1000);
  assert.equal(model.reward(p, 'pet', 1000), 3);
  assert.equal(model.reward(p, 'pet', 1500), 0);
  assert.equal(model.reward(model.normalizeProgress(p, 5000), 'pet', 5000), 0);
  for (let i = 1; i <= 9; i++) model.reward(p, 'pet', 1000 + i * 11000);
  assert.equal(model.bond(p).level, 2);
  assert.equal(p.counts.pet, 10);
});

test('bond tiers preserve the first five thresholds and require more experience through level eight', () => {
  const tiers = [
    [0, '첫 만남'], [25, '낯익은 사이'], [100, '반가운 친구'], [225, '가까운 친구'],
    [400, '든든한 친구'], [800, '소중한 단짝'], [1500, '가족 같은 사이'], [2500, '평생의 가족'],
  ];
  for (const [index, [xp, name]] of tiers.entries()) {
    const at = model.bond(model.normalizeProgress({ xp }));
    assert.equal(at.level, index + 1);
    assert.equal(at.name, name);
    assert.equal(at.isMaxLevel, index === 7);
    assert.equal(at.current, 0);
    assert.equal(at.needed, index === 7 ? 0 : tiers[index + 1][0] - xp);
    if (index > 0) {
      const before = model.bond(model.normalizeProgress({ xp: xp - 1 }));
      assert.equal(before.level, index);
      assert.equal(before.isMaxLevel, false);
      assert.equal(before.needed - before.current, 1);
    }
  }
  // The former levels 6–8 now need more time together, without removing XP.
  for (const [xp, expected] of [[625, 5], [900, 6], [1225, 6]]) {
    const saved = model.normalizeProgress({ xp });
    assert.equal(model.bond(saved).level, expected);
    assert.equal(saved.xp, xp);
  }
});

test('rewards cross the new tier boundaries and preserve experience and counts at the maximum level', () => {
  const progress = model.normalizeProgress({ xp: 799 }, 1000);
  model.reward(progress, 'pet', 1000);
  const restored = model.normalizeProgress(JSON.parse(JSON.stringify(progress)), 2000);
  assert.equal(restored.xp, 802);
  assert.equal(model.bond(restored).level, 6);
  assert.equal(model.bond(restored).current, 2);
  assert.equal(model.bond(restored).needed, 700);

  const finalTier = model.normalizeProgress({ xp: 2499 }, 1000);
  model.reward(finalTier, 'ball', 1000);
  assert.equal(model.bond(finalTier).level, 8);
  model.reward(finalTier, 'ball', 22000);
  const atMax = model.normalizeProgress(JSON.parse(JSON.stringify(finalTier)), 23000);
  assert.equal(atMax.xp, 2515);
  assert.equal(atMax.counts.ball, 2);
  assert.equal(model.bond(atMax).isMaxLevel, true);
  assert.equal(model.bond(atMax).needed - model.bond(atMax).current, 0);
  assert.equal(model.bond(model.normalizeProgress({ xp: 1000000 })).level, 8);
});

test('snacks fill the pet, fullness decays, and repeated feeding is bounded', () => {
  const p = model.normalizeProgress({ fullness: 80, fedAt: 1000 }, 1000);
  assert.equal(model.feed(p, 1000), true);
  assert.equal(p.fullness, 100);
  assert.equal(model.feed(p, 2000), false);
  assert.equal(model.fullness(p, 1000 + 60000), 99);
  assert.equal(model.fullness(p, 1000 + 100 * 60000), 0);
  assert.equal(model.feed(p, 1000 + 14 * 60000), false);
  assert.equal(model.feed(p, 1000 + 15 * 60000), true);
  assert.equal(model.fullness(p, 0), 100);
});

test('resting freezes the current energy across restarts and resumes without charging home time', () => {
  const minute = 60000;
  const p = model.normalizeProgress({ fullness: 72, fedAt: 1000 }, 1000);
  model.setFullnessPaused(p, true, 1000 + minute);
  assert.equal(p.fullness, 71, 'active time before entering home is charged');
  assert.equal(model.fullness(p, 1000 + 1440 * minute), 71);
  const saved = JSON.stringify(p);
  model.setFullnessPaused(p, true, 1000 + 1440 * minute);
  assert.equal(JSON.stringify(p), saved, 'repeated home requests do not change the checkpoint');

  const now = 1000 + 2880 * minute;
  const restored = model.normalizeProgress(JSON.parse(saved), now);
  assert.equal(model.bond(restored, now).fullness, 71);
  model.setFullnessPaused(restored, false, now);
  assert.equal(model.fullness(restored, now), 71);
  model.setFullnessPaused(restored, false, now + minute / 2);
  assert.equal(model.fullness(restored, now + minute), 70, 'only active time after coming back is charged');
  model.setFullnessPaused(restored, true, now + minute);
  assert.equal(model.fullness(restored, now + 100 * minute), 70);
});

test('legacy energy can enter home safely, including empty saves and a clock moving backwards', () => {
  const p = model.normalizeProgress({ fullness: 10, fedAt: 1000 }, 61000);
  model.setFullnessPaused(p, true, 61000);
  assert.equal(model.fullness(p, 121000), 9);
  const restored = model.normalizeProgress(p, 500);
  assert.equal(model.fullness(restored, 500), 9);
  model.setFullnessPaused(restored, false, 500);
  assert.equal(model.fullness(restored, 60500), 8);
  const empty = model.normalizeProgress({ fullness: 0, fullnessPaused: true }, 1000);
  assert.equal(model.fullness(empty, 999999), 0);
  assert.equal(model.normalizeProgress({ fullnessPaused: 'true' }, 1000).fullnessPaused, false);
});

test('invalid and past schedules are rejected without creating records', () => {
  for (const input of [{ title: '', at: 2000 }, { title: 'a', at: 999 }, { title: 'a', at: NaN }, { title: 'a', at: 2000, repeat: 'forever' }]) {
    assert.throws(() => model.createReminder(input, 1000));
  }
});

test('every fetch uses five fullness points in addition to elapsed hunger, including reward cooldowns', () => {
  const p = model.normalizeProgress({ fullness: 30, fedAt: 1000 }, 1000);
  assert.equal(model.usePlayEnergy(p, 61000), 24);
  assert.equal(model.reward(p, 'ball', 61000), 8);
  assert.equal(model.usePlayEnergy(p, 67000), 18.9);
  assert.equal(model.reward(p, 'ball', 67000), 0);
  const restored = model.normalizeProgress(JSON.parse(JSON.stringify(p)), 67000);
  assert.equal(model.fullness(restored, 127000), 17.9);
});

test('play hunger stops at zero and a snack restores energy', () => {
  const p = model.normalizeProgress({ fullness: 5, fedAt: 1000 }, 1000);
  assert.equal(model.usePlayEnergy(p, 1000), 0);
  assert.equal(model.usePlayEnergy(p, 2000), 0);
  assert.equal(model.feed(p, 2000), true);
  assert.equal(model.fullness(p, 2000), 22);
  p.fullness = 2.5;
  assert.equal(model.usePlayEnergy(p, 2000), 0);
});

test('overdue schedules fire once across reloads and cannot complete twice', () => {
  const r = model.createReminder({ title: '스트레칭', at: 2000 }, 1000);
  assert.equal(model.collectDue([r], 100000).length, 1);
  const reloaded = model.normalizeReminders(JSON.parse(JSON.stringify([r])));
  assert.equal(model.collectDue(reloaded, 100001).length, 0);
  assert.equal(model.actOnReminder(reloaded[0], 'complete', 100001), true);
  assert.equal(model.actOnReminder(reloaded[0], 'complete', 100002), false);
});

test('snoozing preserves the recurring calendar anchor', () => {
  const now = new Date(2026, 9, 15, 8, 0).getTime();
  const at = new Date(2026, 9, 15, 9, 0).getTime();
  const r = model.createReminder({ title: '약속', at, repeat: 'daily' }, now);
  model.collectDue([r], at);
  model.actOnReminder(r, 'snooze', at);
  assert.equal(model.actOnReminder(r, 'snooze', at + 1000), false);
  assert.equal(new Date(r.at).getMinutes(), 10);
  model.collectDue([r], at + 600000);
  model.actOnReminder(r, 'complete', at + 600000);
  assert.equal(new Date(r.at).getDate(), 16);
  assert.equal(new Date(r.at).getHours(), 9);
  assert.equal(new Date(r.at).getMinutes(), 0);
});

test('weekly recurrence skips missed weeks, without emitting a backlog', () => {
  const anchor = new Date(2026, 9, 15, 9, 0).getTime();
  const now = new Date(2026, 11, 20, 15, 0).getTime();
  const next = new Date(model.nextOccurrence({ anchor, repeat: 'weekly' }, now));
  assert.equal(next.getDay(), new Date(anchor).getDay());
  assert.equal(next.getHours(), 9);
  assert.ok(next > now && next - now <= 8 * 86400000);
});

test('daily schedules preserve local time across daylight saving transitions', () => {
  const prior = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const anchor = new Date(2026, 2, 7, 9, 0).getTime();
    const next = new Date(model.nextOccurrence({ anchor, repeat: 'daily' }, anchor));
    assert.equal(next.getHours(), 9);
    assert.equal(next.getTime() - anchor, 23 * 3600000);
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});

test('release after a pause does not reuse stale throwing momentum', () => {
  const samples = [{ x: 0, y: 0, t: 0 }, { x: 100, y: -50, t: 100 }];
  assert.deepEqual(throwVelocity(samples, 100), { vx: 1000, vy: -500 });
  assert.deepEqual(throwVelocity(samples, 350), { vx: 0, vy: 0 });
  assert.deepEqual(throwVelocity([...samples, { x: 100, y: -50, t: 600 }], 600), { vx: 0, vy: 0 });
});

test('physics remains within negative-origin monitor bounds and settles', () => {
  const bounds = movementBounds({ x: -1920, y: -200, width: 1920, height: 1080 }, 254, 262);
  let body = { x: -1900, y: -150, vx: -1800, vy: -1500 };
  let bounced = false;
  for (let i = 0; i < 1200; i++) {
    body = stepBody(body, bounds, 1 / 60);
    bounced ||= body.landed;
    assert.ok(body.x >= bounds.left && body.x <= bounds.right);
    assert.ok(body.y >= bounds.top && body.y <= bounds.bottom);
  }
  assert.equal(bounced, true);
  assert.equal(body.settled, true);
  assert.equal(body.vx, 0);
});

test('60 Hz and 120 Hz trajectories use the same time scale', () => {
  const bounds = { left: 0, right: 2000, top: 0, bottom: 1200 };
  const simulate = (hz) => {
    let b = { x: 100, y: 100, vx: 300, vy: -100 };
    for (let i = 0; i < hz; i++) b = stepBody(b, bounds, 1 / hz);
    return b;
  };
  const a = simulate(60), b = simulate(120);
  assert.ok(Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1);
});
