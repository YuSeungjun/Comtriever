const welcomeCard = document.querySelector('.welcome-card');
const welcomeGreeting = document.querySelector('#welcomeGreeting');
const welcomeMessage = document.querySelector('#welcomeMessage');
const welcomePet = document.querySelector('.welcome-pet');
const sendHomeButton = document.querySelector('#sendHomeButton');
const callBackButton = document.querySelector('#callBackButton');
const alwaysOnTopButton = document.querySelector('#alwaysOnTopButton');
const desktopOnlyButton = document.querySelector('#desktopOnlyButton');
const smallSizeButton = document.querySelector('#smallSizeButton');
const mediumSizeButton = document.querySelector('#mediumSizeButton');
const largeSizeButton = document.querySelector('#largeSizeButton');
const wanderToggle = document.querySelector('#wanderToggle');
const launchAtLoginToggle = document.querySelector('#launchAtLoginToggle');
const sizeButtons = {
  small: smallSizeButton,
  medium: mediumSizeButton,
  large: largeSizeButton,
};

function renderState(state) {
  const resting = !state.petVisible;
  welcomeCard.dataset.resting = String(resting);
  welcomeGreeting.textContent = resting ? '나 잠시' : '오늘도';
  welcomeMessage.textContent = resting ? '쉬고 있어' : '네 곁에 있을게';
  const portrait = `./assets/retriever/retriever-${resting ? 'sleep' : 'idle'}-1.png`;
  if (welcomePet.getAttribute('src') !== portrait) welcomePet.src = portrait;
  welcomePet.alt = resting ? '누워서 쉬고 있는 리트리버' : '빨간 리본을 맨 나의 리트리버';
  sendHomeButton.disabled = !state.petVisible;
  callBackButton.disabled = state.petVisible;

  const isAlwaysOnTop = state.displayMode === 'alwaysOnTop';
  alwaysOnTopButton.setAttribute('aria-pressed', String(isAlwaysOnTop));
  desktopOnlyButton.setAttribute('aria-pressed', String(!isAlwaysOnTop));

  const petSize = state.petSize ?? 'medium';
  wanderToggle.checked = state.wanderEnabled !== false;
  launchAtLoginToggle.checked = state.launchAtLogin !== false;

  for (const [size, button] of Object.entries(sizeButtons)) {
    button.setAttribute('aria-pressed', String(size === petSize));
  }
  renderCompanion(state);
}

sendHomeButton.addEventListener('click', () => {
  window.comtriever.sendHome();
});

callBackButton.addEventListener('click', () => {
  window.comtriever.callBack();
});

alwaysOnTopButton.addEventListener('click', () => {
  window.comtriever.setDisplayMode('alwaysOnTop');
});

desktopOnlyButton.addEventListener('click', () => {
  window.comtriever.setDisplayMode('desktopOnly');
});

for (const [size, button] of Object.entries(sizeButtons)) {
  button.addEventListener('click', () => {
    window.comtriever.setPetSize(size);
  });
}

wanderToggle.addEventListener('change', () => {
  window.comtriever.setWanderEnabled(wanderToggle.checked);
});

launchAtLoginToggle.addEventListener('change', () => {
  window.comtriever.setLaunchAtLogin(launchAtLoginToggle.checked);
});

window.comtriever.onStateChanged(renderState);

window.comtriever.getState().then(renderState);
// Refresh time-based fullness even when the user leaves this window open.
setInterval(() => window.comtriever.getState().then(renderState), 60000);

let latestState;
const reminderForm = document.querySelector('#reminderForm');
const reminderAt = document.querySelector('#reminderAt');
const reminderFeedback = document.querySelector('#reminderFeedback');

function selectTab(name) {
  for (const button of document.querySelectorAll('[data-tab]')) button.setAttribute('aria-pressed', String(button.dataset.tab === name));
  for (const id of ['today', 'reminders', 'preferences']) document.querySelector(`#${id}Panel`).hidden = id !== name;
  window.scrollTo(0, 0);
}
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => selectTab(button.dataset.tab));

function renderCompanion(state) {
  latestState = state;
  const bond = state.bond;
  if (!bond) return;
  document.querySelector('#bondDays').textContent = `함께한 지 ${bond.days}일`;
  document.querySelector('#bondTitle').textContent = bond.name;
  document.querySelector('#bondLevel').textContent = `Lv. ${bond.level}`;
  const bondProgress = document.querySelector('#bondProgress');
  bondProgress.max = bond.isMaxLevel ? 1 : bond.needed;
  bondProgress.value = bond.isMaxLevel ? 1 : bond.current;
  bondProgress.setAttribute('aria-label', bond.isMaxLevel ? '최고 친밀도 레벨 달성' : '다음 친밀도 레벨까지');
  document.querySelector('#bondDetail').textContent = bond.isMaxLevel
    ? '최고 레벨 달성 · 오래오래 함께해요'
    : `다음 레벨까지 ${bond.needed - bond.current} ♥ · 함께할수록 가까워져요.`;
  document.querySelector('#petCount').textContent = `쓰다듬기 ${bond.counts.pet}`;
  document.querySelector('#playCount').textContent = `함께 놀기 ${bond.counts.snack + bond.counts.ball}`;
  document.querySelector('#doneCount').textContent = `일정 완료 ${bond.counts.reminder}`;
  document.querySelector('#fullnessProgress').value = bond.fullness;
  document.querySelector('#fullnessText').textContent = `${bond.fullness}%`;
  document.querySelector('#giveSnackButton').disabled = !state.petVisible || bond.fullness > 85 || Boolean(state.activity);
  document.querySelector('#playBallButton').disabled = !state.petVisible || Boolean(state.activity) || bond.fullness === 0;
  document.querySelector('#stopCompanionButton').disabled = !state.activity;
  document.querySelector('#windowWalkToggle').checked = state.windowWalking;
  document.querySelector('#welcomeToggle').checked = state.welcomeBack;
  document.querySelector('#windowWalkStatus').textContent = !state.windowWalking ? ''
    : state.windowTrackingStatus === 'unavailable' ? '창 위치를 읽지 못했어요. 앱을 다시 열거나 이 옵션을 껐다 켜주세요.'
      : state.windowTrackingStatus === 'ready'
        ? (state.displayMode === 'desktopOnly' ? '창 위에 있는 동안만 앞으로 표시하고, 내려오면 다시 작업창 뒤에 머물러요.' : '창 위에 놓아주면 쉬거나 산책해요. 화면 위쪽에는 앉을 공간이 필요해요.') : '';
  document.querySelector('#dueCount').textContent = (state.reminders ?? []).filter((r) => r.status === 'due').length || '';
  renderReminderList(state.reminders ?? []);
}

async function play(kind) {
  document.querySelector('#giveSnackButton').disabled = true;
  document.querySelector('#playBallButton').disabled = true;
  try {
    await window.comtriever.startPlay(kind);
  } catch (error) { console.error('놀이를 시작하지 못했어요.', error); }
  finally { renderCompanion(await window.comtriever.getState()); }
}
document.querySelector('#giveSnackButton').addEventListener('click', () => play('snack'));
document.querySelector('#playBallButton').addEventListener('click', () => play('ball'));
document.querySelector('#stopCompanionButton').addEventListener('click', () => window.comtriever.stopPlay());
for (const [id, option] of [['windowWalkToggle', 'windowWalking'], ['welcomeToggle', 'welcomeBack']]) {
  document.querySelector('#' + id).addEventListener('change', (event) => window.comtriever.setCompanionOption(option, event.target.checked));
}

function localInputDate(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function setQuickTime(minutes) { reminderAt.value = localInputDate(new Date(Date.now() + minutes * 60000)); }
setQuickTime(10);
for (const button of document.querySelectorAll('[data-minutes]')) button.addEventListener('click', () => setQuickTime(Number(button.dataset.minutes)));

reminderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = reminderForm.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    const result = await window.comtriever.addReminder({ title: document.querySelector('#reminderText').value, at: new Date(reminderAt.value).getTime(), repeat: document.querySelector('#reminderRepeat').value });
    reminderFeedback.textContent = result.ok ? '기억해뒀어요. 시간이 되면 알려드릴게요!' : result.message;
    if (result.ok) document.querySelector('#reminderText').value = '';
  } catch { reminderFeedback.textContent = '저장하지 못했어요. 다시 시도해주세요.'; }
  finally { submit.disabled = false; }
});

function renderReminderList(reminders) {
  const list = document.querySelector('#reminderList');
  document.querySelector('#scheduleCount').textContent = `${reminders.filter((r) => r.status !== 'done').length}개의 약속`;
  list.replaceChildren();
  if (!reminders.length) {
    const empty = document.createElement('div');
    empty.className = 'reminder-empty';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-calendar');
    icon.append(use);
    const title = document.createElement('strong');
    title.textContent = '아직 적어둔 일정이 없어요';
    const detail = document.createElement('p');
    detail.textContent = '물 한 잔, 잠깐의 스트레칭부터 시작해봐요.';
    empty.append(icon, title, detail);
    list.append(empty);
    return;
  }
  const order = { due: 0, scheduled: 1, done: 2 };
  for (const reminder of [...reminders].sort((a, b) => order[a.status] - order[b.status] || a.at - b.at)) {
    const row = document.createElement('article');
    row.className = `reminder-row ${reminder.status}`;
    row.dataset.id = reminder.id;
    const title = document.createElement('strong');
    title.textContent = reminder.title;
    const detail = document.createElement('small');
    const repeat = { none: '', daily: ' · 매일', weekly: ' · 매주' }[reminder.repeat];
    detail.textContent = `${reminder.status === 'done' ? '완료 · ' : reminder.status === 'due' ? '확인할 시간 · ' : ''}${new Date(reminder.at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}${repeat}`;
    row.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'reminder-actions';
    const options = reminder.status === 'due' ? [['complete', '완료'], ['snooze', '10분 뒤'], ['delete', '삭제']] : [['delete', '삭제']];
    for (const [action, label] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('aria-label', `${reminder.title} ${label}`);
      button.addEventListener('click', async () => {
        button.disabled = true;
        const result = await window.comtriever.reminderAction(reminder.id, action);
        if (!result.ok) { reminderFeedback.textContent = result.message; button.disabled = false; }
      });
      actions.append(button);
    }
    row.append(actions);
    list.append(row);
  }
}

window.comtriever.onReminders(() => selectTab('reminders'));
