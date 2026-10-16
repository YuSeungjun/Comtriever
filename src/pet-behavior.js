(function (root) {
  class HeldMood {
    constructor(now, x, y) {
      this.startedAt = now;
      this.last = { t: now, x, y };
      this.direction = 0;
      this.turns = [];
      this.startledUntil = 0;
      this.speed = 0;
    }
    move(now, x, y) {
      const dt = now - this.last.t;
      if (dt < 8) return;
      const dx = x - this.last.x;
      this.speed = Math.hypot(dx, y - this.last.y) * 1000 / dt;
      const direction = Math.abs(dx) >= 8 ? Math.sign(dx) : 0;
      this.turns = this.turns.filter((t) => now - t < 1000);
      if (direction && this.direction && direction !== this.direction && this.speed > 650) this.turns.push(now);
      if (this.turns.length >= 2 || this.speed > 1900) this.startledUntil = now + 1300;
      if (direction) this.direction = direction;
      this.last = { t: now, x, y };
    }
    mood(now) {
      if (now < this.startledUntil) return 'startled';
      if (now - this.startedAt >= 8000) return 'restless';
      if (now - this.startedAt >= 1200 && (now - this.last.t > 350 || this.speed < 500)) return 'comfy';
      return 'held';
    }
  }

  class Presence {
    constructor({ threshold = 120000, cooldown = 60000 } = {}) {
      this.threshold = threshold;
      this.cooldown = cooldown;
      this.awaySince = null;
      this.lastWelcomeAt = -Infinity;
      this.locked = false;
      this.suspended = false;
    }
    pause(kind, now, idleSeconds = 0) {
      this[kind] = true;
      this.awaySince ??= now - Math.max(0, idleSeconds) * 1000;
    }
    resume(kind) { this[kind] = false; }
    sample(idleSeconds, now) {
      if (this.locked || this.suspended || !Number.isFinite(idleSeconds)) return null;
      if (idleSeconds * 1000 >= this.threshold) {
        this.awaySince ??= now - idleSeconds * 1000;
        return null;
      }
      if (idleSeconds > 2 || this.awaySince === null) return null;
      const duration = Math.max(0, now - this.awaySince);
      this.awaySince = null;
      if (duration < this.threshold || now - this.lastWelcomeAt < this.cooldown) return null;
      this.lastWelcomeAt = now;
      return { seconds: Math.floor(duration / 1000), returnedAt: now };
    }
  }

  const api = { HeldMood, Presence };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PetBehavior = api;
})(typeof window !== 'undefined' ? window : globalThis);
