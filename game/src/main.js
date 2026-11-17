// Park Master 3D — bootstrap: fixed-step loop, input wiring, overlays, and
// the deterministic ?shot= scenes. Exposes window.__park for probes.
import * as THREE from 'three';
import { STEP, LEVELS } from './config.js';
import { createInput, ACTION_CAMERA, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESET, ACTION_SOUND } from './input.js';
import { createAudio } from './audio.js';
import { createGame, SCREEN_COMPLETE, SCREEN_FAILED, SCREEN_MENU, SCREEN_PAUSED, SCREEN_PLAYING } from './game.js';
import { createView } from './render.js';
import { stageShot } from './shots.js';
import { loadAssets } from './assets.js';

async function boot() {
  // Blender-built assets (car, towers, facades, props) must load before the game is
  // built: car.js and world.js clone them synchronously.
  try {
    await loadAssets();
  } catch (err) {
    document.getElementById('status').textContent = `Park Master 3D failed to load assets: ${err.message}`;
    throw err;
  }

  const canvas = document.getElementById('game');
  const mapCanvas = document.getElementById('map');
  const statusEl = document.getElementById('status');

  const scene = new THREE.Scene();
  const audio = createAudio();
  const game = createGame(scene, audio);
  const input = createInput();

  const ui = {
    onLevel(i) { audio.unlock(); game.loadLevel(i); view.setDark(game.level.dark); view.showOverlay(null); },
    onFreeRoam() { audio.unlock(); game.loadLevel(0, true); view.setDark(false); view.showOverlay(null); },
    onNext() { const n = Math.min(game.levelIndex + 1, LEVELS.length - 1); game.loadLevel(n); view.setDark(game.level.dark); view.showOverlay(null); },
    onReplay() { game.loadLevel(game.levelIndex); view.setDark(game.level.dark); view.showOverlay(null); },
    onMenu() { game.toMenu(); view.showOverlay('menu'); },
    onRetry() { game.loadLevel(game.levelIndex); view.setDark(game.level.dark); view.showOverlay(null); },
    onResume() { game.setScreen(SCREEN_PLAYING); view.showOverlay(null); },
  };
  const view = createView(canvas, mapCanvas, scene, game, ui);
  view.setDark(false);

  let lastScreen = null;
  function syncOverlay() {
    if (game.screen === lastScreen) return;
    lastScreen = game.screen;
    if (game.screen === SCREEN_MENU) view.showOverlay('menu');
    else if (game.screen === SCREEN_COMPLETE) view.showOverlay('complete');
    else if (game.screen === SCREEN_FAILED) view.showOverlay('failed');
    else if (game.screen === SCREEN_PAUSED) view.showOverlay('pause');
    else view.showOverlay(null);
  }

  function driveFromInput() {
    return {
      throttle: input.throttle(),
      steer: input.steer(),
      handbrake: input.handbrake(),
    };
  }

  const params = new URLSearchParams(window.location.search);
  const shotName = params.get('shot');
  const seed = Number(params.get('seed') || 1) || 1;
  void seed;

  window.__park = { game, view, input, ready: false, shot: shotName, stageShot };

  if (shotName) {
    // Deterministic scene: stage it synchronously, settle the camera, render once.
    const overlay = stageShot(shotName, game);
    view.setDark(game.level.dark);
    view.showOverlay(overlay === 'menu' ? 'menu' : overlay === 'complete' ? 'complete' : null);
    lastScreen = game.screen;
    for (let i = 0; i < 40; i += 1) view.render(STEP, i * STEP);
    statusEl.textContent = `Park Master 3D shot ${shotName} ready`;
    window.__park.ready = true;
  } else {
    game.toMenu();
    view.showOverlay('menu');
    lastScreen = SCREEN_MENU;
    let last = performance.now();
    let acc = 0;
    let elapsed = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const actions = input.takeActions();
      if (actions & ACTION_SOUND) audio.setMuted(!audio.isMuted());
      if (actions & ACTION_CAMERA) view.nextCamera();
      if (actions & ACTION_PAUSE) {
        if (game.screen === SCREEN_PLAYING || game.screen === SCREEN_PAUSED) {
          game.togglePause();
          audio.unlock();
        }
      }
      if (actions & ACTION_RESET) game.resetCar();
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        if (game.screen === SCREEN_COMPLETE) ui.onNext();
        else if (game.screen === SCREEN_FAILED) ui.onRetry();
      }
      if (game.screen === SCREEN_PLAYING) {
        acc += dt;
        while (acc >= STEP) {
          game.stepSim(STEP, driveFromInput());
          acc -= STEP;
        }
      }
      elapsed += dt;
      syncOverlay();
      view.render(dt, elapsed);
      statusEl.textContent = game.screen === SCREEN_PLAYING
        ? `Level ${game.levelIndex + 1} ${game.level.name}: ${game.timeLeft.toFixed(0)}s left, damage ${Math.round(game.car.state.damage)}%`
        : 'Park Master 3D menu';
    }
    requestAnimationFrame(frame);
    window.__park.ready = true;
  }
}

boot();
