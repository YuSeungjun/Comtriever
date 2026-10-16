'use strict';

// CGWindowList order is front to back. Subtract covered pieces of each top edge.
function exposedSurfaces(windows, workAreas) {
  const surfaces = [];
  const blockers = [];
  for (const w of windows) {
    if (![w.id, w.x, w.y, w.width, w.height, w.layer].every(Number.isFinite) || w.width <= 0 || w.height <= 0) continue;
    // Notification Center can represent a small banner as a screen-sized
    // transparent window. Its transient overlays are neither ledges nor blockers.
    if (w.isNotificationCenter === true) continue;
    // Dock and ScreenCaptureUI can report screen-sized transparent overlays
    // with alpha=1. Keep their actual controls, menus and other apps as blockers.
    if ((w.isDock === true || w.isScreenCapture === true) && workAreas.some((area) => w.x <= area.x && w.y <= area.y
      && w.x + w.width >= area.x + area.width && w.y + w.height >= area.y + area.height)) continue;
    if (w.layer === 0 && w.width >= 120 && w.height >= 80) {
      for (const area of workAreas) {
        if (w.y <= area.y || w.y >= area.y + area.height) continue;
        let segments = [[Math.max(w.x + 12, area.x), Math.min(w.x + w.width - 12, area.x + area.width)]];
        for (const b of blockers) {
          if (b.y > w.y + 1 || b.y + b.height <= w.y - 1) continue;
          segments = segments.flatMap(([l, r]) => b.x >= r || b.x + b.width <= l ? [[l, r]]
            : [[l, Math.min(r, b.x)], [Math.max(l, b.x + b.width), r]]).filter(([l, r]) => r > l);
        }
        for (const [left, right] of segments) {
          if (right - left >= 80) surfaces.push({ id: w.id, left, right, y: w.y, windowX: w.x, windowY: w.y });
        }
      }
    }
    if (w.layer >= 0) blockers.push(w);
  }
  return surfaces;
}

function footGeometry(bounds, petSize) {
  // Grounded sprites share the idle artwork's 91% baseline.
  return { left: 30 + petSize * 0.3, right: 30 + petSize * 0.75, y: bounds.height - 14 - petSize * 0.09 };
}

function surfaceLimits(surface, foot, screenBounds) {
  return { left: Math.max(screenBounds.left, surface.left - foot.left), right: Math.min(screenBounds.right, surface.right - foot.right), y: surface.y - foot.y };
}

function landingSurface(before, after, surfaces, foot) {
  if (after.vy < 0) return null;
  return surfaces.filter((s) => before.y + foot.y <= s.y + 0.5 && after.y + foot.y >= s.y
    && after.x + foot.left >= s.left && after.x + foot.right <= s.right)
    .sort((a, b) => a.y - b.y)[0] ?? null;
}

module.exports = { exposedSurfaces, footGeometry, surfaceLimits, landingSurface };
