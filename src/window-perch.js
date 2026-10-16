'use strict';
const { footGeometry, surfaceLimits } = require('./surfaces');

class WindowPerch {
  constructor(host) {
    this.host = host;
    this.current = null;
    this.timer = null;
    this.lastTick = 0;
  }
  detach() {
    const wasSupported = Boolean(this.current);
    this.current = null;
    clearInterval(this.timer);
    this.timer = null;
    this.host.tracker.fast = false;
    if (wasSupported) {
      this.host.supportChanged?.();
      this.host.send('pet:perch', { perched: false });
    }
  }
  attach(surface) {
    this.detach();
    this.current = { ...surface };
    this.host.tracker.fast = true;
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), 16);
    this.host.supportChanged?.();
    this.host.send('pet:perch', { perched: true });
    this.host.save();
  }
  loseSupport() {
    this.detach();
    this.host.interruptWander();
    this.host.fall();
  }
  limits() {
    if (!this.current) return null;
    const bounds = this.host.bounds();
    if (!bounds) return null;
    return surfaceLimits(this.current, footGeometry(bounds, this.host.petSize()), this.host.screenBounds(bounds));
  }
  nearby() {
    const b = this.host.bounds();
    if (!b || !this.host.enabled()) return false;
    const foot = footGeometry(b, this.host.petSize());
    const limits = this.host.screenBounds(b);
    const surface = this.host.surfaces().filter((s) => Math.abs(b.y + foot.y - s.y) <= 24
      && b.x + foot.left >= s.left && b.x + foot.right <= s.right
      && s.y - foot.y >= limits.top && s.y - foot.y <= limits.bottom)
      .sort((a, c) => Math.abs(b.y + foot.y - a.y) - Math.abs(b.y + foot.y - c.y))[0];
    if (!surface) return false;
    this.host.move(b.x, surface.y - foot.y);
    this.attach(surface);
    return true;
  }
  tick() {
    if (!this.current) return;
    if (this.host.blocked()) return;
    if (!this.host.enabled()) return this.loseSupport();
    const bounds = this.host.bounds();
    if (!bounds) return this.detach();
    const now = performance.now();
    const alpha = 1 - Math.exp(-30 * Math.min(0.1, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const previous = this.current;
    const candidates = this.host.surfaces().filter((s) => s.id === previous.id);
    const foot = footGeometry(bounds, this.host.petSize());
    const surface = candidates.find((s) => {
      const x = bounds.x + s.windowX - previous.windowX;
      return x + foot.left >= s.left - 1 && x + foot.right <= s.right + 1;
    });
    if (!surface) return this.loseSupport();
    const shiftX = surface.windowX - previous.windowX;
    const shiftY = surface.windowY - previous.windowY;
    const screenBounds = this.host.screenBounds(bounds);
    const finalLimits = surfaceLimits(surface, foot, screenBounds);
    if (finalLimits.y < screenBounds.top || finalLimits.y > screenBounds.bottom || finalLimits.left > finalLimits.right) return this.loseSupport();
    // Ease only the window-follow motion; walking retains its own local position.
    const dx = Math.abs(shiftX) < 1 ? shiftX : shiftX * alpha;
    const dy = Math.abs(shiftY) < 1 ? shiftY : shiftY * alpha;
    this.current = { ...surface, windowX: previous.windowX + dx, windowY: previous.windowY + dy,
      left: surface.left - shiftX + dx, right: surface.right - shiftX + dx, y: previous.y + dy };
    const limits = this.limits();
    this.host.move(Math.min(limits.right, Math.max(limits.left, bounds.x + dx)), limits.y);
  }
  dispose() { this.detach(); }
}

module.exports = { WindowPerch };
