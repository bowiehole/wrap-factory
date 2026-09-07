import * as THREE from "three";
import { OrbitControls } from "./vendor/controls/OrbitControls.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

const MODEL_IDS = [
  "cybertruck",
  "model3",
  "model3-2024-base",
  "model3-2024-performance",
  "modely",
  "modely-2025-base",
  "modely-2025-premium",
  "modely-2025-performance",
  "modely-l",
  "models-2021",
  "models-2025-plaid",
  "modelx-2021",
];

const MODEL_SET = new Set(MODEL_IDS);

const els = {
  title: document.getElementById("viewer-title"),
  meta: document.getElementById("viewer-meta"),
  status: document.getElementById("viewer-status"),
  select: document.getElementById("vehicle-select"),
  back: document.getElementById("back-link"),
  canvas: document.getElementById("viewer-canvas"),
  stage: document.querySelector(".viewer-stage"),
};

const state = {
  catalog: null,
  drop: null,
  dropPath: null,
  vehicle: "cybertruck",
  loadToken: 0,
};

const sceneState = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  root: null,
  texture: null,
  grid: null,
  animId: null,
  ready: false,
};

function setStatus(msg, isError) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("error", !!isError);
}

function modelPath(vehicleId) {
  return "./models/" + vehicleId + ".glb";
}

function parseParams() {
  const params = new URLSearchParams(window.location.search);
  const drop = (params.get("drop") || "").trim();
  let vehicle = (params.get("vehicle") || "cybertruck").trim();
  if (!vehicle) vehicle = "cybertruck";
  return { drop, vehicle };
}

function findDrop(catalog, dropPath) {
  if (!catalog || !Array.isArray(catalog.drops) || !dropPath) return null;
  const cleaned = String(dropPath).replace(/^\/+|\/+$/g, "");
  const parts = cleaned.split("/");
  // workshop/slug
  if (parts.length === 2 && parts[0] === "workshop") {
    const slug = parts[1];
    for (let i = 0; i < catalog.drops.length; i++) {
      const d = catalog.drops[i];
      if (d.kind === "workshop" && d.slug === slug) return d;
    }
    return null;
  }
  // bare workshop slug
  if (parts.length === 1) {
    const slug = parts[0];
    for (let i = 0; i < catalog.drops.length; i++) {
      const d = catalog.drops[i];
      if (d.kind === "workshop" && d.slug === slug) return d;
    }
    for (let i = 0; i < catalog.drops.length; i++) {
      const d = catalog.drops[i];
      if (d.id === cleaned || d.slug === slug) return d;
    }
    return null;
  }
  if (parts.length < 2) return null;
  const date = parts[0];
  const slug = parts.slice(1).join("/");
  for (let i = 0; i < catalog.drops.length; i++) {
    const d = catalog.drops[i];
    if (d.date === date && d.slug === slug) return d;
  }
  for (let i = 0; i < catalog.drops.length; i++) {
    const d = catalog.drops[i];
    if (d.date && d.slug && d.date + "/" + d.slug === cleaned) return d;
  }
  return null;
}

function vehicleLabel(catalog, drop, key) {
  if (drop.vehicles[key] && drop.vehicles[key].label) return drop.vehicles[key].label;
  if (catalog.vehicleLabels && catalog.vehicleLabels[key]) return catalog.vehicleLabels[key];
  return key;
}

function availableVehicles(catalog, drop) {
  const order = (catalog && catalog.vehicleOrder) || MODEL_IDS;
  const keys = [];
  const seen = new Set();
  order.forEach(function (id) {
    if (!MODEL_SET.has(id)) return;
    if (!drop.vehicles || !drop.vehicles[id] || !drop.vehicles[id].url) return;
    keys.push(id);
    seen.add(id);
  });
  Object.keys(drop.vehicles || {}).forEach(function (id) {
    if (seen.has(id)) return;
    if (!MODEL_SET.has(id)) return;
    if (!drop.vehicles[id] || !drop.vehicles[id].url) return;
    keys.push(id);
  });
  return keys;
}

function updateUrl(dropPath, vehicle) {
  const url = new URL(window.location.href);
  url.searchParams.set("drop", dropPath);
  url.searchParams.set("vehicle", vehicle);
  history.replaceState(null, "", url.pathname + url.search);
}

function disposeRoot() {
  if (sceneState.root && sceneState.scene) {
    sceneState.scene.remove(sceneState.root);
    sceneState.root.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (m) {
          if (m.map && m.map !== sceneState.texture) m.map.dispose();
          m.dispose();
        });
      }
    });
    sceneState.root = null;
  }
  if (sceneState.texture) {
    sceneState.texture.dispose();
    sceneState.texture = null;
  }
}

function ensureScene() {
  if (sceneState.ready) return;

  const canvas = els.canvas;
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0e0e);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  camera.position.set(3.2, 1.4, 4.2);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.3);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.9);
  dir.position.set(4, 8, 5);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xaaccff, 0.85);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  const grid = new THREE.GridHelper(20, 40, 0x2a2a2a, 0x1a1a1a);
  grid.position.y = 0;
  scene.add(grid);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0.6, 0);
  controls.minDistance = 1.5;
  controls.maxDistance = 24;

  sceneState.renderer = renderer;
  sceneState.scene = scene;
  sceneState.camera = camera;
  sceneState.controls = controls;
  sceneState.grid = grid;
  sceneState.ready = true;

  function onResize() {
    const w = els.stage.clientWidth || window.innerWidth;
    const h = els.stage.clientHeight || Math.max(320, window.innerHeight - 64);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener("resize", onResize);
  onResize();

  function tick() {
    sceneState.animId = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();
}

function loadTexture(url) {
  const texLoader = new THREE.TextureLoader();
  texLoader.crossOrigin = "anonymous";
  return new Promise(function (resolve, reject) {
    texLoader.load(url, resolve, undefined, reject);
  });
}

function loadGltf(path) {
  const loader = new GLTFLoader();
  return new Promise(function (resolve, reject) {
    loader.load(path, resolve, undefined, reject);
  });
}

function applyWrap(root, texture) {
  let applied = 0;
  root.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(function (mat, i) {
      if (mat && mat.name === "Tesla_Wrap") {
        const cloned = new THREE.MeshStandardMaterial({
          name: "Tesla_Wrap",
          map: texture,
          color: 0xffffff,
          roughness: 0.68,
          metalness: 0.05,
          emissiveMap: texture,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0.85,
        });
        cloned.needsUpdate = true;
        if (Array.isArray(obj.material)) obj.material[i] = cloned;
        else obj.material = cloned;
        applied += 1;
      }
    });
  });
  return applied;
}

async function loadVehicle(vehicleId) {
  const token = ++state.loadToken;
  const drop = state.drop;
  if (!drop) throw new Error("No drop loaded.");

  const entry = drop.vehicles[vehicleId];
  if (!entry || !entry.url) throw new Error("No wrap texture for " + vehicleId + ".");

  setStatus("Loading " + vehicleId + "…");
  ensureScene();
  disposeRoot();

  const [gltf, texture] = await Promise.all([
    loadGltf(modelPath(vehicleId)),
    loadTexture(entry.url),
  ]);

  if (token !== state.loadToken) {
    // Stale load — dispose what we got
    texture.dispose();
    gltf.scene.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (m) { m.dispose(); });
      }
    });
    return;
  }

  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  sceneState.texture = texture;

  const root = gltf.scene;
  sceneState.scene.add(root);
  sceneState.root = root;

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  root.position.sub(center);
  root.position.y += size.y * 0.05;

  // Sit grid under wheels
  if (sceneState.grid) {
    const after = new THREE.Box3().setFromObject(root);
    sceneState.grid.position.y = after.min.y;
  }

  sceneState.controls.target.set(0, Math.max(0.15, size.y * 0.25), 0);
  const radius = Math.max(size.x, size.y, size.z);
  const dist = Math.max(3.5, radius * 1.85);
  sceneState.camera.position.set(dist * 0.72, dist * 0.38, dist * 0.95);
  sceneState.controls.update();

  const applied = applyWrap(root, texture);
  if (!applied) console.warn("No Tesla_Wrap material found on", vehicleId);

  const label = vehicleLabel(state.catalog, drop, vehicleId);
  setStatus(label + " · wrap applied");
}

function fillSelect(keys, selected) {
  els.select.innerHTML = "";
  keys.forEach(function (id) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = vehicleLabel(state.catalog, state.drop, id);
    if (id === selected) opt.selected = true;
    els.select.appendChild(opt);
  });
}

async function boot() {
  const params = parseParams();
  if (!params.drop) {
    setStatus("Missing required ?drop=YYYY-MM-DD/slug or workshop/slug", true);
    els.title.textContent = "3D viewer";
    return;
  }

  state.dropPath = params.drop;
  els.back.href = "./?drop=" + encodeURIComponent(params.drop);

  setStatus("Loading catalog…");
  let catalog;
  try {
    const res = await fetch("./catalog.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("catalog.json HTTP " + res.status);
    catalog = await res.json();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load catalog.json", true);
    return;
  }

  state.catalog = catalog;
  const drop = findDrop(catalog, params.drop);
  if (!drop) {
    setStatus("Drop not found: " + params.drop, true);
    els.title.textContent = params.drop;
    return;
  }
  state.drop = drop;

  els.title.textContent = drop.title || drop.slug || params.drop;
  els.meta.textContent = (drop.kind === "workshop" ? "workshop" : (drop.date || "")) + " · " + (drop.slug || "");
  document.title = (drop.title || drop.slug) + " — 3D Viewer · Tesla Wrap Factory";

  const keys = availableVehicles(catalog, drop);
  if (!keys.length) {
    setStatus("No vehicles with both wrap PNG and GLB for this drop.", true);
    return;
  }

  let vehicle = params.vehicle;
  if (!keys.includes(vehicle)) {
    vehicle = keys.includes("cybertruck") ? "cybertruck" : keys[0];
  }
  state.vehicle = vehicle;
  fillSelect(keys, vehicle);
  updateUrl(state.dropPath, vehicle);

  els.select.addEventListener("change", function () {
    const next = els.select.value;
    state.vehicle = next;
    updateUrl(state.dropPath, next);
    loadVehicle(next).catch(function (err) {
      console.error(err);
      setStatus((err && err.message) || "Failed to load vehicle", true);
    });
  });

  try {
    await loadVehicle(vehicle);
  } catch (err) {
    console.error(err);
    setStatus((err && err.message) || "Failed to load 3D model", true);
  }
}

boot();
