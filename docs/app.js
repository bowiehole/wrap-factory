(function () {
  "use strict";

  const state = {
    catalog: null,
    filter: "all",
    query: "",
    activeDrop: null,
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

  function previewUrl(drop) {
    if (!drop || !drop.vehicles) return null;
    const order = state.catalog?.vehicleOrder || [];
    const preferred = drop.previewVehicle || "cybertruck";
    const candidates = [preferred, "cybertruck", ...order];
    for (const key of candidates) {
      const v = drop.vehicles[key];
      if (v && v.url) return v.url;
    }
    const first = Object.values(drop.vehicles)[0];
    return first ? first.url : null;
  }

  function vehicleEntries(drop) {
    const order = state.catalog?.vehicleOrder || [];
    const labels = state.catalog?.vehicleLabels || {};
    const keys = new Set(Object.keys(drop.vehicles || {}));
    const ordered = [];
    for (const k of order) {
      if (keys.has(k)) {
        ordered.push(k);
        keys.delete(k);
      }
    }
    for (const k of keys) ordered.push(k);
    return ordered.map((key) => {
      const v = drop.vehicles[key];
      return {
        key,
        label: v.label || labels[key] || key,
        url: v.url,
        bytes: v.bytes,
        file: v.file,
      };
    });
  }

  function filteredDrops() {
    const drops = state.catalog?.drops || [];
    const q = state.query.trim().toLowerCase();
    return drops.filter((d) => {
      if (state.filter !== "all" && d.kind !== state.filter) return false;
      if (!q) return true;
      const hay = ((d.slug || "") + " " + (d.title || "") + " " + (d.brief || "")).toLowerCase();
      return hay.includes(q);
    });
  }

  function renderStatus(count, total) {
    const kindLabel =
      state.filter === "all" ? "drops" : state.filter === "factory" ? "factory skins" : "workshop drops";
    const q = state.query.trim();
    if (q) {
      els.status.textContent = `${count} of ${total} ${kindLabel} matching “${q}”`;
    } else {
      els.status.textContent = `${count} ${kindLabel}`;
    }
  }

  function createCard(drop) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card";
    btn.setAttribute("aria-label", `Open ${drop.title || drop.slug}`);

    const preview = document.createElement("div");
    preview.className = "card-preview";

    const badge = document.createElement("span");
    badge.className = "badge " + (drop.kind === "workshop" ? "workshop" : "factory");
    badge.textContent = drop.kind === "workshop" ? "Workshop" : "Factory";
    preview.appendChild(badge);

    const url = previewUrl(drop);
    if (url) {
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = url;
      img.addEventListener("error", () => {
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
    meta.textContent = `${formatDate(drop.date)} · ${drop.slug}`;

    const brief = document.createElement("p");
    brief.className = "card-brief";
    brief.textContent = truncate(drop.brief, 120);

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(brief);

    btn.appendChild(preview);
    btn.appendChild(body);
    btn.addEventListener("click", () => openModal(drop));
    return btn;
  }

  function renderGrid() {
    const drops = filteredDrops();
    const total = (state.catalog?.drops || []).length;
    els.grid.innerHTML = "";
    drops.forEach((d) => els.grid.appendChild(createCard(d)));
    els.empty.classList.toggle("hidden", drops.length > 0);
    renderStatus(drops.length, total);
  }

  function openModal(drop) {
    state.activeDrop = drop;
    const url = previewUrl(drop);
    els.modalPreview.src = url || "";
    els.modalPreview.alt = (drop.title || drop.slug) + " preview";
    els.modalBadge.className = "badge " + (drop.kind === "workshop" ? "workshop" : "factory");
    els.modalBadge.textContent = drop.kind === "workshop" ? "Workshop" : "Factory";
    els.modalTitle.textContent = drop.title || drop.slug;
    els.modalMeta.textContent = `${formatDate(drop.date)} · ${drop.slug} · ${drop.id || ""}`.replace(/ · $/, "");
    els.modalBrief.textContent = drop.brief || "";

    els.downloads.innerHTML = "";
    vehicleEntries(drop).forEach((v) => {
      const a = document.createElement("a");
      a.className = "download-btn";
      a.href = v.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = v.file || "";
      const label = document.createElement("span");
      label.textContent = v.label;
      const size = document.createElement("span");
      size.className = "size";
      size.textContent = formatBytes(v.bytes);
      a.appendChild(label);
      a.appendChild(size);
      els.downloads.appendChild(a);
    });

    els.modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    state.activeDrop = null;
    els.modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
    els.modalPreview.removeAttribute("src");
  }

  function bindEvents() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.filter = tab.dataset.filter || "all";
        els.tabs.forEach((t) => {
          const on = t === tab;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderGrid();
      });
    });

    let debounce;
    els.search.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.query = els.search.value;
        renderGrid();
      }, 120);
    });

    els.modal.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.modal.classList.contains("hidden")) {
        closeModal();
      }
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
      els.status.textContent = `${data.drops.length} drops loaded`;
      renderGrid();
    } catch (err) {
      console.error(err);
      els.status.textContent = "Failed to load catalog.json";
      els.empty.textContent = "Could not load the wrap catalog. Check that catalog.json is present.";
      els.empty.classList.remove("hidden");
    }
  }

  init();
})();
