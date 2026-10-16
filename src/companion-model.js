'use strict';

const { randomUUID } = require('node:crypto');
const REPEATS = ['none', 'daily', 'weekly'];
const REWARDS = { pet: [3, 10000], snack: [6, 20000], ball: [8, 20000], reminder: [5, 0] };
const BOND_TIERS = [
  { name: '첫 만남', xp: 0 },
  { name: '낯익은 사이', xp: 25 },
  { name: '반가운 친구', xp: 100 },
  { name: '가까운 친구', xp: 225 },
  { name: '든든한 친구', xp: 400 },
  { name: '소중한 단짝', xp: 800 },
  { name: '가족 같은 사이', xp: 1500 },
  { name: '평생의 가족', xp: 2500 },
];
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

function normalizeProgress(value, now = Date.now()) {
  const p = value && typeof value === 'object' ? value : {};
  return {
    xp: clamp(Math.floor(finite(p.xp, 0)), 0, 1000000),
    firstMet: clamp(finite(p.firstMet, now), 0, now),
    fullness: clamp(finite(p.fullness, 30), 0, 100),
    fedAt: clamp(finite(p.fedAt, now), 0, now),
    fullnessPaused: p.fullnessPaused === true,
    rewards: Object.fromEntries(Object.keys(REWARDS).map((key) => [key, clamp(finite(p.rewards?.[key], 0), 0, now)])),
    counts: Object.fromEntries(Object.keys(REWARDS).map((key) => [key, clamp(Math.floor(finite(p.counts?.[key], 0)), 0, 1000000)])),
  };
}

function fullness(progress, now = Date.now()) {
  if (progress.fullnessPaused) return progress.fullness;
  return Math.max(0, progress.fullness - Math.max(0, now - progress.fedAt) / 60000);
}

function setFullnessPaused(progress, paused, now = Date.now()) {
  if (Boolean(progress.fullnessPaused) === paused) return;
  // Settle active time once on entering home; restarting while resting must
  // not charge that time again. Resume from the exact moment of coming back.
  progress.fullness = fullness(progress, now);
  progress.fedAt = now;
  progress.fullnessPaused = paused;
}

function bond(progress, now = Date.now()) {
  let index = 0;
  while (index < BOND_TIERS.length - 1 && progress.xp >= BOND_TIERS[index + 1].xp) index += 1;
  const tier = BOND_TIERS[index];
  const next = BOND_TIERS[index + 1];
  return {
    level: index + 1, name: tier.name, xp: progress.xp, isMaxLevel: !next,
    current: next ? progress.xp - tier.xp : 0, needed: next ? next.xp - tier.xp : 0,
    days: Math.max(1, Math.floor((now - progress.firstMet) / 86400000) + 1),
    fullness: Math.round(fullness(progress, now)), counts: { ...progress.counts },
  };
}

function reward(progress, kind, now = Date.now()) {
  const config = REWARDS[kind];
  if (!config || (progress.rewards[kind] && now - progress.rewards[kind] < config[1])) return 0;
  progress.xp = Math.min(1000000, progress.xp + config[0]);
  progress.rewards[kind] = now;
  progress.counts[kind] += 1;
  return config[0];
}

function feed(progress, now = Date.now()) {
  const amount = fullness(progress, now);
  if (amount > 85) return false;
  progress.fullness = Math.min(100, amount + 22);
  progress.fedAt = now;
  return true;
}

function usePlayEnergy(progress, now = Date.now()) {
  progress.fullness = Math.max(0, fullness(progress, now) - 5);
  progress.fedAt = now;
  return progress.fullness;
}

function createReminder(input, now = Date.now()) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const at = input?.at;
  if (!title || title.length > 80) throw new Error('할 일을 1~80자로 적어주세요.');
  if (!Number.isFinite(at) || at <= now || at > now + 366 * 86400000) throw new Error('지금부터 1년 안의 미래 시간을 골라주세요.');
  if (!REPEATS.includes(input.repeat ?? 'none')) throw new Error('반복 설정을 확인해주세요.');
  return { id: randomUUID(), title, at, anchor: at, repeat: input.repeat ?? 'none', status: 'scheduled', notifiedAt: 0, completedAt: 0 };
}

function normalizeReminders(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.filter((r) => {
    const ok = r && typeof r.id === 'string' && r.id.length < 100 && !ids.has(r.id)
      && typeof r.title === 'string' && r.title.trim().length > 0 && r.title.length <= 80
      && Number.isFinite(r.at) && r.at > 0 && r.at < 8640000000000000 && REPEATS.includes(r.repeat);
    if (ok) ids.add(r.id);
    return ok;
  }).slice(0, 100).map((r) => ({
    id: r.id, title: r.title.trim(), at: r.at,
    anchor: Number.isFinite(r.anchor) && r.anchor > 0 && r.anchor < 8640000000000000 ? r.anchor : r.at,
    repeat: r.repeat, status: ['scheduled', 'due', 'done'].includes(r.status) ? r.status : 'scheduled',
    notifiedAt: finite(r.notifiedAt, 0), completedAt: finite(r.completedAt, 0),
  }));
}

// Calendar arithmetic preserves local wall-clock time across DST and snoozes.
function nextOccurrence(reminder, now) {
  if (reminder.repeat === 'none') return null;
  const anchor = new Date(reminder.anchor);
  const date = new Date(now);
  date.setHours(anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
  if (reminder.repeat === 'weekly') {
    date.setDate(date.getDate() + (anchor.getDay() - date.getDay() + 7) % 7);
    if (date.getTime() <= now) date.setDate(date.getDate() + 7);
  } else if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  return date.getTime();
}

function collectDue(reminders, now = Date.now()) {
  const due = [];
  for (const r of reminders) {
    if (r.status !== 'scheduled' || r.at > now) continue;
    r.status = 'due';
    r.notifiedAt = now;
    due.push(r);
  }
  return due;
}

function actOnReminder(reminder, action, now = Date.now()) {
  if (!reminder || reminder.status !== 'due') return false;
  if (action === 'snooze') {
    reminder.at = now + 10 * 60000;
    reminder.status = 'scheduled';
    reminder.notifiedAt = 0;
    return true;
  }
  if (action !== 'complete' || reminder.status !== 'due') return false;
  reminder.completedAt = now;
  const next = nextOccurrence(reminder, now);
  reminder.status = next === null ? 'done' : 'scheduled';
  if (next !== null) reminder.at = next;
  reminder.notifiedAt = 0;
  return true;
}

module.exports = { normalizeProgress, fullness, setFullnessPaused, bond, reward, feed, usePlayEnergy, createReminder, normalizeReminders, nextOccurrence, collectDue, actOnReminder };
