  /* ---------------- basics ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const snap = (v) => Math.round(v / 10) * 10;
  const STORE_KEY = "uml-agent-v2", OLD_KEY = "uml-agent-citygml-v1", VIEW_KEY = "uml-agent-view";
  const SANS = '"IBM Plex Sans", system-ui, sans-serif';
  const MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const inClaude = !!(window.claude && typeof window.claude.use === "function");
  const KIND_LABEL = { association: "Association", aggregation: "Agrégation", composition: "Composition", generalization: "Héritage", realization: "Réalisation", dependency: "Dépendance" };
  const EXT_PKG = "Classes externes";

  const readStore = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const writeStore = (k, v) => { try { localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

  /* ---------------- state ---------------- */
  let S = null;
  let undoStack = [], redoStack = [];
  let issues = [];
  const sel = { nodes: new Set(), notes: new Set(), rel: null };
  const fresh = () => ({ added: new Set(), modified: new Set() });
  let recent = fresh();
  const view = { x: 40, y: 60, k: 1 };
  const opts = Object.assign({ fullChain: false, refAttrs: false, ops: true, frames: true }, readStore(VIEW_KEY) || {});
  let mode = null, connectFrom = null;
  let geo = {};
  let drag = null;
  let clipboard = null;
  let openRow = null;
  let sample = null, toolsOK = false, downloads = null, agentCtl = null;
  let chatTurns = [];
  const pendingNear = {};

  const svg = $("#svg"), vp = $("#viewport"), stage = $("#stage");

  /* ---------------- selection ---------------- */
  const selCount = () => sel.nodes.size + sel.notes.size + (sel.rel ? 1 : 0);
  function selOne() {
    if (selCount() !== 1) return null;
    if (sel.rel) return { kind: "rel", id: sel.rel };
    if (sel.notes.size) return { kind: "note", id: [...sel.notes][0] };
    const id = [...sel.nodes][0];
    return { kind: Core.findClass(S.model, id) ? "class" : "ref", id };
  }
  function clearSel() { sel.nodes.clear(); sel.notes.clear(); sel.rel = null; }
  function fixSel() {
    for (const n of [...sel.nodes]) if (!Core.resolve(S.model, n)) sel.nodes.delete(n);
    for (const n of [...sel.notes]) if (!S.model.notes.some((x) => x.id === n)) sel.notes.delete(n);
    if (sel.rel && !sel.rel.startsWith("lib:") && !S.model.relations.some((r) => r.id === sel.rel)) sel.rel = null;
  }
  function select(what, { add = false, inspector = true } = {}) {
    if (!add) clearSel();
    if (what) {
      if (what.kind === "rel") { clearSel(); sel.rel = what.id; }
      else { sel.rel = null; const set = what.kind === "note" ? sel.notes : sel.nodes; if (add && set.has(what.id)) set.delete(what.id); else set.add(what.id); }
    }
    openRow = null;
    render(); renderTreeSel();
    if (inspector) renderInspector();
  }

  /* ---------------- persistence & history ---------------- */
  const snapshot = () => JSON.stringify(S);
  function save() { writeStore(STORE_KEY, snapshot()); }
  function load() {
    for (const k of [STORE_KEY, OLD_KEY]) {
      const st = readStore(k);
      if (st && st.model && Array.isArray(st.model.classes)) { try { return prepare(st); } catch (e) { /* unreadable: ignore */ } }
    }
    return null;
  }
  function prepare(st) {
    Core.migrate(st);
    st.layout.hidden = st.layout.hidden || [];
    return st;
  }
  let lastNudge = 0;
  function pushUndo(before) { undoStack.push(before); if (undoStack.length > 120) undoStack.shift(); redoStack = []; }
  function undo() { if (!undoStack.length) return; closeInline(false); redoStack.push(snapshot()); S = JSON.parse(undoStack.pop()); fixSel(); afterChange(); }
  function redo() { if (!redoStack.length) return; closeInline(false); undoStack.push(snapshot()); S = JSON.parse(redoStack.pop()); fixSel(); afterChange(); }

  // every model change goes through here
  function runOps(ops, { source = "ui", inspector = true, quiet = false } = {}) {
    const before = snapshot();
    const res = Core.applyOps(S, ops);
    if (res.failed.length && source === "ui" && !quiet) toast(res.failed[0].error);
    if (!res.applied) return res;
    pushUndo(before);
    for (const [o, n] of Object.entries(res.ctx.renamed)) {
      if (sel.nodes.delete(o)) sel.nodes.add(n);
      const i = S.layout.hidden.indexOf(o); if (i >= 0) S.layout.hidden[i] = n;
    }
    for (const d of res.ctx.deleted) { sel.nodes.delete(d); S.layout.hidden = S.layout.hidden.filter((x) => x !== d); }
    if (source === "ui") recent = fresh();
    else { res.ctx.added.forEach((n) => recent.added.add(n)); res.ctx.modified.forEach((n) => { if (!recent.added.has(n)) recent.modified.add(n); }); }
    fixSel();
    afterChange({ inspector });
    return res;
  }
  // layout-only change (positions, routing, visibility)
  function layoutChange(fn, { inspector = false } = {}) {
    const before = snapshot();
    fn();
    pushUndo(before);
    afterChange({ inspector, modelSame: true });
  }

  /* ---------------- measurement ---------------- */
  const mctx = document.createElement("canvas").getContext("2d");
  const F = {
    st: `400 10.5px ${SANS}`, nm: `600 13px ${SANS}`, nmi: `italic 600 13px ${SANS}`, pre: `400 13px ${SANS}`,
    at: `400 11.5px ${MONO}`, note: `400 11.5px ${SANS}`, pk: `600 11px ${SANS}`
  };
  const twCache = new Map();
  function tw(t, font) {
    const key = font + "|" + t;
    let v = twCache.get(key);
    if (v == null) { mctx.font = font; v = mctx.measureText(t).width; if (twCache.size > 20000) twCache.clear(); twCache.set(key, v); }
    return v;
  }

  const pkgOf = (c) => (c.external ? EXT_PKG : c.package || S.model.name);
  function isHidden(c) { return S.layout.hidden.includes(c.name) || S.layout.hiddenPackages.includes(pkgOf(c)); }

  function nodeBox(name) {
    const c = Core.resolve(S.model, name);
    if (!c) return null;
    const lib = !!c.ref, ext = !!c.external;
    const lit = Core.isLiteralClass(c);
    const stTxt = c.stereotype ? "«" + c.stereotype + "»" : "";
    const prefix = lib ? c.module + "::" : "";
    const showAttrs = !lib || opts.refAttrs;
    const attrs = showAttrs ? c.attributes.map((a) => ({ t: Core.attrText(a, lit), u: !!a.static })) : [];
    const ops = !lib && opts.ops ? (c.operations || []).map((o) => ({ t: Core.opText(o), u: !!o.static, it: !!o.abstract })) : [];
    const nf = c.abstract ? F.nmi : F.nm;
    let w = Math.max(tw(stTxt, F.st), tw(prefix, F.pre) + tw(c.name, nf), ...attrs.map((l) => tw(l.t, F.at)), ...ops.map((l) => tw(l.t, F.at))) + 26;
    w = Math.max(120, Math.ceil(w / 10) * 10);
    const headH = stTxt ? 42 : 32;
    const attrH = showAttrs ? (attrs.length ? attrs.length * 16 + 10 : ops.length || ext ? 8 : 14) : 0;
    const opsH = ops.length ? ops.length * 16 + 10 : 0;
    return { c, lib, ext, stTxt, prefix, attrs, ops, w, h: headH + attrH + opsH, headH, attrH, opsH };
  }

  function visibleNames() {
    const own = S.model.classes.filter((c) => !isHidden(c)).map((c) => c.name);
    const vis = new Set(own);
    const refs = new Set();
    const chain = (n) => { let c = Core.LIB[n]; while (c && !Core.findClass(S.model, c.name)) { refs.add(c.name); if (!opts.fullChain) break; c = c.superclass ? Core.LIB[c.superclass] : null; } };
    for (const r of S.model.relations) {
      if (vis.has(r.from) && Core.LIB[r.to] && !Core.findClass(S.model, r.to)) chain(r.to);
      if (vis.has(r.to) && Core.LIB[r.from] && !Core.findClass(S.model, r.from)) chain(r.from);
    }
    return [...own, ...refs];
  }

  function computeGeo() {
    geo = {};
    for (const n of visibleNames()) {
      const b = nodeBox(n);
      if (!b) continue;
      const p = S.layout.nodes[n];
      geo[n] = Object.assign(b, { x: p ? p.x : null, y: p ? p.y : null, pinned: !!(p && p.pinned) });
    }
  }

  function layoutInput(names, fixedOf) {
    const visible = new Set(names);
    const nodes = {};
    const parents = {}, links = {};
    names.forEach((n) => { parents[n] = []; links[n] = []; });
    const owner = {};
    for (const r of S.model.relations) {
      if (!visible.has(r.from) || !visible.has(r.to) || r.from === r.to) continue;
      if (r.kind === "generalization") parents[r.from].push(r.to);
      else { links[r.from].push(r.to); links[r.to].push(r.from); if (r.kind === "composition" || r.kind === "aggregation") owner[r.to] = owner[r.to] || r.from; }
    }
    names.forEach((n) => { const c = geo[n].c; if (c.ref && c.superclass && visible.has(c.superclass)) parents[n].push(c.superclass); });
    const kids = new Set();
    names.forEach((n) => parents[n].forEach((p) => kids.add(p)));
    names.forEach((n) => {
      const g = geo[n], c = g.c;
      const typeLike = ["DataType", "CodeList", "Enumeration", "Union"].includes(c.stereotype) && !parents[n].length && !kids.has(n) && !links[n].length;
      nodes[n] = { w: g.w, h: g.h, parents: parents[n], links: links[n], type: typeLike, kind: c.stereotype, owner: owner[n] || null, fixed: fixedOf(n, g) };
    });
    return nodes;
  }

  // "all": start over; "free": keep hand-placed boxes; used by the Auto-layout button and after an import
  function runLayout(all) {
    computeGeo();
    const names = Object.keys(geo);
    const nodes = layoutInput(names, (n, g) => (!all && g.pinned && g.x != null ? { x: g.x, y: g.y } : null));
    const pos = Core.layout(nodes);
    for (const n of names) {
      const keep = nodes[n].fixed;
      S.layout.nodes[n] = keep ? { x: keep.x, y: keep.y, pinned: true } : { x: snap(pos[n].x), y: snap(pos[n].y) };
    }
    if (all) S.layout.edges = {};
    computeGeo();
    for (const [id, p] of Object.entries(S.layout.notes)) if (p.auto || all) delete S.layout.notes[id];
    placeNotes();
  }

  function freeSpot(x, y, w, h, boxes) {
    const hit = (r) => boxes.some((o) => r.x < o.x + o.w + 30 && r.x + r.w + 30 > o.x && r.y < o.y + o.h + 30 && r.y + r.h + 30 > o.y);
    const r = { x: snap(x), y: snap(y), w, h };
    let guard = 0;
    while (hit(r) && guard++ < 200) r.x += 40;
    return r;
  }
  // boxes that have no position yet: next to a relative when there are few, as a separate block when there are many
  function placeNew() {
    const names = Object.keys(geo);
    const fresh_ = names.filter((n) => geo[n].x == null);
    if (!fresh_.length) return;
    const placed = names.filter((n) => geo[n].x != null);
    if (!placed.length) { runLayout(false); return; }
    const boxes = placed.map((n) => ({ x: geo[n].x, y: geo[n].y, w: geo[n].w, h: geo[n].h }));
    const bb = bbox(true);
    if (fresh_.length > 8) {
      const nodes = layoutInput(fresh_, () => null);
      const pos = Core.layout(nodes);
      for (const n of fresh_) S.layout.nodes[n] = { x: snap(bb.x + bb.w + 120 + pos[n].x), y: snap(bb.y + pos[n].y) };
    } else {
      for (const n of fresh_) {
        const g = geo[n];
        let spot = null;
        for (const r of S.model.relations) {
          const other = r.from === n ? r.to : r.to === n ? r.from : null;
          const o = other && other !== n && geo[other];
          if (!o || o.x == null) continue;
          const hier = r.kind === "generalization" || r.kind === "realization";
          spot = !hier ? freeSpot(o.x + o.w + 80, o.y, g.w, g.h, boxes) : r.from === n ? freeSpot(o.x, o.y + o.h + 70, g.w, g.h, boxes) : freeSpot(o.x, o.y - g.h - 70, g.w, g.h, boxes);
          break;
        }
        if (!spot && g.c.ref) { const kid = placed.find((k) => (geo[k].c.superclass === n)); if (kid) spot = freeSpot(geo[kid].x, geo[kid].y - g.h - 70, g.w, g.h, boxes); }
        if (!spot) spot = freeSpot(bb.x + bb.w + 60, bb.y, g.w, g.h, boxes);
        S.layout.nodes[n] = { x: spot.x, y: spot.y };
        g.x = spot.x; g.y = spot.y;
        boxes.push(spot);
      }
    }
    computeGeo();
  }

  function wrapText(text, maxW) {
    const out = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const t = line ? line + " " + w : w;
        if (tw(t, F.note) > maxW && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  function noteGeo(n) {
    const p = S.layout.notes[n.id] || { x: 0, y: 0, w: 210 };
    const lines = wrapText(n.text || " ", p.w - 22);
    return { x: p.x, y: p.y, w: p.w, lines, h: Math.max(44, lines.length * 16 + 18) };
  }
  function placeNotes() {
    const bb = bbox(true);
    let y = bb.y;
    const boxes = Object.values(geo).filter((g) => g.x != null).map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h }));
    for (const n of S.model.notes) if (S.layout.notes[n.id]) { const g = noteGeo(n); boxes.push({ x: g.x, y: g.y, w: g.w, h: g.h }); }
    const free = (r) => !boxes.some((o) => r.x < o.x + o.w + 16 && r.x + r.w + 16 > o.x && r.y < o.y + o.h + 16 && r.y + r.h + 16 > o.y);
    for (const n of S.model.notes) {
      if (S.layout.notes[n.id]) continue;
      const g = n.near && geo[n.near];
      const h = Math.max(44, wrapText(n.text || " ", 188).length * 16 + 18);
      let spot = null;
      if (g && g.x != null) {
        for (const [cx, cy] of [[g.x + g.w + 40, g.y], [g.x, g.y + g.h + 30], [g.x - 250, g.y], [g.x, g.y - h - 40]]) { const r = { x: cx, y: cy, w: 210, h }; if (free(r)) { spot = r; break; } }
      }
      if (!spot) { spot = { x: bb.x + bb.w + 50, y, w: 210, h }; while (!free(spot)) spot.y += 30; y = spot.y + h + 30; }
      S.layout.notes[n.id] = { x: snap(spot.x), y: snap(spot.y), w: 210, auto: true };
      boxes.push(spot);
    }
  }
  function ensurePositions() {
    computeGeo();
    placeNew();
    placeNotes();
  }
  function bbox(nodesOnly, names) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of names || Object.keys(geo)) { const g = geo[n]; if (!g || g.x == null) continue; x1 = Math.min(x1, g.x); y1 = Math.min(y1, g.y); x2 = Math.max(x2, g.x + g.w); y2 = Math.max(y2, g.y + g.h); }
    if (!nodesOnly) for (const n of S.model.notes) { if (!S.layout.notes[n.id]) continue; const g = noteGeo(n); x1 = Math.min(x1, g.x); y1 = Math.min(y1, g.y); x2 = Math.max(x2, g.x + g.w); y2 = Math.max(y2, g.y + g.h); }
    if (x1 === Infinity) return { x: 0, y: 0, w: 400, h: 300 };
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  let hintTimer = null;
  function toast(t) { const h = $("#hint"); h.hidden = false; h.textContent = t; clearTimeout(hintTimer); hintTimer = setTimeout(updateHint, 3200); }
  function updateHint() {
    const h = $("#hint");
    if (mode !== "link") { h.hidden = true; return; }
    h.hidden = false;
    h.textContent = connectFrom ? `Depuis ${connectFrom}: clique la classe cible (Échap pour annuler)` : "Relier: clique la classe de départ";
  }
