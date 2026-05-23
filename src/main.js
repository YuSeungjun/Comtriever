const { app, BrowserWindow, Menu, Tray, clipboard, ipcMain, nativeImage, powerMonitor, screen, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

const DEFAULT_STATE = {
  petVisible: true,
  displayMode: 'alwaysOnTop',
  petPosition: null,
  petSize: 'medium',
  wanderEnabled: true,
  launchAtLogin: true,
};

const WANDER_DELAY_MIN_MS = 3000;
const WANDER_DELAY_MAX_MS = 7000;
const WANDER_DURATION_MIN_MS = 2000;
const WANDER_DURATION_MAX_MS = 4000;
const WANDER_DISTANCE_MIN_PX = 70;
const WANDER_DISTANCE_MAX_PX = 340;
const PET_EDGE_MARGIN_PX = 14;
const PET_SIZE_OPTIONS = {
  small: { petSize: 156, windowWidth: 222, windowHeight: 230 },
  medium: { petSize: 188, windowWidth: 254, windowHeight: 262 },
  large: { petSize: 220, windowWidth: 286, windowHeight: 294 },
};
const WORK_APP_CHECK_INTERVAL_MS = 3500;
const WORK_APP_REACTION_COOLDOWN_MS = 15000;
const WORK_APP_LONG_SESSION_MS = 20 * 60 * 1000;
const CLIPBOARD_CHECK_INTERVAL_MS = 800;
const CLIPBOARD_REACTION_COOLDOWN_MS = 2000;
const CLIPBOARD_PREVIEW_MAX_CHARS = 18;
const FILE_DROP_MAX_ITEMS = 30;
const RHYTHM_REACTION_COOLDOWN_MS = 3 * 60 * 1000;
const RHYTHM_FOCUS_SESSION_MS = 15 * 60 * 1000;
const RHYTHM_COPY_WINDOW_MS = 60 * 1000;
const RHYTHM_COPY_THRESHOLD = 3;
const RHYTHM_APP_SWITCH_WINDOW_MS = 2 * 60 * 1000;
const RHYTHM_APP_SWITCH_THRESHOLD = 5;
const SYSTEM_IDLE_CHECK_INTERVAL_MS = 1000;
const SYSTEM_IDLE_YAWN_AFTER_SECONDS = 60;
const SYSTEM_IDLE_SLEEP_AFTER_SECONDS = 75;
const CURSOR_PROXIMITY_CHECK_INTERVAL_MS = 250;
const CURSOR_PROXIMITY_ENTER_PADDING_PX = 72;
const CURSOR_PROXIMITY_LEAVE_PADDING_PX = 120;
const CURSOR_NEARBY_PULSE_MIN_MS = 4000;
const CURSOR_NEARBY_PULSE_MAX_MS = 8000;
const CURSOR_NEAR_RETRY_INTERVAL_MS = 900;
const CURSOR_NEAR_RETRY_WINDOW_MS = 2500;
const LOGIN_LAUNCH_ARG = '--comtriever-login-launch';
const LOGIN_LAUNCH_ARGS = [LOGIN_LAUNCH_ARG];
const WORK_APP_REACTIONS = {
  coding: ['코딩 중이야?', '버그 잡는 중?', '좋은 코드 냄새나'],
  browsing: ['자료 찾는 중?', '뭐 보고 있어?', '탭이 많아졌어'],
  writing: ['정리 중이야?', '생각 모으는 중?', '기록은 중요해'],
  design: ['디자인 중이야?', '색 고르는 중?', '멋지게 만들자'],
  presentation: ['발표 준비?', '슬라이드 다듬는 중?', '한 장씩 가보자'],
  music: ['음악 듣는 중?', '좋은 노래다멍', '리듬 타는 중이야'],
};
const LONG_WORK_APP_REACTIONS = [
  '오래 집중했네. 잠깐 쉬어도 좋아.',
  '물 한 모금 마실 시간?',
  '눈도 조금 쉬게 해줘.',
];
const RHYTHM_REACTIONS = {
  focus: [
    '계속 집중 중이네. 내가 옆에 있을게.',
    '흐름 좋다멍. 차분히 가자.',
    '집중하는 소리 들려.',
  ],
  copyBurst: [
    '자료 많이 모았다멍!',
    '클립보드가 바쁘네. 잘 모으고 있어.',
    '복사 척척이다멍!',
  ],
  appSwitchBurst: [
    '왔다 갔다 바쁘네. 천천히 해도 돼.',
    '탭 사이를 열심히 뛰는 중이네.',
    '정신없을 땐 한 번 숨 쉬자.',
  ],
};

if (process.platform === 'darwin') {
  app.setActivationPolicy('accessory');
}

let settingsWindow;
let petWindow;
let tray;
let state = { ...DEFAULT_STATE };
let appReactionTimer;
let clipboardTimer;
let systemIdleTimer;
let cursorProximityTimer;
let sendHomeTimer;
let wanderTimer;
let wanderMoveTimer;
let isWandering = false;
let isSleeping = false;
let petDrag;
let stateFilePath;
let lastFrontmostAppName = "";
let activeWorkAppName = "";
let activeWorkAppStartedAt = 0;
let longWorkAppReactionSent = false;
let lastWorkAppReactionAt = 0;
let pendingWorkAppReaction = null;
let lastClipboardText = "";
let lastClipboardReactionAt = 0;
let focusRhythmReactionSent = false;
let lastRhythmReactionAt = 0;
let recentClipboardCopies = [];
let recentAppSwitches = [];
let systemIdleStage = "active";
let lastWanderDirection = 0;
let cursorNearby = false;
let cursorNearbyReactionSent = false;
let nextCursorNearbyPulseAt = 0;
let cursorNearRetryUntil = 0;
let lastCursorNearAttemptAt = 0;

function createSettingsWindow() {
  if (isUsableWindow(settingsWindow)) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 340,
    height: 670,
    minWidth: 320,
    minHeight: 640,
    title: 'Comtriever',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
    updateTrayMenu();
  });
}

function createTray() {
  if (tray || process.platform !== 'darwin') return;

  const trayIcon = nativeImage.createFromPath(getTrayIconPath());
  if (!trayIcon.isEmpty()) trayIcon.setTemplateImage(true);

  tray = new Tray(trayIcon);
  tray.setToolTip('Comtriever');
  tray.on('click', () => {
    openSettingsWindow();
  });
  updateTrayMenu();
}

function getTrayIconPath() {
  const developmentTrayIconPath = path.join(__dirname, '..', 'build', 'trayTemplate.png');
  if (!app.isPackaged && fs.existsSync(developmentTrayIconPath)) return developmentTrayIconPath;

  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'trayTemplate.png');
  }
  return path.join(__dirname, '..', 'logo', 'MenuBarIcon_RetrieverFace.png');
}

function updateTrayMenu() {
  if (!tray) return;

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '설정 열기',
      click: openSettingsWindow,
    },
    { type: 'separator' },
    {
      label: '리트리버 보이기',
      enabled: !state.petVisible,
      click: showPetFromMenu,
    },
    {
      label: '리트리버 숨기기',
      enabled: state.petVisible,
      click: hidePetFromMenu,
    },
    {
      label: '집으로 보내기',
      enabled: state.petVisible,
      click: sendPetHome,
    },
    {
      label: '다시 부르기',
      click: callPetBack,
    },
    { type: 'separator' },
    {
      label: 'Comtriever 종료',
      click: quitFromMenu,
    },
  ]));
}

function openSettingsWindow() {
  createSettingsWindow();
}

function showPetFromMenu() {
  if (!state.petVisible) {
    callPetBack();
    return;
  }

  applyDisplayMode();
  broadcastState();
}

function hidePetFromMenu() {
  if (!state.petVisible) return;

  markPetAwake();
  stopSendHomeAnimation();
  stopWander({ notifyRenderer: true });
  state.petVisible = false;
  saveState();
  hidePetWindow();
  broadcastState();
}

function quitFromMenu() {
  app.quit();
}

function createPetWindow() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const windowSize = getPetWindowSize();
  const initialPosition = clampWindowPosition(
    state.petPosition?.x ?? workArea.x + Math.round(workArea.width * 0.62),
    state.petPosition?.y ?? workArea.y + Math.round(workArea.height * 0.68),
    windowSize,
    workArea,
  );

  petWindow = new BrowserWindow({
    width: windowSize.width,
    height: windowSize.height,
    x: initialPosition.x,
    y: initialPosition.y,
    frame: false,
    transparent: true,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    acceptFirstMouse: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    fullscreenable: false,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  petWindow.setIgnoreMouseEvents(false);
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  petWindow.on('closed', () => {
    stopCursorProximityWatcher();
    stopSendHomeAnimation();
    stopWander();
    petDrag = null;
    petWindow = null;
  });
  petWindow.once('ready-to-show', () => {
    applyDisplayMode();
    if (state.petVisible) showPetInactive();
    scheduleWander();
    startWorkAppWatcher();
    startClipboardWatcher();
    startSystemIdleWatcher();
    startCursorProximityWatcher();
  });
}

function broadcastState() {
  const payload = normalizeStateForRenderer();
  sendToWindow(settingsWindow, 'state:changed', payload);
  sendToWindow(petWindow, 'state:changed', payload);
  updateTrayMenu();
}

function isUsableWindow(targetWindow) {
  return Boolean(targetWindow && !targetWindow.isDestroyed() && !targetWindow.webContents.isDestroyed());
}

function sendToWindow(targetWindow, channel, payload) {
  if (!isUsableWindow(targetWindow)) return false;
  if (arguments.length >= 3) {
    targetWindow.webContents.send(channel, payload);
  } else {
    targetWindow.webContents.send(channel);
  }
  return true;
}

function sendToPet(channel, payload) {
  return arguments.length >= 2
    ? sendToWindow(petWindow, channel, payload)
    : sendToWindow(petWindow, channel);
}

function showPetInactive() {
  if (isUsableWindow(petWindow)) petWindow.showInactive();
}

function hidePetWindow() {
  if (isUsableWindow(petWindow)) petWindow.hide();
}

function loadState() {
  stateFilePath = path.join(app.getPath('userData'), 'state.json');
  try {
    const parsedState = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    const needsWanderMigration = typeof parsedState.wanderEnabled !== 'boolean';
    const needsLaunchAtLoginMigration = typeof parsedState.launchAtLogin !== 'boolean';
    state = {
      ...DEFAULT_STATE,
      ...parsedState,
      displayMode: ['alwaysOnTop', 'desktopOnly'].includes(parsedState.displayMode)
        ? parsedState.displayMode
        : DEFAULT_STATE.displayMode,
      petSize: Object.hasOwn(PET_SIZE_OPTIONS, parsedState.petSize)
        ? parsedState.petSize
        : DEFAULT_STATE.petSize,
      wanderEnabled: typeof parsedState.wanderEnabled === 'boolean'
        ? parsedState.wanderEnabled
        : DEFAULT_STATE.wanderEnabled,
      launchAtLogin: typeof parsedState.launchAtLogin === 'boolean'
        ? parsedState.launchAtLogin
        : DEFAULT_STATE.launchAtLogin,
    };
    if (needsWanderMigration || needsLaunchAtLoginMigration) saveState();
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

function saveState() {
  if (!stateFilePath) return;
  try {
    fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
    fs.writeFileSync(stateFilePath, JSON.stringify(normalizeStateForRenderer(), null, 2));
  } catch {
    // Settings persistence should never break the pet window itself.
  }
}

function normalizeStateForRenderer() {
  return {
    petVisible: state.petVisible,
    displayMode: state.displayMode,
    petPosition: state.petPosition,
    petSize: state.petSize,
    wanderEnabled: state.wanderEnabled,
    launchAtLogin: state.launchAtLogin,
  };
}

function applyLaunchAtLoginSetting() {
  if (process.platform !== 'darwin' || !app.isPackaged) return;

  try {
    app.setLoginItemSettings({
      openAtLogin: state.launchAtLogin,
      args: LOGIN_LAUNCH_ARGS,
    });
  } catch {
    // Login item registration should not block the desktop pet itself.
  }
}

function showPetAfterLoginLaunch() {
  if (!process.argv.includes(LOGIN_LAUNCH_ARG) || state.launchAtLogin === false) return;
  state.petVisible = true;
  saveState();
}

function applyDisplayMode() {
  if (!petWindow) return;

  if (state.displayMode === 'alwaysOnTop') {
    petWindow.setAlwaysOnTop(true, 'floating');
    petWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    if (state.petVisible) showPetInactive();
    scheduleWander();
    return;
  }

  petWindow.setAlwaysOnTop(false);
  petWindow.setVisibleOnAllWorkspaces(false);
  if (state.petVisible) showPetInactive();
  scheduleWander();
}

function startWorkAppWatcher() {
  if (appReactionTimer || process.platform !== "darwin") return;
  appReactionTimer = setInterval(checkWorkAppReaction, WORK_APP_CHECK_INTERVAL_MS);
  checkWorkAppReaction();
}

function stopWorkAppWatcher() {
  if (!appReactionTimer) return;
  clearInterval(appReactionTimer);
  appReactionTimer = null;
}

function startClipboardWatcher() {
  if (clipboardTimer) return;
  lastClipboardText = normalizeClipboardText(clipboard.readText());
  clipboardTimer = setInterval(checkClipboardCopy, CLIPBOARD_CHECK_INTERVAL_MS);
}

function stopClipboardWatcher() {
  if (!clipboardTimer) return;
  clearInterval(clipboardTimer);
  clipboardTimer = null;
}

function startSystemIdleWatcher() {
  if (systemIdleTimer) return;
  systemIdleTimer = setInterval(checkSystemIdleState, SYSTEM_IDLE_CHECK_INTERVAL_MS);
  checkSystemIdleState();
}

function stopSystemIdleWatcher() {
  if (!systemIdleTimer) return;
  clearInterval(systemIdleTimer);
  systemIdleTimer = null;
}

function startCursorProximityWatcher() {
  if (cursorProximityTimer) return;
  cursorProximityTimer = setInterval(checkCursorProximity, CURSOR_PROXIMITY_CHECK_INTERVAL_MS);
  checkCursorProximity();
}

function stopCursorProximityWatcher() {
  if (!cursorProximityTimer) return;
  clearInterval(cursorProximityTimer);
  cursorProximityTimer = null;
  cursorNearby = false;
  cursorNearbyReactionSent = false;
  nextCursorNearbyPulseAt = 0;
  cursorNearRetryUntil = 0;
  lastCursorNearAttemptAt = 0;
}

function checkCursorProximity() {
  if (!petWindow || petWindow.isDestroyed()) return;

  const padding = cursorNearby
    ? CURSOR_PROXIMITY_LEAVE_PADDING_PX
    : CURSOR_PROXIMITY_ENTER_PADDING_PX;
  const isNear = isCursorWithinPetProximity(padding);

  if (!isNear) {
    if (cursorNearby) {
      cursorNearby = false;
      cursorNearbyReactionSent = false;
      nextCursorNearbyPulseAt = 0;
      cursorNearRetryUntil = 0;
      lastCursorNearAttemptAt = 0;
      sendToPet("pet:cursorLeft");
    }
    return;
  }

  if (!cursorNearby) {
    cursorNearby = true;
    cursorNearbyReactionSent = false;
    nextCursorNearbyPulseAt = 0;
    cursorNearRetryUntil = 0;
    lastCursorNearAttemptAt = 0;
  }

  if (!canShowCursorProximityReaction()) return;

  const now = Date.now();
  if (!cursorNearbyReactionSent) {
    if (!cursorNearRetryUntil) {
      cursorNearRetryUntil = now + CURSOR_NEAR_RETRY_WINDOW_MS;
    }

    if (now <= cursorNearRetryUntil) {
      if (now - lastCursorNearAttemptAt >= CURSOR_NEAR_RETRY_INTERVAL_MS) {
        lastCursorNearAttemptAt = now;
        sendToPet("pet:cursorNear");
      }
      return;
    }

    cursorNearbyReactionSent = true;
    nextCursorNearbyPulseAt = now + randomInt(CURSOR_NEARBY_PULSE_MIN_MS, CURSOR_NEARBY_PULSE_MAX_MS);
    return;
  }

  if (now < nextCursorNearbyPulseAt) return;

  nextCursorNearbyPulseAt = now + randomInt(CURSOR_NEARBY_PULSE_MIN_MS, CURSOR_NEARBY_PULSE_MAX_MS);
  sendToPet("pet:cursorNearbyPulse");
}

function isCursorWithinPetProximity(padding) {
  const cursor = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();
  return cursor.x >= bounds.x - padding
    && cursor.x <= bounds.x + bounds.width + padding
    && cursor.y >= bounds.y - padding
    && cursor.y <= bounds.y + bounds.height + padding;
}

function canShowCursorProximityReaction() {
  if (!petWindow || !state.petVisible || sendHomeTimer || isWandering || isSleeping || petDrag) return false;
  if (state.displayMode === "desktopOnly" && !petWindow.isVisible()) return false;
  return true;
}

function checkSystemIdleState() {
  const idleSeconds = powerMonitor.getSystemIdleTime();

  if (idleSeconds < SYSTEM_IDLE_YAWN_AFTER_SECONDS) {
    if (systemIdleStage !== "active") {
      systemIdleStage = "active";
      handleSystemUserActive();
    }
    return;
  }

  if (idleSeconds >= SYSTEM_IDLE_SLEEP_AFTER_SECONDS) {
    if (systemIdleStage !== "sleep") {
      systemIdleStage = "sleep";
      handleSystemIdleSleep();
    }
    return;
  }

  if (systemIdleStage === "active") {
    systemIdleStage = "yawn";
    handleSystemIdleYawn();
  }
}

function handleSystemUserActive() {
  const wasSleeping = isSleeping;
  isSleeping = false;
  if (state.petVisible) sendToPet("pet:userActive");
  if (wasSleeping) scheduleWander();
}

function handleSystemIdleYawn() {
  if (!canShowSystemIdleReaction()) return;
  sendToPet("pet:systemIdleYawn");
}

function handleSystemIdleSleep() {
  if (!canShowSystemIdleReaction()) return;
  isSleeping = true;
  stopWander({ notifyRenderer: true });
  sendToPet("pet:systemIdleSleep");
}

function canShowSystemIdleReaction() {
  if (!petWindow || !state.petVisible || sendHomeTimer || petDrag) return false;
  if (state.displayMode === "desktopOnly" && !petWindow.isVisible()) return false;
  return true;
}

function checkClipboardCopy() {
  const clipboardText = normalizeClipboardText(clipboard.readText());
  if (!clipboardText || clipboardText === lastClipboardText) return;

  lastClipboardText = clipboardText;
  if (!canShowClipboardReaction()) return;

  const now = Date.now();
  if (recordClipboardCopy(now)) return;
  if (now - lastClipboardReactionAt < CLIPBOARD_REACTION_COOLDOWN_MS) return;

  lastClipboardReactionAt = now;
  sendToPet("pet:clipboardCopied", {
    preview: getClipboardPreview(clipboardText),
  });
}

function normalizeClipboardText(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
}

function getClipboardPreview(text) {
  if (text.length <= CLIPBOARD_PREVIEW_MAX_CHARS) return text;
  return text.slice(0, CLIPBOARD_PREVIEW_MAX_CHARS).trimEnd() + "...";
}

function inspectDroppedItems(paths) {
  const validPaths = getValidDroppedPaths(paths);
  const items = [];

  for (const itemPath of validPaths) {
    try {
      const stat = fs.statSync(itemPath);
      items.push({
        path: itemPath,
        name: path.basename(itemPath),
        kind: stat.isDirectory() ? "folder" : "file",
        size: stat.isFile() ? stat.size : null,
      });
    } catch {
      // A dragged item can disappear before the renderer finishes the drop flow.
    }
  }

  return {
    ok: items.length > 0,
    items,
    rejectedCount: Math.max(0, validPaths.length - items.length),
    summary: getDroppedItemsSummary(items),
  };
}

async function openDroppedItem(itemPath) {
  const [validPath] = getValidDroppedPaths([itemPath]);
  if (!validPath) return { ok: false, message: "열 수 있는 파일이 없다멍." };

  const errorMessage = await shell.openPath(validPath);
  if (errorMessage) {
    return { ok: false, message: "열기에 실패했다멍." };
  }

  return { ok: true, message: `"${path.basename(validPath)}" 열었다멍!` };
}

function copyDroppedItemPaths(paths) {
  const validPaths = getValidDroppedPaths(paths);
  if (!validPaths.length) return { ok: false, message: "복사할 경로가 없다멍." };

  clipboard.writeText(validPaths.join("\n"));
  lastClipboardText = normalizeClipboardText(clipboard.readText());
  return {
    ok: true,
    message: getPathCopiedMessage(validPaths),
  };
}

async function trashDroppedItems(paths) {
  const validPaths = getValidDroppedPaths(paths);
  if (!validPaths.length) return { ok: false, message: "휴지통으로 보낼 파일이 없다멍." };

  const failed = [];
  for (const validPath of validPaths) {
    try {
      await shell.trashItem(validPath);
    } catch {
      failed.push(path.basename(validPath));
    }
  }

  if (failed.length) {
    return {
      ok: false,
      message: failed.length === validPaths.length
        ? "휴지통으로 못 보냈다멍."
        : `${validPaths.length - failed.length}개만 휴지통에 보냈다멍.`,
    };
  }

  return {
    ok: true,
    message: validPaths.length === 1
      ? `"${path.basename(validPaths[0])}" 휴지통에 보냈다멍!`
      : `${validPaths.length}개 항목 휴지통에 보냈다멍!`,
  };
}

function getValidDroppedPaths(paths) {
  if (!Array.isArray(paths)) return [];

  const seen = new Set();
  const validPaths = [];
  for (const itemPath of paths) {
    if (typeof itemPath !== "string" || !itemPath.trim()) continue;
    const resolvedPath = path.resolve(itemPath);
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    if (!fs.existsSync(resolvedPath)) continue;
    validPaths.push(resolvedPath);
    if (validPaths.length >= FILE_DROP_MAX_ITEMS) break;
  }

  return validPaths;
}

function getDroppedItemsSummary(items) {
  if (!items.length) return "";
  if (items.length === 1) return items[0].name;

  const folderCount = items.filter((item) => item.kind === "folder").length;
  const fileCount = items.length - folderCount;
  if (folderCount && fileCount) return `파일 ${fileCount}개, 폴더 ${folderCount}개`;
  if (folderCount) return `폴더 ${folderCount}개`;
  return `파일 ${fileCount}개`;
}

function getPathCopiedMessage(paths) {
  if (paths.length === 1) return `"${path.basename(paths[0])}" 경로 복사 완료다멍!`;
  return `${paths.length}개 경로 복사 완료다멍!`;
}

function canShowClipboardReaction() {
  if (!petWindow || !state.petVisible) return false;
  if (state.displayMode === "desktopOnly" && !petWindow.isVisible()) return false;
  return true;
}

function recordClipboardCopy(now) {
  recentClipboardCopies = pruneRecentTimestamps(
    [...recentClipboardCopies, now],
    now,
    RHYTHM_COPY_WINDOW_MS,
  );

  if (recentClipboardCopies.length < RHYTHM_COPY_THRESHOLD) return false;
  recentClipboardCopies = [];
  return sendRhythmReaction({
    message: randomChoice(RHYTHM_REACTIONS.copyBurst),
    motion: "celebrate",
    type: "copyBurst",
  });
}

function recordAppSwitch(now, appName) {
  if (isIgnoredApp(appName)) return false;

  recentAppSwitches = pruneRecentTimestamps(
    [...recentAppSwitches, now],
    now,
    RHYTHM_APP_SWITCH_WINDOW_MS,
  );

  if (recentAppSwitches.length < RHYTHM_APP_SWITCH_THRESHOLD) return false;
  recentAppSwitches = [];
  return sendRhythmReaction({
    message: randomChoice(RHYTHM_REACTIONS.appSwitchBurst),
    motion: "headTilt",
    type: "appSwitchBurst",
  });
}

function pruneRecentTimestamps(timestamps, now, windowMs) {
  return timestamps.filter((timestamp) => now - timestamp <= windowMs);
}

function sendRhythmReaction(payload) {
  if (!canShowRhythmReaction()) return false;

  const now = Date.now();
  if (now - lastRhythmReactionAt < RHYTHM_REACTION_COOLDOWN_MS) return false;

  lastRhythmReactionAt = now;
  sendToPet("pet:rhythmReaction", payload);
  return true;
}

function canShowRhythmReaction() {
  if (!petWindow || !state.petVisible || sendHomeTimer) return false;
  if (state.displayMode === "desktopOnly" && !petWindow.isVisible()) return false;
  return true;
}

function checkWorkAppReaction() {
  if (!petWindow || !state.petVisible) return;

  getFrontmostAppName((frontmostAppName) => {
    if (!frontmostAppName) return;
    handleFrontmostAppForReaction(frontmostAppName);
  });
}

function handleFrontmostAppForReaction(frontmostAppName) {
  const now = Date.now();
  const appChanged = frontmostAppName !== lastFrontmostAppName;
  if (appChanged) {
    lastFrontmostAppName = frontmostAppName;
    activeWorkAppName = frontmostAppName;
    activeWorkAppStartedAt = now;
    longWorkAppReactionSent = false;
    focusRhythmReactionSent = false;
    recordAppSwitch(now, frontmostAppName);
  }

  const reaction = getWorkAppReaction(frontmostAppName);
  if (!reaction) return;

  if (pendingWorkAppReaction && pendingWorkAppReaction.appName === frontmostAppName
    && canShowWorkAppReaction()
    && now - lastWorkAppReactionAt >= WORK_APP_REACTION_COOLDOWN_MS) {
    sendWorkAppReaction(pendingWorkAppReaction);
    pendingWorkAppReaction = null;
    return;
  }

  if (!canShowWorkAppReaction()) {
    if (appChanged) {
      pendingWorkAppReaction = {
        ...reaction,
        appName: frontmostAppName,
        type: "appChanged",
      };
    }
    return;
  }

  if (!focusRhythmReactionSent && activeWorkAppName === frontmostAppName
    && now - activeWorkAppStartedAt >= RHYTHM_FOCUS_SESSION_MS) {
    if (sendRhythmReaction({
      message: randomChoice(RHYTHM_REACTIONS.focus),
      motion: "cheerSit",
      type: "focus",
    })) {
      focusRhythmReactionSent = true;
      return;
    }
  }

  if (appChanged && now - lastWorkAppReactionAt >= WORK_APP_REACTION_COOLDOWN_MS) {
    pendingWorkAppReaction = null;
    sendWorkAppReaction({ ...reaction, appName: frontmostAppName, type: "appChanged" });
    return;
  }

  if (!longWorkAppReactionSent && activeWorkAppName === frontmostAppName
    && now - activeWorkAppStartedAt >= WORK_APP_LONG_SESSION_MS) {
    longWorkAppReactionSent = true;
    sendWorkAppReaction({
      appName: frontmostAppName,
      message: randomChoice(LONG_WORK_APP_REACTIONS),
      type: "longSession",
    });
  }
}

function getWorkAppReaction(appName) {
  const lowerAppName = appName.toLowerCase();
  if (isIgnoredApp(appName)) return null;

  if (["code", "visual studio code", "cursor", "xcode", "terminal", "iterm"].includes(lowerAppName)) {
    return { message: randomChoice(WORK_APP_REACTIONS.coding), motion: "nod" };
  }

  if (["google chrome", "chrome", "safari", "arc", "firefox", "microsoft edge", "brave browser", "whale"].includes(lowerAppName)) {
    return { message: randomChoice(WORK_APP_REACTIONS.browsing), motion: "sniffSearch" };
  }

  if (["notion", "obsidian", "microsoft word", "pages"].includes(lowerAppName)) {
    return { message: randomChoice(WORK_APP_REACTIONS.writing), motion: "nod" };
  }

  if (["figma", "sketch", "adobe photoshop", "adobe illustrator"].includes(lowerAppName)) {
    return { message: randomChoice(WORK_APP_REACTIONS.design), motion: "nod" };
  }

  if (["keynote", "microsoft powerpoint"].includes(lowerAppName)) {
    return { message: randomChoice(WORK_APP_REACTIONS.presentation), motion: "nod" };
  }

  if (["music", "spotify", "melon", "bugs", "flo", "youtube music", "vlc", "iina"].includes(lowerAppName)) {
    return { message: randomChoice(WORK_APP_REACTIONS.music), motion: "tailWag" };
  }

  return null;
}

function isIgnoredApp(appName) {
  return ["finder", "comtriever", "electron", "codex"].includes(appName.toLowerCase());
}

function canShowWorkAppReaction() {
  if (!petWindow || !state.petVisible || sendHomeTimer || isWandering || isSleeping || petDrag) return false;
  if (state.displayMode === "desktopOnly" && !petWindow.isVisible()) return false;
  return true;
}

function sendWorkAppReaction(payload) {
  lastWorkAppReactionAt = Date.now();
  sendToPet("pet:workAppReaction", payload);
}

function getFrontmostAppName(callback) {
  execFile(
    'osascript',
    ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'],
    { timeout: 1200 },
    (error, stdout) => {
      if (error) {
        callback('');
        return;
      }
      callback(stdout.trim());
    },
  );
}

function setDisplayMode(displayMode) {
  if (!['alwaysOnTop', 'desktopOnly'].includes(displayMode)) return;
  stopWander({ notifyRenderer: true });
  state.displayMode = displayMode;
  saveState();
  applyDisplayMode();
  broadcastState();
}

function setPetSize(petSize) {
  if (!Object.hasOwn(PET_SIZE_OPTIONS, petSize)) return;
  if (state.petSize === petSize) return;

  stopSendHomeAnimation();
  stopWander({ notifyRenderer: true });
  const currentBounds = petWindow?.getBounds();
  state.petSize = petSize;

  if (petWindow && currentBounds) {
    const nextSize = getPetWindowSize();
    const nextPosition = getResizedPetPosition(currentBounds, nextSize);
    petWindow.setBounds({
      x: nextPosition.x,
      y: nextPosition.y,
      width: nextSize.width,
      height: nextSize.height,
    }, false);
    state.petPosition = nextPosition;
  }

  saveState();
  broadcastState();
  scheduleWander();
}

function setWanderEnabled(wanderEnabled) {
  if (typeof wanderEnabled !== 'boolean') return;
  if (state.wanderEnabled === wanderEnabled) return;

  state.wanderEnabled = wanderEnabled;
  if (wanderEnabled) {
    scheduleWander();
  } else {
    stopWander({ notifyRenderer: true, save: true });
  }

  saveState();
  broadcastState();
}

function setLaunchAtLogin(launchAtLogin) {
  if (typeof launchAtLogin !== 'boolean') return;
  if (state.launchAtLogin === launchAtLogin) return;

  state.launchAtLogin = launchAtLogin;
  saveState();
  applyLaunchAtLoginSetting();
  broadcastState();
}

function callPetBack() {
  markPetAwake();
  stopSendHomeAnimation();
  stopWander({ notifyRenderer: true });
  state.petVisible = true;
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const windowSize = getPetWindowSize();
  const position = clampWindowPosition(
    workArea.x + Math.round(workArea.width * 0.18),
    workArea.y + Math.round(workArea.height * 0.7),
    windowSize,
    workArea,
  );
  movePetWindow(position.x, position.y);
  sendToPet('pet:calledBack');
  saveState();
  applyDisplayMode();
  broadcastState();
  scheduleWander();
}

function sendPetHome() {
  if (!petWindow || !state.petVisible) return;
  markPetAwake();
  stopWander();
  stopSendHomeAnimation();

  const currentBounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const home = chooseHomePosition(currentBounds, workArea);
  sendToPet('pet:goingHome', { direction: home.x < currentBounds.x ? 'left' : 'right' });

  const durationMs = 1500;
  const frameMs = 16;
  const steps = Math.max(1, Math.round(durationMs / frameMs));
  let step = 0;
  const startX = currentBounds.x;
  const startY = currentBounds.y;

  sendHomeTimer = setInterval(() => {
    step += 1;
    const progress = step / steps;
    const eased = 1 - Math.pow(1 - progress, 3);
    const x = Math.round(startX + (home.x - startX) * eased);
    const y = Math.round(startY + (home.y - startY) * eased);
    movePetWindow(x, y);

    if (step >= steps) {
      stopSendHomeAnimation();
      state.petVisible = false;
      sendToPet('pet:arrivedHome');
      saveState();
      setTimeout(() => {
        if (!state.petVisible) hidePetWindow();
      }, 180);
      broadcastState();
    }
  }, frameMs);
}

function chooseHomePosition(bounds, workArea) {
  const leftHome = {
    x: workArea.x + PET_EDGE_MARGIN_PX,
    y: workArea.y + workArea.height - bounds.height - 18,
  };
  const rightHome = {
    x: workArea.x + workArea.width - bounds.width - PET_EDGE_MARGIN_PX,
    y: workArea.y + workArea.height - bounds.height - 18,
  };

  const leftDistance = Math.abs(bounds.x - leftHome.x);
  const rightDistance = Math.abs(bounds.x - rightHome.x);
  return leftDistance <= rightDistance ? leftHome : rightHome;
}

function stopSendHomeAnimation() {
  if (!sendHomeTimer) return;
  clearInterval(sendHomeTimer);
  sendHomeTimer = null;
}

function scheduleWander() {
  if (state.wanderEnabled === false) return;
  if (wanderTimer || isWandering || petDrag) return;
  if (!petWindow || !state.petVisible || sendHomeTimer || isSleeping) return;

  wanderTimer = setTimeout(startWander, randomInt(WANDER_DELAY_MIN_MS, WANDER_DELAY_MAX_MS));
}

function startWander() {
  wanderTimer = null;

  if (!canWanderNow()) {
    scheduleWander();
    return;
  }

  const currentBounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const minX = workArea.x + PET_EDGE_MARGIN_PX;
  const maxX = workArea.x + workArea.width - currentBounds.width - PET_EDGE_MARGIN_PX;
  const distance = getRandomWanderDistance(minX, maxX, currentBounds);
  const direction = chooseWanderDirection(currentBounds.x, distance, minX, maxX);
  const targetX = clamp(currentBounds.x + direction * distance, minX, maxX);

  if (targetX === currentBounds.x) {
    scheduleWander();
    return;
  }

  const durationMs = randomInt(WANDER_DURATION_MIN_MS, WANDER_DURATION_MAX_MS);
  const frameMs = 16;
  const steps = Math.max(1, Math.round(durationMs / frameMs));
  const startX = currentBounds.x;
  const startY = currentBounds.y;
  let step = 0;

  isWandering = true;
  lastWanderDirection = targetX < startX ? -1 : 1;
  sendToPet('pet:wanderStarted', { direction: targetX < startX ? 'left' : 'right' });

  wanderMoveTimer = setInterval(() => {
    if (!canWanderNow({ allowCurrentWander: true })) {
      stopWander({ notifyRenderer: true });
      return;
    }

    step += 1;
    const progress = step / steps;
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const x = Math.round(startX + (targetX - startX) * eased);
    movePetWindow(x, startY);

    if (step >= steps) {
      stopWander({ notifyRenderer: true, reschedule: true, save: true });
    }
  }, frameMs);
}

function stopWander(options = {}) {
  if (wanderTimer) clearTimeout(wanderTimer);
  wanderTimer = null;

  if (wanderMoveTimer) clearInterval(wanderMoveTimer);
  wanderMoveTimer = null;

  const wasWandering = isWandering;
  isWandering = false;

  if (wasWandering && options.notifyRenderer) {
    sendToPet('pet:wanderEnded');
  }

  if (wasWandering && options.save) {
    saveState();
  }

  if (options.reschedule) {
    scheduleWander();
  }
}

function canWanderNow(options = {}) {
  if (state.wanderEnabled === false) return false;
  if (!petWindow || !state.petVisible || sendHomeTimer || isSleeping || petDrag) return false;
  if (isWandering && !options.allowCurrentWander) return false;
  if (state.displayMode === 'desktopOnly' && !petWindow.isVisible()) return false;
  return true;
}

function handlePetIdleReady() {
  markPetAwake();
  scheduleWander();
}

function handlePetSleepStarted() {
  isSleeping = true;
  stopWander({ notifyRenderer: true });
}

function stopPetMotionForInteraction() {
  markPetAwake();
  stopSendHomeAnimation();
  stopWander({ notifyRenderer: true });
  state.petVisible = true;
}

function markPetAwake() {
  const wasSleeping = isSleeping;
  isSleeping = false;
  if (wasSleeping) scheduleWander();
}

function getRandomWanderDistance(minX, maxX, bounds) {
  const availableLeft = Math.max(0, bounds.x - minX);
  const availableRight = Math.max(0, maxX - bounds.x);
  const maxAvailable = Math.max(availableLeft, availableRight);
  const minDistance = Math.min(WANDER_DISTANCE_MIN_PX, maxAvailable);
  const maxDistance = Math.max(minDistance, Math.min(WANDER_DISTANCE_MAX_PX, maxAvailable));
  return randomInt(minDistance, maxDistance);
}

function handlePetDragStart(pointerPayload) {
  const pointer = getValidPointer(pointerPayload);
  if (!pointer || !petWindow || !state.petVisible) return;

  stopPetMotionForInteraction();
  const wasWandering = isWandering;
  petDrag = {
    startPointer: pointer,
    startBounds: petWindow.getBounds(),
    wasWandering,
  };
}

function handlePetDragMove(pointerPayload) {
  const pointer = getValidPointer(pointerPayload);
  if (!pointer || !petDrag || !petWindow) return;

  const deltaX = pointer.screenX - petDrag.startPointer.screenX;
  const deltaY = pointer.screenY - petDrag.startPointer.screenY;
  const target = clampPetPosition(
    petDrag.startBounds.x + deltaX,
    petDrag.startBounds.y + deltaY,
    petDrag.startBounds,
    pointer,
  );
  movePetWindow(target.x, target.y);
}

function handlePetDragEnd(pointerPayload) {
  const wasWandering = petDrag?.wasWandering;
  handlePetDragMove(pointerPayload);
  if (!petDrag) return;

  petDrag = null;
  if (wasWandering) sendToPet('pet:wanderEnded');
  saveState();
  scheduleWander();
  broadcastState();
}

function getValidPointer(pointer) {
  if (!pointer || !Number.isFinite(pointer.screenX) || !Number.isFinite(pointer.screenY)) return null;
  return {
    screenX: pointer.screenX,
    screenY: pointer.screenY,
  };
}

function clampPetPosition(x, y, bounds, pointer) {
  const display = screen.getDisplayNearestPoint({
    x: Math.round(pointer.screenX),
    y: Math.round(pointer.screenY),
  });
  return clampWindowPosition(x, y, bounds, display.workArea);
}

function getPetWindowSize() {
  const config = PET_SIZE_OPTIONS[state.petSize] ?? PET_SIZE_OPTIONS[DEFAULT_STATE.petSize];
  return { width: config.windowWidth, height: config.windowHeight };
}

function getResizedPetPosition(currentBounds, nextSize) {
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const nextX = Math.round(currentBounds.x + (currentBounds.width - nextSize.width) / 2);
  const nextY = Math.round(currentBounds.y + currentBounds.height - nextSize.height);
  return clampWindowPosition(nextX, nextY, nextSize, workArea);
}

function clampWindowPosition(x, y, bounds, workArea) {
  const minX = workArea.x;
  const minY = workArea.y;
  const maxX = Math.max(minX, workArea.x + workArea.width - bounds.width);
  const maxY = Math.max(minY, workArea.y + workArea.height - bounds.height);

  return {
    x: clamp(Math.round(x), minX, maxX),
    y: clamp(Math.round(y), minY, maxY),
  };
}

function chooseWanderDirection(currentX, distance, minX, maxX) {
  const canMoveLeft = currentX - distance >= minX;
  const canMoveRight = currentX + distance <= maxX;

  if (canMoveLeft && canMoveRight) {
    if (lastWanderDirection && Math.random() < 0.62) return -lastWanderDirection;
    return Math.random() < 0.5 ? -1 : 1;
  }
  if (canMoveLeft) return -1;
  if (canMoveRight) return 1;
  return currentX - minX > maxX - currentX ? -1 : 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function randomChoice(items) {
  return items[randomInt(0, items.length - 1)];
}

function movePetWindow(x, y) {
  if (!petWindow) return;
  petWindow.setPosition(x, y, false);
  state.petPosition = { x, y };
}

app.whenReady().then(() => {
  app.setName('Comtriever');
  loadState();
  showPetAfterLoginLaunch();
  applyLaunchAtLoginSetting();
  createTray();
  createSettingsWindow();
  createPetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSettingsWindow();
      createPetWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopWorkAppWatcher();
  stopClipboardWatcher();
  stopSystemIdleWatcher();
  stopCursorProximityWatcher();
  stopSendHomeAnimation();
  stopWander();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('state:get', () => normalizeStateForRenderer());
ipcMain.handle('assets:getRetrieverManifest', () => {
  const manifestPath = path.join(__dirname, 'assets', 'retriever', 'manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
});
ipcMain.handle('fileDrop:inspect', (_event, paths) => inspectDroppedItems(paths));
ipcMain.handle('fileDrop:open', (_event, itemPath) => openDroppedItem(itemPath));
ipcMain.handle('fileDrop:copyPaths', (_event, paths) => copyDroppedItemPaths(paths));
ipcMain.handle('fileDrop:trash', (_event, paths) => trashDroppedItems(paths));
ipcMain.on('pet:sendHome', sendPetHome);
ipcMain.on('pet:callBack', callPetBack);
ipcMain.on('pet:setDisplayMode', (_event, displayMode) => setDisplayMode(displayMode));
ipcMain.on('pet:setSize', (_event, petSize) => setPetSize(petSize));
ipcMain.on('pet:setWanderEnabled', (_event, wanderEnabled) => setWanderEnabled(wanderEnabled));
ipcMain.on('pet:setLaunchAtLogin', (_event, launchAtLogin) => setLaunchAtLogin(launchAtLogin));
ipcMain.on('pet:interruptMotion', stopPetMotionForInteraction);
ipcMain.on('pet:sleepStarted', handlePetSleepStarted);
ipcMain.on('pet:awake', markPetAwake);
ipcMain.on('pet:idleReady', handlePetIdleReady);
ipcMain.on('pet:dragStart', (_event, pointer) => handlePetDragStart(pointer));
ipcMain.on('pet:dragMove', (_event, pointer) => handlePetDragMove(pointer));
ipcMain.on('pet:dragEnd', (_event, pointer) => handlePetDragEnd(pointer));
ipcMain.on('pet:updatePosition', (_event, position) => {
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') return;
  state.petPosition = position;
  saveState();
});
