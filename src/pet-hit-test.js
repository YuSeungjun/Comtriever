class PetHitTest {
  constructor({ sprite, tools, getImage, isHolding }) {
    this.sprite = sprite;
    this.tools = tools;
    this.getImage = getImage;
    this.isHolding = isHolding;
    this.masks = new WeakMap();
    this.point = null;
    this.pressed = new Set();
    this.toolsUntil = 0;
    this.lastInteractive = undefined;
    window.comtriever.onHitCursor((point) => {
      this.point = point;
      this.lastInteractive = undefined;
      this.update();
    });
    document.addEventListener('mousemove', (event) => {
      this.point = { x: event.clientX, y: event.clientY };
      this.update();
    }, true);
    document.addEventListener('pointerdown', (event) => {
      this.point = { x: event.clientX, y: event.clientY };
      if (this.hit(this.point)) this.pressed.add(event.pointerId);
      this.update();
    }, true);
    const release = (event) => { this.pressed.delete(event.pointerId); this.update(); };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(name, release, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { this.pressed.clear(); this.update(); }
    });
    window.addEventListener('pagehide', () => { this.stopped = true; cancelAnimationFrame(this.timer); });
    const tick = () => {
      if (this.stopped) return;
      this.update();
      this.timer = requestAnimationFrame(tick);
    };
    tick();
  }

  spriteContains(point) {
    if (!point) return false;
    const image = this.getImage();
    if (!image?.complete || !image.naturalWidth) return false;
    const element = this.sprite;
    const rect = element.getBoundingClientRect();
    if (point.x < rect.left || point.y < rect.top || point.x >= rect.right || point.y >= rect.bottom) return false;

    // Recover the sprite's local coordinates, including mirroring, breathing,
    // rotation, ground alignment and the outer button's hop/pop animations.
    let matrix = new DOMMatrix();
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const transform = getComputedStyle(node).transform;
      if (transform !== 'none') matrix = new DOMMatrix(transform).multiply(matrix);
    }
    const width = element.offsetWidth, height = element.offsetHeight;
    const corners = [[0, 0], [width, 0], [0, height], [width, height]]
      .map(([x, y]) => ({ x: matrix.a * x + matrix.c * y, y: matrix.b * x + matrix.d * y }));
    matrix.e = rect.left - Math.min(...corners.map((p) => p.x));
    matrix.f = rect.top - Math.min(...corners.map((p) => p.y));
    const local = matrix.inverse().transformPoint(point);
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y) || local.x < 0 || local.y < 0 || local.x >= width || local.y >= height) return false;

    let mask = this.masks.get(image);
    if (!mask) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      mask = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3];
      this.masks.set(image, mask);
    }
    const x = Math.floor(local.x / width * image.naturalWidth);
    const y = Math.floor(local.y / height * image.naturalHeight);
    return mask[y * image.naturalWidth + x] > 16;
  }

  controlContains(point) {
    if (!point) return false;
    // Decorative speech bubbles/hearts and spaces between buttons pass through.
    return [...document.querySelectorAll('.pet-tools button, .reminder-card, .file-menu')].some((element) => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility !== 'visible' || style.pointerEvents === 'none') return false;
      if (element.closest('.pet-tools') && !this.tools.matches('.visible, .pinned, :focus-within')) return false;
      if (element.matches('.file-menu') && !element.classList.contains('visible')) return false;
      const rect = element.getBoundingClientRect();
      return point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;
    });
  }

  hit(point) { return this.spriteContains(point) || this.controlContains(point); }

  update() {
    const onSprite = this.spriteContains(this.point);
    const onControl = this.controlContains(this.point);
    if (onSprite || onControl || this.isHolding()) this.toolsUntil = performance.now() + 900;
    this.tools.classList.toggle('visible', performance.now() < this.toolsUntil);
    const interactive = Boolean(this.pressed.size || this.isHolding() || onSprite || onControl);
    if (interactive === this.lastInteractive) return;
    this.lastInteractive = interactive;
    window.comtriever.setHitResult(interactive);
  }
}
