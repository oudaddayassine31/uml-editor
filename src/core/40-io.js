  /* ===================== text formats ===================== */
  const pq = (n) => (/^[A-Za-z_][\w.]*$/.test(n) ? n : `"${n}"`);
  function pumlEnd(mult, role) {
    const t = [role ? "+" + role : "", mult || ""].filter(Boolean).join(" ");
    return t ? ` "${t}"` : "";
  }
  const isEnumLike = (c) => c.stereotype === "Enumeration" || (c.stereotype === "CodeList" && c.attributes.length > 0);
  function relArrow(r) {
    switch (r.kind) {
      case "generalization": return "--|>";
      case "realization": return "..|>";
      case "dependency": return "..>";
      case "composition": return r.nav === "to" ? "*-->" : "*--";
      case "aggregation": return r.nav === "to" ? "o-->" : "o--";
      default: return r.nav === "both" ? "<-->" : r.nav === "none" ? "--" : "-->";
    }
  }

  const pcol = (c) => (c ? " #" + String(c).replace(/^#/, "") : "");
  function toPlantUML(model, opt = {}) {
    const refs = visibleRefs(model, !!opt.fullChain);
    const style = normStyle(opt.style ? JSON.parse(JSON.stringify(opt.style)) : null);
    const L = ["@startuml", "skinparam classAttributeIconSize 0", "hide empty methods"];
    const stc = Object.entries(style.stereotypes).filter(([, v]) => v && v.fill);
    if (stc.length) { L.push("skinparam class {"); stc.forEach(([k, v]) => L.push(`  BackgroundColor<<${k}>>${pcol(v.fill)}`)); L.push("}"); }
    if (model.title) L.push("title " + model.title);
    L.push("");
    const kw = (c) => (isEnumLike(c) ? "enum" : c.stereotype === "Interface" ? "interface" : c.abstract ? "abstract class" : "class");
    const st = (c) => (c.stereotype && c.stereotype !== "Interface" && !(c.stereotype === "Enumeration") ? ` <<${c.stereotype}>>` : c.external && !c.stereotype ? " <<external>>" : "");
    const mod = (m) => `${m.static ? "{static} " : ""}${m.abstract ? "{abstract} " : ""}`;
    const body = (c, ind) => {
      const out = [];
      for (const a of c.attributes) out.push(ind + mod(a) + attrText(a, isLiteralClass(c)));
      for (const o of c.operations) out.push(ind + mod(o) + opText(o));
      return out;
    };
    const decl = (c, ind) => {
      const b = body(c, ind + "  ");
      const cc = style.classes[c.name];
      const head = `${ind}${kw(c)} ${pq(c.name)}${st(c)}${cc && cc.fill ? pcol(cc.fill) : ""}`;
      return b.length || !c.external ? [head + " {", ...b, ind + "}"] : [head];
    };
    const byMod = {};
    refs.forEach((n) => (byMod[LIB[n].module] = byMod[LIB[n].module] || []).push(LIB[n]));
    for (const [mo, cs] of Object.entries(byMod)) {
      L.push(`package "${MODULES[mo] || mo} (CityGML 3.0)" #EEEEEE {`);
      cs.forEach((c) => L.push(`  ${c.abstract ? "abstract class" : "class"} ${c.name} <<${c.stereotype}>>`));
      L.push("}");
    }
    const byPkg = {};
    model.classes.filter((c) => !c.external).forEach((c) => (byPkg[c.package || model.name] = byPkg[c.package || model.name] || []).push(c));
    for (const [pkg, cs] of Object.entries(byPkg)) {
      const pc = style.packages[pkg];
      L.push(`package "${pkg}"${pkg === model.name && model.alias ? " as " + model.alias : ""}${pc && pc.fill ? pcol(pc.fill) : ""} {`);
      for (const c of cs) L.push(...decl(c, "  "));
      L.push("}");
    }
    for (const c of model.classes.filter((x) => x.external)) L.push(...decl(c, ""));
    for (const n of model.notes || []) {
      if (n.near) L.push(`note bottom of ${pq(n.near)}`, n.text, "end note");
      else L.push(`note "${String(n.text).replace(/"/g, "'").replace(/\n/g, "\\n")}" as ${n.id}`);
    }
    for (const r of model.relations) {
      const assoc = ASSOC_KINDS.includes(r.kind);
      L.push(`${pq(r.from)}${assoc ? pumlEnd(r.fromMult, r.fromRole) : ""} ${relArrow(r)}${assoc ? pumlEnd(r.toMult, r.toRole) : ""} ${pq(r.to)}${r.name ? " : " + r.name : ""}`);
    }
    L.push("@enduml");
    return L.join("\n");
  }

  function toMermaid(model, opt = {}) {
    const style = normStyle(opt.style ? JSON.parse(JSON.stringify(opt.style)) : null);
    const id = (n) => String(n).replace(/[^\w]/g, "_");
    const L = ["classDiagram"];
    const decl = (c, ind) => {
      const lines = [];
      if (c.stereotype) lines.push(`<<${c.stereotype}>>`); else if (c.external) lines.push("<<external>>");
      if (c.abstract) lines.push("<<abstract>>");
      for (const a of c.attributes) lines.push(attrText(a, isLiteralClass(c)) + (a.static ? "$" : ""));
      for (const o of c.operations) lines.push(`${o.vis || ""}${o.name}(${o.params || ""})${o.type ? " " + o.type.replace(/<([^<>]*)>/g, "~$1~") : ""}${o.static ? "$" : ""}${o.abstract ? "*" : ""}`);
      return lines.length ? [`${ind}class ${id(c.name)} {`, ...lines.map((l) => ind + "  " + l), ind + "}"] : [`${ind}class ${id(c.name)}`];
    };
    const byPkg = {};
    model.classes.forEach((c) => (byPkg[c.external ? "" : c.package || model.name] = byPkg[c.external ? "" : c.package || model.name] || []).push(c));
    const multi = Object.keys(byPkg).filter(Boolean).length > 1;
    for (const [pkg, cs] of Object.entries(byPkg)) {
      if (pkg && multi) { L.push(`  namespace ${id(pkg)} {`); cs.forEach((c) => L.push(...decl(c, "    "))); L.push("  }"); }
      else cs.forEach((c) => L.push(...decl(c, "  ")));
    }
    const end = (mult, role) => { const t = [mult, role].filter(Boolean).join(" "); return t ? ` "${t}"` : ""; };
    for (const r of model.relations) {
      const assoc = ASSOC_KINDS.includes(r.kind);
      L.push(`  ${id(r.from)}${assoc ? end(r.fromMult, r.fromRole) : ""} ${relArrow(r)}${assoc ? end(r.toMult, r.toRole) : ""} ${id(r.to)}${r.name ? " : " + r.name : ""}`);
    }
    for (const c of model.classes) {
      const cc = style.classes[c.name], fill = (cc && cc.fill) || (style.packages[c.package] || {}).fill || (style.stereotypes[c.stereotype] || {}).fill;
      if (fill) L.push(`  style ${id(c.name)} fill:${fill.startsWith("#") ? fill : fill}`);
    }
    for (const n of model.notes || []) L.push(n.near ? `  note for ${id(n.near)} "${n.text.replace(/"/g, "'").replace(/\n/g, "\\n")}"` : `  note "${n.text.replace(/"/g, "'").replace(/\n/g, "\\n")}"`);
    return L.join("\n");
  }

  /* ---------- shared pieces of the two text importers ---------- */
  const NAME_RX = String.raw`("[^"]+"|` + "`[^`]+`" + String.raw`|[A-Za-z_][\w.:]*)`;
  const ARROW_RX = String.raw`([<*o#x+}{|^]{0,2}[-.]+(?:\[[^\]]*\])?(?:(?:up|down|left|right|u|d|l|r)[-.]+)?(?:\[[^\]]*\])?[-.]*[|>*o#x+}{^]{0,2})`;
  const REL_RX = new RegExp(String.raw`^${NAME_RX}\s*(?:"([^"]*)")?\s*${ARROW_RX}\s*(?:"([^"]*)")?\s*${NAME_RX}\s*(?::\s*(.*))?$`);

  function makeBuilder() {
    const B = {
      rep: { format: "", colors: 0, classes: 0, externals: 0, attributes: 0, operations: 0, generalizations: 0, relations: 0, notes: 0, skipped: [], warnings: [], externalTypes: [] },
      classes: new Map(), alias: new Map(), rels: [], notes: [], title: "", firstPkg: null, firstAlias: null,
      colors: { classes: {}, packages: {}, stereotypes: {} }, classDefs: {}, cssClass: {},
      skip(ln, why, line) { B.rep.skipped.push({ line: ln, why, text: String(line).trim().slice(0, 100) }); },
      unq(s) { return s == null ? s : String(s).trim().replace(/^"(.*)"$/, "$1").replace(/^`(.*)`$/, "$1").trim(); },
      nameOf(n) { n = B.unq(n); if (B.alias.has(n)) return B.alias.get(n); return /\s/.test(n) ? n : n.split(/::|\./).pop(); },
      ensure(name, how) {
        if (!B.classes.has(name)) B.classes.set(name, { name, stereotype: "", abstract: false, package: null, attributes: [], operations: [], implicit: how || null });
        return B.classes.get(name);
      },
      member(c, raw, ln) {
        const lit = isLiteralClass(c) || c._enum;
        const m = parseMember(raw, lit);
        if (!m) { if (!/^(--|\.\.|==|__)/.test(raw.trim())) B.skip(ln, "membre non compris", raw); return; }
        if (m.kind === "op") { const { kind, ...o } = m; c.operations.push({ params: "", type: "", ...o }); }
        else if (m.kind === "lit") c.attributes.push({ name: m.name, type: "", mult: "" });
        else { const { kind, ...a } = m; c.attributes.push(a); }
      },
      splitEnd(s) {
        if (s == null) return { mult: "", role: "" };
        s = s.replace(/\\n/g, " ").trim();
        if (/^(many|n|m)$/i.test(s)) return { mult: "0..*", role: "" };
        const m = s.match(/(\d+|\*)(\.\.(\d+|\*|n))?/);
        const mult = m ? m[0].replace(/n$/, "*") : "";
        const role = (m ? s.replace(m[0], "") : s).replace(/[+\-#~]/g, " ").trim().split(/\s+/)[0] || "";
        return { mult: normMult(mult), role };
      },
      relation(a, q1, arrow, q2, b, label, ln, line) {
        a = B.nameOf(a); b = B.nameOf(b);
        const ar = arrow.replace(/\[[^\]]*\]/g, "").replace(/(up|down|left|right)/g, "").replace(/([-.])[udlr](?=[-.])/g, "$1");
        const left = (ar.match(/^[<*o#x+}{|^]*/) || [""])[0], right = (ar.match(/[|>*o#x+}{^]*$/) || [""])[0];
        const dotted = ar.includes(".");
        label = (label || "").replace(/^[<>]\s+|\s+[<>]$/g, "").trim();
        const e1 = B.splitEnd(q1), e2 = B.splitEnd(q2);
        const assoc = (kind, from, to, f, t, nav) => B.rels.push({ kind, from, to, fromMult: f.mult, fromRole: f.role, toMult: t.mult, toRole: t.role, name: label, nav, ln });
        if (left === "<|" || left === "^") B.rels.push({ kind: dotted ? "realization" : "generalization", from: b, to: a, ln });
        else if (right === "|>" || right === "^") B.rels.push({ kind: dotted ? "realization" : "generalization", from: a, to: b, ln });
        else if (/[*o]/.test(left)) assoc(left.includes("*") ? "composition" : "aggregation", a, b, e1, e2, right === ">" ? "to" : "none");
        else if (/[*o]/.test(right)) assoc(right.includes("*") ? "composition" : "aggregation", b, a, e2, e1, left === "<" ? "to" : "none");
        else if (dotted) { if (left === "<" && right !== ">") B.rels.push({ kind: "dependency", from: b, to: a, name: label, ln }); else B.rels.push({ kind: "dependency", from: a, to: b, name: label, ln }); }
        else if (left === "<" && right === ">") assoc("association", a, b, e1, e2, "both");
        else if (right === ">") assoc("association", a, b, e1, e2, "to");
        else if (left === "<") assoc("association", b, a, e2, e1, "to");
        else if (!left && !right) assoc("association", a, b, e1, e2, "none");
        else B.skip(ln, "type de lien non reconnu", line);
      },
      finish(opt) {
        const rep = B.rep;
        const pk = new Set([...B.classes.values()].filter((c) => !c.implicit && !c.external).map((c) => c.package || null));
        const single = B.firstPkg && pk.size === 1 && !pk.has(null);
        const pkgName = single ? B.firstPkg : opt.name || "Model";
        if (!single) B.firstAlias = null;
        const st = emptyState(pkgName, "uml");
        const M = st.model;
        if (B.title) M.title = B.title;
        if (B.firstAlias) { M.alias = B.firstAlias; M.prefix = B.firstAlias.toLowerCase(); }
        for (const r of B.rels) for (const n of [r.from, r.to]) {
          if (!B.classes.has(n) && !LIB[n]) { B.ensure(n, "relation"); rep.warnings.push(`${n}: utilisée (ligne ${r.ln}) sans être déclarée, importée comme classe externe.`); }
        }
        let iso = false;
        for (const c of B.classes.values()) {
          if (c.implicit) c.external = true;
          if (STEREOS.includes(c.stereotype) && c.stereotype !== "Enumeration") iso = true;
          const out = { name: c.name, stereotype: c.stereotype, abstract: !!c.abstract, package: c.external ? c.package || "?" : c.package || pkgName, attributes: c.attributes, operations: c.operations };
          if (c.external) { out.external = true; rep.externals++; } else rep.classes++;
          rep.attributes += c.attributes.length; rep.operations += c.operations.length;
          M.classes.push(out);
        }
        const seen = new Set();
        for (const r of B.rels) {
          const key = [r.kind, r.from, r.to, r.name || "", r.fromMult || "", r.toMult || ""].join("|");
          if (seen.has(key)) { rep.warnings.push(`Lien en double ignoré (ligne ${r.ln}): ${r.from} → ${r.to}.`); continue; }
          seen.add(key);
          if ((r.kind === "generalization" || r.kind === "realization") && r.from === r.to) { rep.warnings.push(`${r.from} hérite d'elle-même (ligne ${r.ln}): ignoré.`); continue; }
          M.relations.push(newRel(M, r));
          if (r.kind === "generalization") rep.generalizations++; else rep.relations++;
        }
        for (const n of B.notes) { const o = { id: "N" + M.seq++, text: n.text }; if (n.near && B.classes.has(n.near)) o.near = n.near; M.notes.push(o); rep.notes++; }
        M.profile = opt.profile || (iso ? "iso19109" : "uml");
        for (const [cls, def] of Object.entries(B.cssClass)) if (B.classDefs[def] && !B.colors.classes[cls]) B.colors.classes[cls] = { ...B.classDefs[def] };
        for (const [k, v] of Object.entries(B.colors.classes)) if (B.classes.has(k)) st.layout.style.classes[k] = v;
        Object.assign(st.layout.style.packages, B.colors.packages);
        Object.assign(st.layout.style.stereotypes, B.colors.stereotypes);
        rep.colors = Object.keys(st.layout.style.classes).length + Object.keys(st.layout.style.packages).length + Object.keys(st.layout.style.stereotypes).length;
        const known = new Set([...M.classes.map((c) => c.name), ...PRIMITIVES, ...Object.keys(LIB)]);
        const ext = new Set();
        if (iso) M.classes.forEach((c) => { if (!isLiteralClass(c)) c.attributes.forEach((a) => { if (a.type && !known.has(a.type)) ext.add(a.type); }); });
        M.externalTypes = [...ext].sort();
        rep.externalTypes = M.externalTypes;
        return { state: st, report: rep };
      }
    };
    return B;
  }
  // header of a class declaration after the keyword: name, alias, generics, stereotypes, colour, extends, implements
  function parseClassHead(B, kw, rest, pkg) {
    let brace = false, inline = null;
    let m = rest.match(/\{([^{}]*)\}\s*$/);
    if (m && !/<<[^>]*$/.test(rest.slice(0, m.index))) { inline = m[1]; rest = rest.slice(0, m.index); brace = false; }
    else if (/\{\s*$/.test(rest)) { brace = true; rest = rest.replace(/\{\s*$/, ""); }
    rest = rest.trim();
    let cssTok = null;
    rest = rest.replace(/:::\s*(\w+)/g, (_, k) => { cssTok = k; return " "; }).trim();
    m = rest.match(new RegExp("^" + NAME_RX));
    if (!m) return null;
    const disp = B.unq(m[1]);
    rest = rest.slice(m[0].length).trim();
    let al = null;
    if ((m = rest.match(new RegExp(String.raw`^as\s+${NAME_RX}`)))) { al = B.unq(m[1]); rest = rest.slice(m[0].length).trim(); }
    let name = /\s/.test(disp) ? disp : disp.split(/::|\.(?=[A-Za-z_])/).pop();
    let generic = "";
    if ((m = rest.match(/^(<(?!<)[^<>]*(?:<[^<>]*>[^<>]*)*>)(?!>)/)) || (m = rest.match(/^~([^~]*)~/))) { generic = m[0].startsWith("~") ? `<${m[1]}>` : m[1]; rest = rest.slice(m[0].length).trim(); }
    if ((m = name.match(/^(.*?)(<.*>)$/))) { name = m[1]; generic = m[2]; }
    if ((m = name.match(/^(.*?)~(.*)~$/))) { name = m[1]; generic = `<${m[2]}>`; }
    if (al) { B.alias.set(al, name); B.alias.set(disp, name); }
    const c = B.ensure(name);
    c.implicit = null;
    const sts = [];
    let colorTok = null;
    rest = rest.replace(/<<\s*([^>]*?)\s*>>/g, (_, s) => { s = s.replace(/^\([^)]*\)\s*/, "").trim(); if (s) sts.push(s); return " "; })
      .replace(/#[\w#;:.\-|/\\]+/g, (t) => { if (!colorTok) colorTok = t; return " "; }).trim();
    if (colorTok) { const col = parseColor(colorTok); if (col) B.colors.classes[name] = col; }
    if (cssTok) B.cssClass[name] = cssTok;
    const sups = [], reals = [];
    if ((m = rest.match(/\bimplements\s+(.+)$/i))) { reals.push(...m[1].split(",")); rest = rest.slice(0, m.index).trim(); }
    if ((m = rest.match(/\bextends\s+(.+)$/i))) { sups.push(...m[1].split(",")); rest = rest.slice(0, m.index).trim(); }
    if (sts.length > 1) B.rep.warnings.push(`${name}: plusieurs stéréotypes (${sts.join(", ")}), seul «${sts[0]}» est gardé.`);
    c.package = pkg;
    kw = kw.toLowerCase();
    annotate(c, sts[0] || "");
    if (!c.stereotype && kw === "enum") c.stereotype = "Enumeration";
    if (!c.stereotype && (kw === "interface" || kw === "protocol")) c.stereotype = "Interface";
    if (kw.startsWith("abstract")) c.abstract = true;
    if (kw === "enum") c._enum = true;
    for (const s of sups) if (s.trim()) B.rels.push({ kind: kw === "interface" ? "generalization" : "generalization", from: name, to: B.nameOf(s.replace(/<.*>/, "")), ln: 0 });
    for (const s of reals) if (s.trim()) B.rels.push({ kind: "realization", from: name, to: B.nameOf(s.replace(/<.*>/, "")), ln: 0 });
    return { c, brace, inline };
  }
  // "#lightblue", "#AABBCC", "#back:pink;line:red", "#red|green" (gradient: first colour kept)
  function parseColor(tok) {
    const parts = String(tok).trim().replace(/^#/, "").split(";");
    let back = null, line = false;
    for (const p of parts) {
      const kv = p.split(":");
      if (kv.length === 2) { const k = kv[0].trim().toLowerCase(); if (k === "back" || k === "fill") back = kv[1]; else if (k === "line" || k === "stroke") line = true; }
      else if (!back && p.trim()) back = p;
    }
    if (!back) return null;
    back = back.trim().replace(/^#/, "").split(/[|\\/-]/)[0].trim();
    if (!/^[a-z0-9]+$/i.test(back)) return null;
    const col = { fill: /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(back) ? "#" + back.toLowerCase() : back.toLowerCase() };
    if (line) col.line = true;
    return col;
  }
  function annotate(c, s) {
    s = String(s || "").trim();
    if (!s) return;
    if (/^stub\b/i.test(s)) { c.external = true; c.package = s.replace(/^stub\s*/i, "") || null; c.stereotype = s; }
    else if (/^external$/i.test(s)) c.external = true;
    else if (/^abstract$/i.test(s)) c.abstract = true;
    else { c.stereotype = normStereo(s); if (isLiteralClass(c)) c._enum = true; }
  }
  const CLASS_KW = /^(abstract\s+class|abstract|class|enum|interface|entity|struct|annotation|dataclass|record|exception|protocol|metaclass)\s+(.+)$/;

  /* ---------- PlantUML class diagrams ---------- */
  function fromPlantUML(text, opt = {}) {
    const B = makeBuilder();
    B.rep.format = "PlantUML";
    const lines = String(text).replace(/\r\n?/g, "\n").replace(/\/'[\s\S]*?'\//g, (m) => m.replace(/[^\n]/g, " ")).split("\n");
    const stack = [];
    let cur = null, noteBuf = null, skipDepth = 0, skipClass = false;
    const curPkg = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].type === "package") return stack[i].name; return null; };
    lines.forEach((raw, i) => {
      const ln = i + 1;
      const line = raw.trim();
      if (noteBuf) { if (/^end\s*(note|legend)$/i.test(line)) { B.notes.push(noteBuf); noteBuf = null; } else noteBuf.text += (noteBuf.text ? "\n" : "") + line; return; }
      if (!line || line.startsWith("'") || /^@(start|end)/i.test(line)) return;
      if (skipDepth) {
        const sk = skipClass && line.match(/^BackgroundColor\s*<<\s*(.+?)\s*>>\s+(\S+)/i);
        if (sk) { const col = parseColor(sk[2]); if (col) B.colors.stereotypes[normStereo(sk[1])] = { fill: col.fill }; }
        if (/\{\s*$/.test(line)) skipDepth++; else if (line === "}") skipDepth--; return;
      }
      if (cur) {
        if (line === "}") { cur = null; stack.pop(); return; }
        B.member(cur, line, ln); return;
      }
      if (line === "}") { stack.pop(); return; }
      let m;
      if ((m = line.match(/^title\s+(.*)$/i))) { B.title = m[1].trim(); return; }
      if (/^(skinparam|hide|show|left to right direction|top to bottom direction|scale|set |allowmixing|allow_mixing|caption|header|footer|legend|!|remove|restore|page|center |sprite|direction)\b/i.test(line) || /^!/.test(line)) {
        if (/^!include/i.test(line)) B.skip(ln, "!include non résolu", line);
        const sk = line.match(/^skinparam\s+classBackgroundColor\s*<<\s*(.+?)\s*>>\s+(\S+)/i);
        if (sk) { const col = parseColor(sk[2]); if (col) B.colors.stereotypes[normStereo(sk[1])] = { fill: col.fill }; }
        skipClass = /^skinparam\s+class\s*\{/i.test(line);
        if (/\{\s*$/.test(line)) skipDepth = 1;
        if (/^legend\b/i.test(line)) noteBuf = { skipLegend: true, text: "" };
        return;
      }
      if ((m = line.match(/^(package|namespace|folder|frame|rectangle|node|cloud|database)\s+("[^"]+"|[^\s{<#]+)(?:\s+as\s+(\S+))?[^{]*\{\s*$/i))) {
        const name = B.unq(m[2]);
        const pc = line.slice(m[1].length + 1 + m[2].length).match(/\s#([\w;:.\-|]+)/);
        if (pc) { const col = parseColor(pc[1]); if (col) B.colors.packages[name] = { fill: col.fill }; }
        stack.push({ type: "package", name });
        if (!B.firstPkg) { B.firstPkg = name; B.firstAlias = m[3] || null; }
        if (m[3]) B.alias.set(m[3], name);
        return;
      }
      if (/^together\s*\{/.test(line)) { stack.push({ type: "group" }); return; }
      if ((m = line.match(/^note\s+(?:left|right|top|bottom)\s+of\s+("[^"]+"|\S+?)\s*:\s*(.*)$/i))) { B.notes.push({ near: B.nameOf(m[1]), text: m[2].replace(/\\n/g, "\n") }); return; }
      if ((m = line.match(/^note\s+(?:left|right|top|bottom)\s+of\s+("[^"]+"|\S+)\s*$/i))) { noteBuf = { near: B.nameOf(m[1]), text: "" }; return; }
      if ((m = line.match(/^note\s+(?:left|right|top|bottom)\s*:\s*(.*)$/i))) { B.notes.push({ near: B._last, text: m[1].replace(/\\n/g, "\n") }); return; }
      if ((m = line.match(/^note\s+"([^"]*)"(?:\s+as\s+\S+)?/i))) { B.notes.push({ near: null, text: m[1].replace(/\\n/g, "\n") }); return; }
      if (/^note\s+as\s+\S+\s*$/i.test(line) || /^note\s+(left|right|top|bottom)\s*$/i.test(line)) { noteBuf = { near: /as/i.test(line) ? null : B._last, text: "" }; return; }
      if ((m = line.match(CLASS_KW))) {
        const h = parseClassHead(B, m[1], m[2], curPkg());
        if (h) {
        B._last = h.c.name;
        if (h.inline != null) h.inline.split(h.c._enum ? /[;,\n]/ : /[;\n]/).forEach((x) => x.trim() && B.member(h.c, x, ln));
        if (h.brace) { cur = h.c; stack.push({ type: "class" }); }
        B.rels.forEach((r) => { if (!r.ln) r.ln = ln; });
        return;
        }
      }
      if ((m = line.match(REL_RX))) { B.relation(m[1], m[2], m[3], m[4], m[5], m[6], ln, line); return; }
      if ((m = line.match(new RegExp(String.raw`^${NAME_RX}\s*:\s*(.+)$`)))) { const c = B.ensure(B.nameOf(m[1])); c.implicit = null; if (!c.package) c.package = curPkg(); B.member(c, m[2], ln); return; }
      if (/^\w+\s*-+>\s*\w+/.test(line) || /^(participant|actor|usecase|state|start|stop|if|while|:.*;)\b/i.test(line)) { B.skip(ln, "pas un diagramme de classes", line); return; }
      B.skip(ln, "ligne non reconnue", line);
    });
    B.notes = B.notes.filter((n) => !n.skipLegend);
    return B.finish(opt);
  }

  /* ---------- Mermaid classDiagram ---------- */
  function fromMermaid(text, opt = {}) {
    const B = makeBuilder();
    B.rep.format = "Mermaid";
    let src = String(text).replace(/\r\n?/g, "\n");
    const fence = src.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
    if (fence) src = fence[1];
    src = src.replace(/^---\n[\s\S]*?\n---\n/, (m) => { const t = m.match(/title:\s*(.+)/); if (t) B.title = t[1].trim(); return m.replace(/[^\n]/g, ""); });
    const stack = [];
    let cur = null;
    const curNs = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].type === "package") return stack[i].name; return null; };
    src.split("\n").forEach((raw, i) => {
      const ln = i + 1;
      const line = raw.replace(/%%.*$/, "").trim();
      if (!line) return;
      if (cur) {
        if (line === "}") { cur = null; stack.pop(); return; }
        const a = line.match(/^<<\s*(.+?)\s*>>$/);
        if (a) { annotate(cur, a[1]); return; }
        B.member(cur, line, ln); return;
      }
      if (line === "}") { stack.pop(); return; }
      let m;
      if ((m = line.match(/^style\s+(\S+)\s+(.+)$/i))) { const f = m[2].match(/fill\s*:\s*([^,;\s]+)/i), s = /stroke\s*:/i.test(m[2]); if (f) { const col = parseColor(f[1]); if (col) { if (s) col.line = true; B.colors.classes[B.nameOf(m[1])] = col; } } return; }
      if ((m = line.match(/^classDef\s+(\S+)\s+(.+)$/i))) { const f = m[2].match(/fill\s*:\s*([^,;\s]+)/i); if (f) { const col = parseColor(f[1]); if (col) { if (/stroke\s*:/i.test(m[2])) col.line = true; for (const k of m[1].split(",")) B.classDefs[k.trim()] = col; } } return; }
      if ((m = line.match(/^cssClass\s+"([^"]+)"\s+(\S+)/i))) { m[1].split(",").forEach((n) => (B.cssClass[B.nameOf(n.trim())] = m[2])); return; }
      if (/^classDiagram(-v2)?\b/i.test(line) || /^(direction|click|link|callback|accTitle|accDescr)\b/i.test(line)) return;
      if ((m = line.match(/^title\s+(.*)$/i))) { B.title = m[1]; return; }
      if ((m = line.match(/^namespace\s+(\S+)\s*\{\s*$/i))) { stack.push({ type: "package", name: m[1] }); if (!B.firstPkg) B.firstPkg = m[1]; return; }
      if ((m = line.match(/^<<\s*(.+?)\s*>>\s+(\S+)$/))) { const c = B.ensure(B.nameOf(m[2])); c.implicit = null; annotate(c, m[1]); return; }
      if ((m = line.match(/^note\s+for\s+(\S+)\s+"([\s\S]*)"$/i))) { B.notes.push({ near: B.nameOf(m[1]), text: m[2].replace(/\\n|<br\s*\/?>/g, "\n") }); return; }
      if ((m = line.match(/^note\s+"([\s\S]*)"$/i))) { B.notes.push({ near: null, text: m[1].replace(/\\n|<br\s*\/?>/g, "\n") }); return; }
      if ((m = line.match(/^class\s+(.+)$/i))) {
        const rest = m[1].replace(/\["[^"]*"\]/, "");
        const h = parseClassHead(B, "class", rest, curNs());
        if (!h) { B.skip(ln, "déclaration non comprise", line); return; }
        if (h.inline != null) h.inline.split(h.c._enum ? /[;,\n]/ : /[;\n]/).forEach((x) => x.trim() && B.member(h.c, x, ln));
        if (h.brace) { cur = h.c; stack.push({ type: "class" }); }
        return;
      }
      if ((m = line.match(REL_RX))) { B.relation(m[1], m[2], m[3], m[4], m[5], m[6], ln, line); return; }
      if ((m = line.match(new RegExp(String.raw`^${NAME_RX}\s*:\s*(.+)$`)))) { const c = B.ensure(B.nameOf(m[1])); c.implicit = null; if (!c.package) c.package = curNs(); B.member(c, m[2], ln); return; }
      if (/^(graph|flowchart|sequenceDiagram|erDiagram|stateDiagram|gantt|pie)\b/i.test(line)) { B.skip(ln, "pas un diagramme de classes", line); return; }
      B.skip(ln, "ligne non reconnue", line);
    });
    for (const c of B.classes.values()) if (c.stereotype === "Enumeration") c.attributes.forEach((a) => { a.type = ""; a.mult = ""; delete a.vis; });
    return B.finish(opt);
  }

  function detectFormat(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    if (/^[\[{]/.test(t)) return "json";
    if (/^\s*(```mermaid|classDiagram)/im.test(t) && !/@startuml/i.test(t)) return "mermaid";
    if (/@startuml/i.test(t)) return "plantuml";
    if (/^\s*(abstract\s+class|class|enum|interface|package)\s+\S+/m.test(t) || REL_RX.test(t.split("\n").find((l) => /--|\.\./.test(l)) || "")) return "plantuml";
    return null;
  }
  function importText(text, opt = {}) {
    const f = detectFormat(text);
    if (f === "mermaid") return fromMermaid(text, opt);
    if (f === "plantuml") return fromPlantUML(text, opt);
    return null;
  }

  // Adds an imported model to the current one. A real class replaces a stub of the same name; positions are kept.
  function mergeState(base, inc) {
    const M = base.model, N = inc.model;
    if (!M.classes.length) M.profile = N.profile;
    const rep = { added: 0, resolved: [], updated: [], relations: 0 };
    for (const c of N.classes) {
      const cur = findClass(M, c.name);
      if (!cur) { M.classes.push(c); rep.added++; continue; }
      if (c.external) continue;
      if (cur.external) rep.resolved.push(c.name); else rep.updated.push(c.name);
      M.classes[M.classes.indexOf(cur)] = c;
    }
    const key = (r) => [r.kind, r.from, r.to, r.name].join("|");
    const have = new Set(M.relations.map(key));
    for (const r of N.relations) { if (have.has(key(r))) continue; have.add(key(r)); M.relations.push({ ...r, id: "R" + M.seq++ }); rep.relations++; }
    for (const n of N.notes) M.notes.push({ ...n, id: "N" + M.seq++ });
    if (inc.layout && inc.layout.style) {
      base.layout.style = normStyle(base.layout.style);
      for (const k of ["classes", "packages", "stereotypes"]) Object.assign(base.layout.style[k], normStyle(inc.layout.style)[k]);
    }
    const names = new Set(M.classes.map((c) => c.name));
    M.externalTypes = [...new Set([...(M.externalTypes || []), ...(N.externalTypes || [])])].filter((t) => !names.has(t)).sort();
    return rep;
  }
