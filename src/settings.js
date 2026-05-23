const petStatus = document.querySelector('#petStatus');
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
  petStatus.textContent = state.petVisible ? '함께 있음' : '집에서 쉼';
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
