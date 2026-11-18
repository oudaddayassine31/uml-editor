  /* ---------------- actions ---------------- */
  const isIso = () => S.model.profile !== "uml";
  function uniqueName(base) { let n = base, i = 1; while (Core.resolve(S.model, n)) n = base + ++i; return n; }
  function addClassAt(wx, wy, extra = {}) {
    const name = uniqueName("NewClass");
    const before = snapshot();
    const res = Core.applyOps(S, [{ op: "add_class", name, abstract: false, ...(S.model.profile === "citygml" ? { superclass: "AbstractOccupiedSpace" } : {}), ...extra }]);
    if (res.failed.length) { toast(res.failed[0].error); return null; }
    S.layout.nodes[name] = { x: snap(wx), y: snap(wy), pinned: true };
    pushUndo(before);
    recent = fresh();
    clearSel(); sel.nodes.add(name);
    afterChange();
    return name;
  }
  function addNoteAt(wx, wy, near) {
    const before = snapshot();
    const res = Core.applyOps(S, [{ op: "add_note", text: "Note", near }]);
    const id = res.results[0];
    S.layout.notes[id] = { x: snap(wx), y: snap(wy), w: 210 };
    pushUndo(before);
    clearSel(); sel.notes.add(id);
    afterChange();
    editNote(id);
  }
  function createRelation(from, to, kind) {
    const iso = isIso(), assoc = Core.ASSOC_KINDS.includes(kind);
    const op = { op: "add_relation", kind, from, to };
    if (assoc && iso) { op.toRole = to.charAt(0).toLowerCase() + to.slice(1); op.toMult = "0..*"; }
    const res = runOps([op]);
    if (res.results[0]) select({ kind: "rel", id: res.results[0] });
  }
  function kindMenu(cx, cy, from, to, onNew) {
    const glyph = { association: "──>", aggregation: "◇──", composition: "◆──", generalization: "──▷", realization: "- -▷", dependency: "- ->" };
    const order = ["association", "composition", "aggregation", "generalization", "realization", "dependency"];
    openMenu(cx, cy, order.map((k) => ({
      label: KIND_LABEL[k] + (k === "generalization" && to ? ` (${from} hérite de ${to})` : ""), hint: glyph[k],
      act: () => { const target = to || onNew(); if (target) createRelation(from, target, k); }
    })));
  }
  function deleteSelection() {
    const ops = [];
    for (const n of sel.nodes) if (Core.findClass(S.model, n)) ops.push({ op: "delete_class", name: n });
    for (const n of sel.notes) ops.push({ op: "delete_note", id: n });
    if (sel.rel && !sel.rel.startsWith("lib:")) ops.push({ op: "delete_relation", id: sel.rel });
    if (!ops.length) { if (sel.nodes.size) toast("Les classes CityGML sont en lecture seule: supprime le lien qui les référence."); return; }
    clearSel();
    runOps(ops);
  }
  function hideClasses(names) {
    layoutChange(() => { for (const n of names) if (Core.findClass(S.model, n) && !S.layout.hidden.includes(n)) S.layout.hidden.push(n); clearSel(); }, { inspector: true });
  }
  function copySelection() {
    const names = [...sel.nodes].filter((n) => Core.findClass(S.model, n));
    if (!names.length) return false;
    clipboard = {
      classes: names.map((n) => Core.clone(Core.findClass(S.model, n))),
      relations: S.model.relations.filter((r) => names.includes(r.from) && names.includes(r.to)).map(Core.clone),
      pos: Object.fromEntries(names.map((n) => [n, { ...(S.layout.nodes[n] || { x: 0, y: 0 }) }])), n: 0,
      style: Object.fromEntries(names.filter((n) => S.layout.style.classes[n]).map((n) => [n, { ...S.layout.style.classes[n] }]))
    };
    return true;
  }
  function pasteClipboard() {
    if (!clipboard) return;
    clipboard.n++;
    const map = {}, ops = [];
    const taken = new Set();
    for (const c of clipboard.classes) {
      let base = c.name.replace(/\d+$/, "") || c.name, n = c.name, i = 1;
      while (Core.resolve(S.model, n) || taken.has(n)) n = base + ++i;
      taken.add(n); map[c.name] = n;
      ops.push({ op: "add_class", name: n, stereotype: c.stereotype, abstract: c.abstract, package: c.external ? undefined : c.package, external: c.external, doc: c.doc, attributes: c.attributes, operations: c.operations });
    }
    for (const r of clipboard.relations) ops.push({ ...r, id: undefined, op: "add_relation", from: map[r.from], to: map[r.to] });
    const before = snapshot();
    const res = Core.applyOps(S, ops);
    if (!res.applied) return;
    const d = 30 * clipboard.n;
    for (const [o, n] of Object.entries(map)) {
      const p = clipboard.pos[o]; S.layout.nodes[n] = { x: snap(p.x + d), y: snap(p.y + d), pinned: true };
      if (clipboard.style[o]) S.layout.style.classes[n] = { ...clipboard.style[o] };
    }
    pushUndo(before);
    recent = fresh();
    clearSel(); Object.values(map).forEach((n) => sel.nodes.add(n));
    afterChange();
  }
  function alignSelection(how) {
    const items = [...sel.nodes].filter((n) => geo[n] && geo[n].x != null).map((n) => ({ p: S.layout.nodes[n], w: geo[n].w, h: geo[n].h }));
    if (items.length < 2) return;
    layoutChange(() => {
      const xs = items.map((i) => i.p.x), ys = items.map((i) => i.p.y);
      const x1 = Math.min(...xs), x2 = Math.max(...items.map((i) => i.p.x + i.w)), y1 = Math.min(...ys), y2 = Math.max(...items.map((i) => i.p.y + i.h));
      const dist = (key, size) => {
        const s = [...items].sort((a, b) => a.p[key] - b.p[key]);
        const total = s.reduce((t, i) => t + i[size], 0), lo = s[0].p[key], hi = s[s.length - 1].p[key] + s[s.length - 1][size];
        const gap = (hi - lo - total) / (s.length - 1);
        let cur = lo;
        s.forEach((i) => { i.p[key] = snap(cur); cur += i[size] + gap; });
      };
      for (const i of items) {
        if (how === "l") i.p.x = x1; else if (how === "r") i.p.x = x2 - i.w; else if (how === "c") i.p.x = snap((x1 + x2) / 2 - i.w / 2);
        else if (how === "t") i.p.y = y1; else if (how === "b") i.p.y = y2 - i.h; else if (how === "m") i.p.y = snap((y1 + y2) / 2 - i.h / 2);
        i.p.pinned = true;
      }
      if (how === "dh") dist("x", "w"); if (how === "dv") dist("y", "h");
    });
  }

  /* ---------------- editing in place ---------------- */
  let inline = null;
  function openInline({ wx, wy, ww, wh, value, placeholder = "", mono = true, multiline = false, center = false, onCommit }) {
    closeInline(true);
    const el = multiline ? $("#inlineTa") : $("#inlineEd");
    const k = view.k;
    const w = Math.max(ww * k, multiline ? 180 : 170), h = Math.max(wh * k, multiline ? 70 : 24);
    el.style.left = clamp(wx * k + view.x - (w - ww * k) / 2 * (center ? 1 : 0), 4, Math.max(4, stage.clientWidth - w - 4)) + "px";
    el.style.top = clamp(wy * k + view.y - (h - wh * k) / 2, 4, Math.max(4, stage.clientHeight - h - 4)) + "px";
    el.style.width = w + "px"; el.style.height = h + "px";
    el.style.fontSize = clamp(12 * k, 11, 16) + "px";
    el.style.fontFamily = mono && !multiline ? "var(--font-mono)" : "var(--font-ui)";
    el.style.textAlign = center ? "center" : "left";
    el.value = value; el.placeholder = placeholder; el.hidden = false;
    inline = { el, onCommit, enter: false };
    $("#nodebar").hidden = true;
    el.focus(); el.select();
  }
  function closeInline(commit) {
    if (!inline) return;
    const i = inline; inline = null;
    i.el.hidden = true;
    if (commit) i.onCommit(i.el.value, i.enter);
    placeNodebar();
  }
  for (const el of [$("#inlineEd"), $("#inlineTa")]) {
    el.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape") closeInline(false);
      else if (ev.key === "Enter" && (el.tagName === "INPUT" || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); if (inline) inline.enter = true; closeInline(true); }
    });
    el.addEventListener("blur", () => closeInline(true));
  }
  function renameClass(name) {
    const g = geo[name]; if (!g || g.lib) return;
    const c = g.c;
    openInline({
      wx: g.x + 2, wy: g.y + (g.stTxt ? 18 : 6), ww: g.w - 4, wh: 20, value: c.name, center: true, mono: false,
      onCommit: (v) => {
        v = v.trim();
        const m = v.match(/^(?:«|<<)\s*(.*?)\s*(?:»|>>)\s*(.+)$/);
        const set = {};
        if (m) { set.stereotype = m[1]; v = m[2].trim(); }
        if (v && v !== c.name) set.name = v;
        if (Object.keys(set).length) runOps([{ op: "update_class", name, set }]);
      }
    });
  }
  function memberText(c, kind, i) {
    const m = kind === "a" ? c.attributes[i] : c.operations[i];
    const mod = `${m.static ? "{static} " : ""}${m.abstract ? "{abstract} " : ""}`;
    return mod + (kind === "a" ? Core.attrText(m, Core.isLiteralClass(c)) : Core.opText(m));
  }
  function editMember(name, kind, i) {
    const g = geo[name]; if (!g || g.lib || g.ext) return;
    const c = g.c;
    const top = kind === "a" ? g.headH : g.headH + g.attrH;
    openInline({
      wx: g.x + 2, wy: g.y + top + 4 + i * 16, ww: g.w - 4, wh: 18, value: memberText(c, kind, i),
      onCommit: (v) => {
        v = v.trim();
        const key = kind === "a" ? "attribute" : "operation";
        if (!v) runOps([{ op: "delete_" + key, class: name, index: i }]);
        else if (v !== memberText(c, kind, i)) runOps([kind === "a" ? { op: "update_attribute", class: name, name: c.attributes[i].name, text: v } : { op: "update_operation", class: name, index: i, text: v }]);
      }
    });
  }
  // type a member, Enter adds it and opens the next line; an empty line stops
  function addMember(name, kind) {
    const g = geo[name]; if (!g || g.lib) return;
    const c = g.c, lit = Core.isLiteralClass(c);
    if (kind === "o" && !opts.ops) { opts.ops = true; writeStore(VIEW_KEY, opts); syncViewMenu(); render(); }
    const gg = geo[name];
    const n = kind === "a" ? gg.attrs.length : gg.ops.length;
    const top = kind === "a" ? gg.headH : gg.headH + gg.attrH;
    openInline({
      wx: gg.x + 2, wy: gg.y + top + 4 + n * 16, ww: gg.w - 4, wh: 18, value: "",
      placeholder: kind === "o" ? "nom(param: Type) : Retour" : lit ? "valeur" : isIso() ? "nom : Type [0..1]" : "nom : Type",
      onCommit: (v, enter) => {
        v = v.trim();
        if (!v) return;
        const res = runOps([{ op: kind === "a" ? "add_attribute" : "add_operation", class: name, text: v }]);
        if (enter && !res.failed.length) addMember(name, kind);
      }
    });
  }
  function editRelName(id) {
    const e = edgeList().find((x) => x.key === id); if (!e || !e.r) return;
    const p = labelPos(route(e), e);
    openInline({ wx: p.x - 70, wy: p.y - 14, ww: 140, wh: 20, value: e.r.name, placeholder: "nom du lien", mono: false, center: true, onCommit: (v) => { if (v.trim() !== e.r.name) runOps([{ op: "update_relation", id, set: { name: v.trim() } }]); } });
  }
  function editNote(id) {
    const n = S.model.notes.find((x) => x.id === id); if (!n) return;
    const g = noteGeo(n);
    openInline({ wx: g.x, wy: g.y, ww: g.w, wh: g.h + 16, value: n.text, multiline: true, onCommit: (v) => { if (v !== n.text) runOps([{ op: "update_note", id, text: v }]); } });
  }

  /* ---------------- popup menu ---------------- */
  let menuItems = [];
  function placeMenu(m, cx, cy) {
    m.hidden = false;
    m.style.left = clamp(cx, 4, window.innerWidth - m.offsetWidth - 6) + "px";
    m.style.top = clamp(cy, 4, window.innerHeight - m.offsetHeight - 6) + "px";
  }
  /* target: "sel" (selected classes), "pkg:<name>", "st:<stereotype>" */
  function currentColor(target) {
    const st = S.layout.style;
    if (target.startsWith("pkg:")) return (st.packages[target.slice(4)] || {}).fill || "";
    if (target.startsWith("st:")) return (st.stereotypes[target.slice(3)] || {}).fill || "";
    const fills = [...sel.nodes].map((n) => (st.classes[n] || {}).fill || "");
    return fills.every((f) => f === fills[0]) ? fills[0] || "" : null;
  }
  function swatchesHtml(target) {
    const cur = normColor(currentColor(target) || "") || "";
    return `<div class="swatches" data-target="${esc(target)}">${PALETTE.map(([c, n]) => `<button type="button" class="swb${cur === c ? " on" : ""}" data-color="${c}" style="background:${c}" title="${n}" aria-label="Couleur ${n}"></button>`).join("")}<label class="swb custom" title="Autre couleur"><span class="sr">Autre couleur</span><input type="color" data-colorpick value="${cur || "#dbe7fb"}"></label><button type="button" class="btn small" data-color="">Par défaut</button></div>`;
  }
  function openPalette(cx, cy, target) {
    const m = $("#ctx");
    menuItems = [];
    m.innerHTML = swatchesHtml(target);
    placeMenu(m, cx, cy);
    const f = m.querySelector(".swb.on, .swb"); if (f) f.focus({ preventScroll: true });
  }
  function applyColor(target, color, { keepOpen = false } = {}) {
    layoutChange(() => {
      const st = S.layout.style;
      if (target === "sel") {
        for (const n of sel.nodes) {
          if (!Core.findClass(S.model, n)) continue;
          const cur = st.classes[n] || {};
          if (color) st.classes[n] = { ...cur, fill: color };
          else { delete cur.fill; if (cur.line) st.classes[n] = cur; else delete st.classes[n]; }
        }
      } else {
        const [kind, key] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
        const bag = kind === "pkg" ? st.packages : st.stereotypes;
        if (color) bag[key] = { fill: color }; else delete bag[key];
      }
    }, { inspector: true });
    if (!keepOpen) closeMenu();
  }
  function setColorLine(on) {
    layoutChange(() => {
      const st = S.layout.style;
      for (const n of sel.nodes) {
        if (!Core.findClass(S.model, n)) continue;
        const cur = st.classes[n] || {};
        if (on) st.classes[n] = { ...cur, line: true }; else { delete cur.line; if (cur.fill) st.classes[n] = cur; else delete st.classes[n]; }
      }
    }, { inspector: true });
  }
  // swatch clicks and the custom colour picker, wherever a palette is shown
  function wirePalette(root) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-color]"); if (!b) return;
      const box = b.closest("[data-target]"); if (!box) return;
      e.stopPropagation();
      applyColor(box.dataset.target, b.dataset.color || null);
    });
    root.addEventListener("change", (e) => {
      const i = e.target.closest("[data-colorpick]"); if (!i) return;
      const box = i.closest("[data-target]"); if (!box) return;
      e.stopPropagation();
      applyColor(box.dataset.target, i.value);
    });
  }
  function openMenu(cx, cy, items) {
    const m = $("#ctx");
    menuItems = items;
    m.innerHTML = items.map((it, i) => (it.sep ? "<hr>" : `<button data-i="${i}" class="${it.danger ? "danger" : ""}">${esc(it.label)}${it.hint ? `<span>${esc(it.hint)}</span>` : ""}</button>`)).join("");
    placeMenu(m, cx, cy);
    const f = m.querySelector("button"); if (f) f.focus({ preventScroll: true });
  }
  wirePalette($("#ctx"));
  function closeMenu() { $("#ctx").hidden = true; menuItems = []; }
  $("#ctx").addEventListener("click", (e) => { const b = e.target.closest("button[data-i]"); if (!b) return; const it = menuItems[+b.dataset.i]; closeMenu(); if (it && it.act) it.act(); });
  document.addEventListener("pointerdown", (e) => { if (!$("#ctx").hidden && !e.target.closest("#ctx")) closeMenu(); }, true);

  /* ---------------- pointer ---------------- */
  function toWorld(ev) { const r = svg.getBoundingClientRect(); return [(ev.clientX - r.left - view.x) / view.k, (ev.clientY - r.top - view.y) / view.k]; }
  const nodeAt = (ev) => { const el = document.elementFromPoint(ev.clientX, ev.clientY); const n = el && el.closest && el.closest("[data-node]"); return n ? n.getAttribute("data-node") : null; };

  svg.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    closeInline(true);
    const t = ev.target;
    const hEl = t.closest("[data-h]"), lblEl = t.closest("[data-lbl]"), connEl = t.closest("[data-conn]"), nodeEl = t.closest("[data-node]"), noteEl = t.closest("[data-note]"), edgeEl = t.closest("[data-edge]");
    const [wx, wy] = toWorld(ev);
    const multi = ev.shiftKey || ev.ctrlKey || ev.metaKey;
    if (hEl) {
      drag = { type: "handle", h: hEl.getAttribute("data-h"), key: hEl.getAttribute("data-key"), before: snapshot(), moved: false };
    } else if (lblEl) {
      const key = lblEl.getAttribute("data-lbl");
      if (sel.rel !== key) select({ kind: "rel", id: key });
      const L = S.layout.edges[key] || {};
      drag = { type: "label", key, sx: wx, sy: wy, ox: L.lx || 0, oy: L.ly || 0, before: snapshot(), moved: false };
    } else if (connEl && mode !== "link") {
      drag = { type: "link", from: connEl.getAttribute("data-conn"), moved: false };
    } else if (nodeEl) {
      const id = nodeEl.getAttribute("data-node");
      if (mode === "link") { onLinkClick(id, ev); return; }
      if (multi) { select({ kind: "node", id }, { add: true }); return; }
      if (!sel.nodes.has(id)) select({ kind: "node", id });
      drag = { type: "move", sx: wx, sy: wy, before: snapshot(), moved: false, start: startPositions() };
    } else if (noteEl) {
      const id = noteEl.getAttribute("data-note");
      if (multi) { select({ kind: "note", id }, { add: true }); return; }
      if (!sel.notes.has(id)) select({ kind: "note", id });
      drag = { type: "move", sx: wx, sy: wy, before: snapshot(), moved: false, start: startPositions() };
    } else if (edgeEl) {
      select({ kind: "rel", id: edgeEl.getAttribute("data-edge") });
      return;
    } else if (ev.shiftKey) {
      drag = { type: "band", sx: wx, sy: wy, moved: false };
    } else {
      drag = { type: "pan", sx: ev.clientX, sy: ev.clientY, ox: view.x, oy: view.y, moved: false };
    }
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  });
  function startPositions() {
    const o = { nodes: {}, notes: {} };
    for (const n of sel.nodes) if (S.layout.nodes[n]) o.nodes[n] = { ...S.layout.nodes[n] };
    for (const n of sel.notes) if (S.layout.notes[n]) o.notes[n] = { ...S.layout.notes[n] };
    return o;
  }
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    if (drag.type === "pan") {
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true; svg.classList.add("panning");
      view.x = drag.ox + dx; view.y = drag.oy + dy; applyView();
      return;
    }
    const [wx, wy] = toWorld(ev);
    if (drag.type === "move") {
      const dx = wx - drag.sx, dy = wy - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) * view.k < 3) return;
      if (!drag.moved) { drag.moved = true; $("#nodebar").hidden = true; }
      for (const [n, p] of Object.entries(drag.start.nodes)) Object.assign(S.layout.nodes[n], { x: snap(p.x + dx), y: snap(p.y + dy), pinned: true });
      for (const [n, p] of Object.entries(drag.start.notes)) { Object.assign(S.layout.notes[n], { x: snap(p.x + dx), y: snap(p.y + dy) }); delete S.layout.notes[n].auto; }
      scheduleRender(true);
    } else if (drag.type === "handle") {
      const e = edgeList().find((x) => x.key === drag.key); if (!e) return;
      const L = (S.layout.edges[drag.key] = S.layout.edges[drag.key] || {});
      const r0 = route(e, { ...L, [drag.h === "m" ? "off" : drag.h]: 0 });
      if (drag.h === "m") L.off = Math.round((r0.mode === "v" ? wy : wx) - r0.base);
      else {
        const p = drag.h === "a" ? r0.pts[0] : r0.pts[r0.pts.length - 1];
        const box = geo[drag.h === "a" ? e.from : e.to];
        if (r0.mode === "v") L[drag.h] = Math.round(clamp(wx, box.x + 6, box.x + box.w - 6) - p[0]);
        else if (r0.mode === "h") L[drag.h] = Math.round(clamp(wy, box.y + 6, box.y + box.h - 6) - p[1]);
      }
      drag.moved = true;
      scheduleRender(true);
    } else if (drag.type === "label") {
      const L = (S.layout.edges[drag.key] = S.layout.edges[drag.key] || {});
      L.lx = Math.round(drag.ox + wx - drag.sx); L.ly = Math.round(drag.oy + wy - drag.sy);
      drag.moved = true;
      scheduleRender(true);
    } else if (drag.type === "link") {
      drag.moved = true;
      const g = geo[drag.from];
      $("#gOver").innerHTML = `<line class="linkline" x1="${g.x + g.w}" y1="${g.y + g.h / 2}" x2="${wx}" y2="${wy}"/>`;
    } else if (drag.type === "band") {
      drag.moved = true; drag.ex = wx; drag.ey = wy;
      $("#gOver").innerHTML = `<rect class="rubber" x="${Math.min(drag.sx, wx)}" y="${Math.min(drag.sy, wy)}" width="${Math.abs(wx - drag.sx)}" height="${Math.abs(wy - drag.sy)}"/>`;
    }
  });
  function endDrag(ev) {
    if (!drag) return;
    const d = drag; drag = null;
    svg.classList.remove("panning");
    $("#gOver").innerHTML = "";
    if (d.type === "pan") { if (!d.moved && selCount()) select(null); else placeNodebar(); return; }
    if (d.type === "link") {
      if (!d.moved || !ev) { placeNodebar(); return; }
      const target = nodeAt(ev);
      const [wx, wy] = toWorld(ev);
      if (target) kindMenu(ev.clientX, ev.clientY, d.from, target);
      else kindMenu(ev.clientX, ev.clientY, d.from, null, () => { const n = addClassAt(wx - 60, wy - 20); if (n) setTimeout(() => renameClass(n), 0); return n; });
      return;
    }
    if (d.type === "band") {
      if (d.moved) {
        const x1 = Math.min(d.sx, d.ex), x2 = Math.max(d.sx, d.ex), y1 = Math.min(d.sy, d.ey), y2 = Math.max(d.sy, d.ey);
        clearSel();
        for (const [n, g] of Object.entries(geo)) if (g.x != null && g.x < x2 && g.x + g.w > x1 && g.y < y2 && g.y + g.h > y1) sel.nodes.add(n);
        for (const n of S.model.notes) { const g = noteGeo(n); if (S.layout.notes[n.id] && g.x < x2 && g.x + g.w > x1 && g.y < y2 && g.y + g.h > y1) sel.notes.add(n.id); }
        select(null, { add: true });
      }
      return;
    }
    if (d.moved && d.before) { pushUndo(d.before); afterChange({ modelSame: true, inspector: false }); }
    else placeNodebar();
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", () => endDrag(null));

  svg.addEventListener("dblclick", (ev) => {
    const t = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target; // the pointer is captured by the svg while pressed
    if (!t.closest || !t.closest("#svg")) return;
    const h = t.closest("[data-h]"), edgeEl = t.closest("[data-edge]"), nodeEl = t.closest("[data-node]"), noteEl = t.closest("[data-note]");
    if (h) { const k = h.getAttribute("data-key"); layoutChange(() => { delete S.layout.edges[k]; }); return; }
    if (nodeEl) {
      const name = nodeEl.getAttribute("data-node");
      const g = geo[name];
      if (g.lib) { toast("Classe CityGML en lecture seule. Crée une sous-classe ou un hook depuis l'inspecteur."); return; }
      const mem = t.closest("[data-mem]");
      if (mem && !g.ext) { const [k, i] = mem.getAttribute("data-mem").split(":"); editMember(name, k, +i); }
      else renameClass(name);
      return;
    }
    if (noteEl) { editNote(noteEl.getAttribute("data-note")); return; }
    if (edgeEl) { const k = edgeEl.getAttribute("data-edge"); if (!k.startsWith("lib:")) editRelName(k); return; }
    const [wx, wy] = toWorld(ev);
    const n = addClassAt(wx - 60, wy - 16);
    if (n) renameClass(n);
  });
  svg.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    closeInline(true);
    const r = svg.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    const k2 = clamp(view.k * Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)), 0.08, 3);
    view.x = mx - (mx - view.x) * k2 / view.k; view.y = my - (my - view.y) * k2 / view.k; view.k = k2;
    applyView();
  }, { passive: false });

  svg.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    closeInline(true);
    const t = ev.target;
    const nodeEl = t.closest("[data-node]"), noteEl = t.closest("[data-note]"), edgeEl = t.closest("[data-edge]");
    const [wx, wy] = toWorld(ev);
    const items = [];
    if (nodeEl) {
      const name = nodeEl.getAttribute("data-node"), g = geo[name];
      if (!sel.nodes.has(name)) select({ kind: "node", id: name });
      const many = sel.nodes.size > 1;
      if (!g.lib && !many) {
        const lit = Core.isLiteralClass(g.c);
        items.push({ label: "Renommer", hint: "F2", act: () => renameClass(name) }, { label: lit ? "Ajouter une valeur" : "Ajouter un attribut", act: () => addMember(name, "a") });
        if (!lit) items.push({ label: "Ajouter une opération", act: () => addMember(name, "o") });
        const mem = t.closest("[data-mem]");
        if (mem) { const [k, i] = mem.getAttribute("data-mem").split(":"); items.push({ label: "Modifier cette ligne", act: () => editMember(name, k, +i) }, { label: "Supprimer cette ligne", danger: true, act: () => runOps([{ op: k === "a" ? "delete_attribute" : "delete_operation", class: name, index: +i }]) }); }
        items.push({ sep: true }, { label: "Relier à…", act: () => { setMode("link"); connectFrom = name; updateHint(); render(); } }, { label: "Ajouter une note", act: () => addNoteAt(g.x + g.w + 40, g.y, name) }, { sep: true });
      }
      if (many) items.push({ label: "Aligner à gauche", act: () => alignSelection("l") }, { label: "Aligner en haut", act: () => alignSelection("t") }, { sep: true });
      if (!g.lib) items.push({ label: many ? `Couleur des ${sel.nodes.size} classes…` : "Couleur…", act: () => openPalette(ev.clientX, ev.clientY, "sel") });
      items.push({ label: "Copier", hint: "Ctrl+C", act: copySelection }, { label: "Dupliquer", hint: "Ctrl+D", act: () => { if (copySelection()) pasteClipboard(); } },
        { label: many ? "Masquer la sélection" : "Masquer du diagramme", act: () => hideClasses([...sel.nodes]) });
      if (!many && g.pinned) items.push({ label: "Rendre à l'auto-layout", act: () => layoutChange(() => { delete S.layout.nodes[name].pinned; }) });
      items.push({ sep: true }, { label: many ? `Supprimer ${sel.nodes.size} classes` : "Supprimer", hint: "Suppr", danger: true, act: deleteSelection });
    } else if (noteEl) {
      const id = noteEl.getAttribute("data-note");
      select({ kind: "note", id });
      items.push({ label: "Modifier le texte", act: () => editNote(id) }, { label: "Supprimer la note", danger: true, act: deleteSelection });
    } else if (edgeEl) {
      const key = edgeEl.getAttribute("data-edge");
      select({ kind: "rel", id: key });
      if (key.startsWith("lib:")) return;
      const r = S.model.relations.find((x) => x.id === key);
      items.push({ label: "Nommer le lien", act: () => editRelName(key) }, { label: "Inverser le sens", act: () => flipRel(r) });
      for (const k of Core.REL_KINDS) if (k !== r.kind) items.push({ label: "Changer en " + KIND_LABEL[k].toLowerCase(), act: () => runOps([{ op: "update_relation", id: key, set: { kind: k } }]) });
      items.push({ sep: true }, { label: "Tracé automatique", act: () => layoutChange(() => { delete S.layout.edges[key]; }) }, { label: "Supprimer le lien", hint: "Suppr", danger: true, act: deleteSelection });
    } else {
      items.push({ label: "Nouvelle classe ici", act: () => { const n = addClassAt(wx, wy); if (n) renameClass(n); } }, { label: "Nouvelle note ici", act: () => addNoteAt(wx, wy) });
      if (clipboard) items.push({ label: "Coller", hint: "Ctrl+V", act: pasteClipboard });
      items.push({ sep: true }, { label: "Tout sélectionner", hint: "Ctrl+A", act: selectAll }, { label: "Ajuster à l'écran", act: fit }, { label: "Auto-layout", act: () => $("#btnLayout").click() });
    }
    openMenu(ev.clientX, ev.clientY, items);
  });
  function flipRel(r) {
    if (r.kind === "generalization" || r.kind === "realization") { if (!Core.findClass(S.model, r.to)) { toast("L'héritage doit partir d'une classe du modèle."); return; } }
    runOps([{ op: "update_relation", id: r.id, set: { from: r.to, to: r.from, fromMult: r.toMult, toMult: r.fromMult, toRole: r.fromRole, fromRole: r.toRole } }]);
  }
  function selectAll() { clearSel(); Object.keys(geo).forEach((n) => sel.nodes.add(n)); S.model.notes.forEach((n) => sel.notes.add(n.id)); select(null, { add: true }); }

  /* ---------------- link tool ---------------- */
  function setMode(m) {
    mode = mode === m ? null : m; connectFrom = null;
    $("#btnLink").setAttribute("aria-pressed", String(mode === "link"));
    svg.classList.toggle("connect", !!mode);
    updateHint(); render();
  }
  function onLinkClick(id, ev) {
    if (!connectFrom) { connectFrom = id; updateHint(); render(); return; }
    const from = connectFrom;
    setMode(null);
    kindMenu(ev.clientX, ev.clientY, from, id);
  }

  $("#nodebar").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-nb]"); if (!b) return;
    const one = selOne(); if (!one || one.kind !== "class") return;
    const name = one.id;
    switch (b.dataset.nb) {
      case "attr": addMember(name, "a"); break;
      case "op": addMember(name, "o"); break;
      case "link": setMode("link"); connectFrom = name; updateHint(); render(); break;
      case "dup": if (copySelection()) pasteClipboard(); break;
      case "color": { const r = b.getBoundingClientRect(); openPalette(r.left, r.bottom + 6, "sel"); break; }
      case "hide": hideClasses([name]); break;
      case "del": deleteSelection(); break;
    }
  });

  /* ---------------- keyboard ---------------- */
  document.addEventListener("keydown", (ev) => {
    const tag = (ev.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";
    if (ev.key === "Escape") {
      if (!$("#ctx").hidden) closeMenu();
      else if (!$("#modal").hidden) closeModal();
      else if (mode) setMode(null);
      else if (!typing && selCount()) select(null);
      $$(".menuwrap .menu").forEach((m) => (m.hidden = true));
      return;
    }
    if (typing || !$("#modal").hidden) return;
    const mod = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (mod && k === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); }
    else if (mod && (k === "y" || (k === "z" && ev.shiftKey))) { ev.preventDefault(); redo(); }
    else if (mod && k === "a") { ev.preventDefault(); selectAll(); }
    else if (mod && k === "c") { if (copySelection()) toast(`${clipboard.classes.length} classe${clipboard.classes.length > 1 ? "s" : ""} copiée${clipboard.classes.length > 1 ? "s" : ""}`); }
    else if (mod && k === "d") { ev.preventDefault(); if (copySelection()) pasteClipboard(); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { if (selCount()) { ev.preventDefault(); deleteSelection(); } }
    else if (ev.key === "F2") { const o = selOne(); if (o && o.kind === "class") { ev.preventDefault(); renameClass(o.id); } }
    else if (ev.key.startsWith("Arrow") && (sel.nodes.size || sel.notes.size)) {
      ev.preventDefault();
      const step = ev.altKey ? 1 : 10, dx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0, dy = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
      const now = Date.now();
      if (now - lastNudge > 900) pushUndo(snapshot());
      lastNudge = now;
      for (const n of sel.nodes) { const p = S.layout.nodes[n]; if (p) { p.x += dx; p.y += dy; p.pinned = true; } }
      for (const n of sel.notes) { const p = S.layout.notes[n]; if (p) { p.x += dx; p.y += dy; delete p.auto; } }
      afterChange({ modelSame: true, inspector: false });
    }
  });
  document.addEventListener("paste", (ev) => {
    const tag = (ev.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || !$("#modal").hidden) return;
    const text = ev.clipboardData && ev.clipboardData.getData("text");
    if (text && Core.detectFormat(text) && Core.detectFormat(text) !== "json") { ev.preventDefault(); importSources([{ name: null, text }]); }
    else if (clipboard) { ev.preventDefault(); pasteClipboard(); }
  });

  /* ---------------- toolbar ---------------- */
  $("#btnAddClass").addEventListener("click", () => { const [cx, cy] = viewCenter(); const n = addClassAt(cx - 70, cy - 30); if (n) renameClass(n); });
  $("#btnAddNote").addEventListener("click", () => { const [cx, cy] = viewCenter(); const one = selOne(); addNoteAt(cx - 100, cy - 20, one && one.kind === "class" ? one.id : undefined); });
  $("#btnLink").addEventListener("click", () => setMode("link"));
  $("#btnLayout").addEventListener("click", () => { layoutChange(() => runLayout(false)); fit(); });
  $("#btnUndo").addEventListener("click", undo);
  $("#btnRedo").addEventListener("click", redo);
  $("#btnFit").addEventListener("click", fit);
  $("#btnZoomIn").addEventListener("click", () => zoomBy(1.2));
  $("#btnZoomOut").addEventListener("click", () => zoomBy(1 / 1.2));
  $("#btnIssues").addEventListener("click", () => select(null));
  $("#modelName").addEventListener("change", (e) => runOps([{ op: "set_model", name: e.target.value.trim() || "Model" }], { inspector: !selCount() }));

  function syncViewMenu() { $("#optOps").checked = opts.ops; $("#optFrames").checked = opts.frames; $("#optChain").checked = opts.fullChain; $("#optRefAttrs").checked = opts.refAttrs; }
  for (const [id, key] of [["optOps", "ops"], ["optFrames", "frames"], ["optChain", "fullChain"], ["optRefAttrs", "refAttrs"]]) {
    $("#" + id).addEventListener("change", (e) => { opts[key] = e.target.checked; writeStore(VIEW_KEY, opts); afterChange({ modelSame: true, inspector: false }); });
  }
  $("#btnShowAll").addEventListener("click", () => { $("#viewMenu").hidden = true; layoutChange(() => { S.layout.hidden = []; S.layout.hiddenPackages = []; }); });
  function wireMenu(btn, menu) {
    $(btn).addEventListener("click", (e) => { e.stopPropagation(); const m = $(menu), open = m.hidden; $$(".menuwrap .menu").forEach((x) => (x.hidden = true)); m.hidden = !open; $(btn).setAttribute("aria-expanded", String(open)); });
  }
  wireMenu("#btnExport", "#exportMenu"); wireMenu("#btnView", "#viewMenu");
  document.addEventListener("click", (e) => { if (!e.target.closest(".menuwrap")) $$(".menuwrap .menu").forEach((m) => (m.hidden = true)); });
