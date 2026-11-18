  /* ===================== model v2 =====================
     model:  { version: 2, name, title?, alias?, prefix, profile: "uml" | "iso19109" | "citygml",
               classes: [...], relations: [...], notes: [...], externalTypes: [...], seq }
     class:  { name, stereotype, abstract, package, external?, doc?,
               attributes: [{ name, type, mult, vis?, static?, derived?, default?, doc? }],
               operations: [{ name, params, type, vis?, static?, abstract? }] }
     rel:    { id, kind, from, to, name, fromRole, toRole, fromMult, toMult, nav: "to" | "both" | "none" }
     note:   { id, text, near? }
     layout: { nodes: { [class]: { x, y, pinned?, hidden? } }, edges: { [relId]: { off?, a?, b?, lx?, ly? } },
               notes: { [id]: { x, y, w } }, hiddenPackages: [] }                                              */
  const ASSOC_KINDS = ["association", "aggregation", "composition"];
  const REL_KINDS = [...ASSOC_KINDS, "generalization", "realization", "dependency"];
  const UI_STEREOS = [...STEREOS, "Interface"];
  const PROFILES = ["uml", "iso19109", "citygml"];

  function normStereo(s) {
    const raw = String(s == null ? "" : s).replace(/[«»]/g, "").replace(/^<<\s*|\s*>>$/g, "").trim();
    const t = raw.toLowerCase();
    if (t === "enum" || t === "enumeration") return "Enumeration";
    if (t === "interface") return "Interface";
    return STEREOS.find((x) => x.toLowerCase() === t) || raw;
  }
  function stripPrefix(n) {
    if (n == null) return n;
    const s = String(n).trim().replace(/^"(.*)"$/, "$1");
    if (s.includes("<")) return s;
    const i = s.lastIndexOf("::");
    return i >= 0 ? s.slice(i + 2) : s.replace(/^[a-z]+:(?=[A-Z])/, "");
  }
  const isLiteralClass = (c) => !!c && (c.stereotype === "Enumeration" || c.stereotype === "CodeList");
  const normMult = (m) => { const s = String(m == null ? "" : m).replace(/\s/g, ""); return s === "*" ? "0..*" : s; };

  function emptyState(name = "Model", profile = "uml") {
    return {
      model: { version: 2, name, prefix: name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "m", profile, classes: [], relations: [], notes: [], externalTypes: [], seq: 1 },
      layout: { nodes: {}, edges: {}, notes: {}, hiddenPackages: [], style: emptyStyle() }
    };
  }
  // colours are presentation, like positions: they live in the layout, not in the model
  function emptyStyle() { return { classes: {}, packages: {}, stereotypes: {} }; }
  function normStyle(st) {
    st = st && typeof st === "object" ? st : {};
    for (const k of ["classes", "packages", "stereotypes"]) st[k] = st[k] && typeof st[k] === "object" ? st[k] : {};
    return st;
  }
  const findClass = (model, name) => model.classes.find((c) => c.name === name) || null;
  function resolve(model, name) { return name ? findClass(model, name) || LIB[name] || null : null; }
  function supersOf(model, name, kind = "generalization") {
    if (!findClass(model, name)) { const l = LIB[name]; return l && l.superclass && kind === "generalization" ? [l.superclass] : []; }
    return model.relations.filter((r) => r.kind === kind && r.from === name).map((r) => r.to);
  }
  // all ancestors, nearest first (breadth-first over multiple inheritance)
  function ancestors(model, name) {
    const out = [], seen = new Set([name]);
    let level = [name];
    while (level.length) {
      const next = [];
      for (const n of level) for (const s of supersOf(model, n)) {
        if (s === name) { out.push({ cycle: true, name: s }); continue; }
        if (seen.has(s)) continue;
        seen.add(s);
        const c = resolve(model, s);
        out.push(c || { missing: true, name: s });
        if (c) next.push(s);
      }
      level = next;
    }
    return out;
  }
  function inheritedAttributes(model, name) {
    const res = [];
    for (const a of ancestors(model, name)) if (a && a.attributes) for (const at of a.attributes) res.push({ ...at, from: a.name });
    return res;
  }

  /* ---------- member text <-> object ---------- */
  // Reads one member line in PlantUML, Mermaid, UML or Java-like notation.
  function parseMember(raw, literal) {
    let l = String(raw == null ? "" : raw).trim();
    if (!l || /^(--|\.\.|==|__)/.test(l)) return null;
    let stat = false, abs = false;
    l = l.replace(/\{\s*(static|classifier)\s*\}/gi, () => { stat = true; return ""; })
      .replace(/\{\s*abstract\s*\}/gi, () => { abs = true; return ""; })
      .replace(/\{\s*(field|method)\s*\}/gi, "").trim();
    const vm = l.match(/^([+\-#~])\s*/);
    const vis = vm ? vm[1] : "";
    if (vm) l = l.slice(vm[0].length);
    l = l.replace(/~([^~\s]*)~/g, "<$1>");
    for (;;) {
      const k = l.match(/^(static|abstract|final|public|private|protected)\s+/i);
      if (!k) break;
      if (/static/i.test(k[1])) stat = true;
      if (/abstract/i.test(k[1])) abs = true;
      l = l.slice(k[0].length);
    }
    if (literal) {
      const n = l.replace(/[,;]\s*$/, "").split(/[\s=(:]/)[0];
      return n ? { kind: "lit", name: n } : null;
    }
    const pi = l.indexOf("("), pc = l.lastIndexOf(")");
    if (pi > 0 && pc > pi) {
      const head = l.slice(0, pi).trim().split(/\s+/);
      let tail = l.slice(pc + 1).trim();
      if (/\$$/.test(tail)) { stat = true; tail = tail.slice(0, -1).trim(); }
      if (/\*$/.test(tail)) { abs = true; tail = tail.slice(0, -1).trim(); }
      const name = head.pop();
      let type = tail.replace(/^:\s*/, "").replace(/\{[^}]*\}\s*$/, "").trim();
      if (!type && head.length) type = head.join(" ");
      if (!name || /[^\w$<>.]/.test(name)) return null;
      const op = { kind: "op", name, params: l.slice(pi + 1, pc).trim(), type: type === "void" ? "" : type };
      if (vis) op.vis = vis; if (stat) op.static = true; if (abs) op.abstract = true;
      return op;
    }
    let derived = false;
    if (l[0] === "/") { derived = true; l = l.slice(1).trim(); }
    if (/\$$/.test(l)) { stat = true; l = l.slice(0, -1).trim(); }
    l = l.replace(/\{[^}]*\}\s*$/, "").replace(/;\s*$/, "").trim();
    let def;
    const eq = l.match(/^(.*?[^=<>!])\s*=\s*([^=].*)$/);
    if (eq) { l = eq[1].trim(); def = eq[2].trim(); }
    const a = { kind: "attr", name: "", type: "", mult: "" };
    let m = l.match(/^([A-Za-z_][\w]*)\s*(?:\[([^\]]+)\])?\s*:\s*(.+?)\s*(?:\[([^\]]+)\])?$/);
    if (m) { a.name = m[1]; a.type = stripPrefix(m[3]); a.mult = normMult(m[4] || m[2] || ""); }
    else if ((m = l.match(/^(.+?)\s*(?:\[([^\]]+)\])?\s+([A-Za-z_]\w*)\s*(?:\[([^\]]+)\])?$/))) { a.name = m[3]; a.type = stripPrefix(m[1]); a.mult = normMult(m[2] || m[4] || ""); }
    else if ((m = l.match(/^([A-Za-z_][\w]*)\s*(?:\[([^\]]+)\])?$/))) { a.name = m[1]; a.mult = normMult(m[2] || ""); }
    else return null;
    if (vis) a.vis = vis; if (stat) a.static = true; if (derived) a.derived = true; if (def != null) a.default = def;
    return a;
  }
  function attrText(a, literal) {
    if (literal) return a.name;
    return `${a.vis || ""}${a.derived ? "/" : ""}${a.name}${a.type ? " : " + a.type : ""}${a.mult ? " [" + a.mult + "]" : ""}${a.default != null && a.default !== "" ? " = " + a.default : ""}`;
  }
  function opText(o) { return `${o.vis || ""}${o.name}(${o.params || ""})${o.type ? " : " + o.type : ""}`; }

  function normAttr(a, cls) {
    const lit = isLiteralClass(cls);
    if (typeof a === "string") a = parseMember(a, lit) || { name: a };
    const out = { name: String(a.name || "").trim(), type: lit ? "" : stripPrefix(a.type || "") || "", mult: lit ? "" : normMult(a.mult ?? a.multiplicity) };
    const vis = a.vis ?? a.visibility;
    if (vis && /^[+\-#~]$/.test(vis)) out.vis = vis;
    if (a.static) out.static = true;
    if (a.derived) out.derived = true;
    if (a.default != null && a.default !== "") out.default = String(a.default);
    if (a.doc) out.doc = String(a.doc);
    return out;
  }
  function normOp(o) {
    if (typeof o === "string") o = parseMember(o, false) || { name: o };
    let params = o.params ?? o.parameters ?? "";
    if (Array.isArray(params)) params = params.map((p) => (typeof p === "string" ? p : `${p.name}${p.type ? ": " + p.type : ""}`)).join(", ");
    const out = { name: String(o.name || "").trim(), params: String(params), type: String(o.type ?? o.returnType ?? o.returns ?? "").trim() };
    const vis = o.vis ?? o.visibility;
    if (vis && /^[+\-#~]$/.test(vis)) out.vis = vis;
    if (o.static) out.static = true;
    if (o.abstract) out.abstract = true;
    return out;
  }
  function newRel(model, r) {
    const kind = REL_KINDS.includes(r.kind) ? r.kind : "association";
    const nav = ["to", "both", "none"].includes(r.nav) ? r.nav : r.navigable === false ? "none" : kind === "association" ? "to" : "none";
    return {
      id: r.id || "R" + model.seq++, kind, from: stripPrefix(r.from), to: stripPrefix(r.to), name: String(r.name || ""),
      fromRole: String(r.fromRole || ""), toRole: String(r.toRole ?? r.role ?? ""), fromMult: normMult(r.fromMult), toMult: normMult(r.toMult), nav
    };
  }

  /* ---------- operations (the only way the model changes) ---------- */
  const OP_ALIAS = { add_association: "add_relation", update_association: "update_relation", delete_association: "delete_relation", add_literal: "add_attribute", delete_literal: "delete_attribute", add_method: "add_operation", update_method: "update_operation", delete_method: "delete_operation" };
  const KNOWN_OPS = ["add_class", "update_class", "delete_class", "add_attribute", "update_attribute", "delete_attribute", "move_attribute",
    "add_operation", "update_operation", "delete_operation", "move_operation", "add_relation", "update_relation", "delete_relation",
    "set_model", "add_note", "update_note", "delete_note", ...Object.keys(OP_ALIAS)];
  const opTypeIsName = (op) => !op.op && !op.action && KNOWN_OPS.includes(op.type);
  function opName(op) { const n = String(op.op || op.action || (opTypeIsName(op) ? op.type : "") || "").trim(); return OP_ALIAS[n] || n; }
  function setOf(op) {
    if (op.set && typeof op.set === "object") return op.set;
    const s = { ...op };
    for (const k of ["op", "action", "class", "id", "target"]) delete s[k];
    if (opTypeIsName(op)) delete s.type;
    if (/_(class|attribute|operation)$/.test(opName(op))) delete s.name;
    return s;
  }

  function renameEverywhere(state, from, to) {
    const m = state.model;
    for (const c of m.classes) {
      for (const a of c.attributes) if (a.type === from) a.type = to;
      for (const o of c.operations) if (o.type === from) o.type = to;
    }
    for (const r of m.relations) { if (r.from === from) r.from = to; if (r.to === from) r.to = to; }
    for (const n of m.notes) if (n.near === from) n.near = to;
    const L = state.layout.nodes;
    if (L[from]) { L[to] = L[from]; delete L[from]; }
    const C = state.layout.style && state.layout.style.classes;
    if (C && C[from]) { C[to] = C[from]; delete C[from]; }
  }
  function moveItem(arr, i, to) {
    if (i < 0) return false;
    to = Math.max(0, Math.min(arr.length - 1, to));
    const [x] = arr.splice(i, 1); arr.splice(to, 0, x);
    return true;
  }

  function applyOp(state, op, ctx) {
    const m = state.model;
    const kind = opName(op);
    const need = (v, what) => { if (v == null || v === "") throw new Error(`${what} manquant`); return v; };
    const getC = (n) => {
      const name = stripPrefix(need(n, "nom de classe"));
      const c = findClass(m, name);
      if (!c) throw new Error(LIB[name] ? `${name} est une classe CityGML (lecture seule): crée une sous-classe ou un hook ADEOf${name}` : `classe inconnue: ${name}`);
      return c;
    };
    const addGen = (from, to, k = "generalization") => {
      to = stripPrefix(to);
      if (from === to) throw new Error("une classe ne peut pas hériter d'elle-même");
      if (m.relations.some((r) => r.kind === k && r.from === from && r.to === to)) return null;
      const r = newRel(m, { kind: k, from, to });
      m.relations.push(r);
      return r.id;
    };
    switch (kind) {
      case "add_class": {
        const name = stripPrefix(need(op.name, "name"));
        if (findClass(m, name)) throw new Error(`${name} existe déjà (utilise update_class)`);
        if (LIB[name] && m.profile === "citygml") throw new Error(`${name} est un nom réservé CityGML`);
        const c = {
          name, stereotype: op.stereotype == null ? (m.profile === "uml" ? "" : "FeatureType") : normStereo(op.stereotype),
          abstract: op.abstract != null ? !!op.abstract : /^Abstract[A-Z]/.test(name), package: op.package || m.name, attributes: [], operations: []
        };
        if (op.doc) c.doc = String(op.doc);
        if (op.external) c.external = true;
        for (const a of op.attributes || op.literals || op.values || []) c.attributes.push(normAttr(a, c));
        for (const o of op.operations || op.methods || []) c.operations.push(normOp(o));
        m.classes.push(c);
        for (const s of [].concat(op.supers || op.superclass || [])) if (s) addGen(name, s);
        for (const s of [].concat(op.realizes || op.implements || [])) if (s) addGen(name, s, "realization");
        ctx.added.add(name);
        return name;
      }
      case "update_class": {
        const c = getC(op.name || op.class);
        const s = setOf(op);
        if (s.newName != null && s.name == null) s.name = s.newName;
        if (s.stereotype != null) { c.stereotype = normStereo(s.stereotype); if (isLiteralClass(c)) { c.attributes.forEach((a) => { a.type = ""; a.mult = ""; }); } }
        if (s.abstract != null) c.abstract = !!s.abstract;
        if (s.external != null) { if (s.external) c.external = true; else delete c.external; }
        if (s.package != null) c.package = String(s.package) || m.name;
        if (s.doc != null) c.doc = String(s.doc);
        if (s.superclass !== undefined) {
          m.relations = m.relations.filter((r) => !(r.kind === "generalization" && r.from === c.name));
          if (s.superclass) addGen(c.name, s.superclass);
        }
        if (s.name != null && stripPrefix(s.name) !== c.name) {
          const nn = stripPrefix(s.name);
          if (!nn) throw new Error("nom vide");
          if (findClass(m, nn) || (LIB[nn] && m.profile === "citygml")) throw new Error(`le nom ${nn} est déjà pris`);
          const old = c.name; c.name = nn; renameEverywhere(state, old, nn);
          ctx.renamed[old] = nn;
        }
        ctx.modified.add(c.name);
        return c.name;
      }
      case "delete_class": {
        const c = getC(op.name || op.class);
        m.classes = m.classes.filter((x) => x !== c);
        m.relations.filter((r) => r.from === c.name || r.to === c.name).forEach((r) => { delete state.layout.edges[r.id]; const o = r.from === c.name ? r.to : r.from; if (findClass(m, o)) ctx.modified.add(o); });
        m.relations = m.relations.filter((r) => r.from !== c.name && r.to !== c.name);
        m.notes.forEach((n) => { if (n.near === c.name) delete n.near; });
        delete state.layout.nodes[c.name];
        if (state.layout.style) delete state.layout.style.classes[c.name];
        ctx.deleted.add(c.name); ctx.modified.delete(c.name);
        return c.name;
      }
      case "add_attribute": {
        const c = getC(op.class || op.target);
        const a = normAttr(op.text != null ? op.text : { ...op, name: need(op.name, "name"), type: opTypeIsName(op) ? op.attrType : (op.type ?? op.attrType) }, c);
        if (!a.name) throw new Error("nom d'attribut manquant");
        if (c.attributes.some((x) => x.name === a.name)) throw new Error(`${c.name}.${a.name} existe déjà`);
        if (op.index != null) c.attributes.splice(+op.index, 0, a); else c.attributes.push(a);
        ctx.modified.add(c.name);
        return c.name + "." + a.name;
      }
      case "update_attribute": {
        const c = getC(op.class || op.target);
        const a = c.attributes.find((x) => x.name === op.name);
        if (!a) throw new Error(`attribut inconnu: ${c.name}.${op.name}`);
        const s = op.text != null ? normAttr(op.text, c) : setOf(op);
        if (op.text != null) { for (const k of ["vis", "static", "derived", "default"]) delete a[k]; if (!s.name) throw new Error("ligne d'attribut non comprise"); }
        if (s.newName != null && s.name == null) s.name = s.newName;
        if (s.name != null && s.name !== a.name) { if (!String(s.name).trim()) throw new Error("nom vide"); if (c.attributes.some((x) => x !== a && x.name === s.name)) throw new Error(`${c.name}.${s.name} existe déjà`); a.name = String(s.name).trim(); }
        if (!isLiteralClass(c)) {
          const t = s.type ?? s.attrType;
          if (t != null) a.type = stripPrefix(t);
          if ((s.mult ?? s.multiplicity) != null) a.mult = normMult(s.mult ?? s.multiplicity);
        }
        const vis = s.vis ?? s.visibility;
        if (vis != null) { if (/^[+\-#~]$/.test(vis)) a.vis = vis; else delete a.vis; }
        for (const k of ["static", "derived"]) if (s[k] != null) { if (s[k]) a[k] = true; else delete a[k]; }
        if (s.default != null) { if (s.default === "") delete a.default; else a.default = String(s.default); }
        if (s.doc != null) a.doc = String(s.doc);
        ctx.modified.add(c.name);
        return c.name + "." + a.name;
      }
      case "delete_attribute": case "delete_operation": {
        const c = getC(op.class || op.target);
        const key = kind === "delete_attribute" ? "attributes" : "operations";
        const i = op.index != null ? +op.index : c[key].findIndex((x) => x.name === op.name);
        if (!c[key][i]) throw new Error(`membre inconnu: ${c.name}.${op.name}`);
        c[key].splice(i, 1);
        ctx.modified.add(c.name);
        return c.name;
      }
      case "move_attribute": case "move_operation": {
        const c = getC(op.class || op.target);
        const arr = kind === "move_attribute" ? c.attributes : c.operations;
        const i = op.index != null ? +op.index : arr.findIndex((x) => x.name === op.name);
        if (!moveItem(arr, i, op.to != null ? +op.to : i + (+op.delta || 0))) throw new Error(`membre inconnu: ${c.name}.${op.name}`);
        ctx.modified.add(c.name);
        return c.name;
      }
      case "add_operation": {
        const c = getC(op.class || op.target);
        const o = normOp(op.text != null ? op.text : { ...op, type: opTypeIsName(op) ? op.returnType : (op.type ?? op.returnType) });
        if (!o.name) throw new Error("nom d'opération manquant");
        c.operations.push(o);
        ctx.modified.add(c.name);
        return c.name + "." + o.name + "()";
      }
      case "update_operation": {
        const c = getC(op.class || op.target);
        const o = op.index != null ? c.operations[+op.index] : c.operations.find((x) => x.name === op.name);
        if (!o) throw new Error(`opération inconnue: ${c.name}.${op.name}`);
        if (op.text != null) { const n = normOp(op.text); if (!n.name) throw new Error("ligne d'opération non comprise"); for (const k of Object.keys(o)) delete o[k]; Object.assign(o, n); }
        else {
          const s = setOf(op);
          if (s.name != null && String(s.name).trim()) o.name = String(s.name).trim();
          if (s.params != null) o.params = String(s.params);
          const t = s.type ?? s.returnType;
          if (t != null) o.type = String(t).trim();
          const vis = s.vis ?? s.visibility;
          if (vis != null) { if (/^[+\-#~]$/.test(vis)) o.vis = vis; else delete o.vis; }
          for (const k of ["static", "abstract"]) if (s[k] != null) { if (s[k]) o[k] = true; else delete o[k]; }
        }
        ctx.modified.add(c.name);
        return c.name + "." + o.name + "()";
      }
      case "add_relation": {
        const from = stripPrefix(need(op.from, "from")), to = stripPrefix(need(op.to, "to"));
        const k = REL_KINDS.includes(op.kind) ? op.kind : "association";
        if (!findClass(m, from) && !findClass(m, to)) throw new Error("au moins une extrémité doit être une classe du modèle");
        if (k === "generalization" || k === "realization") {
          if (!findClass(m, from)) throw new Error(`${from} n'est pas une classe du modèle: l'héritage part de la sous-classe`);
          const id = addGen(from, to, k);
          if (!id) throw new Error("cette relation existe déjà");
          ctx.modified.add(from);
          return id;
        }
        const r = newRel(m, { ...op, kind: k, id: undefined });
        m.relations.push(r);
        ctx.modified.add(findClass(m, from) ? from : to);
        return r.id;
      }
      case "update_relation": {
        const r = m.relations.find((x) => x.id === op.id);
        if (!r) throw new Error(`relation inconnue: ${op.id}`);
        const s = setOf(op);
        if (s.role != null && s.toRole == null) s.toRole = s.role;
        for (const k of ["name", "fromRole", "toRole"]) if (s[k] != null) r[k] = String(s[k]);
        for (const k of ["fromMult", "toMult"]) if (s[k] != null) r[k] = normMult(s[k]);
        if (s.kind && REL_KINDS.includes(s.kind)) r.kind = s.kind;
        if (s.navigable != null) r.nav = s.navigable === false || s.navigable === "false" ? "none" : "to";
        if (["to", "both", "none"].includes(s.nav)) r.nav = s.nav;
        if (s.from) r.from = stripPrefix(s.from);
        if (s.to) r.to = stripPrefix(s.to);
        if (!ASSOC_KINDS.includes(r.kind)) { r.fromRole = r.toRole = r.fromMult = r.toMult = ""; r.nav = "none"; }
        return r.id;
      }
      case "delete_relation": {
        const n = m.relations.length;
        m.relations = m.relations.filter((x) => x.id !== op.id);
        if (m.relations.length === n) throw new Error(`relation inconnue: ${op.id}`);
        delete state.layout.edges[op.id];
        return op.id;
      }
      case "set_model": {
        if (op.name && String(op.name) !== m.name) {
          const old = m.name; m.name = String(op.name);
          m.classes.forEach((c) => { if (c.package === old) c.package = m.name; });
          const P = state.layout.style && state.layout.style.packages;
          if (P && P[old]) { P[m.name] = P[old]; delete P[old]; }
        }
        if (op.prefix != null) m.prefix = String(op.prefix);
        if (op.title != null) m.title = String(op.title);
        if (PROFILES.includes(op.profile)) m.profile = op.profile;
        if (Array.isArray(op.externalTypes)) m.externalTypes = [...new Set(op.externalTypes.map((t) => String(t).trim()).filter(Boolean))];
        return m.name;
      }
      case "add_note": {
        const n = { id: "N" + m.seq++, text: String(op.text || "") };
        if (op.near) n.near = stripPrefix(op.near);
        m.notes.push(n);
        return n.id;
      }
      case "update_note": {
        const n = m.notes.find((x) => x.id === op.id);
        if (!n) throw new Error(`note inconnue: ${op.id}`);
        if (op.text != null) n.text = String(op.text);
        if (op.near !== undefined) { if (op.near) n.near = stripPrefix(op.near); else delete n.near; }
        return n.id;
      }
      case "delete_note": {
        const n = m.notes.length;
        m.notes = m.notes.filter((x) => x.id !== op.id);
        if (m.notes.length === n) throw new Error(`note inconnue: ${op.id}`);
        delete state.layout.notes[op.id];
        return op.id;
      }
      default:
        throw new Error(`op inconnue: "${kind}"`);
    }
  }

  function applyOps(state, ops) {
    const ctx = { added: new Set(), modified: new Set(), deleted: new Set(), renamed: {} };
    const failed = [], results = [];
    if (!Array.isArray(ops)) ops = [ops];
    ops.forEach((op, i) => {
      try { results.push(applyOp(state, op || {}, ctx)); }
      catch (e) { results.push(null); failed.push({ index: i, op: opName(op || {}) || "?", error: e.message }); }
    });
    for (const n of ctx.added) ctx.modified.delete(n);
    return { applied: ops.length - failed.length, failed, results, ctx };
  }

  /* ---------- older saved files ---------- */
  function migrate(st) {
    if (!st || !st.model || !Array.isArray(st.model.classes)) throw new Error("Ce fichier n'est pas un modèle.");
    const M = st.model;
    st.layout = st.layout || {};
    for (const k of ["nodes", "edges", "notes"]) st.layout[k] = st.layout[k] || {};
    st.layout.hiddenPackages = st.layout.hiddenPackages || [];
    st.layout.style = normStyle(st.layout.style);
    M.seq = M.seq || 1000;
    if (!Array.isArray(M.relations)) {
      const E = st.layout.edges, E2 = {};
      M.relations = [];
      for (const a of M.associations || []) {
        M.relations.push(newRel(M, { ...a, toRole: a.role, nav: a.nav === false ? "none" : undefined }));
        if (E["assoc:" + a.id]) E2[a.id] = E["assoc:" + a.id];
      }
      for (const c of M.classes) {
        if (c.superclass) { const r = newRel(M, { id: "G" + M.seq++, kind: "generalization", from: c.name, to: c.superclass }); M.relations.push(r); if (E["gen:" + c.name]) E2[r.id] = E["gen:" + c.name]; }
        delete c.superclass;
      }
      for (const k of Object.keys(E)) if (k.startsWith("gen:") && LIB[k.slice(4)] && !findClass(M, k.slice(4))) E2["lib:" + k.slice(4)] = E[k];
      delete M.associations;
      st.layout.edges = E2;
      if (!M.profile) M.profile = "citygml";
    }
    M.relations = M.relations.map((r) => newRel(M, r));
    for (const c of M.classes) { c.attributes = c.attributes || []; c.operations = c.operations || []; c.stereotype = c.stereotype || ""; c.package = c.package || M.name; }
    M.notes = M.notes || [];
    for (const n of M.notes) { const p = st.layout.notes[n.id]; if (p && p.near && !n.near) n.near = p.near; }
    M.externalTypes = M.externalTypes || [];
    if (!PROFILES.includes(M.profile)) M.profile = "uml";
    M.version = 2;
    return st;
  }
