// Sprite cadence and continuous body motion share one display-synchronised clock.
class PetAnimator {
  constructor(element, manifest) {
    this.element = element;
    this.motionElement = document.querySelector('#spriteMotion');
    this.manifest = manifest;
    this.timer = null;
    this.completionTimer = null;
    this.currentName = null;
    this.pose = { tilt: 0, lift: 0 };
    this.drawnPose = { tilt: 0, lift: 0 };
    this.images = [];
    this.imageBySource = new Map();
    this.ready = Promise.all(Object.values(manifest.animations).flatMap((a) => a.frames ?? [a.src]).filter(Boolean).map((src) => {
      const image = new Image();
      image.src = src;
      this.images.push(image);
      this.imageBySource.set(src, image);
      return image.decode().catch(() => {});
    }));
  }

  play(name, options = {}) {
    const animation = this.manifest.animations[name];
    if (!animation) return false;
    const rate = options.rate ?? 1;
    if (name === this.currentName && animation.loop && this.timer !== null && this.rate === rate) return true;
    this.stop();
    this.currentName = name;
    this.rate = rate;
    this.frame = -1;
    this.onComplete = options.onComplete;
    this.startedAt = performance.now();
    this.lastAt = this.startedAt;
    this.element.style.aspectRatio = `${animation.frameWidth} / ${animation.frameHeight}`;
    this.element.dataset.motion = name;
    this.element.style.transform = `translateY(${(0.91 - (animation.groundY ?? 0.91)) * 100}%)`;
    window.comtriever.setActivity(name === 'idle' ? 'idle' : name === 'walk' ? 'walk' : 'busy');
    const complete = () => {
      if (this.timer !== null) cancelAnimationFrame(this.timer);
      this.timer = null;
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
      const done = this.onComplete;
      this.onComplete = null;
      done?.();
    };
    // macOS pauses animation frames when another app fully covers the pet.
    // Logical completion must still release busy/landing state in that case.
    if (!animation.loop) {
      const count = animation.frames?.length ?? animation.frameCount;
      this.completionTimer = setTimeout(complete, Math.ceil(count * 1000 / (animation.fps * rate)) + 50);
    }
    const draw = (now) => {
      const elapsed = now - this.startedAt;
      const slot = Math.floor(elapsed * animation.fps * rate / 1000);
      const count = animation.frames?.length ?? animation.frameCount;
      const finished = !animation.loop && slot >= count;
      const nextFrame = animation.loop ? slot % count : Math.min(count - 1, slot);
      if (this.frame !== nextFrame) {
        this.frame = nextFrame;
        const source = animation.frames?.[nextFrame] ?? animation.src;
        this.image = this.imageBySource.get(source);
        this.element.style.backgroundImage = `url("${source}")`;
      }
      this.drawMotion(name, elapsed, Math.min(0.1, (now - this.lastAt) / 1000));
      this.lastAt = now;
      if (finished) complete();
      else this.timer = requestAnimationFrame(draw);
    };
    draw(this.startedAt);
    return true;
  }

  drawMotion(name, elapsed, dt) {
    if (!this.motionElement) return;
    const smoothing = 1 - Math.exp(-14 * dt);
    for (const key of ['tilt', 'lift']) this.drawnPose[key] += (this.pose[key] - this.drawnPose[key]) * smoothing;
    let lift = 0;
    let tilt = 0;
    let stretch = 1;
    if (!document.hidden) {
      const t = elapsed / 1000;
      if (name === 'idle' || name === 'sleep') {
        const breath = Math.sin(t * (name === 'sleep' ? 1.6 : 2.1));
        lift = breath * 0.7;
        stretch = 1 + breath * 0.008;
      } else if (name === 'walk' || name === 'goHome') {
        const stride = t * 2 * Math.PI * 2.5 * this.rate;
        lift = -Math.abs(Math.sin(stride)) * 2;
        tilt = Math.sin(stride) * 0.7;
      } else if (name.startsWith('pressed') && this.heldMood) {
        if (this.heldMood === 'comfy') { lift = Math.sin(t * 2) * 1.1; tilt = Math.sin(t * 2) * 1.2; }
        if (this.heldMood === 'startled') tilt = Math.sin(t * 22) * 2;
        if (this.heldMood === 'restless') tilt = Math.sin(t * 5) * 3;
      }
    }
    this.motionElement.style.transform = `translateY(${lift + this.drawnPose.lift}px) rotate(${tilt + this.drawnPose.tilt}deg) scaleY(${stretch})`;
  }

  stop() {
    if (this.timer !== null) cancelAnimationFrame(this.timer);
    clearTimeout(this.completionTimer);
    this.completionTimer = null;
    this.timer = null;
    this.onComplete = null;
  }
}
