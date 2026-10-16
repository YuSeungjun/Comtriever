// Transparent BrowserWindows still receive clicks unless explicitly ignored.
// The renderer checks the current sprite's alpha; only this window may apply it.
function attachPetMouse(window, screen, ipcMain) {
  let ignored;
  let lastPoint;
  const setIgnored = (value) => {
    if (window.isDestroyed() || ignored === value) return;
    ignored = value;
    window.setIgnoreMouseEvents(value, { forward: true });
  };
  const onHit = (event, interactive) => {
    if (window.isDestroyed()) return;
    if (event.sender !== window.webContents || typeof interactive !== 'boolean') return;
    setIgnored(!interactive || !window.isVisible());
  };
  const reset = () => { lastPoint = undefined; setIgnored(true); };
  const sample = () => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    if (!window.isVisible()) { reset(); return; }
    const cursor = screen.getCursorScreenPoint();
    const bounds = window.getContentBounds();
    const x = cursor.x - bounds.x, y = cursor.y - bounds.y;
    const inside = x >= 0 && y >= 0 && x < bounds.width && y < bounds.height;
    const point = inside ? { x, y } : null;
    if (lastPoint !== undefined && lastPoint?.x === point?.x && lastPoint?.y === point?.y) return;
    lastPoint = point;
    window.webContents.send('pet:hitCursor', point);
  };
  reset();
  ipcMain.on('pet:hitResult', onHit);
  window.webContents.on('did-start-loading', reset);
  window.webContents.on('did-finish-load', () => { lastPoint = undefined; sample(); });
  window.webContents.on('render-process-gone', reset);
  window.on('hide', reset);
  // Also covers a stationary cursor when the dog walks underneath it, native
  // file drags, and platforms which do not forward ignored mouse moves.
  const timer = setInterval(sample, 32);
  // Tie native mouse tracking to the renderer/window lifetime.
  window.webContents.once('destroyed', () => {
    clearInterval(timer);
    ipcMain.removeListener('pet:hitResult', onHit);
  });
}

module.exports = { attachPetMouse };
