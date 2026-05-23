const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('comtriever', {
  getState: () => ipcRenderer.invoke('state:get'),
  getRetrieverManifest: () => ipcRenderer.invoke('assets:getRetrieverManifest'),
  sendHome: () => ipcRenderer.send('pet:sendHome'),
  callBack: () => ipcRenderer.send('pet:callBack'),
  setDisplayMode: (mode) => ipcRenderer.send('pet:setDisplayMode', mode),
  setPetSize: (size) => ipcRenderer.send('pet:setSize', size),
  setWanderEnabled: (enabled) => ipcRenderer.send('pet:setWanderEnabled', enabled),
  interruptPetMotion: () => ipcRenderer.send('pet:interruptMotion'),
  updatePosition: (position) => ipcRenderer.send('pet:updatePosition', position),
  startPetDrag: (pointer) => ipcRenderer.send('pet:dragStart', pointer),
  movePetDrag: (pointer) => ipcRenderer.send('pet:dragMove', pointer),
  endPetDrag: (pointer) => ipcRenderer.send('pet:dragEnd', pointer),
  notifySleepStarted: () => ipcRenderer.send('pet:sleepStarted'),
  notifyPetAwake: () => ipcRenderer.send('pet:awake'),
  notifyPetIdle: () => ipcRenderer.send('pet:idleReady'),
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  inspectDroppedItems: (paths) => ipcRenderer.invoke('fileDrop:inspect', paths),
  openDroppedItem: (path) => ipcRenderer.invoke('fileDrop:open', path),
  copyDroppedItemPaths: (paths) => ipcRenderer.invoke('fileDrop:copyPaths', paths),
  trashDroppedItems: (paths) => ipcRenderer.invoke('fileDrop:trash', paths),
  onStateChanged: (callback) => {
    ipcRenderer.on('state:changed', (_event, state) => callback(state));
  },
  onGoingHome: (callback) => {
    ipcRenderer.on('pet:goingHome', (_event, payload) => callback(payload));
  },
  onArrivedHome: (callback) => {
    ipcRenderer.on('pet:arrivedHome', callback);
  },
  onCalledBack: (callback) => {
    ipcRenderer.on('pet:calledBack', callback);
  },
  onWanderStarted: (callback) => {
    ipcRenderer.on('pet:wanderStarted', (_event, payload) => callback(payload));
  },
  onWanderEnded: (callback) => {
    ipcRenderer.on('pet:wanderEnded', callback);
  },
  onWorkAppReaction: (callback) => {
    ipcRenderer.on('pet:workAppReaction', (_event, payload) => callback(payload));
  },
  onClipboardCopied: (callback) => {
    ipcRenderer.on('pet:clipboardCopied', (_event, payload) => callback(payload));
  },
  onRhythmReaction: (callback) => {
    ipcRenderer.on('pet:rhythmReaction', (_event, payload) => callback(payload));
  },
  onCursorNear: (callback) => {
    ipcRenderer.on('pet:cursorNear', callback);
  },
  onCursorNearbyPulse: (callback) => {
    ipcRenderer.on('pet:cursorNearbyPulse', callback);
  },
  onCursorLeft: (callback) => {
    ipcRenderer.on('pet:cursorLeft', callback);
  },
  onSystemIdleYawn: (callback) => {
    ipcRenderer.on('pet:systemIdleYawn', callback);
  },
  onSystemIdleSleep: (callback) => {
    ipcRenderer.on('pet:systemIdleSleep', callback);
  },
  onUserActive: (callback) => {
    ipcRenderer.on('pet:userActive', callback);
  },
});
