const pet = document.querySelector('#pet');
const sprite = document.querySelector('#sprite');
const spriteWrap = document.querySelector('#spriteWrap');
const home = document.querySelector('#home');
const bubble = document.querySelector('#bubble');
const stage = document.querySelector('#stage');
const fileMenu = document.querySelector('#fileMenu');
const fileMenuActions = document.querySelector('#fileMenuActions');
const openFileAction = document.querySelector('#openFileAction');
const copyPathAction = document.querySelector('#copyPathAction');
const trashFileAction = document.querySelector('#trashFileAction');

const IDLE_VARIANT_DELAY_MIN_MS = 7000;
const IDLE_VARIANT_DELAY_MAX_MS = 14000;
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_TO_DRAG_MS = 500;
const DOUBLE_CLICK_WINDOW_MS = 250;
const BUBBLE_DURATION_MS = 1800;
const BUBBLE_SEQUENCE_GAP_MS = 180;
const CURSOR_NEARBY_RENDERER_COOLDOWN_MS = 3500;
const PET_SIZE_PX = {
  small: 156,
  medium: 188,
  large: 220,
};
const BUBBLE_POSITION = {
  small: { left: 108, top: 24 },
  medium: { left: 124, top: 24 },
  large: { left: 140, top: 24 },
};
const DIALOGUE = {
  click: [
    ['멍!'],
    ['좋아'],
    ['나 불렀어?'],
    ['여기 있어'],
  ],
  wake: [
    ['일어났어', '멍!'],
    ['나 불렀어?'],
    ['좋은 아침이야'],
  ],
  specialHappy: [
    ['좋아!', '또 해줘!'],
    ['신난다!'],
    ['멍멍!', '기분 좋아'],
  ],
  goingHome: [
    ['집에 다녀올게'],
    ['쉬러 갈게'],
    ['금방 올게'],
  ],
  calledBack: [
    ['다시 왔어'],
    ['불렀어?'],
    ['기다렸지?'],
  ],
  yawn: [
    ['하암...'],
    ['조금 졸려'],
    ['눈이 감겨'],
  ],
  sleep: [
    ['쿨...'],
    ['조금만 잘게'],
    ['꿈꾸는 중...'],
  ],
  clipboard: [
    ['복사 완료다멍!'],
    ['복사해뒀어!'],
    ['클립보드에 물어왔어'],
  ],
};
const CURSOR_NEARBY_REACTIONS = [
  {
    type: 'welcome',
    motion: 'headTilt',
    messages: ['왔어?', '나 보러 왔어?'],
  },
  {
    type: 'curious',
    motion: 'sniffSearch',
    messages: ['킁킁... 뭐지?', '마우스 냄새난다멍'],
  },
  {
    type: 'playful',
    motion: 'tailWag',
    messages: ['좋다멍!', '조금 더 가까이 와봐'],
  },
];

let bubbleTimer;
let bubbleSequenceTimer;
let idleVariantTimer;
let animator;
let busy = false;
let sleeping = false;
let sleepPending = false;
let pointerDrag = null;
let clickTimer = null;
let dragDepth = 0;
let droppedItems = [];
let fileInteractionLocked = false;
let fileMenuOpen = false;
let fileActionRunning = false;
let lastCursorNearbyReactionType = null;
let lastCursorNearbyReactionAt = 0;
let cursorNearbyReactionPending = false;

class PetAnimator {
  constructor(element, manifest) {
    this.element = element;
    this.manifest = manifest;
    this.preloadedImages = [];
    this.frame = 0;
    this.timer = null;
    this.currentName = null;
    this.onComplete = null;
    this.preloadFrames();
  }

  preloadFrames() {
    for (const animation of Object.values(this.manifest.animations)) {
      for (const frameSrc of animation.frames ?? [animation.src]) {
        if (!frameSrc) continue;
        const image = new Image();
        image.src = frameSrc;
        this.preloadedImages.push(image);
      }
    }
  }

  play(name, options = {}) {
    const animation = this.manifest.animations[name];
    if (!animation) return false;

    this.stop();
    this.currentName = name;
    this.frame = 0;
    this.onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
    this.element.style.aspectRatio = `${animation.frameWidth} / ${animation.frameHeight}`;
    this.element.style.backgroundSize = '100% 100%';
    this.renderFrame(animation);

    const frameMs = Math.max(1, Math.round(1000 / animation.fps));
    this.timer = window.setInterval(() => {
      this.frame += 1;

      if (this.frame >= animation.frameCount) {
        if (animation.loop) {
          this.frame = 0;
        } else {
          this.frame = animation.frameCount - 1;
          this.renderFrame(animation);
          this.stop();
          const callback = this.onComplete;
          this.onComplete = null;
          callback?.();
          return;
        }
      }

      this.renderFrame(animation);
    }, frameMs);

    return true;
  }

  stop() {
    if (!this.timer) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  renderFrame(animation) {
    const frameSrc = animation.frames?.[this.frame] ?? animation.src;
    this.element.style.backgroundImage = `url("${frameSrc}")`;
    this.element.style.backgroundPosition = '0 0';
  }
}

function showBubble(message, options = {}) {
  showBubbleSequence([message], options);
}

function hideBubble() {
  window.clearTimeout(bubbleTimer);
  window.clearTimeout(bubbleSequenceTimer);
  bubble.classList.remove('visible', 'action-result');
}

function showBubbleSequence(messages, options = {}) {
  window.clearTimeout(bubbleTimer);
  window.clearTimeout(bubbleSequenceTimer);

  const queue = messages.filter((message) => typeof message === 'string' && message.trim());
  if (!queue.length) {
    bubble.classList.remove('visible', 'action-result');
    return;
  }

  let index = 0;
  const showNext = () => {
    bubble.textContent = queue[index];
    bubble.classList.toggle('action-result', options.variant === 'actionResult');
    bubble.classList.add('visible');
    bubbleTimer = window.setTimeout(() => {
      bubble.classList.remove('visible');
      bubble.classList.remove('action-result');
      index += 1;
      if (index < queue.length) {
        bubbleSequenceTimer = window.setTimeout(showNext, BUBBLE_SEQUENCE_GAP_MS);
      }
    }, BUBBLE_DURATION_MS);
  };

  showNext();
}

function randomInt(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function randomChoice(items) {
  return items[randomInt(0, items.length - 1)];
}

function randomDialogueSequence(name) {
  return [...randomChoice(DIALOGUE[name] ?? [['멍!']])];
}

function showActionResultBubble(message) {
  showBubble(message, { variant: 'actionResult' });
}

function isFileInteractionActive() {
  return fileInteractionLocked || fileMenuOpen || fileActionRunning;
}

function canPlayIdleVariant() {
  return !busy && !sleeping && !pointerDrag && !isFileInteractionActive();
}

function canPlayCursorNearbyReaction() {
  return !busy && !sleeping && !sleepPending && !pointerDrag && !clickTimer && !isFileInteractionActive();
}

function canAcceptCursorNearbyReaction() {
  return Date.now() - lastCursorNearbyReactionAt >= CURSOR_NEARBY_RENDERER_COOLDOWN_MS;
}

function clearIdleTimers() {
  clearIdleVariantTimer();
}

function clearIdleVariantTimer() {
  window.clearTimeout(idleVariantTimer);
  idleVariantTimer = null;
}

function clearClickTimer() {
  window.clearTimeout(clickTimer);
  clickTimer = null;
}

function scheduleIdleTimers() {
  scheduleIdleVariantTimer();
}

function scheduleIdleVariantTimer() {
  clearIdleVariantTimer();
  if (!canPlayIdleVariant()) return;

  idleVariantTimer = window.setTimeout(() => {
    idleVariantTimer = null;
    playIdleVariant('tailWag');
  }, randomInt(IDLE_VARIANT_DELAY_MIN_MS, IDLE_VARIANT_DELAY_MAX_MS));
}

function noteUserInteraction() {
  sleepPending = false;
  sleeping = false;
  pet.classList.remove('sleeping');
  window.comtriever.notifyPetAwake();
}

function holdFileInteraction() {
  clearClickTimer();
  clearIdleTimers();
  busy = true;
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  animator?.stop();
}

function beginFileInteraction() {
  fileInteractionLocked = true;
  sleepPending = false;
  sleeping = false;
  window.comtriever.interruptPetMotion();
  noteUserInteraction();
  holdFileInteraction();
}

function endFileInteraction(options = {}) {
  fileInteractionLocked = false;
  fileActionRunning = false;
  hideFileMenu();
  if (options.returnToIdle !== false) playIdle();
}

function getDroppedFilePaths(event) {
  return [...(event.dataTransfer?.files ?? [])]
    .map((file) => window.comtriever.getDroppedFilePath(file))
    .filter((filePath, index, paths) => filePath && paths.indexOf(filePath) === index);
}

function showFileDropTarget() {
  beginFileInteraction();
  stage.classList.add('file-dragging');
  hideBubble();
}

function hideFileDropTarget() {
  dragDepth = 0;
  stage.classList.remove('file-dragging');
}

function showFileMenu(items, summary) {
  droppedItems = items;
  fileMenuOpen = true;
  fileInteractionLocked = true;
  holdFileInteraction();
  hideBubble();
  fileMenuActions.hidden = false;
  setSelectedFileAction(null);
  openFileAction.disabled = items.length !== 1;
  fileMenu.classList.add('visible');
  fileMenu.setAttribute('aria-hidden', 'false');
}

function hideFileMenu() {
  fileMenuOpen = false;
  fileMenuActions.hidden = false;
  setSelectedFileAction(null);
  fileMenu.classList.remove('visible');
  fileMenu.setAttribute('aria-hidden', 'true');
}

function setSelectedFileAction(action) {
  openFileAction.classList.toggle('selected', action === 'open');
  copyPathAction.classList.toggle('selected', action === 'copy');
  trashFileAction.classList.toggle('selected', action === 'trash');
}

async function handleFileDrop(event) {
  event.preventDefault();
  hideFileDropTarget();

  const paths = getDroppedFilePaths(event);
  if (!paths.length) {
    showBubble('이 파일은 못 물어오겠다멍.');
    endFileInteraction();
    return;
  }

  hideFileMenu();
  const result = await window.comtriever.inspectDroppedItems(paths);
  if (!result?.ok || !result.items?.length) {
    showBubble('파일을 못 찾았다멍.');
    endFileInteraction();
    return;
  }

  fileInteractionLocked = true;
  hideBubble();
  playOneShotMotion('retrieveCopy', {
    force: true,
    onComplete: () => showFileMenu(result.items),
  });
}

async function runDroppedItemAction(action) {
  if (!droppedItems.length || fileActionRunning) return;

  setSelectedFileAction(action);
  fileActionRunning = true;
  fileInteractionLocked = true;
  holdFileInteraction();
  const paths = droppedItems.map((item) => item.path);
  let result;
  try {
    if (action === 'open') {
      result = await window.comtriever.openDroppedItem(paths[0]);
    } else if (action === 'copy') {
      result = await window.comtriever.copyDroppedItemPaths(paths);
    } else if (action === 'trash') {
      result = await window.comtriever.trashDroppedItems(paths);
    }
  } catch {
    result = { ok: false, message: '작업에 실패했다멍.' };
  }

  if (!result) {
    fileActionRunning = false;
    fileInteractionLocked = false;
    hideFileMenu();
    playIdle();
    return;
  }
  if (result.ok) {
    hideFileMenu();
    fileActionRunning = false;
    fileInteractionLocked = false;
    const motion = action === 'trash' && animator?.manifest?.animations?.trashPickup
      ? 'trashPickup'
      : 'celebrate';
    playOneShotMotion(motion, { force: true });
    showActionResultBubble(result.message);
    return;
  }

  fileActionRunning = false;
  fileInteractionLocked = false;
  hideFileMenu();
  playIdle();
  showActionResultBubble(result.message ?? '잘 안 됐다멍.');
}

function enterSleep() {
  if (sleeping) return;
  clearIdleTimers();
  sleeping = true;
  sleepPending = false;
  pet.classList.add('sleeping');
  animator?.play('sleep');
  showBubbleSequence(randomDialogueSequence('sleep'));
  window.comtriever.notifySleepStarted();
}

function clearSleepTimer() {
  sleepPending = false;
  clearIdleTimers();
}

function setDirection(direction = 'right') {
  spriteWrap.classList.toggle('direction-left', direction === 'left');
}

function applyPetSize(size = 'medium') {
  const petSize = PET_SIZE_PX[size] ?? PET_SIZE_PX.medium;
  const bubblePosition = BUBBLE_POSITION[size] ?? BUBBLE_POSITION.medium;
  document.documentElement.style.setProperty('--pet-size', petSize + 'px');
  document.documentElement.style.setProperty('--bubble-left', bubblePosition.left + 'px');
  document.documentElement.style.setProperty('--bubble-top', bubblePosition.top + 'px');
}

function playIdle() {
  busy = false;
  if (isFileInteractionActive()) {
    holdFileInteraction();
    return;
  }

  if (sleepPending) {
    enterSleep();
    return;
  }

  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  animator?.play('idle');
  scheduleIdleTimers();
  window.comtriever.notifyPetIdle();
  flushPendingCursorNearbyReaction();
}

function playHappy(options = {}) {
  if (busy && !options.force) return;
  const messages = options.messages ?? randomDialogueSequence(options.dialogueName ?? 'click');
  if (!animator) {
    showBubbleSequence(messages);
    return;
  }

  clearIdleTimers();
  busy = true;
  pet.classList.remove('sleeping', 'pop-in', 'special-happy');
  home.classList.remove('visible');
  pet.classList.add('happy');
  showBubbleSequence(messages);
  animator.play('happy', {
    onComplete: () => {
      pet.classList.remove('happy');
      playIdle();
    },
  });
}

function playOneShotMotion(name, options = {}) {
  if (busy && !options.force) return false;
  clearIdleTimers();
  busy = true;
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  if (options.messages) showBubbleSequence(options.messages);

  const played = animator?.play(name, {
    onComplete: options.onComplete ?? playIdle,
  });

  if (played) return true;

  busy = false;
  if (name !== 'happy') return playOneShotMotion('happy', options);
  playIdle();
  return false;
}

function playSpecialHappy(options = {}) {
  if (busy && !options.force) return;
  if (!animator) {
    showBubbleSequence(randomDialogueSequence('specialHappy'));
    return;
  }

  clearIdleTimers();
  busy = true;
  pet.classList.remove('sleeping', 'pop-in', 'happy');
  home.classList.remove('visible');
  pet.classList.add('special-happy');
  showBubbleSequence(randomDialogueSequence('specialHappy'));
  const played = animator.play('celebrate', {
    onComplete: () => {
      pet.classList.remove('special-happy');
      playIdle();
    },
  });
  if (played) return;

  animator.play('happy', {
    onComplete: () => {
      pet.classList.remove('special-happy');
      playIdle();
    },
  });
}

function playGoingHome(direction) {
  clearClickTimer();
  noteUserInteraction();
  clearIdleTimers();
  busy = true;
  setDirection(direction);
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.add('visible');
  showBubbleSequence(randomDialogueSequence('goingHome'));
  animator?.play('goHome');
}

function playCalledBack() {
  clearClickTimer();
  noteUserInteraction();
  if (!animator) {
    showBubbleSequence(randomDialogueSequence('calledBack'));
    playIdle();
    return;
  }

  clearIdleTimers();
  busy = true;
  setDirection('right');
  home.classList.remove('visible');
  pet.classList.remove('happy', 'special-happy', 'sleeping');
  pet.classList.add('pop-in');
  showBubbleSequence(randomDialogueSequence('calledBack'));
  animator?.play('popIn', {
    onComplete: () => {
      pet.classList.remove('pop-in');
      playIdle();
    },
  });
}

function playWandering(direction) {
  clearClickTimer();
  clearIdleTimers();
  busy = true;
  setDirection(direction);
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  animator?.play('walk');
}

function playIdleVariant(name) {
  if (!canPlayIdleVariant()) return;
  if (!animator) return;

  clearIdleVariantTimer();
  busy = true;
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  if (name === 'yawn') showBubbleSequence(randomDialogueSequence('yawn'));
  animator?.play(name, {
    onComplete: playIdle,
  });
}

function playPressed(name) {
  clearClickTimer();
  clearIdleTimers();
  busy = true;
  setDirection('right');
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  animator?.play(name);
}

function handleShortClick(dialogueName = 'click') {
  if (clickTimer) {
    clearClickTimer();
    playSpecialHappy({ force: true });
    return;
  }

  clickTimer = window.setTimeout(() => {
    clickTimer = null;
    playHappy({ force: true, dialogueName });
  }, DOUBLE_CLICK_WINDOW_MS);
}

function updatePressedDrag(deltaX) {
  if (!pointerDrag || !pointerDrag.longPressed) return;
  const nextName = deltaX < 0 ? 'pressedLeft' : 'pressedRight';
  if (pointerDrag.pressedName === nextName) return;
  pointerDrag.pressedName = nextName;
  playPressed(nextName);
}

function beginLongPressDrag() {
  if (!pointerDrag || pointerDrag.longPressed) return;

  pointerDrag.longPressed = true;
  pointerDrag.pressedName = 'pressedHold';
  playPressed('pressedHold');

  const deltaX = pointerDrag.lastScreenX - pointerDrag.startScreenX;
  const deltaY = pointerDrag.lastScreenY - pointerDrag.startScreenY;
  if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;

  pointerDrag.dragging = true;
  window.comtriever.startPetDrag({
    screenX: pointerDrag.startScreenX,
    screenY: pointerDrag.startScreenY,
  });
  updatePressedDrag(deltaX);
  window.comtriever.movePetDrag({
    screenX: pointerDrag.lastScreenX,
    screenY: pointerDrag.lastScreenY,
  });
}

function showWorkAppReaction(payload) {
  const message = payload?.message;
  if (busy || sleeping || pointerDrag || isFileInteractionActive() || typeof message !== 'string' || !message.trim()) return;
  const motion = payload?.motion;
  if (motion) {
    playOneShotMotion(motion, { messages: [message] });
    return;
  }
  showBubble(message);
}

function getClipboardDialogue(payload) {
  const preview = typeof payload?.preview === 'string' ? payload.preview.trim() : '';
  if (!preview) return randomDialogueSequence('clipboard');
  const [message] = randomDialogueSequence('clipboard');
  return [`"${preview}" ${message}`];
}

function showClipboardCopied(payload) {
  if (pointerDrag || isFileInteractionActive()) return;

  const dialogue = getClipboardDialogue(payload);
  if (busy) {
    showBubbleSequence(dialogue);
    return;
  }

  noteUserInteraction();
  playOneShotMotion('retrieveCopy', { force: true, messages: dialogue });
}

function playRhythmTailWag(messages) {
  if (!animator) {
    showBubbleSequence(messages);
    return;
  }

  clearIdleTimers();
  busy = true;
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  showBubbleSequence(messages);
  animator?.play('tailWag', {
    onComplete: playIdle,
  });
}

function showRhythmReaction(payload) {
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (!message || pointerDrag || isFileInteractionActive()) return;

  const messages = [message];
  const motion = payload?.motion ?? 'bubbleOnly';
  if (busy || sleeping) {
    showBubbleSequence(messages);
    return;
  }

  if (motion === 'tailWag') {
    playRhythmTailWag(messages);
    return;
  }

  if (motion !== 'bubbleOnly') {
    playOneShotMotion(motion, { force: true, messages });
    return;
  }

  showBubbleSequence(messages);
}

function chooseCursorNearbyReaction() {
  const fallback = randomChoice(CURSOR_NEARBY_REACTIONS);
  const candidates = CURSOR_NEARBY_REACTIONS.filter((reaction) => (
    reaction.type !== lastCursorNearbyReactionType
  ));
  return randomChoice(candidates.length ? candidates : CURSOR_NEARBY_REACTIONS) ?? fallback;
}

function showCursorNearbyReaction() {
  if (!canAcceptCursorNearbyReaction()) return;

  if (!canPlayCursorNearbyReaction()) {
    cursorNearbyReactionPending = true;
    return;
  }

  const reaction = chooseCursorNearbyReaction();
  lastCursorNearbyReactionType = reaction.type;
  lastCursorNearbyReactionAt = Date.now();
  cursorNearbyReactionPending = false;
  playOneShotMotion(reaction.motion, {
    messages: [randomChoice(reaction.messages)],
  });
}

function flushPendingCursorNearbyReaction() {
  if (!cursorNearbyReactionPending) return;

  window.setTimeout(() => {
    if (cursorNearbyReactionPending) showCursorNearbyReaction();
  }, 0);
}

function noteCursorLeft() {
  lastCursorNearbyReactionType = null;
  lastCursorNearbyReactionAt = 0;
  cursorNearbyReactionPending = false;
}

function showSystemIdleYawn() {
  if (!canPlayIdleVariant()) return;
  playIdleVariant('yawn');
}

function showSystemIdleSleep() {
  if (pointerDrag || isFileInteractionActive()) {
    sleepPending = true;
    return;
  }
  if (busy) {
    sleepPending = true;
    return;
  }
  enterSleep();
}

function wakeFromSystemActivity() {
  if (!sleeping && !sleepPending) return;
  const wasSleeping = sleeping;
  sleeping = false;
  sleepPending = false;
  pet.classList.remove('sleeping');
  if (wasSleeping && !busy) playIdle();
}

function wakeFromPointerInteraction() {
  const wasSleeping = sleeping;
  noteUserInteraction();
  if (wasSleeping && !busy) playIdle();
}

function getPointer(event) {
  return {
    screenX: event.screenX,
    screenY: event.screenY,
  };
}

function clearPointerDrag(event) {
  if (!pointerDrag) return;
  window.clearTimeout(pointerDrag.longPressTimer);
  if (pet.hasPointerCapture?.(pointerDrag.pointerId)) {
    pet.releasePointerCapture(pointerDrag.pointerId);
  }
  pointerDrag = null;
  event?.preventDefault();
}

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) return;

  const wokeFromSleep = sleeping;
  wakeFromPointerInteraction();
  window.comtriever.interruptPetMotion();
  pointerDrag = {
    pointerId: event.pointerId,
    startScreenX: event.screenX,
    startScreenY: event.screenY,
    lastScreenX: event.screenX,
    lastScreenY: event.screenY,
    dragging: false,
    moved: false,
    longPressed: false,
    wokeFromSleep,
    pressedName: 'pressedHold',
    longPressTimer: window.setTimeout(beginLongPressDrag, LONG_PRESS_TO_DRAG_MS),
  };
  pet.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});

pet.addEventListener('pointermove', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;

  pointerDrag.lastScreenX = event.screenX;
  pointerDrag.lastScreenY = event.screenY;

  const deltaX = event.screenX - pointerDrag.startScreenX;
  const deltaY = event.screenY - pointerDrag.startScreenY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance >= DRAG_THRESHOLD_PX) pointerDrag.moved = true;

  if (!pointerDrag.longPressed) {
    event.preventDefault();
    return;
  }

  if (!pointerDrag.dragging) {
    if (distance < DRAG_THRESHOLD_PX) return;

    pointerDrag.dragging = true;
    window.comtriever.startPetDrag({
      screenX: pointerDrag.startScreenX,
      screenY: pointerDrag.startScreenY,
    });
  }

  updatePressedDrag(deltaX);
  window.comtriever.movePetDrag(getPointer(event));
  event.preventDefault();
});

pet.addEventListener('pointerup', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;

  if (pointerDrag.dragging) {
    window.comtriever.endPetDrag(getPointer(event));
    clearPointerDrag(event);
    clearClickTimer();
    playIdle();
    return;
  }

  const wasLongPressed = pointerDrag.longPressed;
  const wasMoved = pointerDrag.moved;
  const wokeFromSleep = pointerDrag.wokeFromSleep;
  clearPointerDrag(event);
  if (wasLongPressed || wasMoved) {
    clearClickTimer();
    playIdle();
    return;
  }

  handleShortClick(wokeFromSleep ? 'wake' : 'click');
});

pet.addEventListener('pointercancel', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  if (pointerDrag.dragging) window.comtriever.endPetDrag(getPointer(event));
  clearPointerDrag(event);
  clearClickTimer();
  playIdle();
});

stage.addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth += 1;
  if (dragDepth === 1) showFileDropTarget();
});

stage.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
});

stage.addEventListener('dragleave', (event) => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    hideFileDropTarget();
    if (!fileMenuOpen && !fileActionRunning) endFileInteraction();
  }
});

stage.addEventListener('drop', handleFileDrop);

openFileAction.addEventListener('click', () => runDroppedItemAction('open'));
copyPathAction.addEventListener('click', () => runDroppedItemAction('copy'));
trashFileAction.addEventListener('click', () => runDroppedItemAction('trash'));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  hideFileDropTarget();
  endFileInteraction();
});

window.comtriever.onStateChanged((state) => {
  applyPetSize(state.petSize);
});

window.comtriever.onGoingHome((payload) => {
  playGoingHome(payload?.direction ?? 'right');
});

window.comtriever.onArrivedHome(() => {
  clearClickTimer();
  busy = false;
  sleeping = false;
  clearSleepTimer();
  home.classList.remove('visible');
});

window.comtriever.onCalledBack(() => {
  playCalledBack();
});

window.comtriever.onWanderStarted((payload) => {
  playWandering(payload?.direction ?? 'right');
});

window.comtriever.onWanderEnded(() => {
  playIdle();
});

window.comtriever.onWorkAppReaction(showWorkAppReaction);
window.comtriever.onClipboardCopied(showClipboardCopied);
window.comtriever.onRhythmReaction(showRhythmReaction);
window.comtriever.onCursorNear(showCursorNearbyReaction);
window.comtriever.onCursorNearbyPulse(showCursorNearbyReaction);
window.comtriever.onCursorLeft(noteCursorLeft);
window.comtriever.onSystemIdleYawn(showSystemIdleYawn);
window.comtriever.onSystemIdleSleep(showSystemIdleSleep);
window.comtriever.onUserActive(wakeFromSystemActivity);

window.comtriever.getState().then((state) => {
  applyPetSize(state.petSize);
});

window.comtriever.getRetrieverManifest().then((manifest) => {
  animator = new PetAnimator(sprite, manifest);
  playIdle();
});
