// Park Master 3D — every tuning number, colour and level in one place.
// The lot is a flat XZ plane: x east, z south, heading 0 faces +z (south),
// forward = (sin(heading), cos(heading)). Y is up.

export const STEP = 1 / 60;

export const LOT = { x0: -45, x1: 45, z0: -30, z1: 30 };
export const BAY = { width: 2.8, length: 5.6 };

// North row (nose-in facing north, heading PI) and south row (nose-in facing
// south, heading 0). West row is diagonal, facing north-west (heading 5PI/4).
export const ROWS = {
  north: { z: -24, heading: Math.PI, xs: [-36, -30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30, 36] },
  south: { z: 24, heading: 0, xs: [-36, -30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30, 36] },
  west: { x: -40, heading: (5 * Math.PI) / 4, zs: [-8, 2, 12] },
};

export function bayCenter(row, index) {
  if (row === 'west') return { x: ROWS.west.x, z: ROWS.west.zs[index], heading: ROWS.west.heading };
  const r = ROWS[row];
  return { x: r.xs[index], z: r.z, heading: r.heading };
}

export const CAR = {
  length: 4.4, width: 1.9, wheelBase: 2.7, radius: 1.15,
  accel: 9.5, brake: 16, reverseAccel: 6.5, drag: 0.55, rollDrag: 1.1,
  maxSpeed: 15, maxReverse: 6.5, steerMax: 0.55, steerSpeed: 3.2,
  grip: 8.5, driftGrip: 2.2, handbrakeTurn: 1.6,
};

export const PARK = { posMargin: 0.45, headingTol: 0.21, speedTol: 0.4, holdSeconds: 1.0 };
export const DAMAGE = { failAt: 100, coneHit: 4, scrapePerMs: 6, hardHit: 18 };

// Levels: start pose, target bay (row + index), reverse-in flag, extra cones,
// parked bays (row:index), time limit and par time in seconds.
export const LEVELS = [
  { name: 'First Bay', start: { x: -40, z: 0, heading: Math.PI / 2 }, target: { row: 'north', index: 4, reverse: false }, cones: [], parked: [], time: 90, par: 35, hint: 'Drive up the lane and park in the glowing bay.' },
  { name: 'Turn In', start: { x: -40, z: 0, heading: Math.PI / 2 }, target: { row: 'south', index: 7, reverse: false }, cones: [], parked: [], time: 90, par: 40, hint: 'Swing right into the south row and park nose-in.' },
  { name: 'Reverse In', start: { x: -38, z: -14, heading: Math.PI / 2 }, target: { row: 'north', index: 8, reverse: true }, cones: [], parked: [], time: 120, par: 55, hint: 'Back into the bay — your nose must point out.' },
  { name: 'Tight Spot', start: { x: -40, z: 0, heading: Math.PI / 2 }, target: { row: 'north', index: 6, reverse: false }, cones: [], parked: ['north:5', 'north:7'], time: 120, par: 60, hint: 'Thread between the two parked cars. Slow is smooth.' },
  { name: 'Slalom', start: { x: -40, z: 0, heading: Math.PI / 2 }, target: { row: 'south', index: 3, reverse: false }, cones: [{ x: -24, z: -4 }, { x: -16, z: 4 }, { x: -8, z: -4 }, { x: 0, z: 4 }], parked: [], time: 120, par: 65, hint: 'Weave the cones, then park. Cones cost damage.' },
  { name: 'Night Shift', start: { x: 40, z: 0, heading: -Math.PI / 2 }, target: { row: 'north', index: 10, reverse: false }, cones: [], parked: ['north:9', 'north:11', 'south:10'], time: 120, par: 60, hint: 'Late night, tight row. Headlights on, eyes open.', dark: true },
  { name: 'Angle Bay', start: { x: -30, z: 14, heading: -Math.PI / 2 }, target: { row: 'west', index: 1, reverse: false }, cones: [{ x: -34, z: 8 }], parked: ['west:0'], time: 120, par: 60, hint: 'A diagonal bay — match its angle, not the lot.' },
  { name: 'Double Turn', start: { x: -40, z: 0, heading: Math.PI / 2 }, target: { row: 'north', index: 12, reverse: false }, cones: [], parked: [], barriers: [{ x: 0, z: 0, w: 14, d: 4 }, { x: 20, z: -10, w: 4, d: 12 }], time: 150, par: 75, hint: 'Concrete blocks the lane — go around, then park.' },
  { name: 'Rush Hour', start: { x: -40, z: 0, heading: Math.PI / 2 }, target: { row: 'south', index: 5, reverse: false }, cones: [{ x: -14, z: 8 }, { x: -6, z: 8 }], parked: ['south:4', 'south:6', 'north:5', 'north:6', 'south:3'], time: 150, par: 80, hint: 'The lot is full. One bay is yours — take it gently.' },
  { name: 'Master Park', start: { x: -38, z: -14, heading: Math.PI / 2 }, target: { row: 'north', index: 2, reverse: true }, cones: [{ x: -30, z: -10 }], parked: ['north:1', 'north:3', 'south:2'], time: 150, par: 85, hint: 'Reverse into a tight bay between two cars. The master test.' },
];

export const PALETTE = {
  asphalt: 0x23262e, asphaltLine: 0x3a3f4a, bayLine: 0xe8e8e8, targetGlow: 0x37e08a,
  curb: 0x4a4f5a, building: 0x2c3140, buildingTop: 0x3a4054, lampGlow: 0xffb340,
  skyTop: 0x1b2340, skyBottom: 0x3a2a4a, fog: 0x1a1e2a,
  carBody: 0xff5a3c, carGlass: 0x1c2733, carTrim: 0x222222,
  cone: 0xff6a1f, coneStripe: 0xf2f2f2, barrier: 0xd8b13a,
  parkedColors: [0x4f7ec2, 0xc2a24f, 0x6fc24f, 0xb04fc2, 0x9aa3b0, 0xc25a4f],
};

export const BEST_KEY = 'park-master-3d.best';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
