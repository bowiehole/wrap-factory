(function () {
  "use strict";

  const STILL_ANGLES = ["front", "side", "front-quarter", "rear-quarter"];
  const STILL_LABELS = {
    front: "Front",
    side: "Side",
    "front-quarter": "Front ¾",
    "rear-quarter": "Rear ¾",
  };
  /** Vehicle ids that have a GLB under docs/models/ (viewer.html only). */
  const MODEL_VEHICLES = new Set([
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
  ]);

  const state = {
    catalog: null,
    filter: "all",
    query: "",
    gridVehicle: "cybertruck",
    activeDrop: null,
    selectedVehicle: null,
    activeStill: null,
    stillsToken: 0,
  };

  const els = {
    grid: document.getElementById("grid"),
    status: document.getElementById("status"),
    empty: document.getElementById("empty"),
    search: document.getElementById("search"),
    gridVehicle: document.getElementById("grid-vehicle"),
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
    // Prefer prerendered still for the header grid vehicle — never swatch as main image.
    const vehicle = state.gridVehicle || "cybertruck";
    const stills = stillsOf(drop, vehicle);
    if (stills) {
      if (stills.side) return stills.side;
      if (stills["front-quarter"]) return stills["front-quarter"];
      if (stills.front) return stills.front;
      if (stills["rear-quarter"]) return stills["rear-quarter"];
    }
    const p = drop && drop.preview;
    if (p && p.stills && p.stills.side) return p.stills.side;
    if (p && p.stills && p.stills["front-quarter"]) return p.stills["front-quarter"];
    return atlasUrl(drop, vehicle);
  }

  function cardSwatchUrl(drop) {
    const p = drop && drop.preview;
    return (p && p.swatch) || null;
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
    if (parts.length === 2 && parts[0] === "workshop") {
      const slug = parts[1];
      for (let i = 0; i < drops.length; i++) {
        if (drops[i].kind === "workshop" && drops[i].slug === slug) return drops[i];
      }
      return null;
    }
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
    if (drop.kind === "workshop") return "workshop/" + (drop.slug || "");
    if (drop.date) return drop.date + "/" + drop.slug;
    return drop.slug || "";
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
        const atlas = atlasUrl(drop, state.gridVehicle || "cybertruck");
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

    const swatchUrl = cardSwatchUrl(drop);
    if (swatchUrl) {
      const sw = document.createElement("div");
      sw.className = "card-swatch";
      sw.setAttribute("aria-hidden", "true");
      const swImg = document.createElement("img");
      swImg.alt = "";
      swImg.loading = "lazy";
      swImg.decoding = "async";
      swImg.src = swatchUrl;
      swImg.addEventListener("error", function () { sw.remove(); });
      sw.appendChild(swImg);
      preview.appendChild(sw);
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

  function populateGridVehicleSelect() {
    if (!els.gridVehicle || !state.catalog) return;
    const order = state.catalog.vehicleOrder || [];
    const labels = state.catalog.vehicleLabels || {};
    const current = state.gridVehicle || "cybertruck";
    els.gridVehicle.innerHTML = "";
    order.forEach(function (id) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = labels[id] || id;
      if (id === current) opt.selected = true;
      els.gridVehicle.appendChild(opt);
    });
    if (!order.includes(current) && order.length) {
      state.gridVehicle = order[0];
      els.gridVehicle.value = state.gridVehicle;
    }
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

  function syncStillActive() {
    const thumbs = els.stillsStrip.querySelectorAll(".still-thumb");
    for (let i = 0; i < thumbs.length; i++) {
      const btn = thumbs[i];
      const angle = btn.getAttribute("data-angle");
      const on = angle === state.activeStill;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function renderStills(drop) {
    const stills = stillsOf(drop, state.selectedVehicle);
    els.stillsStrip.innerHTML = "";
    els.stillsStrip.classList.add("hidden");
    if (!stills || !Object.keys(stills).length) return;

    const angles = [];
    for (let i = 0; i < STILL_ANGLES.length; i++) {
      const angle = STILL_ANGLES[i];
      if (stills[angle]) angles.push(angle);
    }
    if (!angles.length) return;

    let pending = angles.length;
    let loadedOk = 0;
    const token = ++state.stillsToken;

    function revealIfReady() {
      if (token !== state.stillsToken) return;
      if (pending > 0) return;
      if (loadedOk > 0) els.stillsStrip.classList.remove("hidden");
      else els.stillsStrip.classList.add("hidden");
    }

    angles.forEach(function (angle) {
      const url = stills[angle];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "still-thumb" + (state.activeStill === angle ? " active" : "");
      btn.setAttribute("data-angle", angle);
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", state.activeStill === angle ? "true" : "false");
      btn.title = STILL_LABELS[angle] || angle;
      btn.style.visibility = "hidden";

      const img = document.createElement("img");
      img.alt = STILL_LABELS[angle] || angle;
      img.decoding = "async";

      const label = document.createElement("span");
      label.textContent = STILL_LABELS[angle] || angle;

      btn.appendChild(img);
      btn.appendChild(label);

      btn.addEventListener("click", function () {
        state.activeStill = angle;
        setHero(url, (drop.title || drop.slug) + " — " + (STILL_LABELS[angle] || angle));
        syncStillActive();
      });

      img.onload = function () {
        if (token !== state.stillsToken) return;
        pending -= 1;
        loadedOk += 1;
        btn.style.visibility = "visible";
        revealIfReady();
      };
      img.onerror = function () {
        if (token !== state.stillsToken) return;
        pending -= 1;
        btn.remove();
        revealIfReady();
      };

      els.stillsStrip.appendChild(btn);
      img.src = url;
    });
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
        const hero = defaultHeroUrl(drop, v.key);
        state.activeStill = hero.still;
        setHero(hero.url, (drop.title || drop.slug) + " — " + v.label);
        renderStills(drop);
        renderVehiclePicker(drop);
        renderDownloads(drop);
        updateSpinButton(drop);
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

  function dropPath(drop) {
    if (!drop) return "";
    if (drop.kind === "workshop") return "workshop/" + (drop.slug || "");
    if (drop.date) return drop.date + "/" + (drop.slug || "");
    return drop.id || drop.slug || "";
  }

  function spinVehicleFor(drop) {
    const selected = state.selectedVehicle;
    if (
      selected &&
      MODEL_VEHICLES.has(selected) &&
      drop &&
      drop.vehicles &&
      drop.vehicles[selected]
    ) {
      return selected;
    }
    if (drop && drop.vehicles && drop.vehicles.cybertruck && MODEL_VEHICLES.has("cybertruck")) {
      return "cybertruck";
    }
    return selected && MODEL_VEHICLES.has(selected) ? selected : "cybertruck";
  }

  function viewerUrl(drop, vehicle) {
    const path = dropPath(drop);
    const v = vehicle || spinVehicleFor(drop);
    return (
      "viewer.html?drop=" +
      encodeURIComponent(path) +
      "&vehicle=" +
      encodeURIComponent(v)
    );
  }

  function updateSpinButton(drop) {
    const vehicle = state.selectedVehicle;
    const ok =
      drop &&
      vehicle &&
      MODEL_VEHICLES.has(vehicle) &&
      drop.vehicles &&
      drop.vehicles[vehicle];
    els.spinBtn.classList.toggle("hidden", !ok);
    if (ok) {
      els.spinBtn.href = viewerUrl(drop, vehicle);
    } else {
      els.spinBtn.removeAttribute("href");
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

    if (els.gridVehicle) {
      els.gridVehicle.addEventListener("change", function () {
        state.gridVehicle = els.gridVehicle.value || "cybertruck";
        renderGrid();
      });
    }

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
    document.addEventListener("keydown", function (e) {
      if (els.modal.classList.contains("hidden")) return;
      if (e.key === "Escape") closeModal();
      else if (e.key === "ArrowLeft") { e.preventDefault(); navigateRelative(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); navigateRelative(1); }
    });
  }

  async function init() {
    bindEvents();
    try {
      const res = await fetch("catalog.json?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data || !Array.isArray(data.drops)) throw new Error("Invalid catalog shape");
      state.catalog = data;
      if (!state.gridVehicle || !(data.vehicleOrder || []).includes(state.gridVehicle)) {
        state.gridVehicle = "cybertruck";
      }
      populateGridVehicleSelect();
      els.status.textContent = data.drops.length + " drops loaded";
      renderGrid();

      const params = new URLSearchParams(window.location.search);
      const dropParam = params.get("drop");
      const vehicleParam = params.get("vehicle");
      const spinParam = (params.get("spin") || "").toLowerCase();
      const wantSpin = spinParam === "1" || spinParam === "3d" || spinParam === "true" || spinParam === "yes";
      if (dropParam && wantSpin) {
        const found = findDropByPath(dropParam);
        let vehicle = vehicleParam;
        if (found) {
          if (!vehicle || !found.vehicles || !found.vehicles[vehicle] || !MODEL_VEHICLES.has(vehicle)) {
            vehicle = found.vehicles && found.vehicles.cybertruck ? "cybertruck" : "cybertruck";
            if (!found.vehicles || !found.vehicles[vehicle]) {
              const keys = Object.keys(found.vehicles || {}).filter(function (k) {
                return MODEL_VEHICLES.has(k);
              });
              vehicle = keys[0] || "cybertruck";
            }
          }
        } else {
          vehicle = vehicleParam || "cybertruck";
        }
        window.location.replace(
          "viewer.html?drop=" +
            encodeURIComponent(dropParam) +
            "&vehicle=" +
            encodeURIComponent(vehicle || "cybertruck")
        );
        return;
      }
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

