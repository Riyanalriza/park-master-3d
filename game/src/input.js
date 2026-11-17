// Keyboard input. Held keys give throttle/steer/handbrake; one-shot presses
// (confirm, camera, reset, pause, sound) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_CAMERA = 2;
export const ACTION_RESET = 4;
export const ACTION_PAUSE = 8;
export const ACTION_SOUND = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const BRAKE = new Set(['Space']);
const CONFIRM = new Set(['Enter', 'NumpadEnter']);
const CAMERA = new Set(['KeyC']);
const RESET = new Set(['KeyR']);
const PAUSE = new Set(['KeyP', 'Escape']);
const SOUND = new Set(['KeyM']);

export function createInput() {
  let up = false, down = false, left = false, right = false, brake = false;
  let actions = 0;
  const held = new Set();
  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (BRAKE.has(event.code)) brake = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (CAMERA.has(event.code)) { if (!event.repeat) actions |= ACTION_CAMERA; }
    else if (RESET.has(event.code)) { if (!event.repeat) actions |= ACTION_RESET; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (SOUND.has(event.code)) { if (!event.repeat) actions |= ACTION_SOUND; }
    else return;
    held.add(event.code);
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (BRAKE.has(event.code)) brake = false;
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    up = down = left = right = brake = false;
    held.clear();
  });
  return {
    throttle() { return (up ? 1 : 0) - (down ? 1 : 0); },
    steer() { return (left ? 1 : 0) - (right ? 1 : 0); },
    handbrake() { return brake; },
    takeActions() { const taken = actions; actions = 0; return taken; },
    // For scripted drivers (screenshots): set the held keys directly.
    setScripted(state) {
      up = !!state.up; down = !!state.down; left = !!state.left;
      right = !!state.right; brake = !!state.brake;
    },
  };
}
