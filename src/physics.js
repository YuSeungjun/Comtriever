'use strict';
const { landingSurface } = require('./surfaces');

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// Positions are screen DIP; velocity is DIP/second. Small substeps prevent tunnelling.
function stepBody(body, bounds, seconds, options = {}) {
  const next = { ...body };
  const gravity = options.gravity ?? 1900;
  const bounce = options.bounce ?? 0.36;
  let remaining = clamp(seconds, 0, 0.1);
  let landed = false;
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;
    const before = { x: next.x, y: next.y };
    next.vy += gravity * dt;
    next.x += next.vx * dt;
    next.y += next.vy * dt;
    if (next.x < bounds.left || next.x > bounds.right) {
      next.x = clamp(next.x, bounds.left, bounds.right);
      next.vx *= -bounce;
    }
    if (next.y < bounds.top) {
      next.y = bounds.top;
      next.vy = Math.abs(next.vy) * bounce;
    }
    const surface = options.foot && landingSurface(before, next, options.surfaces ?? [], options.foot);
    if (surface && surface.y - options.foot.y >= bounds.top) {
      return { ...next, y: surface.y - options.foot.y, vx: 0, vy: 0, settled: true, landed: true, support: surface };
    }
    if (next.y >= bounds.bottom) {
      landed ||= next.vy > 130;
      next.y = bounds.bottom;
      next.vy = next.vy > 150 ? -next.vy * bounce : 0;
      next.vx *= Math.exp(-7 * dt);
    }
  }
  const settled = next.y >= bounds.bottom - 0.5 && Math.abs(next.vy) < 30 && Math.abs(next.vx) < 18;
  if (settled) Object.assign(next, { y: bounds.bottom, vx: 0, vy: 0 });
  return { ...next, settled, landed };
}

function throwVelocity(samples, releasedAt) {
  const valid = samples.filter((p) => [p.x, p.y, p.t].every(Number.isFinite));
  const last = valid.at(-1);
  if (!last || releasedAt - last.t > 100) return { vx: 0, vy: 0 };
  const recent = valid.filter((p) => p.t >= releasedAt - 120 && p.t <= releasedAt);
  const first = recent[0];
  if (!first || last.t - first.t < 16) return { vx: 0, vy: 0 };
  const dt = (last.t - first.t) / 1000;
  const vx = clamp((last.x - first.x) / dt, -1800, 1800);
  const vy = clamp((last.y - first.y) / dt, -1500, 1500);
  return Math.hypot(vx, vy) < 100 ? { vx: 0, vy: 0 } : { vx, vy };
}

function movementBounds(workArea, width, height) {
  return {
    left: workArea.x,
    right: Math.max(workArea.x, workArea.x + workArea.width - width),
    top: workArea.y,
    bottom: Math.max(workArea.y, workArea.y + workArea.height - height),
  };
}

module.exports = { stepBody, throwVelocity, movementBounds };
