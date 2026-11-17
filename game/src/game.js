// Game state: menu, levels, parking detection, scoring, stars, unlocks.
// The simulation itself (car + world) advances only through stepSim, so the
// screenshot stager can drive it forward deterministically.
import { BAY, CAR, DAMAGE, LEVELS, PARK, BEST_KEY } from './config.js';
import { createCar } from './car.js';
import { createWorld } from './world.js';

export const SCREEN_MENU = 'menu';
export const SCREEN_PLAYING = 'playing';
export const SCREEN_COMPLETE = 'complete';
export const SCREEN_FAILED = 'failed';
export const SCREEN_PAUSED = 'paused';

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; }
}
function saveBest(best) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* private mode */ }
}

export function createGame(scene, audio) {
  const car = createCar();
  scene.add(car.mesh);
  let world = null;
  let levelIndex = 0;
  let screen = SCREEN_MENU;
  let freeRoam = false;
  let timeLeft = 0, timeUsed = 0, holdT = 0, lastDamage = 0;
  let stars = 0, failReason = '', completeStats = '';
  let best = loadBest();
  let unlocked = 1;
  for (const k of Object.keys(best)) unlocked = Math.max(unlocked, Number(k) + 1);
  unlocked = Math.min(unlocked, LEVELS.length);

  function loadLevel(index, roam = false) {
    levelIndex = index;
    freeRoam = roam;
    const level = LEVELS[index];
    if (world) {
      // Remove the old world's meshes (the lot is rebuilt per level).
      for (let i = scene.children.length - 1; i >= 0; i -= 1) {
        const child = scene.children[i];
        if (child !== car.mesh && child.type !== 'HemisphereLight' && child.type !== 'DirectionalLight') scene.remove(child);
      }
    }
    world = createWorld(scene, level);
    car.reset(level.start);
    timeLeft = level.time;
    timeUsed = 0;
    holdT = 0;
    lastDamage = 0;
    stars = 0;
    failReason = '';
    screen = SCREEN_PLAYING;
  }
  function toMenu() {
    if (!world) loadLevel(0);
    // Park the car at the entrance for the menu backdrop.
    car.reset(LEVELS[0].start);
    screen = SCREEN_MENU;
  }
  function togglePause() {
    if (screen === SCREEN_PLAYING) screen = SCREEN_PAUSED;
    else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAYING;
  }
  function starsFor(level, used, damage) {
    if (used <= level.par && damage < 5) return 3;
    if (used <= level.par * 1.6 && damage < 40) return 2;
    return 1;
  }
  function parkCheck() {
    if (freeRoam || !world) return null;
    const level = LEVELS[levelIndex];
    const bay = world.target;
    const dx = car.state.x - bay.x, dz = car.state.z - bay.z;
    const fx = Math.sin(bay.heading), fz = Math.cos(bay.heading);
    const rx = Math.cos(bay.heading), rz = -Math.sin(bay.heading);
    const along = dx * fx + dz * fz;
    const across = dx * rx + dz * rz;
    const alongTol = BAY.length / 2 - CAR.length / 2 + 0.3;
    const acrossTol = BAY.width / 2 - CAR.width / 2 + 0.25;
    const inside = Math.abs(along) <= alongTol && Math.abs(across) <= acrossTol;
    const headingOk = Math.abs(angDiff(car.state.heading, bay.heading)) < PARK.headingTol;
    const slow = Math.hypot(car.state.velX, car.state.velZ) < PARK.speedTol;
    return { inside, headingOk, slow, parked: inside && headingOk && slow };
  }
  function stepSim(dt, drive) {
    if (screen !== SCREEN_PLAYING) return;
    if (drive) car.step(dt, drive, world.colliders);
    const level = LEVELS[levelIndex];
    timeUsed += dt;
    if (!freeRoam) timeLeft -= dt;
    // Crash feedback on fresh damage.
    if (car.state.damage > lastDamage + 0.5) {
      audio.crash(car.state.damage - lastDamage > 6);
      lastDamage = car.state.damage;
    }
    audio.engine(car.state.speed, drive ? drive.throttle : 0);
    audio.skid(car.state.skid);
    if (!freeRoam) {
      if (car.state.damage >= DAMAGE.failAt) return fail('Too much damage — the car is wrecked.');
      if (timeLeft <= 0) return fail('Out of time.');
      const check = parkCheck();
      if (check && check.parked) {
        holdT += dt;
        if (holdT >= PARK.holdSeconds) return complete();
      } else holdT = 0;
    }
    void level;
  }
  function complete() {
    const level = LEVELS[levelIndex];
    stars = starsFor(level, timeUsed, car.state.damage);
    const key = String(levelIndex);
    if (!best[key] || best[key] < stars) { best[key] = stars; saveBest(best); }
    unlocked = Math.min(LEVELS.length, Math.max(unlocked, levelIndex + 2));
    completeStats = `Time ${timeUsed.toFixed(1)}s (par ${level.par}s) · Damage ${Math.round(car.state.damage)}%`;
    audio.success();
    audio.engine(0, 0);
    screen = SCREEN_COMPLETE;
  }
  function fail(reason) {
    failReason = reason;
    audio.fail();
    audio.engine(0, 0);
    screen = SCREEN_FAILED;
  }
  function resetCar() {
    if (screen !== SCREEN_PLAYING) return;
    car.reset(LEVELS[levelIndex].start);
    holdT = 0;
  }
  return {
    car, get world() { return world; },
    get screen() { return screen; },
    get levelIndex() { return levelIndex; },
    get freeRoam() { return freeRoam; },
    get timeLeft() { return Math.max(0, timeLeft); },
    get timeUsed() { return timeUsed; },
    get holdT() { return holdT; },
    get stars() { return stars; },
    get failReason() { return failReason; },
    get completeStats() { return completeStats; },
    get best() { return best; },
    get unlocked() { return unlocked; },
    get level() { return LEVELS[levelIndex]; },
    loadLevel, toMenu, togglePause, stepSim, resetCar, parkCheck,
    setScreen(s) { screen = s; },
  };
}
