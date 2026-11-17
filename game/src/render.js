// Rendering: Three.js scene, chase/near/top cameras, dusk lighting, the 2D
// minimap and every HUD element (timer, speed, damage, banners, overlays).
import * as THREE from 'three';
import { BAY, LEVELS, LOT, PARK, ROWS, bayCenter } from './config.js';

const CAM_MODES = ['chase', 'near', 'top'];

export function createView(canvas, mapCanvas, scene, game, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene.fog = new THREE.Fog(0x1a1e2a, 70, 260);

  const hemi = new THREE.HemisphereLight(0x8a7fd0, 0x2a2118, 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0.7);
  moon.position.set(30, 55, 25);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -60; moon.shadow.camera.right = 60;
  moon.shadow.camera.top = 45; moon.shadow.camera.bottom = -45;
  moon.shadow.camera.far = 160;
  scene.add(moon);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 700);
  camera.position.set(-48, 10, 18);
  camera.lookAt(0, 0, 0);
  let camMode = 0;
  const camPos = new THREE.Vector3(-48, 10, 18);
  const camLook = new THREE.Vector3(0, 0, 0);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const $ = (id) => document.getElementById(id);
  const els = {
    topbar: $('topbar'), timer: $('timer'), speed: $('speed'), dmgFill: $('dmgFill'),
    banner: $('banner'), hint: $('hint'), menu: $('menu'), complete: $('complete'),
    failed: $('failed'), pause: $('pause'), levelGrid: $('levelGrid'),
    completeStars: $('completeStars'), completeStats: $('completeStats'),
    completeTitle: $('completeTitle'), failReason: $('failReason'), failTitle: $('failTitle'),
  };
  const mapCtx = mapCanvas.getContext('2d');

  function fmtTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  }
  function starRow(n) {
    let s = '';
    for (let i = 0; i < 3; i += 1) s += i < n ? '★' : '<span class="off">★</span>';
    return s;
  }
  function buildMenu() {
    els.levelGrid.innerHTML = '';
    for (let i = 0; i < LEVELS.length; i += 1) {
      const b = document.createElement('button');
      const locked = i >= game.unlocked;
      b.className = locked ? 'locked' : '';
      const stars = game.best[String(i)] || 0;
      b.innerHTML = `${i + 1}<span class="st">${locked ? '🔒' : '★'.repeat(stars) + '☆'.repeat(3 - stars)}</span>`;
      if (!locked) b.addEventListener('click', () => ui.onLevel(i));
      els.levelGrid.appendChild(b);
    }
  }
  function showOverlay(name) {
    for (const [key, el] of [['menu', els.menu], ['complete', els.complete], ['failed', els.failed], ['pause', els.pause]]) {
      el.classList.toggle('hidden', key !== name);
    }
    if (name === 'menu') buildMenu();
    if (name === 'complete') {
      els.completeTitle.textContent = `LEVEL ${game.levelIndex + 1} COMPLETE`;
      els.completeStars.innerHTML = starRow(game.stars);
      els.completeStats.textContent = game.completeStats;
      $('nextBtn').style.display = game.levelIndex + 1 < LEVELS.length ? '' : 'none';
    }
    if (name === 'failed') {
      els.failTitle.textContent = `LEVEL ${game.levelIndex + 1} FAILED`;
      els.failReason.textContent = game.failReason;
    }
  }
  function updateCamera(dt) {
    // The menu shows a fixed high overview of the lot; gameplay uses the chase cams.
    if (game.screen === 'menu') {
      camera.up.set(0, 1, 0);
      camPos.set(-34, 26, 34);
      camLook.set(4, 0, -6);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      return;
    }
    const car = game.car.state;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const mode = CAM_MODES[camMode];
    let px, py, pz, lx, ly, lz;
    if (mode === 'top') {
      px = car.x; py = 30; pz = car.z + 0.01;
      lx = car.x; ly = 0; lz = car.z;
      camera.up.set(0, 0, -1);
    } else if (mode === 'near') {
      px = car.x - fx * 6.2; py = 2.3; pz = car.z - fz * 6.2;
      lx = car.x + fx * 7; ly = 1; lz = car.z + fz * 7;
      camera.up.set(0, 1, 0);
    } else {
      px = car.x - fx * 10; py = 4.6; pz = car.z - fz * 10;
      lx = car.x + fx * 5; ly = 1.1; lz = car.z + fz * 5;
      camera.up.set(0, 1, 0);
    }
    const k = 1 - Math.exp(-6 * dt);
    camPos.x += (px - camPos.x) * k;
    camPos.y += (py - camPos.y) * k;
    camPos.z += (pz - camPos.z) * k;
    camLook.x += (lx - camLook.x) * k;
    camLook.y += (ly - camLook.y) * k;
    camLook.z += (lz - camLook.z) * k;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }
  function drawMinimap() {
    const W = mapCanvas.width, H = mapCanvas.height;
    const sx = W / 96, sy = H / 66;
    const X = (x) => (x + 48) * sx, Z = (z) => (z + 33) * sy;
    mapCtx.fillStyle = '#141821';
    mapCtx.fillRect(0, 0, W, H);
    mapCtx.strokeStyle = '#4a5060';
    mapCtx.lineWidth = 2.2;
    mapCtx.strokeRect(X(LOT.x0), Z(LOT.z0), (LOT.x1 - LOT.x0) * sx, (LOT.z1 - LOT.z0) * sy);
    // Bays: filled so they read as rectangles, not just outlines.
    const bayRect = (x, z, heading) => {
      mapCtx.save();
      mapCtx.translate(X(x), Z(z));
      mapCtx.rotate(-heading + Math.PI);
      mapCtx.fillStyle = 'rgba(232,232,232,0.22)';
      mapCtx.fillRect((-BAY.width / 2) * sx, (-BAY.length / 2) * sy, BAY.width * sx, BAY.length * sy);
      mapCtx.strokeStyle = 'rgba(232,232,232,0.75)';
      mapCtx.lineWidth = 1.7;
      mapCtx.strokeRect((-BAY.width / 2) * sx, (-BAY.length / 2) * sy, BAY.width * sx, BAY.length * sy);
      mapCtx.restore();
    };
    for (const row of ['north', 'south']) {
      for (const x of ROWS[row].xs) bayRect(x, ROWS[row].z, ROWS[row].heading);
    }
    for (const z of ROWS.west.zs) bayRect(ROWS.west.x, z, ROWS.west.heading);
    // Parked cars and cones, big enough to read at a glance.
    const level = game.level;
    mapCtx.fillStyle = '#9aa3b8';
    for (const key of level.parked || []) {
      const [row, idx] = key.split(':');
      const b = bayCenter(row, Number(idx));
      mapCtx.save();
      mapCtx.translate(X(b.x), Z(b.z));
      mapCtx.rotate(-b.heading + Math.PI);
      mapCtx.fillRect(-4, -7, 8, 14);
      mapCtx.restore();
    }
    mapCtx.fillStyle = '#ff6a1f';
    for (const c of level.cones || []) {
      mapCtx.beginPath(); mapCtx.arc(X(c.x), Z(c.z), 4, 0, Math.PI * 2); mapCtx.fill();
    }
    // Target bay: bright fill with a glowing border.
    if (game.world && !game.freeRoam) {
      const t = game.world.target;
      mapCtx.save();
      mapCtx.translate(X(t.x), Z(t.z));
      mapCtx.rotate(-t.heading + Math.PI);
      mapCtx.fillStyle = 'rgba(55,224,138,0.85)';
      mapCtx.fillRect((-BAY.width / 2) * sx, (-BAY.length / 2) * sy, BAY.width * sx, BAY.length * sy);
      mapCtx.strokeStyle = '#8affc1';
      mapCtx.lineWidth = 2.8;
      mapCtx.strokeRect((-BAY.width / 2) * sx, (-BAY.length / 2) * sy, BAY.width * sx, BAY.length * sy);
      mapCtx.restore();
    }
    // Player car as a big arrow with a white outline. Canvas y is down
    // (= world +z), so a triangle drawn pointing up (-y) needs
    // rotate(PI - heading) to face the car.
    const car = game.car.state;
    mapCtx.save();
    mapCtx.translate(X(car.x), Z(car.z));
    mapCtx.rotate(Math.PI - car.heading);
    mapCtx.beginPath();
    mapCtx.moveTo(0, -11); mapCtx.lineTo(8, 9); mapCtx.lineTo(-8, 9); mapCtx.closePath();
    mapCtx.fillStyle = '#ffb340';
    mapCtx.fill();
    mapCtx.strokeStyle = '#ffffff';
    mapCtx.lineWidth = 1.7;
    mapCtx.stroke();
    mapCtx.restore();
  }
  function updateHUD() {
    const car = game.car.state;
    if (game.screen === 'playing') {
      const level = game.level;
      els.topbar.innerHTML = `LEVEL ${game.levelIndex + 1} — ${level.name}<small>${game.freeRoam ? 'Free roam' : level.hint}</small>`;
      els.timer.textContent = game.freeRoam ? '∞' : fmtTime(game.timeLeft);
      els.timer.classList.toggle('low', !game.freeRoam && game.timeLeft < 15);
      const kmh = Math.round(Math.abs(car.speed) * 3.6);
      const gear = car.speed > 0.2 ? 'D' : car.speed < -0.2 ? 'R' : 'N';
      els.speed.innerHTML = `${kmh}<small> km/h</small><span class="gear">${gear}</span>`;
      els.dmgFill.style.width = `${Math.round(car.damage)}%`;
      // Banner: parking progress and guidance.
      const check = game.freeRoam ? null : game.parkCheck();
      let banner = '', sub = '';
      if (game.freeRoam) { banner = ''; }
      else if (game.holdT > 0) { banner = `PARKING… ${Math.round((game.holdT / PARK.holdSeconds) * 100)}%`; sub = 'Hold still!'; }
      else if (check && check.inside && !check.headingOk) { banner = 'WRONG WAY'; sub = 'Face the bay arrow'; }
      else if (check && check.inside && check.headingOk && !check.slow) { banner = 'STOP THE CAR'; sub = 'Come to a full stop in the bay'; }
      else if (check && check.inside) { banner = ''; }
      if (banner) {
        els.banner.innerHTML = `${banner}<small>${sub}</small>`;
        els.banner.style.display = 'block';
      } else els.banner.style.display = 'none';
      els.hint.textContent = 'WASD drive · Space handbrake · C camera · R reset · P pause';
    } else {
      els.banner.style.display = 'none';
      els.hint.textContent = '';
      if (game.screen === 'menu') {
        els.topbar.textContent = '';
        els.timer.textContent = '';
        els.speed.textContent = '';
      }
    }
    drawMinimap();
  }
  function setDark(dark) {
    hemi.intensity = dark ? 0.3 : 0.55;
    moon.intensity = dark ? 0.4 : 0.7;
    renderer.toneMappingExposure = dark ? 0.9 : 1.05;
  }
  // Wire the overlay buttons once.
  $('freeRoamBtn').addEventListener('click', () => ui.onFreeRoam());
  $('nextBtn').addEventListener('click', () => ui.onNext());
  $('replayBtn').addEventListener('click', () => ui.onReplay());
  $('completeMenuBtn').addEventListener('click', () => ui.onMenu());
  $('retryBtn').addEventListener('click', () => ui.onRetry());
  $('failMenuBtn').addEventListener('click', () => ui.onMenu());
  $('resumeBtn').addEventListener('click', () => ui.onResume());
  $('pauseMenuBtn').addEventListener('click', () => ui.onMenu());

  return {
    scene, renderer, camera,
    nextCamera() { camMode = (camMode + 1) % CAM_MODES.length; },
    setDark,
    showOverlay, buildMenu, updateHUD,
    render(dt, t) {
      if (game.world) game.world.update(t);
      updateCamera(dt);
      updateHUD();
      renderer.render(scene, camera);
    },
  };
}
