// The player car: a procedural low-poly car (body, cabin, wheels, headlights)
// and its arcade physics — a bicycle model in the XZ plane with a drift
// handbrake, circle-vs-AABB/circle collision and impact damage.
import * as THREE from 'three';
import { CAR, DAMAGE, LOT } from './config.js';

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Soft radial pool of headlight on the asphalt, drawn once. */
const poolTex = (() => {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,138,0.55)');
  grad.addColorStop(0.5, 'rgba(255,214,138,0.18)');
  grad.addColorStop(1, 'rgba(255,214,138,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

/** A simple car mesh facing +z (its nose is +z in local space). */
export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const body = box(CAR.width, 0.55, CAR.length, color, 0, 0.55, 0);
  const cabin = box(CAR.width * 0.78, 0.5, CAR.length * 0.48, 0x1c2733, 0, 1.05, -0.25);
  cabin.material = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.15, metalness: 0.7 });
  // Body-colour roof so the car reads from above, not as one dark slab.
  const roof = box(CAR.width * 0.72, 0.07, CAR.length * 0.4, color, 0, 1.33, -0.28);
  const nose = box(CAR.width * 0.94, 0.28, 0.5, 0x222222, 0, 0.42, CAR.length / 2 - 0.1);
  const spoiler = opts.spoiler ? box(CAR.width * 0.9, 0.08, 0.35, 0x222222, 0, 0.95, -CAR.length / 2 + 0.15) : null;
  // Raked windshield and rear glass.
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.08, metalness: 0.85 });
  const shield = new THREE.Mesh(new THREE.BoxGeometry(CAR.width * 0.7, 0.5, 0.05), glassMat);
  shield.position.set(0, 1.05, 0.78);
  shield.rotation.x = -0.38;
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(CAR.width * 0.7, 0.45, 0.05), glassMat);
  rearGlass.position.set(0, 1.05, -1.28);
  rearGlass.rotation.x = 0.38;
  // Bumpers and side mirrors.
  const bumperF = box(CAR.width * 0.96, 0.2, 0.18, 0x1a1a1a, 0, 0.32, CAR.length / 2 + 0.02);
  const bumperR = box(CAR.width * 0.96, 0.2, 0.18, 0x1a1a1a, 0, 0.32, -CAR.length / 2 - 0.02);
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.4 });
  const mirrors = [];
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.22), mirrorMat);
    m.position.set(s * (CAR.width / 2 + 0.1), 1.0, 0.55);
    mirrors.push(m);
  }
  g.add(body, cabin, roof, nose, shield, rearGlass, bumperF, bumperR, ...mirrors);
  if (spoiler) g.add(spoiler);
  // Headlights (emissive) and a full-width taillight bar.
  const hl = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf8a, emissiveIntensity: 1.6 });
  const tl = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0xdd2222, emissiveIntensity: 1.2 });
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.06), hl);
    h.position.set(s * 0.62, 0.62, CAR.length / 2 + 0.01);
    g.add(h);
  }
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(CAR.width * 0.9, 0.1, 0.05), tl);
  tailBar.position.set(0, 0.62, -CAR.length / 2 - 0.04);
  g.add(tailBar);
  // Headlight beams: narrow at the lamp, widening forward, plus a warm pool
  // of light on the asphalt — no more flat grey triangle from above.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.0, 6, 12, 1, true), beamMat);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(s * 0.62, 0.5, CAR.length / 2 + 3);
    g.add(beam);
  }
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(5.5, 8),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.04, CAR.length / 2 + 4.5);
  g.add(pool);
  const wheels = [];
  const pivots = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 12);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.25, metalness: 0.9 });
  for (let i = 0; i < 4; i += 1) {
    const [wx, wz] = [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]][i];
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    pivot.add(w, hub);
    g.add(pivot);
    wheels.push(w);
    pivots.push(pivot);
  }
  g.userData.wheels = wheels;
  g.userData.pivots = pivots;
  return g;
}

export function createCar() {
  const mesh = makeCarMesh(0xff5a3c, { spoiler: true });
  const state = {
    x: 0, z: 0, heading: 0, speed: 0, steer: 0,
    velX: 0, velZ: 0, damage: 0, skid: false, moving: false,
  };
  function reset(pose) {
    state.x = pose.x; state.z = pose.z; state.heading = pose.heading;
    state.speed = 0; state.steer = 0; state.velX = 0; state.velZ = 0;
    state.damage = 0; state.skid = false;
    syncMesh();
  }
  function syncMesh(dt = 0) {
    mesh.position.set(state.x, 0, state.z);
    mesh.rotation.y = state.heading;
    // Front pivots steer (yaw), every wheel spins with travel.
    mesh.userData.pivots[0].rotation.y = state.steer;
    mesh.userData.pivots[1].rotation.y = state.steer;
    for (const w of mesh.userData.wheels) w.rotation.x += (state.speed * dt) / 0.36;
  }
  /** Advance one fixed step. `drive` is {throttle -1..1, steer -1..1, handbrake}. */
  function step(dt, drive, colliders) {
    const fx = Math.sin(state.heading), fz = Math.cos(state.heading);
    // Steering eases toward the target angle; it bites harder at low speed.
    const steerTarget = drive.steer * CAR.steerMax;
    state.steer += (steerTarget - state.steer) * Math.min(1, CAR.steerSpeed * dt);
    // Longitudinal force.
    let accel = 0;
    if (drive.throttle > 0) accel = CAR.accel * drive.throttle;
    else if (drive.throttle < 0) {
      accel = state.speed > 0.5 ? -CAR.brake : CAR.reverseAccel * drive.throttle;
    }
    state.speed += accel * dt;
    state.speed -= state.speed * CAR.drag * dt + Math.sign(state.speed) * CAR.rollDrag * dt * Math.min(1, Math.abs(state.speed));
    if (Math.abs(state.speed) < 0.05 && accel === 0) state.speed = 0;
    state.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, state.speed));
    if (drive.handbrake) state.speed *= Math.max(0, 1 - 1.4 * dt);
    // Yaw from the bicycle model; the handbrake sharpens it.
    const turn = (state.speed / CAR.wheelBase) * Math.tan(state.steer) * (drive.handbrake ? CAR.handbrakeTurn : 1);
    state.heading += turn * dt;
    // Velocity: mostly along the nose, with a lateral slip that the handbrake keeps.
    const grip = drive.handbrake ? CAR.driftGrip : CAR.grip;
    const wantX = fx * state.speed, wantZ = fz * state.speed;
    state.velX += (wantX - state.velX) * Math.min(1, grip * dt);
    state.velZ += (wantZ - state.velZ) * Math.min(1, grip * dt);
    state.skid = drive.handbrake && Math.abs(state.speed) > 4;
    state.x += state.velX * dt;
    state.z += state.velZ * dt;
    state.moving = Math.abs(state.speed) > 0.2;
    collide(colliders);
    // Stay inside the lot walls.
    state.x = Math.max(LOT.x0 + 1.4, Math.min(LOT.x1 - 1.4, state.x));
    state.z = Math.max(LOT.z0 + 1.4, Math.min(LOT.z1 - 1.4, state.z));
    syncMesh(dt);
  }
  function collide(colliders) {
    const r = CAR.radius;
    for (const c of colliders.aabbs) {
      const cx = Math.max(c.x0, Math.min(state.x, c.x1));
      const cz = Math.max(c.z0, Math.min(state.z, c.z1));
      const dx = state.x - cx, dz = state.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2) || 0.001;
      const push = r - d;
      const nx = dx / d, nz = dz / d;
      state.x += nx * push; state.z += nz * push;
      const vn = state.velX * nx + state.velZ * nz;
      if (vn < 0) {
        const impact = -vn;
        state.velX -= nx * vn * 1.4; state.velZ -= nz * vn * 1.4;
        state.speed *= 0.55;
        if (impact > 1.2) state.damage = Math.min(100, state.damage + Math.min(DAMAGE.hardHit, impact * 2.2));
      }
    }
    for (const c of colliders.circles) {
      if (c.dead) continue;
      const dx = state.x - c.x, dz = state.z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.001;
      const push = rr - d;
      state.x += (dx / d) * push; state.z += (dz / d) * push;
      const vn = state.velX * (dx / d) + state.velZ * (dz / d);
      if (vn < 0) {
        const impact = -vn;
        state.velX *= 0.6; state.velZ *= 0.6; state.speed *= 0.6;
        state.damage = Math.min(100, state.damage + DAMAGE.coneHit);
        if (impact > 0.5 && c.onHit) c.onHit();
      }
    }
  }
  return { mesh, state, reset, step, syncMesh };
}
