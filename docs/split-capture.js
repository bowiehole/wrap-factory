import * as THREE from "three";

const OUT_W = 4914;
const OUT_H = 2048;
const SLICE_W = 1638;
const BG = 0x0e0e0e;
const BG_CSS = "#0e0e0e";
const WIDTH_COVER = 0.78;
const HEIGHT_MAX = 0.86;
const FRIENDLY = "Your device couldn't make the high-res image. Try a desktop browser.";

let openUrls = [];

function friendly(err) {
  if (err && err.message === FRIENDLY) return err;
  const wrapped = new Error(FRIENDLY);
  if (err) wrapped.cause = err;
  return wrapped;
}

function sanitize(value) {
  const cleaned = String(value == null ? "" : value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "wrap";
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() >> 1) & 31);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: time, day: day };
}

// Store-only ZIP (no compression). files: [{ name, data: Uint8Array }]
function buildZip(files) {
  const stamp = dosTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;

  for (let i = 0; i < files.length; i++) {
    const nameBytes = new TextEncoder().encode(files[i].name);
    const data = files[i].data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, stamp.time, true);
    view.setUint16(12, stamp.day, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cd.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(12, stamp.time, true);
    cdView.setUint16(14, stamp.day, true);
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, data.length, true);
    cdView.setUint32(24, data.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }

  let cdSize = 0;
  for (let i = 0; i < central.length; i++) cdSize += central[i].length;
  const eocd = new Uint8Array(22);
  const end = new DataView(eocd.buffer);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  return new Blob(parts.concat(central, [eocd]), { type: "application/zip" });
}

function canvasToBlob(canvas) {
  return new Promise(function (resolve, reject) {
    try {
      canvas.toBlob(function (blob) {
        if (!blob) reject(friendly());
        else resolve(blob);
      }, "image/png");
    } catch (err) {
      reject(friendly(err));
    }
  });
}

function readLimit(renderer) {
  const gl = renderer.getContext();
  if (!gl || gl.isContextLost()) throw friendly();
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
  const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 0;
  const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const maxVp0 = vp && vp.length ? vp[0] : 0;
  const maxVp1 = vp && vp.length > 1 ? vp[1] : 0;
  let limit = Math.min(maxTex, maxRb, maxVp0, maxVp1);

  let cap = NaN;
  if (typeof window.__psCaptureMaxSize === "number") cap = window.__psCaptureMaxSize;
  const query = new URLSearchParams(window.location.search).get("captureMaxSize");
  if (query) {
    const parsed = parseInt(query, 10);
    cap = Number.isFinite(cap) ? Math.min(cap, parsed) : parsed;
  }
  if (Number.isFinite(cap) && cap > 0) limit = Math.min(limit, cap | 0);
  if (!Number.isFinite(limit) || limit < 16) throw friendly();
  return limit;
}

function contextLost(renderer) {
  try {
    const gl = renderer.getContext();
    return !gl || gl.isContextLost();
  } catch (err) {
    return true;
  }
}

function createOffscreenRenderer() {
  const canvas = document.createElement("canvas");
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
  } catch (err) {
    throw friendly(err);
  }
  if (contextLost(renderer)) throw friendly();
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(BG, 1);
  return { renderer: renderer, canvas: canvas };
}

function destroyRenderer(pair) {
  if (!pair) return;
  try { pair.renderer.dispose(); } catch (err) { /* already gone */ }
  try { pair.renderer.forceContextLoss(); } catch (err) { /* already gone */ }
  if (pair.canvas) {
    pair.canvas.width = 0;
    pair.canvas.height = 0;
  }
}

// Same pose and vertical fov as the live camera, but a wide capture aspect.
// The live camera object is never written.
function makeCaptureCamera(live) {
  const cam = new THREE.PerspectiveCamera(live.fov, OUT_W / OUT_H, live.near, live.far);
  cam.position.copy(live.position);
  cam.quaternion.copy(live.quaternion);
  cam.up.copy(live.up);
  cam.zoom = live.zoom;
  cam.updateMatrixWorld(true);
  return cam;
}

function isShown(obj) {
  let node = obj;
  while (node) {
    if (node.visible === false) return false;
    node = node.parent;
  }
  return true;
}

// Project world-space points that sit in front of the camera into NDC.
function accumulateNdc(cam, world, tmp, acc) {
  tmp.copy(world).applyMatrix4(cam.matrixWorldInverse);
  if (tmp.z >= 0) return acc;
  world.project(cam);
  if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return acc;
  acc.minX = Math.min(acc.minX, world.x);
  acc.maxX = Math.max(acc.maxX, world.x);
  acc.minY = Math.min(acc.minY, world.y);
  acc.maxY = Math.max(acc.maxY, world.y);
  acc.count++;
  return acc;
}

function emptyNdc() {
  return { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, count: 0 };
}

function projectBoxCorners(cam, root) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return emptyNdc();
  const xs = [box.min.x, box.max.x];
  const ys = [box.min.y, box.max.y];
  const zs = [box.min.z, box.max.z];
  const world = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const acc = emptyNdc();
  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        world.set(xs[ix], ys[iy], zs[iz]);
        accumulateNdc(cam, world, tmp, acc);
      }
    }
  }
  return acc;
}

// Tight bounds from real vertices. A loose Box3 overestimates a front-quarter car.
// Stride keeps the projection under ~60k points.
function projectCarNdc(cam, root) {
  root.updateMatrixWorld(true);
  cam.updateMatrixWorld(true);
  const meshes = [];
  let total = 0;
  root.traverse(function (obj) {
    if (!obj.isMesh || !isShown(obj)) return;
    const pos = obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position;
    if (!pos || !pos.count) return;
    meshes.push(obj);
    total += pos.count;
  });

  const acc = emptyNdc();
  if (total > 0) {
    const stride = Math.max(1, Math.ceil(total / 60000));
    const world = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    for (let m = 0; m < meshes.length; m++) {
      const mesh = meshes[m];
      const pos = mesh.geometry.attributes.position;
      const matrix = mesh.matrixWorld;
      for (let i = 0; i < pos.count; i += stride) {
        world.fromBufferAttribute(pos, i).applyMatrix4(matrix);
        accumulateNdc(cam, world, tmp, acc);
      }
    }
  }

  if (acc.count >= 2) {
    return { minX: acc.minX, maxX: acc.maxX, minY: acc.minY, maxY: acc.maxY };
  }
  const boxAcc = projectBoxCorners(cam, root);
  if (boxAcc.count < 2) throw friendly();
  return { minX: boxAcc.minX, maxX: boxAcc.maxX, minY: boxAcc.minY, maxY: boxAcc.maxY };
}

// Zoom/pan window on a virtual frame of size OUT * z. z>1 zooms in.
// Height cap wins over the 78% width target. z<1 is allowed when the car is huge.
function computeFraming(cam, root) {
  const ndc = projectCarNdc(cam, root);
  const ndcW = Math.max(1e-6, ndc.maxX - ndc.minX);
  const ndcH = Math.max(1e-6, ndc.maxY - ndc.minY);
  const zW = WIDTH_COVER / (ndcW * 0.5);
  const zH = HEIGHT_MAX / (ndcH * 0.5);
  const z = Math.min(zW, zH);
  const fullW = OUT_W * z;
  const fullH = OUT_H * z;
  const cx = (ndc.minX + ndc.maxX) * 0.5;
  const cy = (ndc.minY + ndc.maxY) * 0.5;
  const vx = (cx * 0.5 + 0.5) * fullW;
  const vy = (0.5 - cy * 0.5) * fullH;
  return {
    z: z,
    zWidth: zW,
    zHeight: zH,
    fullW: fullW,
    fullH: fullH,
    offX: vx - OUT_W / 2,
    offY: vy - OUT_H / 2,
    ndc: ndc,
  };
}

function renderWindow(pair, scene, cam, framing, tx, ty, tw, th) {
  pair.renderer.setSize(tw, th, false);
  cam.setViewOffset(framing.fullW, framing.fullH, framing.offX + tx, framing.offY + ty, tw, th);
  pair.renderer.render(scene, cam);
  const gl = pair.renderer.getContext();
  if (!gl || gl.isContextLost()) return false;
  return gl.drawingBufferWidth === tw && gl.drawingBufferHeight === th;
}

function tileStarts(total, tile) {
  const starts = [];
  for (let t = 0; t < total; t += tile) starts.push(t);
  return starts;
}

function paintWatermark(ctx) {
  ctx.save();
  ctx.font = "34px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("paintshopwraps.com", OUT_W - 40, OUT_H - 40);
  ctx.restore();
}

function sliceFrom(output, x) {
  const canvas = document.createElement("canvas");
  canvas.width = SLICE_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(output, x, 0, SLICE_W, OUT_H, 0, 0, SLICE_W, OUT_H);
  return canvas;
}

function closePanel() {
  for (let i = 0; i < openUrls.length; i++) URL.revokeObjectURL(openUrls[i]);
  openUrls = [];
  const panel = document.getElementById("split-capture-panel");
  if (!panel) return;
  panel.hidden = true;
  panel.innerHTML = "";
}

function trackUrl(blob) {
  const url = URL.createObjectURL(blob);
  openUrls.push(url);
  return url;
}

function addLink(parent, label, filename, blob) {
  const link = document.createElement("a");
  link.href = trackUrl(blob);
  link.download = filename;
  link.textContent = label;
  parent.appendChild(link);
  return link;
}

function showPanel(result) {
  const panel = document.getElementById("split-capture-panel");
  if (!panel) return;
  closePanel();
  panel.hidden = false;

  const img = document.createElement("img");
  img.className = "split-capture-preview";
  img.alt = "Split capture preview";
  img.src = trackUrl(result.fullBlob);
  panel.appendChild(img);

  const note = document.createElement("p");
  note.className = "split-capture-note";
  note.textContent = "Post the 3 slices in order (1, 2, 3) for a seamless X carousel";
  panel.appendChild(note);

  const links = document.createElement("div");
  links.className = "split-capture-links";
  addLink(links, "Full 4914×2048", result.names[0], result.fullBlob);
  addLink(links, "Slice 1", result.names[1], result.sliceBlobs[0]);
  addLink(links, "Slice 2", result.names[2], result.sliceBlobs[1]);
  addLink(links, "Slice 3", result.names[3], result.sliceBlobs[2]);
  addLink(links, "Download all (.zip)", result.names[4], result.zipBlob);
  panel.appendChild(links);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "split-capture-close";
  close.textContent = "Close";
  close.addEventListener("click", closePanel);
  panel.appendChild(close);
}

function blit(ctx, canvas, tx, ty, tw, th) {
  ctx.drawImage(canvas, 0, 0, tw, th, tx, ty, tw, th);
}

export async function captureSplit(opts) {
  const scene = opts.scene;
  const liveCamera = opts.camera;
  const root = opts.root;
  const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : function () {};
  // Accepted so the viewer can pass its state through. Never touch them.
  void opts.controls;
  void opts.liveRenderer;

  if (!scene || !liveCamera || !root) throw friendly();

  let pair = null;
  const scratch = [];
  try {
    onStatus("Measuring the vehicle…");
    const cam = makeCaptureCamera(liveCamera);
    const framing = computeFraming(cam, root);

    pair = createOffscreenRenderer();
    const limit = readLimit(pair.renderer);

    const output = document.createElement("canvas");
    output.width = OUT_W;
    output.height = OUT_H;
    scratch.push(output);
    const ctx = output.getContext("2d");
    ctx.fillStyle = BG_CSS;
    ctx.fillRect(0, 0, OUT_W, OUT_H);

    let tiled = false;
    let tileSize = 0;
    let singleOK = false;
    // Set only when a full-frame render is silently clamped by the browser.
    let clampedBuffer = 0;

    if (limit >= OUT_W) {
      onStatus("Rendering 4914×2048…");
      try {
        singleOK = renderWindow(pair, scene, cam, framing, 0, 0, OUT_W, OUT_H);
      } catch (err) {
        singleOK = false;
      }
      if (singleOK) {
        blit(ctx, pair.canvas, 0, 0, OUT_W, OUT_H);
        tileSize = OUT_W;
      } else if (!contextLost(pair.renderer)) {
        const gl = pair.renderer.getContext();
        if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
          clampedBuffer = Math.min(gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
      }
    }

    if (!singleOK) {
      tiled = true;
      if (contextLost(pair.renderer)) {
        destroyRenderer(pair);
        pair = createOffscreenRenderer();
        clampedBuffer = 0;
      }
      tileSize = Math.min(limit, 2048);
      if (clampedBuffer > 0) tileSize = Math.min(tileSize, clampedBuffer);
      if (tileSize < 16) throw friendly();

      const xs = tileStarts(OUT_W, tileSize);
      const ys = tileStarts(OUT_H, tileSize);
      const total = xs.length * ys.length;
      let n = 0;
      for (let yi = 0; yi < ys.length; yi++) {
        for (let xi = 0; xi < xs.length; xi++) {
          const tx = xs[xi];
          const ty = ys[yi];
          const tw = Math.min(tileSize, OUT_W - tx);
          const th = Math.min(tileSize, OUT_H - ty);
          n += 1;
          onStatus("Rendering tile " + n + "/" + total + "…");
          let ok = false;
          try {
            ok = renderWindow(pair, scene, cam, framing, tx, ty, tw, th);
          } catch (err) {
            ok = false;
          }
          if (!ok) throw friendly();
          blit(ctx, pair.canvas, tx, ty, tw, th);
        }
      }
    }

    paintWatermark(ctx);

    onStatus("Encoding PNG slices…");
    const slices = [
      sliceFrom(output, 0),
      sliceFrom(output, SLICE_W),
      sliceFrom(output, SLICE_W * 2),
    ];
    scratch.push(slices[0], slices[1], slices[2]);

    const fullBlob = await canvasToBlob(output);
    const sliceBlobs = [];
    for (let i = 0; i < slices.length; i++) sliceBlobs.push(await canvasToBlob(slices[i]));

    const base = sanitize(opts.dropSlug) + "-" + sanitize(opts.vehicleId);
    const names = [
      base + "-split-full.png",
      base + "-split-1.png",
      base + "-split-2.png",
      base + "-split-3.png",
      base + "-split.zip",
    ];

    const blobs = [fullBlob].concat(sliceBlobs);
    const files = [];
    for (let i = 0; i < 4; i++) {
      files.push({ name: names[i], data: new Uint8Array(await blobs[i].arrayBuffer()) });
    }
    const zipBlob = buildZip(files);

    const result = {
      fullBlob: fullBlob,
      sliceBlobs: sliceBlobs,
      zipBlob: zipBlob,
      names: names,
      width: OUT_W,
      height: OUT_H,
      tiled: tiled,
      tileSize: tileSize,
      limit: limit,
      framing: framing,
    };
    window.__psLastCapture = result;
    showPanel(result);
    return result;
  } catch (err) {
    throw friendly(err);
  } finally {
    destroyRenderer(pair);
    for (let i = 0; i < scratch.length; i++) {
      scratch[i].width = 0;
      scratch[i].height = 0;
    }
  }
}
