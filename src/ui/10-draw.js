  /* ---------------- edges ---------------- */
  function edgeList() {
    const E = [];
    for (const r of S.model.relations) if (geo[r.from] && geo[r.to]) E.push({ key: r.id, r, kind: r.kind, from: r.from, to: r.to, par: 0 });
    for (const n of Object.keys(geo)) { const g = geo[n]; if (g.lib && g.c.superclass && geo[g.c.superclass]) E.push({ key: "lib:" + n, kind: "generalization", from: n, to: g.c.superclass, ref: true, par: 0 }); }
    // several links between the same two boxes are spread apart
    const groups = {};
    for (const e of E) { if (e.kind === "generalization" || e.from === e.to) continue; const k = [e.from, e.to].sort().join("\u0000"); (groups[k] = groups[k] || []).push(e); }
    for (const g of Object.values(groups)) if (g.length > 1) g.forEach((e, i) => (e.par = (i - (g.length - 1) / 2) * 28));
    return E;
  }
  function route(e, L) {
    L = L || S.layout.edges[e.key] || {};
    const A = geo[e.from], B = geo[e.to];
    const off = L.off || 0, pa = (L.a || 0) + e.par, pb = (L.b || 0) + e.par;
    const ax1 = A.x, ax2 = A.x + A.w, ay1 = A.y, ay2 = A.y + A.h, bx1 = B.x, bx2 = B.x + B.w, by1 = B.y, by2 = B.y + B.h;
    const acx = (ax1 + ax2) / 2, acy = (ay1 + ay2) / 2, bcx = (bx1 + bx2) / 2, bcy = (by1 + by2) / 2;
    if (e.from === e.to) {
      const x = ax2, y = clamp(ay1 + 16 + pa, ay1 + 8, ay2 - 34), d = 34 + Math.abs(off);
      return { mode: "s", pts: [[x, y], [x + d, y], [x + d, y + 26], [x, y + 26]], base: 0 };
    }
    const hier = e.kind === "generalization" || e.kind === "realization";
    const vsep = ay2 + 16 < by1 || by2 + 16 < ay1;
    const hsep = ax2 + 16 < bx1 || bx2 + 16 < ax1;
    if (vsep) {
      const down = ay2 < by1;
      const y1 = down ? ay2 : ay1, y2 = down ? by1 : by2;
      let x1 = acx, x2 = bcx, base = (y1 + y2) / 2;
      if (!hier) {
        const lo = Math.max(ax1, bx1) + 16, hi = Math.min(ax2, bx2) - 16;
        if (hi > lo) x1 = x2 = (lo + hi) / 2;
        else { x1 = clamp(bcx, ax1 + 18, ax2 - 18); x2 = clamp(acx, bx1 + 18, bx2 - 18); base += down ? 12 : -12; }
      }
      x1 = clamp(x1 + pa, ax1 + 6, ax2 - 6); x2 = clamp(x2 + pb, bx1 + 6, bx2 - 6);
      const my = base + off;
      return { mode: "v", pts: [[x1, y1], [x1, my], [x2, my], [x2, y2]], base };
    }
    if (hsep) {
      const right = ax2 < bx1;
      const x1 = right ? ax2 : ax1, x2 = right ? bx1 : bx2;
      let y1 = clamp(bcy, ay1 + 14, ay2 - 14), y2 = clamp(acy, by1 + 14, by2 - 14);
      const lo = Math.max(ay1, by1) + 14, hi = Math.min(ay2, by2) - 14;
      if (hi > lo) y1 = y2 = (lo + hi) / 2;
      y1 = clamp(y1 + pa, ay1 + 6, ay2 - 6); y2 = clamp(y2 + pb, by1 + 6, by2 - 6);
      const base = (x1 + x2) / 2, mx = base + off;
      return { mode: "h", pts: [[x1, y1], [mx, y1], [mx, y2], [x2, y2]], base };
    }
    return { mode: "d", pts: [[acx, acy], [bcx, bcy]], base: 0 };
  }
  // labels at an association end: multiplicity on one side of the line, role on the other
  function endLabels(p, q, mult, role, extra = 0) {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    let s = "";
    if (Math.abs(dy) >= Math.abs(dx)) {
      const y = p[1] + Math.sign(dy || 1) * (16 + extra) + 4;
      if (mult) s += `<text class="lb ml" x="${p[0] - 6}" y="${y}" text-anchor="end">${esc(mult)}</text>`;
      if (role) s += `<text class="lb" x="${p[0] + 6}" y="${y}" text-anchor="start">+${esc(role)}</text>`;
    } else {
      const sx = Math.sign(dx || 1), x = p[0] + sx * (10 + extra), anchor = sx > 0 ? "start" : "end";
      if (mult) s += `<text class="lb ml" x="${x}" y="${p[1] - 6}" text-anchor="${anchor}">${esc(mult)}</text>`;
      if (role) s += `<text class="lb" x="${x}" y="${p[1] + 15}" text-anchor="${anchor}">+${esc(role)}</text>`;
    }
    return s;
  }
  function labelPos(r, e) {
    const pts = r.pts, L = S.layout.edges[e.key] || {};
    let x, y, anchor = "middle";
    if (pts.length >= 4) {
      const hx = (pts[1][0] + pts[2][0]) / 2, hy = (pts[1][1] + pts[2][1]) / 2;
      const straightV = r.mode === "v" && Math.abs(pts[1][0] - pts[2][0]) < 1, straightH = r.mode === "h" && Math.abs(pts[1][1] - pts[2][1]) < 1;
      if ((r.mode === "h" && !straightH) || straightV || r.mode === "s") { x = hx + 7; y = hy + 4; anchor = "start"; } else { x = hx; y = hy - 6; }
    } else { x = (pts[0][0] + pts[1][0]) / 2; y = (pts[0][1] + pts[1][1]) / 2 - 6; }
    return { x: x + (L.lx || 0), y: y + (L.ly || 0), anchor };
  }

  /* ---------------- SVG ---------------- */
  function markerDefs() {
    const mk = (id, cls, vb, w, h, rx, ry, d) =>
      `<marker id="${id}" viewBox="${vb}" refX="${rx}" refY="${ry}" markerWidth="${w}" markerHeight="${h}" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path class="${cls}" d="${d}"/></marker>`;
    let s = "";
    for (const [suf, c] of [["", ""], ["-s", " mk-s"], ["-r", " mk-r"]]) {
      s += mk("m-gen" + suf, "mk-hollow" + c, "0 0 14 14", 15, 15, 14, 7, "M1,1 L14,7 L1,13 Z");
      s += mk("m-arrow" + suf, "mk-line" + c, "0 0 12 12", 12, 12, 12, 6, "M1,1 L12,6 L1,11");
      s += mk("m-dia-f" + suf, "mk-solid" + c, "0 0 18 10", 18, 10, 18, 5, "M1,5 L9.5,1 L18,5 L9.5,9 Z");
      s += mk("m-dia-h" + suf, "mk-hollow" + c, "0 0 18 10", 18, 10, 18, 5, "M1,5 L9.5,1 L18,5 L9.5,9 Z");
    }
    return s;
  }
  function svgCss(P) {
    return `
.node .box{fill:${P.canvas};stroke:${P.ink};stroke-width:1.2}
.node .head{fill:${P.no};stroke:none}
.node.st-featuretype .head,.node.st-type .head{fill:${P.ft}}.node.st-datatype .head{fill:${P.dt}}.node.st-codelist .head,.node.st-enumeration .head{fill:${P.cl}}.node.st-union .head{fill:${P.un}}.node.st-interface .head{fill:${P.itf}}
.node .div{stroke:${P.ink};stroke-width:1}
.node text{fill:${P.ink};pointer-events:none}
.node .st{font:400 10.5px ${P.sans};text-anchor:middle;fill:${P.muted}}
.node .nm{font:600 13px ${P.sans};text-anchor:middle}.node .nm.abs{font-style:italic}
.node .pre{fill:${P.muted};font-weight:400;font-style:normal}
.node .at{font:400 11.5px ${P.mono}}.node .at.u{text-decoration:underline}.node .at.it{font-style:italic}
.node .mhit{fill:transparent}.node .tint{pointer-events:none}
.node.dk .head~text.st,.node.dk text.st{fill:#e8edf2}.node.dk text.nm,.node.dk .nm .pre{fill:#ffffff}
.node.lt text.st{fill:#4a5663}.node.lt text.nm{fill:#17202a}.node.lt .nm .pre{fill:#4a5663}
.node.own:not(.ext) .mhit:hover{fill:${P.weak}}
.node.ref .box,.node.ext .box{fill:${P.reffill};stroke:${P.ref};stroke-dasharray:4 3}
.node.ref .head,.node.ext .head{fill:${P.reffill}}.node.ref text,.node.ext text{fill:${P.muted}}.node.ref .div,.node.ext .div{stroke:${P.ref}}
.node.sel .box{stroke:${P.accent};stroke-width:2.4}
.node.src .box{stroke:${P.accent};stroke-width:2.4;stroke-dasharray:6 3}
.node.new .box{stroke:${P.ok};stroke-width:2.2}.node.mod .box{stroke:${P.warn};stroke-width:2.2}
.node.new.sel .box,.node.mod.sel .box{stroke:${P.accent}}
.node .tag{font:500 10px ${P.sans}}.node.new .tag{fill:${P.ok}}.node.mod .tag{fill:${P.warn}}
.flag circle{stroke:none}.flag.err circle{fill:${P.err}}.flag.warn circle{fill:${P.warn}}.flag text{font:600 9px ${P.sans};fill:#fff;text-anchor:middle}
.pin{fill:${P.muted}}
.conn{fill:${P.accent};stroke:${P.canvas};stroke-width:2;cursor:crosshair}.connp{stroke:#fff;stroke-width:1.6;pointer-events:none}
.edge .ln{fill:none;stroke:${P.ink};stroke-width:1.2}.edge .ln.dash{stroke-dasharray:6 4}
.edge.refedge .ln{stroke:${P.ref}}
.edge.sel .ln{stroke:${P.accent};stroke-width:2}
.edge .hit{fill:none;stroke:transparent;stroke-width:12;cursor:pointer;pointer-events:stroke}
.handle{fill:${P.canvas};stroke:${P.accent};stroke-width:1.8;cursor:move}
.edge .lb{font:400 11px ${P.sans};fill:${P.ink};paint-order:stroke;stroke:${P.canvas};stroke-width:3px;stroke-linejoin:round;pointer-events:none}
.edge .lb.ml{font:400 10.5px ${P.mono}}
.edge .lb.name{pointer-events:auto;cursor:move}
.notelink{stroke:${P.muted};stroke-width:1;stroke-dasharray:3 3;fill:none}
.frame rect{fill:none;stroke:${P.ref};stroke-width:1}.frame .tab{fill:${P.reffill}}.frame text{font:600 11px ${P.sans};fill:${P.muted}}
.mk-line{fill:none;stroke:${P.ink};stroke-width:1.2}.mk-hollow{fill:${P.canvas};stroke:${P.ink};stroke-width:1.2}.mk-solid{fill:${P.ink};stroke:${P.ink}}
.mk-s.mk-line,.mk-s.mk-hollow{stroke:${P.accent}}.mk-s.mk-solid{fill:${P.accent};stroke:${P.accent}}
.mk-r.mk-line,.mk-r.mk-hollow{stroke:${P.ref}}.mk-r.mk-solid{fill:${P.ref};stroke:${P.ref}}
.note .nbox{fill:${P.note};stroke:${P.muted};stroke-width:1}.note .nfold{fill:none;stroke:${P.muted}}.note text{font:400 11.5px ${P.sans};fill:${P.ink};pointer-events:none}
.note.sel .nbox{stroke:${P.accent};stroke-width:2}
.rubber{fill:${P.weak};fill-opacity:.35;stroke:${P.accent};stroke-dasharray:4 3}
.linkline{stroke:${P.accent};stroke-width:1.6;stroke-dasharray:5 4;fill:none;pointer-events:none}`;
  }
  const PAGE_P = {
    canvas: "var(--canvas)", ink: "var(--ink)", muted: "var(--muted)", ft: "var(--st-ft)", dt: "var(--st-dt)", cl: "var(--st-cl)", un: "var(--st-un)", itf: "var(--st-if)", no: "var(--st-no)",
    reffill: "var(--ref-fill)", ref: "var(--ref)", accent: "var(--accent)", weak: "var(--accent-weak)", ok: "var(--ok)", warn: "var(--warn)", err: "var(--err)", note: "var(--note)", sans: SANS, mono: MONO
  };
  const EXPORT_P = {
    canvas: "#ffffff", ink: "#17202a", muted: "#5a6776", ft: "#e4edfb", dt: "#e3f2ea", cl: "#f7eedb", un: "#efe7f7", itf: "#fde9e4", no: "#eef1f4", reffill: "#f2f4f6", ref: "#8792a0",
    accent: "#1d5fd1", weak: "#e2ebfb", ok: "#2b7a4b", warn: "#a46500", err: "#c2382a", note: "#fbf5d9",
    sans: "'IBM Plex Sans', Helvetica, Arial, sans-serif", mono: "'IBM Plex Mono', Menlo, Consolas, monospace"
  };

  let issueIndex = {};
  function indexIssues() {
    issueIndex = {};
    for (const i of issues) {
      if (i.target.kind !== "class" || i.level === "info") continue;
      const o = (issueIndex[i.target.name] = issueIndex[i.target.name] || { err: 0, warn: 0, msgs: [] });
      if (i.level === "error") o.err++; else o.warn++;
      o.msgs.push(i.msg);
    }
  }
  /* ---------------- colours ---------------- */
  const PALETTE = [
    ["#dbe7fb", "bleu clair"], ["#d6efe0", "vert clair"], ["#fde6c4", "orange clair"], ["#f7d6d3", "rouge clair"], ["#e8dcf6", "violet clair"], ["#d3eeee", "turquoise clair"], ["#f8f0bd", "jaune clair"], ["#e6e9ed", "gris clair"],
    ["#1d5fd1", "bleu"], ["#2b7a4b", "vert"], ["#d9822b", "orange"], ["#c2382a", "rouge"], ["#6a4bb5", "violet"], ["#3a4552", "ardoise"]
  ];
  const normCache = new Map();
  // any CSS colour ("lightgreen", "#9cf", "#AABBCC") -> "#rrggbb", or null if the browser does not know it
  function normColor(s) {
    if (!s) return null;
    if (normCache.has(s)) return normCache.get(s);
    mctx.fillStyle = "#010203"; mctx.fillStyle = s; const a = mctx.fillStyle;
    mctx.fillStyle = "#040506"; mctx.fillStyle = s; const b = mctx.fillStyle;
    const v = a === b && /^#[0-9a-f]{6}$/i.test(a) ? a.toLowerCase() : null;
    normCache.set(s, v);
    return v;
  }
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  function luminance(hex) { return rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0); }
  const shade = (hex, k) => "#" + rgbOf(hex).map((v) => Math.round(v * (1 - k)).toString(16).padStart(2, "0")).join("");
  // which colour a class is drawn with: its own, else its package's, else its stereotype's
  function colorOf(c) {
    if (!c || c.ref) return null;
    const st = S.layout.style, own = st.classes[c.name] || {};
    const raw = own.fill || (!c.external && (st.packages[pkgOf(c)] || {}).fill) || (c.stereotype && (st.stereotypes[c.stereotype] || {}).fill);
    const fill = normColor(raw);
    if (!fill) return own.line ? { line: true } : null;
    return { fill, line: own.line ? shade(fill, 0.45) : null, dark: luminance(fill) < 0.22, src: own.fill ? "class" : (!c.external && (st.packages[pkgOf(c)] || {}).fill) ? "package" : "stereotype" };
  }
  const stClass = (c) => "st-" + (String(c.stereotype || "none").toLowerCase().replace(/[^a-z0-9]/g, "") || "none");

  function nodeSvg(name, exp) {
    const g = geo[name]; if (!g || g.x == null) return "";
    const c = g.c;
    const cls = ["node", g.lib ? "ref" : "own", stClass(c)];
    if (g.ext) cls.push("ext");
    const col = colorOf(c);
    if (col && col.fill) cls.push(col.dark ? "dk" : "lt");
    const single = !exp && sel.nodes.size === 1 && selCount() === 1 && sel.nodes.has(name);
    if (!exp) {
      if (sel.nodes.has(name)) cls.push("sel");
      if (connectFrom === name) cls.push("src");
      if (recent.added.has(name)) cls.push("new"); else if (recent.modified.has(name)) cls.push("mod");
    }
    let s = `<g class="${cls.join(" ")}" data-node="${esc(name)}" transform="translate(${g.x},${g.y})">`;
    const lineStyle = col && col.line && (exp || !sel.nodes.has(name)) ? ` style="stroke:${col.line};stroke-width:1.8;stroke-dasharray:none"` : "";
    s += `<rect class="box" width="${g.w}" height="${g.h}"${lineStyle}/>`;
    if (col && col.fill && g.h > g.headH) s += `<rect class="tint" x="0.6" y="${g.headH}" width="${g.w - 1.2}" height="${g.h - g.headH - 0.6}" fill="${col.fill}" fill-opacity="0.13"/>`;
    s += `<rect class="head" data-part="name" x="0.6" y="0.6" width="${g.w - 1.2}" height="${g.headH - 0.6}"${col && col.fill ? ` style="fill:${col.fill}"` : ""}/>`;
    if (g.stTxt) s += `<text class="st" x="${g.w / 2}" y="16">${esc(g.stTxt)}</text>`;
    s += `<text class="nm${c.abstract ? " abs" : ""}" x="${g.w / 2}" y="${g.stTxt ? 33 : 21}">${g.prefix ? `<tspan class="pre">${esc(g.prefix)}</tspan>` : ""}${esc(c.name)}</text>`;
    const lines = (arr, top, kind) => arr.map((l, i) => `<rect class="mhit" data-mem="${kind}:${i}" x="1" y="${top + 5 + i * 16}" width="${g.w - 2}" height="16"/><text class="at${l.u ? " u" : ""}${l.it ? " it" : ""}" x="10" y="${top + 17 + i * 16}">${esc(l.t)}</text>`).join("");
    if (g.attrH) s += `<line class="div" x1="0" y1="${g.headH}" x2="${g.w}" y2="${g.headH}"/>` + lines(g.attrs, g.headH, "a");
    if (g.opsH) s += `<line class="div" x1="0" y1="${g.headH + g.attrH}" x2="${g.w}" y2="${g.headH + g.attrH}"/>` + lines(g.ops, g.headH + g.attrH, "o");
    if (!exp && !g.lib) {
      const iss = issueIndex[name];
      if (iss) s += `<g class="flag ${iss.err ? "err" : "warn"}" transform="translate(${g.w - 10},10)"><circle r="7"/><text y="3.2">${iss.err || iss.warn}</text><title>${esc(iss.msgs.join("\n"))}</title></g>`;
      if (g.pinned) s += `<circle class="pin" cx="8" cy="8" r="2.4"><title>Placée à la main: l'auto-layout n'y touche pas</title></circle>`;
      if (recent.added.has(name)) s += `<text class="tag" x="0" y="-6">nouveau</text>`;
      else if (recent.modified.has(name)) s += `<text class="tag" x="0" y="-6">modifié</text>`;
    }
    if (single && mode !== "link") s += `<g data-conn="${esc(name)}"><circle class="conn" cx="${g.w}" cy="${g.h / 2}" r="8"><title>Glisse vers une autre classe pour créer un lien</title></circle><path class="connp" d="M${g.w - 4},${g.h / 2} h8 M${g.w},${g.h / 2 - 4} v8"/></g>`;
    return s + "</g>";
  }

  function edgeSvg(e, exp) {
    const r = route(e);
    const pts = r.pts;
    const d = "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L");
    const isSel = !exp && sel.rel === e.key;
    const suf = isSel ? "-s" : e.ref ? "-r" : "";
    const nav = e.r ? e.r.nav : "none";
    let mk = "", dash = false;
    if (e.kind === "generalization") mk = `marker-end="url(#m-gen${suf})"`;
    else if (e.kind === "realization") { mk = `marker-end="url(#m-gen${suf})"`; dash = true; }
    else if (e.kind === "dependency") { mk = `marker-end="url(#m-arrow${suf})"`; dash = true; }
    else {
      if (e.kind === "composition") mk = `marker-start="url(#m-dia-f${suf})"`;
      else if (e.kind === "aggregation") mk = `marker-start="url(#m-dia-h${suf})"`;
      else if (nav === "both") mk = `marker-start="url(#m-arrow${suf})"`;
      if (nav === "to" || nav === "both") mk += ` marker-end="url(#m-arrow${suf})"`;
    }
    let s = `<g class="edge${e.ref ? " refedge" : ""}${isSel ? " sel" : ""}" data-edge="${esc(e.key)}">`;
    s += `<path class="ln${dash ? " dash" : ""}" d="${d}" ${mk}/>`;
    if (!exp) s += `<path class="hit" d="${d}"/>`;
    if (e.r) {
      const a = e.r, last = pts.length - 1;
      if (Core.ASSOC_KINDS.includes(a.kind)) {
        s += endLabels(pts[last], pts[last - 1], a.toMult, a.toRole, nav === "none" ? 0 : 4);
        s += endLabels(pts[0], pts[1], a.fromMult, a.fromRole, a.kind === "association" ? (nav === "both" ? 4 : 0) : 10);
      }
      if (a.name) { const p = labelPos(r, e); s += `<text class="lb name" data-lbl="${esc(e.key)}" x="${p.x}" y="${p.y}" text-anchor="${p.anchor}">${esc(a.name)}</text>`; }
    }
    return s + "</g>";
  }
  // handles of the selected link, drawn above the boxes so the ends stay reachable
  function handlesSvg(E) {
    const e = sel.rel && E.find((x) => x.key === sel.rel);
    if (!e) return "";
    const r = route(e), pts = r.pts;
    if (pts.length < 4 || r.mode === "s") return "";
    const k = esc(e.key), hx = (pts[1][0] + pts[2][0]) / 2, hy = (pts[1][1] + pts[2][1]) / 2;
    return `<circle class="handle" data-h="m" data-key="${k}" cx="${hx}" cy="${hy}" r="5.5"><title>Glisser pour déplacer la ligne · double-clic: tracé automatique</title></circle>`
      + `<circle class="handle" data-h="a" data-key="${k}" cx="${pts[0][0]}" cy="${pts[0][1]}" r="5"><title>Glisser le long du bord</title></circle>`
      + `<circle class="handle" data-h="b" data-key="${k}" cx="${pts[3][0]}" cy="${pts[3][1]}" r="5"><title>Glisser le long du bord</title></circle>`;
  }

  function noteSvg(n, exp) {
    if (!S.layout.notes[n.id]) return "";
    const g = noteGeo(n);
    const isSel = !exp && sel.notes.has(n.id);
    let s = `<g class="note${isSel ? " sel" : ""}" data-note="${esc(n.id)}" transform="translate(${g.x},${g.y})">`;
    s += `<path class="nbox" d="M0,0 H${g.w - 12} L${g.w},12 V${g.h} H0 Z"/><path class="nfold" d="M${g.w - 12},0 V12 H${g.w}"/>`;
    g.lines.forEach((l, i) => (s += `<text x="10" y="${20 + i * 16}">${esc(l)}</text>`));
    return s + "</g>";
  }
  function noteLinks() {
    let s = "";
    for (const n of S.model.notes) {
      const g = n.near && geo[n.near];
      if (!g || g.x == null || !S.layout.notes[n.id]) continue;
      const ng = noteGeo(n);
      s += `<line class="notelink" x1="${ng.x + ng.w / 2}" y1="${ng.y + ng.h / 2}" x2="${g.x + g.w / 2}" y2="${g.y + g.h / 2}"/>`;
    }
    return s;
  }
  function framesSvg() {
    if (!opts.frames) return "";
    const by = {};
    for (const n of Object.keys(geo)) { const g = geo[n]; if (g.lib || g.ext || g.x == null) continue; (by[pkgOf(g.c)] = by[pkgOf(g.c)] || []).push(n); }
    const pk = Object.keys(by);
    if (pk.length < 2) return "";
    return pk.map((p) => {
      const b = bbox(true, by[p]);
      const x = b.x - 16, y = b.y - 34, w = b.w + 32, h = b.h + 50, tabW = Math.min(w, tw(p, F.pk) + 20);
      const pc = normColor((S.layout.style.packages[p] || {}).fill);
      const tabSt = pc ? ` style="fill:${pc};stroke:${shade(pc, 0.35)}"` : "", rectSt = pc ? ` style="stroke:${shade(pc, 0.35)};fill:${pc};fill-opacity:0.06"` : "", txtSt = pc ? ` style="fill:${luminance(pc) < 0.22 ? "#ffffff" : "#17202a"}"` : "";
      return `<g class="frame"><rect class="tab" x="${x}" y="${y - 20}" width="${tabW}" height="20"${tabSt}/><rect x="${x}" y="${y}" width="${w}" height="${h}"${rectSt}/><text x="${x + 10}" y="${y - 6}"${txtSt}>${esc(p)}</text></g>`;
    }).join("");
  }

  let rafPending = false, nodeEls = {}, noteEls = {};
  function scheduleRender(fast) { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; if (fast) renderMoved(); else render(); }); }
  function render() {
    computeGeo();
    const E = edgeList();
    $("#gFrames").innerHTML = framesSvg();
    $("#gEdges").innerHTML = noteLinks() + E.map((e) => edgeSvg(e)).join("");
    $("#gHandles").innerHTML = handlesSvg(E);
    $("#gNodes").innerHTML = Object.keys(geo).map((n) => nodeSvg(n)).join("");
    $("#gNotes").innerHTML = S.model.notes.map((n) => noteSvg(n)).join("");
    nodeEls = {}; noteEls = {};
    for (const el of $("#gNodes").children) nodeEls[el.getAttribute("data-node")] = el;
    for (const el of $("#gNotes").children) noteEls[el.getAttribute("data-note")] = el;
    placeNodebar();
  }
  // while dragging: only move the boxes and redraw the lines
  function renderMoved() {
    for (const n of sel.nodes) { const p = S.layout.nodes[n], g = geo[n], el = nodeEls[n]; if (p && g && el) { g.x = p.x; g.y = p.y; el.setAttribute("transform", `translate(${p.x},${p.y})`); } }
    for (const n of sel.notes) { const p = S.layout.notes[n], el = noteEls[n]; if (p && el) el.setAttribute("transform", `translate(${p.x},${p.y})`); }
    const E = edgeList();
    $("#gFrames").innerHTML = framesSvg();
    $("#gEdges").innerHTML = noteLinks() + E.map((e) => edgeSvg(e)).join("");
    $("#gHandles").innerHTML = handlesSvg(E);
  }
  function applyView() {
    vp.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
    const pat = $("#grid");
    if (pat) pat.setAttribute("patternTransform", `translate(${view.x},${view.y}) scale(${view.k})`);
    $("#zoomPct").textContent = Math.round(view.k * 100) + "%";
    placeNodebar();
  }
  function fit() {
    computeGeo();
    const bb = bbox();
    const W = svg.clientWidth || 800, H = svg.clientHeight || 600;
    const k = clamp(Math.min((W - 80) / Math.max(bb.w, 1), (H - 120) / Math.max(bb.h, 1)), 0.08, 1.15);
    view.k = k; view.x = (W - bb.w * k) / 2 - bb.x * k; view.y = (H - bb.h * k) / 2 - bb.y * k + 14;
    applyView();
  }
  function zoomBy(f) {
    const W = svg.clientWidth, H = svg.clientHeight;
    const k2 = clamp(view.k * f, 0.08, 3);
    view.x = W / 2 - (W / 2 - view.x) * k2 / view.k; view.y = H / 2 - (H / 2 - view.y) * k2 / view.k; view.k = k2;
    applyView();
  }
  function centerOn(name) {
    const g = geo[name]; if (!g || g.x == null) return;
    const W = svg.clientWidth, H = svg.clientHeight;
    if (view.k < 0.45) view.k = 0.8;
    view.x = W / 2 - (g.x + g.w / 2) * view.k; view.y = H / 2 - (g.y + g.h / 2) * view.k;
    applyView();
  }
  const viewCenter = () => [(svg.clientWidth / 2 - view.x) / view.k, (svg.clientHeight / 2 - view.y) / view.k];

  function placeNodebar() {
    const bar = $("#nodebar");
    const one = selOne();
    const g = one && one.kind === "class" && geo[one.id];
    if (!g || g.x == null || drag || mode === "link" || inline) { bar.hidden = true; return; }
    const lit = Core.isLiteralClass(g.c);
    const key = one.id + "|" + lit;
    if (bar.dataset.key !== key) {
      bar.dataset.key = key;
      bar.innerHTML = `<button data-nb="attr">+ ${lit ? "Valeur" : "Attribut"}</button>${lit ? "" : `<button data-nb="op">+ Opération</button>`}<button data-nb="link">Relier</button><button data-nb="color">Couleur</button><button data-nb="dup">Dupliquer</button><button data-nb="hide">Masquer</button><button data-nb="del" class="danger">Supprimer</button>`;
    }
    bar.hidden = false;
    const W = stage.clientWidth;
    const x = clamp(g.x * view.k + view.x, 6, Math.max(6, W - bar.offsetWidth - 6));
    let y = g.y * view.k + view.y - 40;
    if (y < 44) y = (g.y + g.h) * view.k + view.y + 12;
    bar.style.left = x + "px"; bar.style.top = y + "px";
  }

  function afterChange({ inspector = true, modelSame = false } = {}) {
    if (!modelSame) { issues = Core.validate(S.model); indexIssues(); }
    ensurePositions();
    render();
    renderTree();
    if (inspector) renderInspector(); else refreshIssuesBox();
    renderPill();
    $("#btnUndo").disabled = !undoStack.length;
    $("#btnRedo").disabled = !redoStack.length;
    if (document.activeElement !== $("#modelName")) $("#modelName").value = S.model.name;
    if (!modelSame) refreshDatalists();
    const hid = S.model.classes.filter(isHidden).length;
    $("#hiddenInfo").hidden = !hid; $("#hiddenInfo").textContent = `${hid} classe${hid > 1 ? "s" : ""} masquée${hid > 1 ? "s" : ""}`;
    $("#empty").hidden = S.model.classes.length > 0 || S.model.notes.length > 0;
    save();
  }
  function renderPill() {
    const e = issues.filter((i) => i.level === "error").length, w = issues.filter((i) => i.level === "warning").length;
    const b = $("#btnIssues");
    if (!e && !w) b.innerHTML = `<span class="dot ok"></span>Modèle cohérent`;
    else b.innerHTML = `<span class="dot ${e ? "err" : "warn"}"></span>${e ? `${e} erreur${e > 1 ? "s" : ""}` : ""}${e && w ? " · " : ""}${w ? `${w} avert.` : ""}`;
  }
  function refreshDatalists() {
    const own = S.model.classes.map((c) => c.name);
    const lib = S.model.profile === "citygml" ? Object.values(Core.LIB) : [];
    $("#dl-own").innerHTML = own.map((n) => `<option value="${esc(n)}"></option>`).join("");
    $("#dl-classes").innerHTML = own.map((n) => `<option value="${esc(n)}"></option>`).join("") + lib.filter((c) => c.stereotype === "FeatureType" || c.hookOf).map((c) => `<option value="${esc(c.name)}">${c.module}</option>`).join("");
    const types = S.model.profile === "uml"
      ? [...new Set(["String", "int", "float", "double", "boolean", "Date", ...S.model.classes.flatMap((c) => c.attributes.map((a) => a.type)).filter(Boolean), ...own])].map((t) => [t, ""])
      : [...Core.PRIMITIVES.map((t) => [t, "ISO 19103"]), ...S.model.classes.filter((c) => c.stereotype !== "FeatureType").map((c) => [c.name, c.stereotype]), ...(S.model.externalTypes || []).map((t) => [t, "externe"]), ...lib.filter((c) => c.stereotype !== "FeatureType" && !c.hookOf).map((c) => [c.name, c.module + " " + c.stereotype])];
    $("#dl-types").innerHTML = types.map(([t, l]) => `<option value="${esc(t)}">${esc(l)}</option>`).join("");
    $("#dl-pkg").innerHTML = [...new Set(S.model.classes.filter((c) => !c.external).map((c) => c.package))].map((p) => `<option value="${esc(p)}"></option>`).join("");
    $("#dl-stereo").innerHTML = [...new Set([...Core.UI_STEREOS, ...S.model.classes.map((c) => c.stereotype).filter(Boolean)])].map((p) => `<option value="${esc(p)}"></option>`).join("");
  }
