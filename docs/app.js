(function () {
  "use strict";

  const STILL_ANGLES = ["front", "side", "front-quarter", "rear-quarter"];
  const STILL_LABELS = {
    front: "Front",
    side: "Side",
    "front-quarter": "Front ¾",
    "rear-quarter": "Rear ¾",
  };
  const SPIN_VEHICLES = new Set(["cybertruck", "model3"]);
  const THREE_URL = "three";
  const ORBIT_URL = "./vendor/controls/OrbitControls.js";
  const GLTF_URL = "./vendor/loaders/GLTFLoader.js";

  const state = {
    catalog: null,
    filter: "all",
    query: "",
    activeDrop: null,
    selectedVehicle: null,
    activeStill: null,
    spinOpen: false,
  };

  const viewer = {
    three: null,
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    root: null,
    animId: null,
    texture: null,
    disposed: true,
  };

  const els = {
    grid: document.getElementById("grid"),
    status: document.getElementById("status"),
    empty: document.getElementById("empty"),
    search: document.getElementById("search"),
    tabs: document.querySelectorAll(".tab"),
    modal: document.getElementById("modal"),
    modalPreview: document.getElementById("modal-preview"),
    modalBadge: document.getElementById("modal-badge"),
    modalTitle: document.getElementById("modal-title"),
    modalMeta: document.getElementById("modal-meta"),
    modalBrief: document.getElementById("modal-brief"),
    downloads: document.getElementById("downloads"),
    stillsStrip: document.getElementById("stills-strip"),
    swatchTile: document.getElementById("swatch-tile"),
    modalSwatch: document.getElementById("modal-swatch"),
    vehiclePicker: document.getElementById("vehicle-picker"),
    spinBtn: document.getElementById("spin-3d-btn"),
    spinError: document.getElementById("spin-3d-error"),
    viewer3d: document.getElementById("viewer-3d"),
    viewerCanvas: document.getElementById("viewer-canvas"),
    prevDrop: document.getElementById("prev-drop"),
    nextDrop: document.getElementById("next-drop"),
  };

  function formatBytes(n) {
    if (n == null || !Number.isFinite(n)) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(d) {
    if (!d) return "undated";
    return d;
  }

  function truncate(text, max) {
    if (!text) return "";
    const t = String(text).trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1).trimEnd() + "…";
  }

  function webglAvailable() {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    } catch (e) {
      return false;
    }
  }

  function atlasUrl(drop, vehicleKey) {
    if (!drop || !drop.vehicles) return null;
    if (vehicleKey && drop.vehicles[vehicleKey] && drop.vehicles[vehicleKey].url) {
      return drop.vehicles[vehicleKey].url;
    }
    const order = (state.catalog && state.catalog.vehicleOrder) || [];
    const preferred = drop.previewVehicle || (drop.preview && drop.preview.heroVehicle) || "cybertruck";
    const candidates = [preferred, "cybertruck"].concat(order);
    for (let i = 0; i < candidates.length; i++) {
      const key = candidates[i];
      const v = drop.vehicles[key];
      if (v && v.url) return v.url;
    }
    const vals = Object.values(drop.vehicles);
    return vals.length ? vals[0].url : null;
  }

  function stillsOf(drop, vehicleKey) {
    const p = drop && drop.preview;
    if (!p) return null;
    const key = vehicleKey || state.selectedVehicle || p.heroVehicle || "cybertruck";
    const by = p.stillsByVehicle;
    if (by) {
      if (by[key]) return by[key];
      // Prefer exact folder, else family prefix match (model3-*, modely-*, models-*, modelx-*)
      const families = ["model3", "modely", "models", "modelx", "cybertruck"];
      for (const fam of families) {
        if (String(key) === fam || String(key).startsWith(fam)) {
          if (by[fam]) return by[fam];
          const hit = Object.keys(by).find((k) => k === fam || k.startsWith(fam + "-") || k.startsWith(fam));
          if (hit && by[hit]) return by[hit];
        }
      }
      if (by.cybertruck) return by.cybertruck;
    }
    return p.stills || null;
  }

  function cardImageUrl(drop) {
    const p = drop && drop.preview;
    if (p && p.swatch) return p.swatch;
    if (p && p.stills && p.stills.side) return p.stills.side;
    if (p && p.stills && p.stills["front-quarter"]) return p.stills["front-quarter"];
    return atlasUrl(drop);
  }

  function defaultHeroUrl(drop, vehicleKey) {
    const stills = stillsOf(drop, state.selectedVehicle);
    if (stills) {
      const order = ["side", "front-quarter", "front", "rear-quarter"];
      for (let i = 0; i < order.length; i++) {
        const ang = order[i];
        if (stills[ang]) return { url: stills[ang], still: ang };
      }
    }
    return { url: atlasUrl(drop, vehicleKey), still: null };
  }

  function vehicleEntries(drop) {
    const order = (state.catalog && state.catalog.vehicleOrder) || [];
    const labels = (state.catalog && state.catalog.vehicleLabels) || {};
    const keys = new Set(Object.keys(drop.vehicles || {}));
    const ordered = [];
    for (let i = 0; i < order.length; i++) {
      const k = order[i];
      if (keys.has(k)) { ordered.push(k); keys.delete(k); }
    }
    keys.forEach(function (k) { ordered.push(k); });
    return ordered.map(function (key) {
      const v = drop.vehicles[key];
      return {
        key: key,
        label: v.label || labels[key] || key,
        url: v.url,
        bytes: v.bytes,
        file: v.file,
      };
    });
  }

  function filteredDrops() {
    const drops = (state.catalog && state.catalog.drops) || [];
    const q = state.query.trim().toLowerCase();
    return drops.filter(function (d) {
      if (state.filter !== "all" && d.kind !== state.filter) return false;
      if (!q) return true;
      const hay = ((d.slug || "") + " " + (d.title || "") + " " + (d.brief || "")).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function findDropByPath(dateSlug) {
    if (!dateSlug) return null;
    const parts = String(dateSlug).replace(/^\/+|\/+$/g, "").split("/");
    const drops = (state.catalog && state.catalog.drops) || [];
    if (parts.length === 2) {
      const date = parts[0];
      const slug = parts[1];
      for (let i = 0; i < drops.length; i++) {
        if (drops[i].date === date && drops[i].slug === slug) return drops[i];
      }
      return null;
    }
    if (parts.length === 1) {
      const slug = parts[0];
      for (let i = 0; i < drops.length; i++) {
        if (drops[i].kind === "workshop" && drops[i].slug === slug) return drops[i];
      }
      for (let i = 0; i < drops.length; i++) {
        if (drops[i].slug === slug) return drops[i];
      }
      return null;
    }
    return null;
  }

  function dropDeepLink(drop) {
    if (!drop) return "";
    if (drop.date) return drop.date + "/" + drop.slug;
    return drop.slug;
  }

  function setHistoryForDrop(drop) {
    const url = new URL(window.location.href);
    if (drop) url.searchParams.set("drop", dropDeepLink(drop));
    else url.searchParams.delete("drop");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function renderStatus(count, total) {
    let kindLabel = "drops";
    if (state.filter === "factory") kindLabel = "factory skins";
    else if (state.filter === "workshop") kindLabel = "workshop drops";
    const q = state.query.trim();
    if (q) els.status.textContent = count + " of " + total + " " + kindLabel + " matching \u201c" + q + "\u201d";
    else els.status.textContent = count + " " + kindLabel;
  }

  function createCard(drop) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.setAttribute("aria-label", "Open " + (drop.title || drop.slug));

    const preview = document.createElement("div");
    preview.className = "card-preview";

    const badge = document.createElement("span");
    badge.className = "badge " + (drop.kind === "workshop" ? "workshop" : "factory");
    badge.textContent = drop.kind === "workshop" ? "Workshop" : "Factory";
    preview.appendChild(badge);

    const url = cardImageUrl(drop);
    if (url) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = url;
      img.addEventListener("error", function () {
        const atlas = atlasUrl(drop);
        if (atlas && img.getAttribute("src") !== atlas) {
          img.src = atlas;
          return;
        }
        img.remove();
        const fallback = document.createElement("div");
        fallback.className = "preview-fallback";
        fallback.textContent = "Preview unavailable";
        preview.appendChild(fallback);
      });
      preview.appendChild(img);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "preview-fallback";
      fallback.textContent = "No preview";
      preview.appendChild(fallback);
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h2");
    title.className = "card-title";
    title.textContent = drop.title || drop.slug;

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = formatDate(drop.date) + " · " + drop.slug;

    const brief = document.createElement("p");
    brief.className = "card-brief";
    brief.textContent = truncate(drop.brief, 120);

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(brief);
    btn.appendChild(preview);
    btn.appendChild(body);
    btn.addEventListener("click", function () { openModal(drop); });
    return btn;
  }

  function renderGrid() {
    const drops = filteredDrops();
    const total = ((state.catalog && state.catalog.drops) || []).length;
    els.grid.innerHTML = "";
    drops.forEach(function (d) { els.grid.appendChild(createCard(d)); });
    els.empty.classList.toggle("hidden", drops.length > 0);
    renderStatus(drops.length, total);
  }

  function setHero(url, alt) {
    els.modalPreview.src = url || "";
    els.modalPreview.alt = alt || "";
    els.modalPreview.onerror = function () {
      const atlas = atlasUrl(state.activeDrop, state.selectedVehicle);
      if (atlas && els.modalPreview.getAttribute("src") !== atlas) {
        els.modalPreview.src = atlas;
      }
    };
  }

  function renderStills(drop) {
    const stills = stillsOf(drop, state.selectedVehicle);
    els.stillsStrip.innerHTML = "";
    if (!stills || !Object.keys(stills).length) {
      els.stillsStrip.classList.add("hidden");
      return;
    }
    els.stillsStrip.classList.remove("hidden");
    for (let i = 0; i < STILL_ANGLES.length; i++) {
      const angle = STILL_ANGLES[i];
      const url = stills[angle];
      if (!url) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "still-thumb" + (state.activeStill === angle ? " active" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", state.activeStill === angle ? "true" : "false");
      btn.title = STILL_LABELS[angle] || angle;
      const img = document.createElement("img");
      img.src = url;
      img.alt = STILL_LABELS[angle] || angle;
      img.loading = "lazy";
      btn.appendChild(img);
      const label = document.createElement("span");
      label.textContent = STILL_LABELS[angle] || angle;
      btn.appendChild(label);
      btn.addEventListener("click", function () {
        state.activeStill = angle;
        setHero(url, (drop.title || drop.slug) + " — " + (STILL_LABELS[angle] || angle));
        renderStills(drop);
      });
      els.stillsStrip.appendChild(btn);
    }
  }

  function renderSwatch(drop) {
    const swatch = drop && drop.preview && drop.preview.swatch;
    if (swatch) {
      els.swatchTile.classList.remove("hidden");
      els.modalSwatch.src = swatch;
      els.modalSwatch.onerror = function () { els.swatchTile.classList.add("hidden"); };
    } else {
      els.swatchTile.classList.add("hidden");
      els.modalSwatch.removeAttribute("src");
    }
  }

  function renderVehiclePicker(drop) {
    const entries = vehicleEntries(drop);
    els.vehiclePicker.innerHTML = "";
    if (!state.selectedVehicle || !drop.vehicles[state.selectedVehicle]) {
      state.selectedVehicle =
        drop.previewVehicle ||
        (drop.preview && drop.preview.heroVehicle) ||
        (entries[0] && entries[0].key) ||
        null;
    }
    entries.forEach(function (v) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vehicle-chip" + (v.key === state.selectedVehicle ? " active" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", v.key === state.selectedVehicle ? "true" : "false");
      btn.textContent = v.label;
      btn.addEventListener("click", function () {
        state.selectedVehicle = v.key;
        renderVehiclePicker(drop);
        renderDownloads(drop);
        updateSpinButton(drop);
        if (!stillsOf(drop)) {
          setHero(v.url, (drop.title || drop.slug) + " — " + v.label + " atlas");
        }
        if (state.spinOpen) {
          restartViewer().catch(function (err) { showSpinError(err); });
        }
      });
      els.vehiclePicker.appendChild(btn);
    });
  }

  function renderDownloads(drop) {
    els.downloads.innerHTML = "";
    vehicleEntries(drop).forEach(function (v) {
      const link = document.createElement("a");
      link.className = "download-btn" + (v.key === state.selectedVehicle ? " selected" : "");
      link.href = v.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = v.file || "";
      const label = document.createElement("span");
      label.textContent = v.label;
      const size = document.createElement("span");
      size.className = "size";
      size.textContent = formatBytes(v.bytes);
      link.appendChild(label);
      link.appendChild(size);
      els.downloads.appendChild(link);
    });
  }

  function updateSpinButton(drop) {
    const ok =
      webglAvailable() &&
      drop &&
      SPIN_VEHICLES.has(state.selectedVehicle) &&
      drop.vehicles[state.selectedVehicle];
    els.spinBtn.classList.toggle("hidden", !ok);
    if (!ok && state.spinOpen) {
      disposeViewer();
      els.viewer3d.classList.add("hidden");
      state.spinOpen = false;
      els.spinBtn.textContent = "Spin in 3D";
    }
    hideSpinError();
  }

  function showSpinError(err) {
    els.spinError.textContent =
      typeof err === "string" ? err : (err && err.message) || "3D viewer unavailable for this wrap.";
    els.spinError.classList.remove("hidden");
  }

  function hideSpinError() {
    els.spinError.classList.add("hidden");
    els.spinError.textContent = "";
  }

  async function loadThree() {
    if (viewer.three) return viewer.three;
    const THREE = await import(THREE_URL);
    const orbitMod = await import(ORBIT_URL);
    const gltfMod = await import(GLTF_URL);
    viewer.three = {
      THREE: THREE,
      OrbitControls: orbitMod.OrbitControls,
      GLTFLoader: gltfMod.GLTFLoader,
    };
    return viewer.three;
  }

  function disposeViewer() {
    if (viewer.animId != null) {
      cancelAnimationFrame(viewer.animId);
      viewer.animId = null;
    }
    if (viewer.controls) {
      viewer.controls.dispose();
      viewer.controls = null;
    }
    if (viewer.root && viewer.scene) {
      viewer.scene.remove(viewer.root);
      viewer.root.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(function (m) {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      viewer.root = null;
    }
    if (viewer.texture) {
      viewer.texture.dispose();
      viewer.texture = null;
    }
    if (viewer.renderer) {
      viewer.renderer.dispose();
      viewer.renderer = null;
    }
    viewer.scene = null;
    viewer.camera = null;
    viewer.disposed = true;
  }

  async function restartViewer() {
    disposeViewer();
    await startViewer();
  }

  async function startViewer() {
    hideSpinError();
    const drop = state.activeDrop;
    const vehicle = state.selectedVehicle;
    if (!drop || !SPIN_VEHICLES.has(vehicle)) {
      throw new Error("3D spin is only available for Cybertruck and Model 3.");
    }
    const atlas = atlasUrl(drop, vehicle);
    if (!atlas) throw new Error("No wrap texture for this vehicle.");

    const loaded = await loadThree();
    const THREE = loaded.THREE;
    const OrbitControls = loaded.OrbitControls;
    const GLTFLoader = loaded.GLTFLoader;

    const canvas = els.viewerCanvas;
    const wrap = els.viewer3d;
    wrap.classList.remove("hidden");

    const width = wrap.clientWidth || 560;
    const height = Math.max(280, Math.round(width * 0.56));

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0e0e);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(3.2, 1.4, 4.2);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.1);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(4, 8, 5);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xaaccff, 0.45);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.target.set(0, 0.6, 0);
    controls.minDistance = 2;
    controls.maxDistance = 12;

    viewer.renderer = renderer;
    viewer.scene = scene;
    viewer.camera = camera;
    viewer.controls = controls;
    viewer.disposed = false;

    const loader = new GLTFLoader();
    const modelPath = vehicle === "cybertruck" ? "models/cybertruck.glb" : "models/model3.glb";

    const gltf = await new Promise(function (resolve, reject) {
      loader.load(modelPath, resolve, undefined, reject);
    });

    const root = gltf.scene;
    scene.add(root);
    viewer.root = root;

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    root.position.y += (box.max.y - box.min.y) * 0.05;
    controls.target.set(0, 0.2, 0);
    controls.update();

    const texLoader = new THREE.TextureLoader();
    texLoader.crossOrigin = "anonymous";
    const texture = await new Promise(function (resolve, reject) {
      texLoader.load(atlas, resolve, undefined, reject);
    });
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    viewer.texture = texture;

    let applied = 0;
    root.traverse(function (obj) {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(function (mat, i) {
        if (mat && mat.name === "Tesla_Wrap") {
          const cloned = mat.clone();
          cloned.map = texture;
          cloned.needsUpdate = true;
          if (Array.isArray(obj.material)) obj.material[i] = cloned;
          else obj.material = cloned;
          applied += 1;
        }
      });
    });
    if (!applied) console.warn("No Tesla_Wrap material found on model");

    function tick() {
      if (viewer.disposed) return;
      viewer.animId = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    }
    tick();
  }

  async function toggleSpin() {
    if (state.spinOpen) {
      disposeViewer();
      els.viewer3d.classList.add("hidden");
      state.spinOpen = false;
      els.spinBtn.textContent = "Spin in 3D";
      hideSpinError();
      return;
    }
    els.spinBtn.textContent = "Loading 3D…";
    els.spinBtn.disabled = true;
    try {
      await startViewer();
      state.spinOpen = true;
      els.spinBtn.textContent = "Hide 3D";
    } catch (err) {
      console.error(err);
      disposeViewer();
      els.viewer3d.classList.add("hidden");
      state.spinOpen = false;
      els.spinBtn.textContent = "Spin in 3D";
      showSpinError(err);
    } finally {
      els.spinBtn.disabled = false;
    }
  }

  function navigateRelative(delta) {
    const list = filteredDrops();
    if (!list.length || !state.activeDrop) return;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === state.activeDrop.id) { idx = i; break; }
    }
    if (idx < 0) { openModal(list[0]); return; }
    const next = list[(idx + delta + list.length) % list.length];
    openModal(next);
  }

  function openModal(drop) {
    disposeViewer();
    els.viewer3d.classList.add("hidden");
    state.spinOpen = false;
    els.spinBtn.textContent = "Spin in 3D";
    hideSpinError();

    state.activeDrop = drop;
    state.selectedVehicle =
      drop.previewVehicle ||
      (drop.preview && drop.preview.heroVehicle) ||
      Object.keys(drop.vehicles || {})[0] ||
      null;

    const hero = defaultHeroUrl(drop, state.selectedVehicle);
    state.activeStill = hero.still;
    setHero(hero.url, (drop.title || drop.slug) + " preview");

    els.modalBadge.className = "badge " + (drop.kind === "workshop" ? "workshop" : "factory");
    els.modalBadge.textContent = drop.kind === "workshop" ? "Workshop" : "Factory";
    els.modalTitle.textContent = drop.title || drop.slug;
    let meta = formatDate(drop.date) + " · " + drop.slug;
    if (drop.id) meta += " · " + drop.id;
    els.modalMeta.textContent = meta;
    els.modalBrief.textContent = drop.brief || "";

    renderStills(drop);
    renderSwatch(drop);
    renderVehiclePicker(drop);
    renderDownloads(drop);
    updateSpinButton(drop);

    els.modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    setHistoryForDrop(drop);
  }

  function closeModal() {
    disposeViewer();
    els.viewer3d.classList.add("hidden");
    state.spinOpen = false;
    els.spinBtn.textContent = "Spin in 3D";
    hideSpinError();

    state.activeDrop = null;
    state.selectedVehicle = null;
    state.activeStill = null;
    els.modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    els.modalPreview.removeAttribute("src");
    setHistoryForDrop(null);
  }

  function bindEvents() {
    els.tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        state.filter = tab.dataset.filter || "all";
        els.tabs.forEach(function (t) {
          const on = t === tab;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderGrid();
      });
    });

    let debounce;
    els.search.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        state.query = els.search.value;
        renderGrid();
      }, 120);
    });

    els.modal.querySelectorAll("[data-close]").forEach(function (el) {
      el.addEventListener("click", closeModal);
    });

    els.prevDrop.addEventListener("click", function () { navigateRelative(-1); });
    els.nextDrop.addEventListener("click", function () { navigateRelative(1); });
    els.spinBtn.addEventListener("click", function () {
      toggleSpin().catch(function (err) { showSpinError(err); });
    });

    document.addEventListener("keydown", function (e) {
      if (els.modal.classList.contains("hidden")) return;
      if (e.key === "Escape") closeModal();
      else if (e.key === "ArrowLeft") { e.preventDefault(); navigateRelative(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); navigateRelative(1); }
    });

    window.addEventListener("resize", function () {
      if (!state.spinOpen || !viewer.renderer || !viewer.camera) return;
      const wrap = els.viewer3d;
      const width = wrap.clientWidth || 560;
      const height = Math.max(280, Math.round(width * 0.56));
      viewer.camera.aspect = width / height;
      viewer.camera.updateProjectionMatrix();
      viewer.renderer.setSize(width, height, false);
    });
  }

  async function init() {
    bindEvents();
    try {
      const res = await fetch("catalog.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data || !Array.isArray(data.drops)) throw new Error("Invalid catalog shape");
      state.catalog = data;
      els.status.textContent = data.drops.length + " drops loaded";
      renderGrid();

      const params = new URLSearchParams(window.location.search);
      const dropParam = params.get("drop");
      const vehicleParam = params.get("vehicle");
      const spinParam = (params.get("spin") || "").toLowerCase();
      const wantSpin = spinParam === "1" || spinParam === "3d" || spinParam === "true" || spinParam === "yes";
      if (dropParam) {
        const found = findDropByPath(dropParam);
        if (found) {
          openModal(found);
          if (vehicleParam && found.vehicles && found.vehicles[vehicleParam]) {
            state.selectedVehicle = vehicleParam;
            renderStills(found);
            renderVehiclePicker(found);
            renderDownloads(found);
            updateSpinButton(found);
            const hero = defaultHeroUrl(found, vehicleParam);
            state.activeStill = hero.still;
            setHero(hero.url, (found.title || found.slug) + " preview");
          }
          if (wantSpin) {
            if (!SPIN_VEHICLES.has(state.selectedVehicle)) {
              state.selectedVehicle = found.vehicles.cybertruck ? "cybertruck" : "model3";
              renderStills(found);
              renderVehiclePicker(found);
              renderDownloads(found);
              updateSpinButton(found);
            }
            toggleSpin().catch(function (err) { showSpinError(err); });
          }
        }
      }
    } catch (err) {
      console.error(err);
      els.status.textContent = "Failed to load catalog.json";
      els.empty.textContent = "Could not load the wrap catalog. Check that catalog.json is present.";
      els.empty.classList.remove("hidden");
    }
  }

  init();
})();

