/* Live engagement client. Silent no-op when window.PSW_STATS_API is empty.
   window.pswStats.load(ids) -> Promise<{counts, liked, ok}>
   isLiked(id), get(id), toggleLike(id), view(id), download(id, vehicle), formatCount(n) */
(function () {
  "use strict";

  var BID_KEY = "psw-bid";
  var VIEW_KEY = "psw-viewed";
  var TIMEOUT_MS = 3000;
  var BATCH_SIZE = 100;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  var counts = Object.create(null);
  var likedSet = Object.create(null);
  var seenView = Object.create(null);
  var memoryBid = "";
  var likeTail = Object.create(null);
  /* Bumped per like so a slow GET /stats cannot clobber a newer toggle. */
  var rev = Object.create(null);

  function apiBase() {
    try {
      var base = window.PSW_STATS_API;
      if (typeof base !== "string") return "";
      base = base.replace(/^\s+|\s+$/g, "");
      while (base.length && base.charAt(base.length - 1) === "/") {
        base = base.slice(0, -1);
      }
      return base;
    } catch (e) {
      return "";
    }
  }

  function makeUuid() {
    try {
      var c = window.crypto || (typeof crypto !== "undefined" ? crypto : null);
      if (c && typeof c.randomUUID === "function") return c.randomUUID();
      var bytes = new Uint8Array(16);
      if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
      else {
        for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = "";
      for (var j = 0; j < 16; j++) {
        var h = bytes[j].toString(16);
        hex += (h.length === 1 ? "0" : "") + h;
      }
      return (
        hex.slice(0, 8) + "-" +
        hex.slice(8, 12) + "-" +
        hex.slice(12, 16) + "-" +
        hex.slice(16, 20) + "-" +
        hex.slice(20)
      );
    } catch (e) {
      var tail = (Date.now().toString(16) + "000000000000").slice(0, 12);
      return "00000000-0000-4000-8000-" + tail;
    }
  }

  function browserId() {
    var store = null;
    try { store = window.localStorage; } catch (e) { store = null; }
    try {
      if (store) {
        var existing = store.getItem(BID_KEY);
        if (existing && UUID_RE.test(existing)) return existing;
      }
    } catch (e) { /* ignore unreadable storage */ }
    if (!memoryBid || !UUID_RE.test(memoryBid)) memoryBid = makeUuid();
    try {
      if (store) store.setItem(BID_KEY, memoryBid);
    } catch (e) { /* private mode */ }
    return memoryBid;
  }

  function clampCount(n) {
    var value = Math.round(Number(n));
    if (!isFinite(value) || value < 0) return 0;
    return value;
  }

  function sanitizeCounts(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    return {
      views: clampCount(raw.views),
      downloads: clampCount(raw.downloads),
      likes: clampCount(raw.likes),
    };
  }

  function copyCounts(row) {
    if (!row) return null;
    return { views: row.views, downloads: row.downloads, likes: row.likes };
  }

  function normalizeIds(ids) {
    var arr = [];
    if (ids == null) return arr;
    if (typeof ids === "string") arr = [ids];
    else if (typeof ids.length === "number") {
      for (var i = 0; i < ids.length; i++) arr.push(ids[i]);
    }
    var out = [];
    var seen = Object.create(null);
    for (var j = 0; j < arr.length; j++) {
      if (arr[j] == null || arr[j] === "") continue;
      var key = String(arr[j]);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(key);
    }
    return out;
  }

  function snapshot(ok) {
    var copy = {};
    var liked = [];
    for (var id in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, id)) copy[id] = copyCounts(counts[id]);
    }
    for (var lid in likedSet) {
      if (likedSet[lid]) liked.push(lid);
    }
    return { counts: copy, liked: liked, ok: !!ok };
  }

  function emptyResult() {
    counts = Object.create(null);
    likedSet = Object.create(null);
    return { counts: {}, liked: [], ok: false };
  }

  function doFetch(url, opts) {
    var f = null;
    try {
      if (typeof window.fetch === "function") f = window.fetch;
    } catch (e) { f = null; }
    if (!f && typeof fetch === "function") f = fetch;
    if (!f) return Promise.reject(new Error("no fetch"));
    return f.call(window, url, opts);
  }

  /* 3s cap. Abort when the platform allows it; always stop waiting at 3s. */
  function request(url, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var done = false;
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var opts = {
        method: options.method || "GET",
        mode: "cors",
        credentials: "omit",
        cache: options.cache || "no-store",
        keepalive: !!options.keepalive,
      };
      if (options.headers) opts.headers = options.headers;
      if (options.body != null) opts.body = options.body;
      if (ctrl) opts.signal = ctrl.signal;

      function finish(err, value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      }

      var timer = setTimeout(function () {
        if (ctrl) {
          try { ctrl.abort(); } catch (e) { /* already settled */ }
        }
        finish(new Error("timeout"));
      }, TIMEOUT_MS);

      try {
        doFetch(url, opts).then(function (res) {
          finish(null, res);
        }, function (err) {
          finish(err || new Error("fetch"));
        });
      } catch (e) {
        finish(e);
      }
    });
  }

  function readJson(res) {
    if (!res || !res.ok) return Promise.reject(new Error("status"));
    return res.text().then(function (text) {
      if (!text) return null;
      return JSON.parse(text);
    });
  }

  function applyPayload(data, requested, revSnap) {
    var nextCounts = Object.create(null);
    var nextLiked = Object.create(null);
    var rawCounts = data && data.counts && typeof data.counts === "object" ? data.counts : {};
    for (var id in rawCounts) {
      if (!Object.prototype.hasOwnProperty.call(rawCounts, id)) continue;
      nextCounts[id] = sanitizeCounts(rawCounts[id]);
    }
    for (var r = 0; r < requested.length; r++) {
      if (!nextCounts[requested[r]]) nextCounts[requested[r]] = sanitizeCounts(null);
    }
    var liked = data && Array.isArray(data.liked) ? data.liked : [];
    for (var i = 0; i < liked.length; i++) {
      if (liked[i] == null || liked[i] === "") continue;
      nextLiked[String(liked[i])] = true;
    }
    for (var key in rev) {
      if ((revSnap[key] || 0) === rev[key]) continue;
      if (counts[key]) nextCounts[key] = copyCounts(counts[key]);
      else delete nextCounts[key];
      if (likedSet[key]) nextLiked[key] = true;
      else delete nextLiked[key];
    }
    counts = nextCounts;
    likedSet = nextLiked;
    return snapshot(true);
  }

  function mergePayloads(parts, requested, revSnap) {
    var merged = { counts: {}, liked: [] };
    var seen = Object.create(null);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i] || {};
      var raw = part.counts && typeof part.counts === "object" ? part.counts : {};
      for (var id in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, id)) merged.counts[id] = raw[id];
      }
      var liked = Array.isArray(part.liked) ? part.liked : [];
      for (var j = 0; j < liked.length; j++) {
        var lid = liked[j] == null ? "" : String(liked[j]);
        if (!lid || seen[lid]) continue;
        seen[lid] = true;
        merged.liked.push(lid);
      }
    }
    return applyPayload(merged, requested, revSnap);
  }

  function load(ids) {
    try {
      var base = apiBase();
      if (!base) return Promise.resolve(emptyResult());
      var list = normalizeIds(ids);
      if (!list.length) return Promise.resolve(snapshot(true));

      var batches = [];
      for (var i = 0; i < list.length; i += BATCH_SIZE) {
        batches.push(list.slice(i, i + BATCH_SIZE));
      }
      var bid = browserId();
      var revSnap = Object.create(null);
      for (var rk in rev) revSnap[rk] = rev[rk];
      var jobs = [];
      for (var b = 0; b < batches.length; b++) {
        (function (batch) {
          var q = [];
          for (var k = 0; k < batch.length; k++) q.push(encodeURIComponent(batch[k]));
          var url = base + "/stats?ids=" + q.join(",") + "&bid=" + encodeURIComponent(bid);
          jobs.push(request(url, { method: "GET" }).then(readJson));
        })(batches[b]);
      }
      return Promise.all(jobs).then(function (parts) {
        return mergePayloads(parts, list, revSnap);
      }).catch(function () {
        return emptyResult();
      });
    } catch (e) {
      return Promise.resolve(emptyResult());
    }
  }

  function isLiked(id) {
    var key = String(id == null ? "" : id);
    return !!likedSet[key];
  }

  function get(id) {
    var key = String(id == null ? "" : id);
    return copyCounts(counts[key]);
  }

  function countsFromLikeResponse(id, data) {
    if (!data || typeof data !== "object") return null;
    var c = data.counts;
    if (c && typeof c === "object") {
      if (c[id] && typeof c[id] === "object") return sanitizeCounts(c[id]);
      if (
        typeof c.views === "number" ||
        typeof c.likes === "number" ||
        typeof c.downloads === "number"
      ) {
        return sanitizeCounts(c);
      }
    }
    if (
      typeof data.views === "number" ||
      typeof data.likes === "number" ||
      typeof data.downloads === "number"
    ) {
      return sanitizeCounts(data);
    }
    return null;
  }

  function performToggle(key) {
    var had = Object.prototype.hasOwnProperty.call(counts, key);
    var prev = had ? copyCounts(counts[key]) : null;
    var wasLiked = !!likedSet[key];
    var nowLiked = !wasLiked;
    var baseRow = prev || { views: 0, downloads: 0, likes: 0 };
    rev[key] = (rev[key] || 0) + 1;
    var myRev = rev[key];
    counts[key] = {
      views: baseRow.views,
      downloads: baseRow.downloads,
      likes: Math.max(0, baseRow.likes + (nowLiked ? 1 : -1)),
    };
    if (nowLiked) likedSet[key] = true;
    else delete likedSet[key];

    var url = apiBase() + "/like/" + encodeURIComponent(key);
    return request(url, {
      method: nowLiked ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bid: browserId() }),
      keepalive: true,
    }).then(readJson).then(function (data) {
      if (rev[key] !== myRev) return !!likedSet[key];
      var next = countsFromLikeResponse(key, data);
      if (next) counts[key] = next;
      if (data && typeof data.liked === "boolean") {
        if (data.liked) likedSet[key] = true;
        else delete likedSet[key];
      }
      return !!likedSet[key];
    }).catch(function () {
      if (rev[key] !== myRev) return !!likedSet[key];
      if (prev) counts[key] = prev;
      else delete counts[key];
      if (wasLiked) likedSet[key] = true;
      else delete likedSet[key];
      return !!likedSet[key];
    });
  }

  /* Optimistic before the request is issued. Resolves to the settled liked flag; never rejects. */
  function toggleLike(id) {
    var key = String(id == null ? "" : id);
    if (!key || !apiBase()) return Promise.resolve(false);

    function start() {
      var p;
      try { p = performToggle(key); }
      catch (e) { p = Promise.resolve(!!likedSet[key]); }
      var tracked = p.then(function (v) { return v; }, function () { return false; });
      likeTail[key] = tracked;
      tracked.then(function () {
        if (likeTail[key] === tracked) delete likeTail[key];
      });
      return p;
    }

    var busy = likeTail[key];
    if (busy) return busy.then(start, start);
    return start();
  }

  function rememberView(key) {
    if (seenView[key]) return false;
    var list = null;
    try {
      var raw = window.sessionStorage.getItem(VIEW_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      }
      if (!list) list = [];
      for (var i = 0; i < list.length; i++) {
        if (String(list[i]) === key) {
          seenView[key] = true;
          return false;
        }
      }
      list.push(key);
      window.sessionStorage.setItem(VIEW_KEY, JSON.stringify(list));
    } catch (e) {
      /* sessionStorage blocked: in-memory dedupe still applies */
    }
    seenView[key] = true;
    return true;
  }

  function view(id) {
    try {
      var key = String(id == null ? "" : id);
      var base = apiBase();
      if (!key || !base) return;
      if (!rememberView(key)) return;
      request(base + "/view/" + encodeURIComponent(key), {
        method: "POST",
        keepalive: true,
      }).catch(function () {});
    } catch (e) { /* silent */ }
  }

  function download(id, vehicle) {
    try {
      var key = String(id == null ? "" : id);
      var vehicleKey = String(vehicle == null ? "" : vehicle);
      var base = apiBase();
      if (!key || !vehicleKey || !base) return;
      var url = base + "/download/" + encodeURIComponent(key) + "/" + encodeURIComponent(vehicleKey);
      try {
        var nav = window.navigator;
        if (nav && typeof nav.sendBeacon === "function" && nav.sendBeacon(url)) return;
      } catch (e) { /* fall through */ }
      request(url, { method: "POST", keepalive: true }).catch(function () {});
    } catch (e) { /* silent */ }
  }

  /* 999 -> "999"; 1200 -> "1.2k"; 1000 -> "1k". */
  function formatCount(n) {
    var value = Math.round(Number(n));
    if (!isFinite(value) || value < 0) value = 0;
    if (value < 1000) return String(value);
    var text = (Math.round((value / 1000) * 10) / 10).toFixed(1);
    if (text.slice(-2) === ".0") text = text.slice(0, -2);
    return text + "k";
  }

  window.pswStats = {
    load: load,
    isLiked: isLiked,
    get: get,
    toggleLike: toggleLike,
    view: view,
    download: download,
    formatCount: formatCount,
  };
})();
