const toy = document.querySelector('#toy');
const shape = document.querySelector('#shape');
let held = null;
let carried = false;
let canPickUp = true;
const point = (event) => ({ screenX: event.screenX, screenY: event.screenY });
window.comtriever.onToyState((state) => {
  carried = state.carried;
  canPickUp = state.canPickUp !== false;
  toy.classList.toggle('snack', state.kind === 'snack');
  toy.classList.toggle('carried', Boolean(carried));
  toy.dataset.stage = state.stage;
  const label = state.kind === 'snack' ? '간식을 잡아서 던져주세요'
    : state.stage === 'waiting' ? '물고 있는 공을 잡아서 다시 던져주세요' : '공을 잡아서 던져주세요';
  toy.setAttribute('aria-label', label);
  toy.title = label;
  shape.style.transform = `rotate(${state.angle ?? 0}deg)`;
});
toy.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !canPickUp || held !== null) return;
  held = event.pointerId;
  toy.setPointerCapture(held);
  window.comtriever.toyPointer('start', point(event));
  event.preventDefault();
});
toy.addEventListener('pointermove', (event) => {
  if (held === event.pointerId) window.comtriever.toyPointer('move', point(event));
});
function release(event, phase) {
  if (held !== event.pointerId) return;
  window.comtriever.toyPointer(phase, point(event));
  held = null;
  if (toy.hasPointerCapture(event.pointerId)) toy.releasePointerCapture(event.pointerId);
}
toy.addEventListener('pointerup', (event) => release(event, 'end'));
toy.addEventListener('pointercancel', (event) => release(event, 'cancel'));
toy.addEventListener('lostpointercapture', (event) => release(event, 'cancel'));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.comtriever.stopPlay();
});
