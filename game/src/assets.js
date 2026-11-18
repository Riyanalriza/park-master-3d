// Blender-built assets (car.glb, towers.glb, facades.glb, props.glb) loaded
// once at boot. The GLBs are original models built for this game in Blender;
// nothing in them is copied from any other game.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.min.js';

const loader = new GLTFLoader();
let cache = null;

export async function loadAssets() {
  if (cache) return cache;
  const [car, towers, facades, props] = await Promise.all([
    loader.loadAsync('./assets/car.glb'),
    loader.loadAsync('./assets/towers.glb'),
    loader.loadAsync('./assets/facades.glb'),
    loader.loadAsync('./assets/props.glb'),
  ]);
  cache = { car: car.scene, towers: towers.scene, facades: facades.scene, props: props.scene };
  return cache;
}

/** Find a named child group under an asset root (throws when missing). */
export function findGroup(root, name) {
  let found = null;
  root.traverse((o) => { if (o.name === name) found = o; });
  if (!found) throw new Error(`asset group ${name} not found`);
  return found;
}

function need() {
  if (!cache) throw new Error('assets not loaded yet — call loadAssets() first');
  return cache;
}

export function carTemplate() { return need().car; }
export function towerTemplate() { return need().towers; }
export function facadeTemplate() { return need().facades; }
export function propTemplate() { return need().props; }
