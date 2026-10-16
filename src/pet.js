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
const fullnessGauge = document.querySelector('#fullnessGauge');
const fullnessMeter = document.querySelector('#fullnessMeter');
const fullnessFill = document.querySelector('#fullnessFill');
const fullnessValue = document.querySelector('#fullnessValue');

const IDLE_VARIANT_DELAY_MIN_MS = 7000;
const IDLE_VARIANT_DELAY_MAX_MS = 14000;
const DRAG_THRESHOLD_PX = 6;
const LONG_PRESS_TO_DRAG_MS = 400;
const DOUBLE_CLICK_WINDOW_MS = 250;
const BUBBLE_DURATION_MS = 1800;
const BUBBLE_SEQUENCE_GAP_MS = 180;
const CURSOR_NEARBY_RENDERER_COOLDOWN_MS = 3500;
const PET_SIZE_PX = {
  small: 156,
  medium: 188,
  large: 220,
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
let fullnessFrame = null;
let fullnessTimer = null;
let fullnessHideTimer = null;
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
let airborne = false;
let playingWithToy = false;
let toyPhase = null;
// Falling uses a held pose; keep the chase direction for landing separately.
let toyDirection = 'right';
let lastStrokeAt = -Infinity;
let reminders = [];
let companionState = {};
let heldMoodTimer = null;
let queuedWelcome = null;
const reminderCard = document.querySelector('#reminderCard');
const petTools = document.querySelector('#petTools');
const hitTest = new PetHitTest({
  sprite, tools: petTools, getImage: () => animator?.image,
  isHolding: () => Boolean(pointerDrag),
});


function showBubble(message, options = {}) {
  showBubbleSequence([message], options);
}

function hideBubble() {
  window.clearTimeout(bubbleTimer);
  window.clearTimeout(bubbleSequenceTimer);
  bubble.classList.remove('visible', 'action-result');
}

function hideFullnessGauge() {
  cancelAnimationFrame(fullnessFrame);
  clearTimeout(fullnessTimer);
  clearTimeout(fullnessHideTimer);
  fullnessFrame = fullnessTimer = fullnessHideTimer = null;
  fullnessGauge.classList.remove('visible');
  fullnessGauge.hidden = true;
  updateReminderCard();
}

function showFullnessChange(change) {
  if (!change || ![change.from, change.to].every(Number.isFinite) || change.to === change.from) return;
  hideFullnessGauge();
  const from = Math.max(0, Math.min(100, change.from));
  const to = Math.max(0, Math.min(100, change.to));
  fullnessGauge.dataset.direction = to < from ? 'loss' : 'gain';
  const paint = (value) => {
    fullnessFill.style.transform = `scaleY(${value / 100})`;
    fullnessValue.textContent = `${Math.round(value)}%`;
    fullnessMeter.setAttribute('aria-valuenow', String(Math.round(value)));
  };
  paint(from);
  fullnessGauge.hidden = false;
  // Animate from the actual value before eating/catching, in either direction.
  // State broadcasts must not jump this straight to the final value.
  const startedAt = performance.now() + 160;
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 160 : 1200;
  const animate = (now) => {
    fullnessGauge.classList.add('visible');
    const fraction = Math.min(1, Math.max(0, (now - startedAt) / duration));
    paint(from + (to - from) * (1 - (1 - fraction) ** 3));
    fullnessFrame = fraction < 1 ? requestAnimationFrame(animate) : null;
  };
  fullnessFrame = requestAnimationFrame(animate);
  fullnessTimer = setTimeout(() => {
    cancelAnimationFrame(fullnessFrame);
    fullnessFrame = fullnessTimer = null;
    paint(to);
    fullnessGauge.classList.remove('visible');
    fullnessHideTimer = setTimeout(hideFullnessGauge, 220);
  }, 3000);
  updateReminderCard();
}
window.addEventListener('pagehide', hideFullnessGauge);

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
  return !busy && !sleeping && !pointerDrag && !airborne && !playingWithToy && !isFileInteractionActive();
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
  hideFullnessGauge();
  clearClickTimer();
  clearIdleTimers();
  busy = true;
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  animator?.stop();
  window.comtriever.setActivity('file');
  updateReminderCard();
}

function beginFileInteraction() {
  airborne = false;
  playingWithToy = false;
  if (pointerDrag) clearPointerDrag();
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
  const facingLeft = direction === 'left';
  spriteWrap.classList.toggle('direction-left', facingLeft);
  stage.dataset.facing = facingLeft ? 'left' : 'right';
}

function applyPetSize(size = 'medium') {
  const petSize = PET_SIZE_PX[size] ?? PET_SIZE_PX.medium;
  document.documentElement.style.setProperty('--pet-size', petSize + 'px');
}

function playIdle() {
  if (airborne || playingWithToy || pointerDrag) return;
  busy = false;
  if (isFileInteractionActive()) {
    holdFileInteraction();
    return;
  }

  if (queuedWelcome) {
    const welcome = queuedWelcome;
    queuedWelcome = null;
    if (Date.now() < welcome.expiresAt && companionState.petVisible && companionState.welcomeBack) {
      showWelcome(welcome);
      return;
    }
  }
  if (sleepPending) {
    enterSleep();
    return;
  }

  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  animator?.play('idle');
  if (animator) animator.pose = { tilt: 0, lift: 0 };
  pet.classList.remove('airborne', 'held');
  scheduleIdleTimers();
  window.comtriever.notifyPetIdle();
  flushPendingCursorNearbyReaction();
  updateReminderCard();
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
  airborne = false;
  playingWithToy = false;
  clearPointerDrag();
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
  clearPointerDrag();
  airborne = playingWithToy = false;
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

function playWandering(direction, speed = 160) {
  clearClickTimer();
  clearIdleTimers();
  busy = true;
  setDirection(direction);
  pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping');
  home.classList.remove('visible');
  animator?.play('walk', { rate: Math.max(0.65, Math.min(1.35, speed / 160)) });
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
  pet.classList.add('held');
  if (pointerDrag?.longPressed) window.comtriever.setActivity('held');
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
  if (animator) animator.pose.tilt = Math.max(-12, Math.min(12, deltaX * 0.12));
  const nextName = deltaX < 0 ? 'pressedLeft' : 'pressedRight';
  if (pointerDrag.pressedName === nextName) return;
  pointerDrag.pressedName = nextName;
  playPressed(nextName);
}

function beginLongPressDrag() {
  if (!pointerDrag || pointerDrag.longPressed || pointerDrag.stroking) return;

  pointerDrag.longPressed = true;
  pointerDrag.pressedName = 'pressedHold';
  playPressed('pressedHold');
  pointerDrag.moodTracker = new PetBehavior.HeldMood(performance.now(), pointerDrag.lastScreenX, pointerDrag.lastScreenY);
  updateHeldMood();
  heldMoodTimer = setInterval(updateHeldMood, 100);

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
  clearInterval(heldMoodTimer);
  heldMoodTimer = null;
  delete pet.dataset.heldMood;
  document.querySelector('#heldEmotion').hidden = true;
  if (animator) animator.heldMood = null;
  if (!pointerDrag) return;
  window.clearTimeout(pointerDrag.longPressTimer);
  const pointerId = pointerDrag.pointerId;
  pointerDrag = null;
  if (pet.hasPointerCapture?.(pointerId)) pet.releasePointerCapture(pointerId);
  event?.preventDefault();
}

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) return;
  if (isFileInteractionActive()) return;
  hideFullnessGauge();

  const wokeFromSleep = sleeping;
  const interruptedFlight = airborne;
  wakeFromPointerInteraction();
  window.comtriever.interruptPetMotion();
  airborne = false;
  playingWithToy = false;
  pet.classList.remove('airborne');
  window.comtriever.setActivity('busy');
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
    interruptedFlight,
    pressedName: 'pressedHold',
    stroking: false,
    strokeDistance: 0,
    longPressTimer: window.setTimeout(beginLongPressDrag, LONG_PRESS_TO_DRAG_MS),
  };
  pet.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  updateReminderCard();
});

document.addEventListener('pointermove', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;

  const travel = Math.hypot(event.screenX - pointerDrag.lastScreenX, event.screenY - pointerDrag.lastScreenY);
  pointerDrag.lastScreenX = event.screenX;
  pointerDrag.lastScreenY = event.screenY;

  const deltaX = event.screenX - pointerDrag.startScreenX;
  const deltaY = event.screenY - pointerDrag.startScreenY;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance >= DRAG_THRESHOLD_PX) pointerDrag.moved = true;

  if (!pointerDrag.longPressed) {
    if (distance >= DRAG_THRESHOLD_PX) {
      pointerDrag.stroking = true;
      window.clearTimeout(pointerDrag.longPressTimer);
      pointerDrag.strokeDistance += Math.min(travel, 45);
      const bounds = pet.getBoundingClientRect();
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (inside && pointerDrag.strokeDistance >= 70 && performance.now() - lastStrokeAt > 900) {
        pointerDrag.strokeDistance = 0;
        lastStrokeAt = performance.now();
        const y = (event.clientY - bounds.top) / bounds.height;
        const region = y < 0.43 ? 'head' : y < 0.67 ? 'body' : 'belly';
        strokePet(region);
      }
    }
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

  pointerDrag.moodTracker?.move(performance.now(), event.screenX, event.screenY);
  updateHeldMood();
  updatePressedDrag(deltaX);
  window.comtriever.movePetDrag(getPointer(event));
  event.preventDefault();
});

document.addEventListener('pointerup', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;

  if (pointerDrag.dragging || pointerDrag.interruptedFlight) {
    airborne = true;
    window.comtriever.endPetDrag({ ...getPointer(event), cancelled: !pointerDrag.dragging });
    clearPointerDrag(event);
    clearClickTimer();
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

document.addEventListener('pointercancel', (event) => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  window.comtriever.endPetDrag({ cancelled: true });
  clearPointerDrag(event);
  clearClickTimer();
  playIdle();
});

pet.addEventListener('lostpointercapture', (event) => {
  if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
  window.comtriever.endPetDrag({ cancelled: true });
  clearPointerDrag();
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
  if (pointerDrag?.dragging) window.comtriever.endPetDrag({ screenX: pointerDrag.lastScreenX, screenY: pointerDrag.lastScreenY, cancelled: true });
  clearPointerDrag();
  window.comtriever.stopPlay();
  petTools.classList.remove('pinned');
  hideFileDropTarget();
  endFileInteraction();
});

window.comtriever.onStateChanged(applyCompanionState);

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
  playWandering(payload?.direction ?? 'right', payload?.speed);
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
  applyCompanionState(state);
});

window.comtriever.getRetrieverManifest().then(async (manifest) => {
  animator = new PetAnimator(sprite, manifest);
  await animator.ready;
  playIdle();
});

function floatHeart(text = '♥') {
  const effect = document.createElement('span');
  effect.className = 'heart-effect';
  effect.textContent = text;
  effect.style.left = `${75 + Math.random() * 65}px`;
  document.querySelector('#petEffects').append(effect);
  effect.addEventListener('animationend', () => effect.remove(), { once: true });
  setTimeout(() => effect.remove(), 1800);
}

function strokePet(region) {
  noteUserInteraction();
  const responses = {
    head: { motion: 'headTilt', message: '머리 쓰다듬어주니까 좋아!' },
    body: { motion: 'tailWag', message: '따뜻한 손이다멍 ♥' },
    belly: { motion: 'happy', message: '간지러워! 헤헤!' },
  };
  const response = responses[region];
  playOneShotMotion(response.motion, { force: true, messages: [response.message] });
  floatHeart();
  window.comtriever.petStroke(region);
}

function applyCompanionState(state) {
  companionState = state;
  applyPetSize(state.petSize);
  if (pointerDrag?.longPressed) updateHeldMood();
  reminders = (state.reminders ?? []).filter((r) => r.status === 'due');
  document.querySelector('#snackButton').disabled = !state.petVisible || Boolean(state.activity) || state.bond?.fullness > 85;
  document.querySelector('#ballButton').disabled = !state.petVisible || Boolean(state.activity) || state.bond?.fullness === 0;
  document.querySelector('#stopPlayButton').disabled = !state.activity;
  if (!state.petVisible) {
    hideFullnessGauge();
    queuedWelcome = null;
    airborne = playingWithToy = false;
    clearPointerDrag();
    pet.classList.remove('airborne', 'held');
  }
  updateReminderCard();
}

function updateReminderCard() {
  const hidden = !reminders.length || Boolean(pointerDrag) || airborne || playingWithToy || !fullnessGauge.hidden || isFileInteractionActive();
  reminderCard.hidden = hidden;
  if (!hidden) document.querySelector('#reminderTitle').textContent = reminders[0].title;
}

async function startToy(kind) {
  document.querySelector('#snackButton').disabled = true;
  document.querySelector('#ballButton').disabled = true;
  try {
    const result = await window.comtriever.startPlay(kind);
    if (!result.ok) showBubble(result.message);
  } catch { showBubble('놀이를 준비하지 못했어. 다시 해줄래?'); }
  finally { applyCompanionState(await window.comtriever.getState()); }
}
document.querySelector('#snackButton').addEventListener('click', () => startToy('snack'));
document.querySelector('#ballButton').addEventListener('click', () => startToy('ball'));
document.querySelector('#stopPlayButton').addEventListener('click', () => window.comtriever.stopPlay());
pet.addEventListener('contextmenu', (event) => { event.preventDefault(); petTools.classList.toggle('pinned'); });
document.querySelector('#reminderDone').addEventListener('click', () => reminders[0] && window.comtriever.reminderAction(reminders[0].id, 'complete'));
document.querySelector('#reminderSnooze').addEventListener('click', () => reminders[0] && window.comtriever.reminderAction(reminders[0].id, 'snooze'));
window.comtriever.onReminders(() => updateReminderCard());
window.comtriever.onBondReward(({ xp, message }) => {
  if (xp) floatHeart(`♥ +${xp}`);
  if (message && !airborne && !playingWithToy && !pointerDrag && !isFileInteractionActive()) playOneShotMotion('celebrate', { force: true, messages: [message] });
});
window.comtriever.onFlight(({ phase, vx, playing, perched }) => {
  if (phase === 'start') {
    airborne = true;
    clearClickTimer();
    playPressed('pressedHold');
    pet.classList.add('airborne');
    if (animator) animator.pose = { tilt: Math.max(-16, Math.min(16, (vx ?? 0) / 70)), lift: 0 };
  } else if (phase === 'bounce') {
    document.querySelector('#spriteMotion').animate([{ scale: '1.08 0.9' }, { scale: '1 1' }], { duration: 230, easing: 'ease-out' });
  } else if (phase === 'land') {
    airborne = false;
    pet.classList.remove('airborne', 'held');
    if (animator) animator.pose = { tilt: 0, lift: 0 };
    if (playing && ['aim', 'waiting'].includes(toyPhase)) waitForBall();
    else if (playing) playWandering(toyDirection, 230);
    else playOneShotMotion('happy', { force: true, messages: [perched ? '여기 올라앉아도 되지? 멍!' : '사뿐! 잘 내려왔어.'] });
  }
  updateReminderCard();
});
function waitForBall() {
  playingWithToy = true;
  clearClickTimer();
  clearIdleTimers();
  busy = true;
  if (!airborne) {
    pet.classList.remove('happy', 'special-happy', 'pop-in', 'sleeping', 'airborne', 'held');
    setDirection(toyDirection);
    if (animator) animator.pose = { tilt: 0, lift: 0 };
    animator?.play('idle');
    window.comtriever.setActivity('busy');
  }
}

window.comtriever.onPlay(({ phase, kind, direction, xp, message, rounds, fullnessChange }) => {
  toyPhase = phase;
  if (direction === 'left' || direction === 'right') toyDirection = direction;
  if (phase === 'start' || phase === 'chase' || phase === 'thrown') {
    if (phase === 'start') hideFullnessGauge();
    playingWithToy = true;
    if (!airborne) playWandering(toyDirection, 230);
    if (phase === 'start') showBubble(kind === 'snack' ? '간식 냄새! 내가 갈게!' : '공이다! 잡으러 갈게!');
    if (phase === 'thrown') showBubble(randomChoice(['이번에도 내가 잡을게!', '멍! 공 따라 출발!', '어디로 갔지? 내가 찾을게!']));
  } else if (phase === 'waiting') {
    waitForBall();
    showBubble(rounds === 1 ? '잡았다! 여기서 기다릴게!'
      : randomChoice(['또 잡았다! 한 번 더?', '공 물고 기다릴게!', '멍! 또 던져줘!']), { duration: 5500 });
    if (xp) floatHeart(`♥ +${xp}`);
  } else if (phase === 'aim') {
    waitForBall();
    showBubble(randomChoice(['준비됐어! 던져줘!', '공 보고 있어. 어디로 던질 거야?', '이번엔 더 멀리 던져볼까?']));
  } else if (phase === 'complete' || phase === 'hungry') {
    airborne = playingWithToy = false;
    if (animator) animator.pose = { tilt: 0, lift: 0 };
    pet.classList.remove('airborne', 'held');
    playOneShotMotion(phase === 'hungry' ? 'yawn' : kind === 'snack' ? 'happy' : 'retrieveCopy', { force: true, messages: [message] });
    if (xp) floatHeart(`♥ +${xp}`);
  }
  if (fullnessChange) showFullnessChange(fullnessChange);
  updateReminderCard();
});
window.comtriever.onCompanionEnd(({ cancelPointer } = {}) => {
  hideFullnessGauge();
  toyPhase = null;
  if (cancelPointer) clearPointerDrag();
  airborne = playingWithToy = false;
  if (animator) animator.pose = { tilt: 0, lift: 0 };
  pet.classList.remove('airborne', 'held');
  if (!pointerDrag) playIdle();
});

function updateHeldMood() {
  if (!pointerDrag?.moodTracker) return;
  const mood = pointerDrag.moodTracker.mood(performance.now());
  const icon = document.querySelector('#heldEmotion');
  icon.hidden = mood === 'held';
  if (animator) animator.heldMood = mood;
  if (pet.dataset.heldMood === mood) return;
  pet.dataset.heldMood = mood;
  const response = {
    held: ['살살 안아줘!', ''], comfy: ['편안하다멍 ♥', '♥'],
    startled: ['앗, 천천히 옮겨줘!', '!'], restless: ['이제 내려가서 걷고 싶어!', '…'],
  }[mood];
  icon.textContent = response[1];
  icon.dataset.mood = mood;
  showBubble(response[0], { duration: 2200 });
}

window.comtriever.onAway(() => {
  if (!companionState.welcomeBack || airborne || playingWithToy || pointerDrag || isFileInteractionActive()) return;
  if (sleeping || !busy) showBubble('천천히 다녀와. 여기서 기다릴게!');
});
function showWelcome({ seconds, level }) {
  if (companionState.welcomeBack === false || pointerDrag || airborne || playingWithToy || isFileInteractionActive()) {
    if (companionState.welcomeBack !== false) queuedWelcome = { seconds, level, expiresAt: Date.now() + 30000 };
    return;
  }
  noteUserInteraction();
  const messages = seconds >= 1800 ? ['돌아왔구나!', '보고 싶었어. 옆에 있을게 ♥']
    : level >= 3 ? ['내 친구 왔다!', '다시 같이 있자 ♥'] : ['다녀왔어?', '기다리고 있었어! 멍!'];
  playOneShotMotion(seconds >= 600 ? 'celebrate' : 'tailWag', { force: true, messages });
  floatHeart();
}
window.comtriever.onWelcome(showWelcome);
window.comtriever.onPerch(({ perched }) => { pet.dataset.perched = String(perched); });
