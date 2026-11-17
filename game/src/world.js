// The parking lot: dusk sky, asphalt with painted bays, perimeter buildings,
// lamps, cones, parked cars, barriers and the glowing target bay. Also builds
// the collision lists the car physics reads.
import * as THREE from 'three';
import { BAY, LOT, PALETTE, ROWS, bayCenter } from './config.js';
import { createRandom } from './random.js';
import { makeCarMesh } from './car.js';
import { findGroup, propTemplate, towerTemplate, facadeTemplate } from './assets.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function groundTexture(rng) {
  return canvasTexture(1024, 704, (g, W, H) => {
    const px = (x) => ((x + 48) / 96) * W;
    const pz = (z) => ((z + 33) / 66) * H;
    const sx = W / 96, sz = H / 66;
    g.fillStyle = '#23262e';
    g.fillRect(0, 0, W, H);
    // Asphalt speckle and stains.
    for (let i = 0; i < 5200; i += 1) {
      g.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.10)';
      g.fillRect(rng() * W, rng() * H, 2, 2);
    }
    for (let i = 0; i < 14; i += 1) {
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath();
      g.ellipse(rng() * W, rng() * H, 18 + rng() * 30, 10 + rng() * 16, rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Lane dashes down the middle and along the driving lanes.
    g.strokeStyle = '#c8a23a';
    g.lineWidth = 3;
    g.setLineDash([18, 16]);
    for (const z of [-12, 0, 12]) {
      g.beginPath(); g.moveTo(px(LOT.x0), pz(z)); g.lineTo(px(LOT.x1), pz(z)); g.stroke();
    }
    g.setLineDash([]);
    // Bay outlines: white lines, north and south rows axis-aligned, west diagonal.
    g.strokeStyle = '#e8e8e8';
    g.lineWidth = 3;
    const bayRect = (x, z, heading) => {
      g.save();
      g.translate(px(x), pz(z));
      g.rotate(-heading + Math.PI); // canvas y is down, world z is down: heading maps directly
      g.strokeRect((-BAY.width / 2) * sx, (-BAY.length / 2) * sz, BAY.width * sx, BAY.length * sz);
      g.restore();
    };
    for (const row of ['north', 'south']) {
      const r = ROWS[row];
      for (const x of r.xs) bayRect(x, r.z, r.heading);
    }
    for (const z of ROWS.west.zs) bayRect(ROWS.west.x, z, ROWS.west.heading);
    // Entrance arrows near the west gate.
    g.fillStyle = 'rgba(232,232,232,0.75)';
    for (const z of [-6, 6]) {
      g.save();
      g.translate(px(-42), pz(z));
      g.beginPath();
      g.moveTo(10, 0); g.lineTo(-8, -9); g.lineTo(-8, 9); g.closePath();
      g.fill();
      g.restore();
    }
  });
}

function stripeTexture() {
  return canvasTexture(128, 32, (g, W, H) => {
    g.fillStyle = '#d8b13a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#191919';
    for (let x = -H; x < W; x += 32) {
      g.beginPath();
      g.moveTo(x, H); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, H);
      g.closePath(); g.fill();
    }
  });
}

export function createWorld(scene, level) {
  const rng = createRandom(1337);
  const colliders = { aabbs: [], circles: [] };
  const disposables = [];

  // Dusk sky dome: a deeper gradient, plus a moon, stars and a far skyline.
  const skyTex = canvasTexture(4, 256, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0a0f24');
    grad.addColorStop(0.4, '#20204a');
    grad.addColorStop(0.62, '#3d2a52');
    grad.addColorStop(0.8, '#6e3850');
    grad.addColorStop(1, '#a85a40');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Moon with crater shading and a soft halo, high over the north lot, in
  // view of the chase cam. The disc is a canvas texture (maria blotches and
  // small craters), not a flat white circle; the halo is a radial gradient
  // that fades into the sky instead of a hard-edged disc.
  const moonTex = canvasTexture(256, 256, (g, W, H) => {
    const grad = g.createRadialGradient(112, 108, 16, 128, 128, 124);
    grad.addColorStop(0, '#fdf8e7');
    grad.addColorStop(0.7, '#f0e5c3');
    grad.addColorStop(0.9, '#dccfa6');
    grad.addColorStop(1, 'rgba(220,207,166,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // Maria: soft darker blotches.
    g.fillStyle = 'rgba(148,138,112,0.38)';
    for (const [x, y, rx, ry, a] of [[96, 96, 34, 26, 0.4], [156, 146, 28, 34, 0.5], [120, 172, 22, 16, 0.3], [166, 86, 16, 14, 0.6]]) {
      g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill();
    }
    // Craters: dark pit with a light rim on the lit side.
    for (const [x, y, r] of [[86, 140, 7], [150, 106, 5], [110, 70, 6], [176, 160, 4], [70, 100, 4]]) {
      g.fillStyle = 'rgba(118,108,84,0.45)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,250,230,0.5)';
      g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.5, 0, Math.PI * 2); g.fill();
    }
  });
  const haloTex = canvasTexture(256, 256, (g, W, H) => {
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(210,222,255,0.5)');
    grad.addColorStop(0.4, 'rgba(200,212,255,0.18)');
    grad.addColorStop(1, 'rgba(200,212,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  });
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(10, 32),
    new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false }),
  );
  moonDisc.position.set(-45, 55, -260);
  moonDisc.lookAt(0, 0, 0);
  const moonHalo = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0.55, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  moonHalo.position.copy(moonDisc.position).multiplyScalar(0.995);
  moonHalo.lookAt(0, 0, 0);
  scene.add(moonDisc, moonHalo);

  // Stars on the upper hemisphere.
  const starCount = 320;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const a = rng() * Math.PI * 2;
    const y = 0.18 + rng() * 0.8;
    const r = Math.sqrt(1 - y * y) * 300;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = y * 300;
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false }));
  scene.add(stars);

  // A wide dark ground disc so the horizon has ground under it, then the
  // distant skyline silhouettes ringing the lot on it — not floating in sky.
  const farGround = new THREE.Mesh(
    new THREE.CircleGeometry(320, 48),
    new THREE.MeshStandardMaterial({ color: 0x171a22, roughness: 1 }),
  );
  farGround.rotation.x = -Math.PI / 2;
  farGround.position.y = -0.05;
  scene.add(farGround);

  // Distant skyline: Blender-built towers with lit windows and rooftop
  // detail, ringing the lot — no more flat black boxes on the horizon.
  const towerVariants = ['TowerA', 'TowerB', 'TowerC'];
  const towerCanon = { TowerA: [16, 24, 12], TowerB: [22, 18, 14], TowerC: [14, 30, 12] };
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * Math.PI * 2 + rng() * 0.25;
    const r = 125 + rng() * 50;
    const w = 18 + rng() * 18, h = 10 + rng() * 16, d = 12 + rng() * 10;
    const variant = towerVariants[Math.floor(rng() * 3)];
    const canon = towerCanon[variant];
    const tower = findGroup(towerTemplate(), variant).clone(true);
    tower.scale.set(w / canon[0], h / canon[1], d / canon[2]);
    tower.position.set(Math.cos(a) * r, -1, Math.sin(a) * r);
    tower.rotation.y = rng() * Math.PI;
    scene.add(tower);
  }

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 66),
    new THREE.MeshStandardMaterial({ map: groundTexture(rng), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Perimeter buildings: Blender-built facades with real lit windows,
  // parapets and roof plant — no more flat textured boxes. The 30 m slots
  // use the FacadeWide variant (canonical 30x20x14, scale ~1.0) so their
  // windows stay dense instead of stretching 1.875x into light panels.
  const facadeCanon = { Facade: [24, 16, 12], FacadeTall: [16, 22, 10], FacadeWide: [30, 20, 14] };
  const buildings = [
    [-58, -38, 22, 16, 12], [0, -40, 30, 20, 14], [58, -38, 22, 16, 11],
    [-58, 38, 22, 16, 13], [0, 40, 30, 20, 15], [58, 38, 22, 16, 12],
    [-56, 0, 16, 22, 10], [56, 0, 16, 22, 10],
  ];
  for (const [x, z, w, h, d] of buildings) {
    const variant = w >= 30 ? 'FacadeWide' : (h > 18 ? 'FacadeTall' : 'Facade');
    const canon = facadeCanon[variant];
    const b = findGroup(facadeTemplate(), variant).clone(true);
    b.scale.set(w / canon[0], h / canon[1], d / canon[2]);
    b.position.set(x, 0, z);
    b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(b);
    colliders.aabbs.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    // A roof AC unit so the flat roofline has something on it from above.
    const ac = findGroup(propTemplate(), 'ACUnit').clone(true);
    ac.position.set(x + (rng() - 0.5) * w * 0.4, h, z + (rng() - 0.5) * d * 0.4);
    ac.rotation.y = rng() * Math.PI;
    scene.add(ac);
  }

  // Trees outside the lot, between the buildings — the lot is clamped, so
  // they never need colliders.
  const treeTemplate = findGroup(propTemplate(), 'Tree');
  for (const [x, z, s] of [[30, -40, 1.1], [-30, -40, 0.9], [30, 40, 1.0], [-30, 40, 1.2], [-52, -8, 0.85], [-52, 8, 1.05], [52, -8, 0.95], [52, 8, 1.1]]) {
    const tree = treeTemplate.clone(true);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(s);
    tree.rotation.y = rng() * Math.PI * 2;
    tree.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(tree);
  }

  // Curbs around the lot edge.
  const curbMat = new THREE.MeshStandardMaterial({ color: PALETTE.curb, roughness: 0.9 });
  for (const [x, z, w, d] of [[0, -31.2, 92, 1.2], [0, 31.2, 92, 1.2], [-46.2, 0, 1.2, 62], [46.2, 0, 1.2, 62]]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), curbMat);
    curb.position.set(x, 0.25, z);
    scene.add(curb);
  }

  // Lamps: Blender-built pole + arm + head; three real point lights, the
  // rest emissive only. Poles stand at the lot edges (z = +/-29, between
  // the bay rows and the curbs), clear of the driving lanes — and their x
  // positions fall BETWEEN bays, never on a bay centreline, so no pole
  // sits on a level's approach line in the chase camera's view.
  const lampPositions = [[-33, -29], [-9, -29], [15, -29], [33, -29], [-27, 29], [-3, 29], [21, 29]];
  const lampTemplate = findGroup(propTemplate(), 'Lamp');
  let lightCount = 0;
  for (const [x, z] of lampPositions) {
    const lamp = lampTemplate.clone(true);
    lamp.position.set(x, 0, z);
    lamp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(lamp);
    colliders.circles.push({ x, z, r: 0.25 });
    if (lightCount < 3) {
      const pl = new THREE.PointLight(0xffb340, 60, 30, 1.8);
      pl.position.set(x + 1.4, 5.6, z);
      scene.add(pl);
      lightCount += 1;
    }
  }

  // Parked cars in the bays the level names.
  const parkedMeshes = [];
  for (const key of level.parked || []) {
    const [row, idx] = key.split(':');
    const bay = bayCenter(row, Number(idx));
    const color = PALETTE.parkedColors[Math.floor(rng() * PALETTE.parkedColors.length)];
    const mesh = makeCarMesh(color);
    mesh.position.set(bay.x, 0, bay.z);
    mesh.rotation.y = bay.heading;
    scene.add(mesh);
    parkedMeshes.push(mesh);
    if (row === 'west') colliders.aabbs.push({ x0: bay.x - 1.6, x1: bay.x + 1.6, z0: bay.z - 1.6, z1: bay.z + 1.6 });
    else colliders.aabbs.push({ x0: bay.x - 1.15, x1: bay.x + 1.15, z0: bay.z - 2.5, z1: bay.z + 2.5 });
  }

  // Concrete barriers.
  const stripeTex = stripeTexture();
  for (const b of level.barriers || []) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, 1.1, b.d),
      new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.8 }),
    );
    mesh.position.set(b.x, 0.55, b.z);
    mesh.castShadow = true;
    scene.add(mesh);
    colliders.aabbs.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 });
  }

  // Cones: orange cones with a white band; a hard hit tips one over.
  const coneGroup = new THREE.Group();
  const coneMat = new THREE.MeshStandardMaterial({ color: PALETTE.cone, roughness: 0.6 });
  const bandMat = new THREE.MeshStandardMaterial({ color: PALETTE.coneStripe, roughness: 0.6 });
  const coneMeshes = [];
  for (const c of level.cones || []) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 12), coneMat);
    cone.position.y = 0.45;
    cone.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.16, 12), bandMat);
    band.position.y = 0.45;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), coneMat);
    base.position.y = 0.04;
    g.add(cone, band, base);
    g.position.set(c.x, 0, c.z);
    coneGroup.add(g);
    coneMeshes.push(g);
    colliders.circles.push({
      x: c.x, z: c.z, r: 0.3, dead: false,
      onHit() { this.dead = true; g.rotation.z = Math.PI / 2 - 0.15; g.position.y = 0.12; },
    });
  }
  scene.add(coneGroup);

  // Target bay: glowing outline + translucent fill + bobbing arrow.
  const targetBay = bayCenter(level.target.row, level.target.index);
  const targetHeading = level.target.reverse ? targetBay.heading + Math.PI : targetBay.heading;
  const target = { ...targetBay, heading: targetHeading };
  const hw = BAY.width / 2, hl = BAY.length / 2;
  const corners = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([u, v]) => {
    const s = Math.sin(targetBay.heading), c = Math.cos(targetBay.heading);
    return new THREE.Vector3(targetBay.x + u * c + v * s, 0.06, targetBay.z - u * s + v * c);
  });
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([...corners, corners[0]]),
    new THREE.LineBasicMaterial({ color: PALETTE.targetGlow }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(BAY.width, BAY.length),
    new THREE.MeshBasicMaterial({ color: PALETTE.targetGlow, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.rotation.z = -targetBay.heading;
  fill.position.set(targetBay.x, 0.05, targetBay.z);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.1, 4),
    new THREE.MeshStandardMaterial({ color: PALETTE.targetGlow, emissive: PALETTE.targetGlow, emissiveIntensity: 1.4 }),
  );
  arrow.rotation.x = Math.PI;
  arrow.position.set(targetBay.x, 3.4, targetBay.z);
  scene.add(outline, fill, arrow);

  function update(t) {
    arrow.position.y = 3.4 + Math.sin(t * 2.2) * 0.35;
    arrow.rotation.y = t * 0.8;
    fill.material.opacity = 0.18 + 0.09 * Math.sin(t * 2.2);
  }

  return { colliders, target, update, disposables };
}
