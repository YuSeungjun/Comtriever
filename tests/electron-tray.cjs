// Exercise tray callbacks without touching the user's save or login settings.
const { app, BrowserWindow, Tray } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-tray-'));
app.setPath('userData', directory);
fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({
  petVisible: false, wanderEnabled: false, windowWalking: false, launchAtLogin: false,
  progress: { fullness: 60, fullnessPaused: true, fedAt: Date.now() },
}));
process.env.COMTRIEVER_TEST_MODE = '1';
let tray, menu;
const setContextMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function (nextMenu) {
  tray = this;
  menu = nextMenu;
  return setContextMenu.call(this, nextMenu);
};
require('../src/main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if (await fn()) return; await delay(30); }
  throw new Error(`Timed out: ${label}`);
}
const settingsWindow = () => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/settings.html'));
const actionItems = () => menu.items.filter(item => item.type !== 'separator');
const select = label => {
  const item = actionItems().find(entry => entry.label === label);
  assert.ok(item?.enabled, `enabled menu item: ${label}`);
  item.click();
};
const clickTray = () => {
  for (const event of ['click', 'double-click', 'right-click']) tray.emit(event, {}, tray.getBounds());
};

app.whenReady().then(async () => {
  try {
    await until(() => tray && settingsWindow(), 'tray and initial settings');
    assert.deepEqual(actionItems().map(item => item.label), ['설정 열기', '다시 부르기', 'Comtriever 종료']);
    settingsWindow().close();
    await until(() => !settingsWindow(), 'settings closed');
    clickTray();
    await delay(150);
    assert.equal(settingsWindow(), undefined, 'clicking the tray does not create settings');

    select('설정 열기');
    await until(() => settingsWindow()?.isVisible(), 'explicit open settings');
    const settings = settingsWindow();
    const ui = source => settings.webContents.executeJavaScript(source);
    await until(() => ui('typeof latestState !== "undefined" && Boolean(latestState)').catch(() => false), 'settings ready');
    settings.hide();
    clickTray();
    await delay(150);
    assert.equal(settings.isVisible(), false, 'tray clicks do not reveal hidden settings');
    select('다시 부르기');
    await until(() => ui('window.comtriever.getState().then(s => s.petVisible)'), 'called back');
    assert.deepEqual(actionItems().map(item => item.label), ['설정 열기', '집으로 보내기', 'Comtriever 종료']);
    assert.equal(settings.isVisible(), false);

    select('집으로 보내기');
    await until(() => ui('window.comtriever.getState().then(s => !s.petVisible)'), 'home animation complete');
    assert.deepEqual(actionItems().map(item => item.label), ['설정 열기', '다시 부르기', 'Comtriever 종료']);
    assert.equal(settings.isVisible(), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')).progress.fullnessPaused, true);

    select('설정 열기');
    await until(() => settings.isVisible(), 'explicit reopen settings');
    await ui('callBackButton.click()');
    await until(() => actionItems()[1].label === '집으로 보내기', 'settings callback updates tray');
    await ui('sendHomeButton.click()');
    await until(() => actionItems()[1].label === '다시 부르기', 'settings home updates tray');
    settings.close();
    await until(() => !settingsWindow(), 'settings closed again');
    select('다시 부르기');
    await until(() => actionItems()[1].label === '집으로 보내기', 'callback with settings closed');
    assert.equal(settingsWindow(), undefined);
    console.log('PASS tray clicks leave settings closed/hidden; explicit settings, home/callback and saved resting state stay in sync');
    app.once('will-quit', () => console.log('PASS tray Quit exits the app; artifacts:', directory));
    select('Comtriever 종료');
  } catch (error) { console.error(error, 'Artifacts:', directory); app.exit(1); }
});
