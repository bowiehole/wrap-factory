#!/usr/bin/env node
/**
 * Build docs/catalog.json from local skins/ + workshop/.
 * Emits preview URLs only when local preview files exist.
 * Merges title/brief/previewVehicle from existing catalog.json by id.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const SKINS = path.join(ROOT, "skins");
const WORKSHOP = path.join(ROOT, "workshop");
const OUT = path.join(DOCS, "catalog.json");

const RAW_BASE = "https://raw.githubusercontent.com/bowiehole/wrap-factory/main/";
const REPO = "bowiehole/wrap-factory";
const SITE = "https://teslawrapfactory.com";

const VEHICLE_ORDER = [
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

const VEHICLE_LABELS = {
  cybertruck: "Cybertruck",
  model3: "Model 3",
  "model3-2024-base": "Model 3 2024 Base",
  "model3-2024-performance": "Model 3 2024 Performance",
  modely: "Model Y",
  "modely-2025-base": "Model Y 2025 Base",
  "modely-2025-premium": "Model Y 2025 Premium",
  "modely-2025-performance": "Model Y 2025 Performance",
  "modely-l": "Model Y L",
  "models-2021": "Model S 2021",
  "models-2025-plaid": "Model S 2025 Plaid",
  "modelx-2021": "Model X 2021",
};

const PREVIEW_STILLS = ["front", "side", "front-quarter", "rear-quarter"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rawUrl(...parts) {
  return RAW_BASE + parts.map((p) => String(p).replace(/^\/+|\/+$/g, "")).join("/");
}

function readExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT, "utf8"));
  } catch {
    return { drops: [] };
  }
}

function indexExisting(existing) {
  const byId = new Map();
  const byKey = new Map();
  for (const d of existing.drops || []) {
    if (d.id) byId.set(d.id, d);
    const key = `${d.kind}|${d.date || ""}|${d.slug}`;
    byKey.set(key, d);
  }
  return { byId, byKey };
}

function mergeMeta(drop, existing) {
  const prev =
    existing.byId.get(drop.id) ||
    existing.byKey.get(`${drop.kind}|${drop.date || ""}|${drop.slug}`);
  if (!prev) return drop;
  if (prev.title) drop.title = prev.title;
  if (prev.brief != null && prev.brief !== "") drop.brief = prev.brief;
  if (prev.previewVehicle) drop.previewVehicle = prev.previewVehicle;
  return drop;
}

function isVehicleDir(name) {
  return VEHICLE_ORDER.includes(name) || Object.prototype.hasOwnProperty.call(VEHICLE_LABELS, name);
}

function collectVehiclesFromDir(dir, slug, urlBuilder) {
  const vehicles = {};
  if (!fs.existsSync(dir)) return vehicles;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const vehicle = ent.name;
    if (!isVehicleDir(vehicle)) continue;
    const file = `${slug}.png`;
    const filePath = path.join(dir, vehicle, file);
    if (!fs.existsSync(filePath)) continue;
    const st = fs.statSync(filePath);
    vehicles[vehicle] = {
      label: VEHICLE_LABELS[vehicle] || vehicle,
      file,
      url: urlBuilder(vehicle, file),
      bytes: st.size,
    };
  }
  return vehicles;
}

function readStillsFromDir(dir, urlParts) {
  const stills = {};
  for (const angle of PREVIEW_STILLS) {
    const p = path.join(dir, `${angle}.png`);
    if (fs.existsSync(p)) {
      stills[angle] = rawUrl(...urlParts, `${angle}.png`);
    }
  }
  return stills;
}

function readPreview(date, slug) {
  const previewDir = path.join(SKINS, date, slug, "preview");
  if (!fs.existsSync(previewDir) || !fs.statSync(previewDir).isDirectory()) {
    return null;
  }
  const preview = {};
  const swatchPath = path.join(previewDir, "swatch.png");
  if (fs.existsSync(swatchPath)) {
    preview.swatch = rawUrl("skins", date, slug, "preview", "swatch.png");
  }
  const stills = readStillsFromDir(previewDir, ["skins", date, slug, "preview"]);
  if (Object.keys(stills).length) preview.stills = stills;

  const stillsByVehicle = {};
  // Hero CT stills live at preview root
  if (Object.keys(stills).length) stillsByVehicle.cybertruck = stills;
  // Per-vehicle folders: preview/{vehicle}/*.png (all official vehicles)
  for (const ent of fs.readdirSync(previewDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const vehicle = ent.name;
    if (vehicle === "verify") continue; // QA-only contact sheets
    if (!isVehicleDir(vehicle)) continue;
    const vDir = path.join(previewDir, vehicle);
    const vStills = readStillsFromDir(vDir, ["skins", date, slug, "preview", vehicle]);
    if (Object.keys(vStills).length) stillsByVehicle[vehicle] = vStills;
  }
  if (Object.keys(stillsByVehicle).length) preview.stillsByVehicle = stillsByVehicle;

  const ogPath = path.join(previewDir, "og.png");
  if (fs.existsSync(ogPath)) {
    preview.og = rawUrl("skins", date, slug, "preview", "og.png");
  }
  if (preview.swatch || preview.stills) {
    preview.heroVehicle = "cybertruck";
  }
  return Object.keys(preview).length ? preview : null;
}

function scanFactory() {
  const drops = [];
  if (!fs.existsSync(SKINS)) return drops;

  const byDate = new Map();

  for (const dateEnt of fs.readdirSync(SKINS, { withFileTypes: true })) {
    if (!dateEnt.isDirectory() || !DATE_RE.test(dateEnt.name)) continue;
    const date = dateEnt.name;
    const dateDir = path.join(SKINS, date);

    for (const vehEnt of fs.readdirSync(dateDir, { withFileTypes: true })) {
      if (!vehEnt.isDirectory()) continue;
      const vehicle = vehEnt.name;
      if (!isVehicleDir(vehicle)) continue;
      const vehDir = path.join(dateDir, vehicle);
      for (const file of fs.readdirSync(vehDir)) {
        if (!file.endsWith(".png")) continue;
        const slug = file.slice(0, -4);
        if (!byDate.has(date)) byDate.set(date, new Map());
        const slugMap = byDate.get(date);
        if (!slugMap.has(slug)) slugMap.set(slug, {});
        const filePath = path.join(vehDir, file);
        const st = fs.statSync(filePath);
        slugMap.get(slug)[vehicle] = {
          label: VEHICLE_LABELS[vehicle] || vehicle,
          file,
          url: rawUrl("skins", date, vehicle, file),
          bytes: st.size,
        };
      }
    }
  }

  const dates = [...byDate.keys()].sort().reverse();
  for (const date of dates) {
    const slugMap = byDate.get(date);
    const slugs = [...slugMap.keys()].sort();
    for (const slug of slugs) {
      const vehicles = slugMap.get(slug);
      const ordered = {};
      for (const k of VEHICLE_ORDER) {
        if (vehicles[k]) ordered[k] = vehicles[k];
      }
      for (const k of Object.keys(vehicles)) {
        if (!ordered[k]) ordered[k] = vehicles[k];
      }
      const drop = {
        kind: "factory",
        id: `factory-${date}-${slug}`,
        date,
        slug,
        title: slug,
        brief: "",
        previewVehicle: "cybertruck",
        vehicles: ordered,
      };
      const preview = readPreview(date, slug);
      if (preview) {
        if (preview.heroVehicle) drop.previewVehicle = preview.heroVehicle;
        drop.preview = preview;
      }
      drops.push(drop);
    }
  }
  return drops;
}

function scanWorkshop() {
  const drops = [];
  if (!fs.existsSync(WORKSHOP)) return drops;

  const slugs = fs
    .readdirSync(WORKSHOP, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const slug of slugs) {
    const slugDir = path.join(WORKSHOP, slug);
    const vehicles = collectVehiclesFromDir(slugDir, slug, (vehicle, file) =>
      rawUrl("workshop", slug, vehicle, file)
    );
    if (!Object.keys(vehicles).length) continue;

    const ordered = {};
    for (const k of VEHICLE_ORDER) {
      if (vehicles[k]) ordered[k] = vehicles[k];
    }
    for (const k of Object.keys(vehicles)) {
      if (!ordered[k]) ordered[k] = vehicles[k];
    }

    drops.push({
      kind: "workshop",
      id: `workshop-${slug}`,
      date: null,
      slug,
      title: slug,
      brief: "",
      previewVehicle: "cybertruck",
      vehicles: ordered,
    });
  }
  return drops;
}

function main() {
  const existing = indexExisting(readExisting());
  const factory = scanFactory().map((d) => mergeMeta(d, existing));
  const workshop = scanWorkshop().map((d) => mergeMeta(d, existing));

  const publishedWorkshopIds = new Set(
    [...existing.byId.values()].filter((d) => d.kind === "workshop").map((d) => d.id)
  );
  const workshopFiltered = workshop.filter(
    (d) => publishedWorkshopIds.has(d.id) || Object.keys(d.vehicles).length >= 8
  );

  const catalog = {
    generatedAt: new Date().toISOString(),
    repo: REPO,
    site: SITE,
    vehicleOrder: VEHICLE_ORDER,
    vehicleLabels: VEHICLE_LABELS,
    drops: [...factory, ...workshopFiltered],
  };

  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
  const withPreview = catalog.drops.filter((d) => d.preview).length;
  console.log(
    `Wrote ${OUT} — ${catalog.drops.length} drops (${factory.length} factory, ${workshopFiltered.length} workshop), ${withPreview} with preview`
  );
}

main();
