// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh level with a scripted driver (pure pursuit to a
// waypoint path, speed control by distance), so the frame is what a short
// game really looks like and the same seed always gives the same frame.
import { STEP } from './config.js';

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Drive the car toward a list of waypoints, ending parked in the target bay. */
function autopilot(game, dt) {
  const car = game.car.state;
  const bay = game.world.target;
  const waypoints = [
    { x: -16, z: 0 },
    { x: bay.x, z: -10 },
    { x: bay.x, z: bay.z + 6 },
    { x: bay.x, z: bay.z },
  ];
  let wp = 0;
  let parked = false;
  const drive = { throttle: 0, steer: 0, handbrake: false };
  return () => {
    if (parked) return { throttle: 0, steer: 0, handbrake: false };
    const target = waypoints[wp];
    const dx = target.x - car.x, dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    const final = wp === waypoints.length - 1;
    if (dist < (final ? 0.9 : 2.4) && wp < waypoints.length - 1) wp += 1;
    const want = final ? bay.heading : Math.atan2(dx, dz);
    const err = angDiff(want, car.heading);
    drive.steer = clamp(2.4 * err, -1, 1);
    if (final) {
      // Final approach: creep in straight, then stop dead in the bay.
      const wantSpeed = clamp(dist * 1.1, 0, 2.2);
      if (dist < 0.35 && Math.abs(car.speed) < 0.35) {
        drive.throttle = 0;
        parked = true;
        return drive;
      }
      drive.throttle = car.speed < wantSpeed ? 0.7 : (car.speed > wantSpeed + 0.4 ? -0.8 : 0);
      if (Math.abs(err) > 0.5 && car.speed > 1.5) drive.throttle = 0;
    } else {
      const wantSpeed = Math.min(7, 1.5 + dist * 0.9);
      drive.throttle = car.speed < wantSpeed ? 1 : (car.speed > wantSpeed + 1 ? -0.7 : 0);
      if (Math.abs(err) > 1.0 && car.speed > 2.5) drive.throttle = 0;
    }
    return drive;
  };
}

/**
 * Set `game` to the named scene (start, play or end; any other name is start)
 * and return the overlay to show over it.
 */
export function stageShot(name, game) {
  if (name !== 'play' && name !== 'end') {
    game.toMenu();
    return 'menu';
  }
  game.loadLevel(0);
  const drive = autopilot(game, STEP);
  const limit = name === 'end' ? 150 : 8;
  for (let t = 0; t < limit; t += STEP) {
    game.stepSim(STEP, drive());
    if (game.screen !== 'playing') break;
  }
  if (name === 'end') return game.screen === 'complete' ? 'complete' : 'playing';
  return game.screen === 'complete' ? 'complete' : 'playing';
}
