'use strict';

const { BrowserWindow, screen, Notification } = require('electron');
const path = require('node:path');
const model = require('./companion-model');
const { stepBody, throwVelocity, movementBounds } = require('./physics');
const { footGeometry } = require('./surfaces');
const HUNGRY_MESSAGE = '꼬르륵… 배고파! 간식 먹고 다시 놀자.';
// macOS/Electron can paint small (64px) transparent windows opaque white.
// Keep the physics body and artwork unchanged inside a larger native surface.
const TOY_SIZE = 64;
const TOY_WINDOW_SIZE = 128;
const TOY_PADDING = (TOY_WINDOW_SIZE - TOY_SIZE) / 2;

class CompanionController {
  constructor(host) {
    this.host = host;
    this.flight = null;
    this.suspendedFlight = false;
    this.play = null;
    this.timer = null;
    this.reminderTimer = null;
    this.notifications = new Map();
    this.lastTick = 0;
  }

  get busy() { return Boolean(this.flight || this.play); }
  get activity() {
    if (!this.play) return this.flight ? '폴짝!' : '';
    if (this.play.kind === 'snack') return '간식 찾는 중';
    return { chase: '공을 쫓아가는 중', waiting: '공을 주운 자리에서 기다려요 · 공을 잡아 다시 던져주세요', aim: '던져주기를 기다리는 중' }[this.play.stage];
  }

  start() {
    this.reminderTimer ??= setInterval(() => this.checkReminders(), 1000);
    this.checkReminders();
  }

  startTimer() {
    if (this.timer) return;
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), 16);
  }

  drop(velocity) {
    const pet = this.host.pet();
    if (!pet || pet.isDestroyed()) return;
    this.suspendedFlight = false;
    this.host.detachSupport();
    const bounds = pet.getBounds();
    this.flight = { x: bounds.x, y: bounds.y, vx: velocity.vx, vy: velocity.vy };
    this.host.send('pet:flight', { phase: 'start', vx: velocity.vx });
    this.startTimer();
    this.host.broadcast();
  }

  stop({ silent = false } = {}) {
    const wasBusy = this.busy;
    this.suspendedFlight = false;
    this.flight = null;
    const toy = this.play?.window;
    this.play = null;
    if (toy && !toy.isDestroyed()) toy.destroy();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (wasBusy && !silent) this.host.send('pet:companionEnd', {});
    if (wasBusy) this.host.broadcast();
  }

  pauseForInteraction() {
    const wasFalling = Boolean(this.flight || this.suspendedFlight);
    this.stop();
    this.suspendedFlight = wasFalling;
  }

  resumeAfterInteraction() {
    if (this.suspendedFlight) this.drop({ vx: 0, vy: 0 });
  }

  async startPlay(kind) {
    if (!['snack', 'ball'].includes(kind)) return { ok: false, message: '놀이를 골라주세요.' };
    const state = this.host.state();
    const pet = this.host.pet();
    if (!pet || pet.isDestroyed() || !state.petVisible) return { ok: false, message: '먼저 리트리버를 불러주세요.' };
    if (this.busy) return { ok: false, message: '지금 놀이 중이에요. 그만한 뒤에 새 놀이를 골라주세요.' };
    if (this.host.blocked()) return { ok: false, message: '지금 하던 동작이 끝나면 다시 놀아주세요.' };
    if (kind === 'ball' && model.fullness(state.progress) <= 0) {
      this.host.send('pet:play', { phase: 'hungry', kind, message: HUNGRY_MESSAGE });
      return { ok: false, message: HUNGRY_MESSAGE };
    }
    if (kind === 'snack' && model.fullness(state.progress) > 85) return { ok: false, message: '아직 배불러요. 공으로 놀아줄까요?' };
    this.host.interrupt();
    const bounds = pet.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const limits = movementBounds(area, TOY_SIZE, TOY_SIZE);
    const direction = bounds.x < area.x + area.width / 2 ? 1 : -1;
    const usesPanel = process.platform === 'darwin' && state.displayMode === 'alwaysOnTop';
    const toy = new BrowserWindow({
      width: TOY_WINDOW_SIZE, height: TOY_WINDOW_SIZE,
      x: Math.round(Math.min(limits.right, Math.max(limits.left, bounds.x + bounds.width / 2))) - TOY_PADDING,
      y: Math.round(Math.max(limits.top, bounds.y + bounds.height / 2)) - TOY_PADDING,
      frame: false, transparent: true, hasShadow: false, resizable: false,
      // A normal macOS window must accept its own focus, otherwise AppKit
      // redirects the click's activation to the settings window. Floating
      // panels avoid that redirect without taking keyboard focus.
      focusable: process.platform === 'darwin' && !usesPanel,
      backgroundColor: '#00000000', roundedCorners: false, hiddenInMissionControl: true,
      // Panels join all Spaces, so retain a normal window in desktop mode.
      ...(usesPanel ? { type: 'panel' } : {}),
      skipTaskbar: true, show: false, acceptFirstMouse: true, fullscreenable: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js') },
    });
    toy.setAlwaysOnTop(state.displayMode === 'alwaysOnTop', 'floating');
    if (state.displayMode === 'alwaysOnTop') toy.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    const session = {
      kind, window: toy, body: { x: toy.getBounds().x + TOY_PADDING, y: toy.getBounds().y + TOY_PADDING, vx: direction * 430, vy: -480 },
      stage: 'chase', startedAt: Date.now(), dragging: null, samples: [], angle: 0, rounds: 0, direction,
    };
    this.play = session;
    this.host.send('pet:play', { phase: 'start', kind, direction: direction > 0 ? 'right' : 'left' });
    this.host.broadcast();
    toy.on('closed', () => {
      if (this.play !== session) return;
      this.play = null;
      this.flight = null;
      this.host.send('pet:companionEnd', {});
      this.host.broadcast();
      this.host.resume();
    });
    try {
      await toy.loadFile(path.join(__dirname, 'toy.html'));
    } catch {
      if (this.play === session) {
        this.stop();
        this.host.resume();
      }
      return { ok: false, message: '장난감을 준비하지 못했어요. 다시 눌러주세요.' };
    }
    if (this.play !== session || toy.isDestroyed()) return { ok: false, message: '놀이가 끝났어요.' };
    this.updateToy(session);
    toy.showInactive();
    // Bring a pet floating above the desktop down to the play surface first.
    this.drop({ vx: 0, vy: 0 });
    this.startTimer();
    return { ok: true, message: kind === 'snack' ? '간식을 던졌어요. 달려가서 먹을 거예요!' : '공을 주우면 그 자리에서 기다릴게요. 공을 잡아 다시 던져주세요!' };
  }

  toyPointer(phase, pointer, sender) {
    const session = this.play;
    if (!session || session.window.webContents !== sender) return;
    if (phase !== 'cancel' && (!pointer || ![pointer.screenX, pointer.screenY].every(Number.isFinite))) return;
    const now = performance.now();
    if (phase === 'start') {
      if (session.dragging) return;
      session.dragging = { x: pointer.screenX - session.body.x, y: pointer.screenY - session.body.y };
      session.samples = [{ x: pointer.screenX, y: pointer.screenY, t: now }];
      session.body.vx = session.body.vy = 0;
      if (session.kind === 'ball') {
        session.stage = 'aim';
        this.host.send('pet:play', { phase: 'aim', kind: 'ball' });
        this.host.broadcast();
      }
    } else if (session.dragging) {
      // Lost capture can report zero coordinates; drop from the last valid spot.
      if (phase !== 'cancel') {
        session.samples.push({ x: pointer.screenX, y: pointer.screenY, t: now });
        session.samples = session.samples.filter((p) => now - p.t < 180);
        const area = screen.getDisplayNearestPoint({ x: Math.round(pointer.screenX), y: Math.round(pointer.screenY) }).workArea;
        const limits = movementBounds(area, TOY_SIZE, TOY_SIZE);
        session.body.x = Math.min(limits.right, Math.max(limits.left, pointer.screenX - session.dragging.x));
        session.body.y = Math.min(limits.bottom, Math.max(limits.top, pointer.screenY - session.dragging.y));
      }
      session.body.settled = false;
      if (phase === 'end' || phase === 'cancel') {
        Object.assign(session.body, phase === 'cancel' ? { vx: 0, vy: 0 } : throwVelocity(session.samples, now));
        session.dragging = null;
        session.stage = 'chase';
        session.startedAt = Date.now();
        session.direction = undefined;
        if (session.kind === 'ball') this.host.send('pet:play', { phase: 'thrown', kind: 'ball' });
        this.host.broadcast();
      }
    }
    this.updateToy(session);
  }

  updateToy(session) {
    session.window.setPosition(Math.round(session.body.x) - TOY_PADDING, Math.round(session.body.y) - TOY_PADDING, false);
    // The transparent padding must pass clicks to the desktop (or the dog).
    // Keep receiving events outside the ball only while a drag is captured.
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - session.body.x - TOY_SIZE / 2;
    const dy = cursor.y - session.body.y - TOY_SIZE / 2;
    const overToy = session.kind === 'ball' ? Math.hypot(dx, dy) <= 22 : Math.abs(dx) <= 26 && Math.abs(dy) <= 16;
    const ignored = !session.dragging && !overToy;
    if (session.ignored !== ignored) {
      session.ignored = ignored;
      session.window.setIgnoreMouseEvents(ignored, { forward: true });
    }
    session.window.webContents.send('toy:state', {
      kind: session.kind, angle: session.angle, stage: session.stage,
      carried: session.stage === 'waiting', canPickUp: true,
    });
  }

  tick() {
    const pet = this.host.pet();
    if (!pet || pet.isDestroyed() || !this.host.state().petVisible) return this.stop();
    if (this.play?.kind === 'ball' && model.fullness(this.host.state().progress) <= 0) return this.endHungryPlay();
    const now = performance.now();
    const dt = Math.min(0.064, (now - this.lastTick) / 1000);
    this.lastTick = now;
    const bounds = pet.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const limits = movementBounds(area, bounds.width, bounds.height);
    if (this.flight) {
      this.flight = stepBody(this.flight, limits, dt, {
        surfaces: this.play ? [] : this.host.surfaces(), foot: footGeometry(bounds, this.host.petSize()),
      });
      this.host.move(this.flight.x, this.flight.y);
      if (this.flight.landed) this.host.send('pet:flight', { phase: 'bounce' });
      if (this.flight.settled) {
        const support = this.flight.support;
        this.flight = null;
        if (support) this.host.attachSupport(support);
        this.host.send('pet:flight', { phase: 'land', playing: Boolean(this.play), perched: Boolean(support) });
        if (!this.play) this.finish();
      }
    }
    const session = this.play;
    if (session) {
      if (session.stage === 'chase' && !session.dragging && Date.now() - session.startedAt > 60000) {
        this.stop();
        this.host.resume();
        return;
      }
      if (!session.dragging && session.stage === 'chase') {
        const toyArea = screen.getDisplayMatching({ x: Math.round(session.body.x), y: Math.round(session.body.y), width: TOY_SIZE, height: TOY_SIZE }).workArea;
        session.body = stepBody(session.body, movementBounds(toyArea, TOY_SIZE, TOY_SIZE), dt, { bounce: session.kind === 'ball' ? 0.65 : 0.25 });
      }
      if (!this.flight && !session.dragging && session.stage === 'chase') this.chase(session, pet.getBounds(), limits, dt);
      if (this.play !== session) return;
      if (session.stage === 'waiting') {
        const b = pet.getBounds();
        const size = this.host.petSize();
        // Hold the ball at the seated muzzle, without moving from the catch.
        const mouthX = 0.66;
        const mouthY = 0.57;
        session.body.x = b.x + 30 + size * (session.direction > 0 ? mouthX : 1 - mouthX) - 32;
        session.body.y = b.y + b.height - 14 - size * mouthY - 32;
      }
      session.angle += session.body.vx * dt;
      this.updateToy(session);
    }
    if (!this.busy && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  chase(session, bounds, limits, dt) {
    const size = this.host.petSize();
    const target = session.body.x + 32 - 30 - size * 0.5;
    const targetX = Math.min(limits.right, Math.max(limits.left, target));
    const dx = targetX - bounds.x;
    const direction = dx >= 0 ? 1 : -1;
    if (Math.abs(dx) > 5) {
      this.host.move(bounds.x + direction * Math.min(Math.abs(dx), 290 * dt), bounds.y);
      if (direction !== session.direction) {
        session.direction = direction;
        this.host.send('pet:play', { phase: 'chase', kind: session.kind, direction: direction > 0 ? 'right' : 'left' });
      }
      return;
    }
    if (Math.abs(session.body.x + 32 - (bounds.x + 30 + size * 0.5)) <= size * 0.65
      && (session.body.settled || (Math.abs(session.body.vy) < 110 && session.body.y > bounds.y + bounds.height * 0.55))) {
      if (session.kind === 'snack') this.completePlay('snack');
      else this.catchBall(session);
    }
  }

  catchBall(session) {
    if (this.play !== session || session.stage !== 'chase') return;
    session.stage = 'waiting';
    session.body.vx = session.body.vy = 0;
    session.direction ??= 1;
    session.rounds += 1;
    const progress = this.host.state().progress;
    // Charge once at the catch, even during the XP reward cooldown. Waiting
    // and holding the ball never complete another round on their own.
    const now = Date.now();
    const before = model.fullness(progress, now);
    const remaining = model.usePlayEnergy(progress, now);
    const fullnessChange = { from: before, to: remaining };
    const xp = model.reward(progress, 'ball', now);
    if (remaining <= 0) return this.endHungryPlay(xp, fullnessChange);
    this.host.send('pet:play', { phase: 'waiting', kind: 'ball', direction: session.direction > 0 ? 'right' : 'left', xp, rounds: session.rounds, fullnessChange });
    this.host.save();
    this.host.broadcast();
  }

  endHungryPlay(xp = 0, fullnessChange) {
    const wasFalling = Boolean(this.flight);
    this.stop({ silent: true });
    this.host.send('pet:play', { phase: 'hungry', kind: 'ball', xp, fullnessChange, message: HUNGRY_MESSAGE });
    if (wasFalling) this.drop({ vx: 0, vy: 0 });
    this.host.save();
    this.host.broadcast();
    this.host.resume();
  }

  completePlay(kind) {
    const progress = this.host.state().progress;
    const now = Date.now();
    const before = model.fullness(progress, now);
    const ate = kind !== 'snack' || model.feed(progress, now);
    const fullnessChange = kind === 'snack' && ate ? { from: before, to: progress.fullness } : undefined;
    const xp = ate ? model.reward(progress, kind) : 0;
    this.stop({ silent: true });
    this.host.send('pet:play', { phase: 'complete', kind, xp, fullnessChange, message: kind === 'snack' ? (ate ? '냠냠, 고마워!' : '배불러! 조금 있다 먹자.') : '공 잡았어! 또 놀자!' });
    this.host.save();
    this.host.broadcast();
    this.host.resume();
  }

  finish() {
    this.host.save();
    this.host.broadcast();
    this.host.resume();
  }

  checkReminders() {
    const due = model.collectDue(this.host.state().reminders);
    if (!due.length) return;
    this.host.save();
    this.host.broadcast();
    this.host.send('pet:reminders', due);
    if (process.env.COMTRIEVER_TEST_MODE === '1') return;
    for (const reminder of due.slice(0, 3)) {
      if (!Notification.isSupported()) break;
      const notification = new Notification({ title: '컴트리버가 알려줘요', body: reminder.title });
      this.notifications.set(reminder.id, notification);
      notification.on('click', () => this.host.openSettings());
      notification.on('close', () => this.notifications.delete(reminder.id));
      notification.on('failed', () => this.notifications.delete(reminder.id));
      notification.show();
    }
  }

  reminderAction(id, action) {
    const state = this.host.state();
    const item = state.reminders.find((r) => r.id === id);
    if (!item) return { ok: false, message: '일정을 찾을 수 없어요.' };
    const previous = structuredClone({ reminders: state.reminders, progress: state.progress });
    if (action === 'delete') state.reminders = state.reminders.filter((r) => r !== item);
    else if (!model.actOnReminder(item, action)) return { ok: false, message: '이미 처리한 일정이에요.' };
    const xp = action === 'complete' ? model.reward(state.progress, 'reminder') : 0;
    if (!this.host.save()) {
      Object.assign(state, previous);
      return { ok: false, message: '변경 내용을 저장하지 못했어요. 저장 공간을 확인해주세요.' };
    }
    if (xp) this.host.send('pet:bondReward', { xp, message: '하나 해냈네! 잘했어!' });
    this.notifications.get(id)?.close();
    this.notifications.delete(id);
    this.host.broadcast();
    return { ok: true };
  }

  dispose() {
    this.stop({ silent: true });
    clearInterval(this.reminderTimer);
    this.reminderTimer = null;
    for (const notification of this.notifications.values()) notification.close();
    this.notifications.clear();
  }
}

module.exports = { CompanionController };
