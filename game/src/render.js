// Rendering: Three.js scene, chase/near/top cameras, golden-hour lighting,
// the 2D minimap and every HUD element (timer, speed, damage, banners, overlays).
import * as THREE from 'three';
import { BAY, LEVELS, LOT, PARK, ROWS, bayCenter } from './config.js';

const CAM_MODES = ['chase', 'near', 'top'];

export function createView(canvas, mapCanvas, scene, game, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  // Pass #10: PCFSoft ignores shadow.radius, so the south building's
  // shadow edge stayed a hard straight line no matter how much fill
  // light was added. PCFShadowMap honours radius: 5 blurs the edge by
  // ~0.3 m at this frustum, softening the roofline without washing the
  // shadow out.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  // Warm haze fog: the colour matches the far-ground disc rim (world.js)
  // and the sky at the horizon, so distant ground fades into the sky
  // instead of ending in a visible band. (Pass #10: was 0xd9c4a3, a
  // cooler grey that read as a separate strip against the warm sky.)
  scene.fog = new THREE.Fog(0xeaa671, 90, 320);

  // Golden-hour sun: bright blue sky above, warm ground bounce below.
  // The light comes from the south-east, high: the chase camera looks
  // north, so the walls it sees are sunlit instead of in shade (the old
  // north-west light left every camera-facing wall near-black).
  // Pass #8: the south building's shadow read as a hard-edged dark blue
  // slab from the top camera — the shadowed ground only got the cool
  // hemisphere sky light. The hemisphere is now stronger with a warmer,
  // lighter ground bounce, and the sun slightly dimmer, so shadows read
  // as soft warm shade instead of a blue panel. Pass #9: the shadow's
  // straight top edge still showed, so the hemisphere and the warm fill
  // are stronger still — the shadow is now much closer to the lit ground,
  // so its edge barely reads as a line.
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0xa8906f, 1.6);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xffd9a0, 2.0);
  moon.position.set(30, 80, 80);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  // Pass #11: the roofline still read faintly as a straight line, so
  // the blur radius goes 5 -> 8 (~0.5 m on this frustum).
  moon.shadow.radius = 8;
  moon.shadow.camera.left = -60; moon.shadow.camera.right = 60;
  moon.shadow.camera.top = 45; moon.shadow.camera.bottom = -45;
  moon.shadow.camera.far = 160;
  scene.add(moon);
  // Warm fill from the north-west, opposite the sun, no shadows: it
  // lifts every shadowed surface (including the south building's long
  // shadow on the lot) so the shadow reads as shade, not a dark panel.
  const fill = new THREE.DirectionalLight(0xffe0b8, 0.72);
  fill.position.set(-40, 60, -60);
  scene.add(fill);

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
      // Low rear chase view, CPM2-style: close behind the car, low enough
      // that the sedan's roofline and the city fill the frame.
      px = car.x - fx * 11; py = 3.6; pz = car.z - fz * 11;
      lx = car.x + fx * 5; ly = 1.2; lz = car.z + fz * 5;
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
  // Minimap: light day-map style so it matches the bright city.
  function drawMinimap() {
    const W = mapCanvas.width, H = mapCanvas.height;
    const sx = W / 96, sy = H / 66;
    const X = (x) => (x + 48) * sx, Z = (z) => (z + 33) * sy;
    mapCtx.fillStyle = '#d8d2c4';
    mapCtx.fillRect(0, 0, W, H);
    mapCtx.strokeStyle = '#6a6558';
    mapCtx.lineWidth = 2.2;
    mapCtx.strokeRect(X(LOT.x0), Z(LOT.z0), (LOT.x1 - LOT.x0) * sx, (LOT.z1 - LOT.z0) * sy);
    // Bays: filled so they read as rectangles, not just outlines.
    const bayRect = (x, z, heading) => {
      mapCtx.save();
      mapCtx.translate(X(x), Z(z));
      mapCtx.rotate(-heading + Math.PI);
      mapCtx.fillStyle = 'rgba(90,90,90,0.18)';
      mapCtx.fillRect((-BAY.width / 2) * sx, (-BAY.length / 2) * sy, BAY.width * sx, BAY.length * sy);
      mapCtx.strokeStyle = 'rgba(90,90,90,0.7)';
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
    mapCtx.fillStyle = '#7a7568';
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
    mapCtx.strokeStyle = '#3a3428';
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
      // CPM2-style gear selector: P R N D with the active gear lit.
      const gears = ['P', 'R', 'N', 'D'].map((g) => `<span class="${g === gear ? 'on' : ''}">${g}</span>`).join('');
      els.speed.innerHTML = `${kmh}<small> km/h</small><span class="gears">${gears}</span>`;
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
    hemi.intensity = dark ? 0.7 : 1.45;
    moon.intensity = dark ? 1.2 : 2.0;
    fill.intensity = dark ? 0.3 : 0.55;
    renderer.toneMappingExposure = dark ? 1.0 : 1.15;
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
