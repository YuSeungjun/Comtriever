// Resting energy and its settings UI must survive a real process restart.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.COMTRIEVER_HOME_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-home-rest-'));
const restore = process.env.COMTRIEVER_HOME_RESTORE === '1';
const clockFile = path.join(directory, 'clock.json');
const savedClock = restore ? JSON.parse(fs.readFileSync(clockFile, 'utf8')) : null;
const realNow = Date.now;
let offset = restore ? savedClock.now + 2 * 86400000 - realNow() : 0;
Date.now = () => realNow() + offset;
app.setPath('userData', directory);
if (!restore) fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({
  wanderEnabled: false, windowWalking: false, launchAtLogin: false,
  progress: { fullness: 72, fedAt: Date.now() },
}));
process.env.COMTRIEVER_TEST_MODE = '1';
require('../src/main');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const end = realNow() + 12000;
  while (realNow() < end) { if (await fn()) return; await delay(30); }
  throw new Error(`Timed out: ${label}`);
}
const errors = [];
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
});

app.whenReady().then(async () => {
  try {
    let settings;
    await until(() => {
      settings = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/settings.html'));
      return settings;
    }, 'settings created');
    const ui = source => settings.webContents.executeJavaScript(source);
    const state = () => ui('window.comtriever.getState()');
    const saved = () => JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'));
    await until(() => ui('typeof latestState !== "undefined" && Boolean(latestState)').catch(() => false), 'settings ready');
    settings.setIgnoreMouseEvents(true);
    const checkResting = async () => {
      await until(() => ui('!latestState.petVisible && welcomePet.complete && welcomePet.naturalWidth > 0'), 'resting UI loaded');
      assert.equal(await ui('document.querySelector("#petStatus")'), null, 'status badge is removed');
      assert.equal(await ui('welcomeGreeting.textContent + " " + welcomeMessage.textContent'), '나 잠시 쉬고 있어');
      assert.ok(await ui('welcomePet.src.endsWith("retriever-sleep-1.png")'));
      assert.equal(await ui('sendHomeButton.disabled && !callBackButton.disabled'), true);
      assert.equal(await ui('document.body.textContent.includes("집에서 쉼")'), false);
    };
    if (!restore) {
      assert.equal(await ui('welcomeGreeting.textContent + " " + welcomeMessage.textContent'), '오늘도 네 곁에 있을게');
      await ui('sendHomeButton.click()');
      await until(() => state().then(s => !s.petVisible), 'sent home');
      const energy = saved().progress.fullness;
      assert.equal(saved().progress.fullnessPaused, true);
      offset += 60 * 60000;
      assert.equal((await state()).bond.fullness, Math.round(energy), 'an hour at home consumes no energy');
      await ui('window.comtriever.getState().then(renderState)');
      await checkResting();
      for (const [name, width] of [['default', 480], ['narrow', 360]]) {
        settings.setSize(width, 820);
        await ui('window.scrollTo(0,0); void 0');
        await delay(200);
        assert.equal(await ui('document.documentElement.scrollWidth > innerWidth'), false);
        fs.writeFileSync(path.join(directory, `resting-${name}.png`), (await settings.webContents.capturePage()).toPNG());
      }
      fs.writeFileSync(clockFile, JSON.stringify({ now: Date.now(), energy }));
      console.log('PASS home freezes energy for an hour, resting portrait/copy, hidden badge and responsive layout');
    } else {
      await checkResting();
      assert.equal(saved().progress.fullness, savedClock.energy, 'saved energy survives two days offline at home');
      assert.equal((await state()).bond.fullness, Math.round(savedClock.energy));
      await ui('callBackButton.click()');
      await until(() => state().then(s => s.petVisible), 'called back');
      assert.equal(saved().progress.fullnessPaused, false);
      assert.equal(saved().progress.fullness, savedClock.energy, 'coming back does not charge resting time');
      assert.equal(await ui('welcomeGreeting.textContent + " " + welcomeMessage.textContent'), '오늘도 네 곁에 있을게');
      assert.equal(await ui('document.querySelector("#petStatus")'), null);
      await until(() => ui('welcomePet.complete && welcomePet.src.endsWith("retriever-idle-1.png")'), 'active portrait restored');
      offset += 60000;
      assert.equal((await state()).bond.fullness, Math.round(savedClock.energy) - 1, 'one active minute consumes one point again');
      await ui('window.comtriever.getState().then(renderState)');
      await delay(200);
      fs.writeFileSync(path.join(directory, 'returned.png'), (await settings.webContents.capturePage()).toPNG());
      console.log('PASS actual restart preserves resting energy; coming back restores UI and resumes one point per minute');
    }
    assert.deepEqual(errors, []);
    console.log('Home rest artifacts:', directory);
    app.exit(0);
  } catch (error) { console.error(error, errors, 'Artifacts:', directory); app.exit(1); }
});
