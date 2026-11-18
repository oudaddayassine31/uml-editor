  /* ---------- validator: profile "uml" checks consistency only; "iso19109" and "citygml" add modelling rules ---------- */
  const VALUE_TYPES = ["DataType", "Union", "CodeList", "Enumeration"];
  function knownType(model, t) {
    if (!t) return null;
    if (PRIMITIVES.includes(t)) return { primitive: true };
    if ((model.externalTypes || []).includes(t)) return { external: true };
    return resolve(model, t);
  }
  function multOK(s) {
    if (s === "" || s == null || s === "*") return true;
    const m = String(s).match(RX_MULT);
    if (!m) return false;
    const lo = m[1], hi = m[3];
    if (lo === "*") return false;
    if (hi && hi !== "*" && +hi < +lo) return false;
    return true;
  }

  function validate(model) {
    const I = [];
    const add = (level, target, msg, attr) => I.push({ level, target, msg, attr });
    const profile = model.profile || "uml";
    const iso = profile !== "uml", cg = profile === "citygml";
    const counts = {};
    for (const c of model.classes) counts[c.name] = (counts[c.name] || 0) + 1;
    const gens = {}, hasChild = new Set(), linked = new Set();
    for (const r of model.relations) {
      if (r.kind === "generalization") { (gens[r.from] = gens[r.from] || []).push(r.to); hasChild.add(r.to); }
      else { linked.add(r.from); linked.add(r.to); }
    }

    for (const c of model.classes) {
      if (c.external) continue;
      const T = { kind: "class", name: c.name };
      if (!c.name.trim()) add("error", T, "Classe sans nom.");
      if (counts[c.name] > 1) add("error", T, "Nom de classe en double dans le modèle.");
      const anc = ancestors(model, c.name);
      const sups = (gens[c.name] || []).map((s) => resolve(model, s) || { missing: true, name: s });
      for (const s of sups) if (s.missing) add("error", T, `Superclasse inconnue: ${s.name}.`);
      if (anc.some((a) => a.cycle)) add("error", T, "Cycle d'héritage.");
      for (const s of sups) if (s.stereotype === "Interface" && c.stereotype !== "Interface") add("info", T, `${s.name} est une interface: utilise une réalisation plutôt qu'un héritage.`);
      if (isLiteralClass(c) && sups.length) add("warning", T, `Une «${c.stereotype}» n'a normalement pas de superclasse.`);
      if (c.stereotype === "Enumeration" && !c.attributes.length) add("warning", T, "Enumeration sans valeur.");

      const seen = new Set();
      const inh = iso ? inheritedAttributes(model, c.name) : [];
      for (const a of c.attributes) {
        if (!a.name) add("error", T, "Attribut sans nom.");
        if (seen.has(a.name)) add("error", T, `Attribut en double: ${a.name}.`, a.name);
        seen.add(a.name);
        if (isLiteralClass(c)) continue;
        if (!multOK(a.mult)) add("error", T, `Multiplicité invalide pour ${a.name}: "${a.mult}".`, a.name);
        if (!iso) continue;
        if (!RX_ATTR.test(a.name)) add("warning", T, `Attribut ${a.name}: lowerCamelCase attendu.`, a.name);
        const h = inh.find((x) => x.name === a.name);
        if (h) add("warning", T, `${a.name} redéfinit l'attribut hérité de ${h.from}.`, a.name);
        if (!a.type) add("error", T, `Attribut ${a.name} sans type.`, a.name);
        else {
          const t = knownType(model, a.type);
          if (!t) add("error", T, `Attribut ${a.name}: type inconnu ${a.type}. Crée-le («CodeList», «DataType», «Enumeration»), utilise un type ISO 19103, ou déclare-le comme type externe.`, a.name);
          else if (t.stereotype === "FeatureType") add("warning", T, `Attribut ${a.name} typé par une «FeatureType» (${a.type}): utilise une association.`, a.name);
        }
      }
      if (!iso) continue;

      const std = STEREOS.includes(c.stereotype);
      if (!RX_CLASS.test(c.name)) add("error", T, "Nom de classe attendu en UpperCamelCase (lettres, chiffres, _).");
      if (cg && LIB[c.name]) add("error", T, `Nom déjà utilisé par CityGML (${LIB[c.name].module}::${c.name}).`);
      if (!c.stereotype) add("warning", T, "Pas de stéréotype (attendu: FeatureType, DataType, CodeList, Enumeration, Union).");
      else if (!std) add("warning", T, `«${c.stereotype}» n'est pas un stéréotype ISO 19109/19103: ShapeChange ne saura pas l'encoder (FeatureType? Type? DataType?).`);
      if (sups.length > 1) add("warning", T, `Héritage multiple (${sups.map((s) => s.name).join(", ")}): l'encodage GML attend un seul supertype.`);
      for (const s of sups) if (!s.missing && !s.external && std && STEREOS.includes(s.stereotype) && s.stereotype !== c.stereotype) add("error", T, `Une «${c.stereotype}» ne peut pas hériter d'une «${s.stereotype}» (${s.name}).`);
      if (c.operations.length) add("info", T, "Les opérations ne sont pas encodées en GML/CityJSON.");
      const sup = sups[0];
      if (c.stereotype === "FeatureType") {
        if (cg) {
          const reaches = anc.some((a) => a && (a.ref || a.external || a.missing || a.cycle));
          if (!sups.length) add("error", T, "Une «FeatureType» d'ADE doit hériter d'une classe CityGML (ex. AbstractOccupiedSpace, AbstractThematicSurface).");
          else if (!reaches) add("error", T, "La chaîne d'héritage n'atteint aucune classe CityGML.");
        }
        if (sup && sup.ref && !sup.abstract) add("info", T, `Sous-classe d'une classe concrète CityGML (${sup.name}). Pour seulement ajouter des propriétés à ${sup.name}, utilise plutôt le hook ADEOf${sup.name}.`);
        if (!c.attributes.length && !linked.has(c.name) && !hasChild.has(c.name)) add("info", T, "Classe vide: ni attribut, ni association, ni sous-classe.");
      }
      if (sup && sup.hookOf && c.stereotype === "DataType" && !c.attributes.length) add("warning", T, `Hook ADE vers ${sup.hookOf} sans aucune propriété.`);
      if (sup && sup.hookOf && c.abstract) add("warning", T, "Une classe d'extension ADEOf… doit être concrète pour être instanciée.");
      if (/^Abstract[A-Z]/.test(c.name) && !c.abstract) add("warning", T, "Le nom commence par Abstract mais la classe n'est pas abstraite.");
      if (cg && c.abstract && !/^Abstract/.test(c.name) && c.stereotype === "FeatureType") add("warning", T, "Convention CityGML 3.0: les classes abstraites sont préfixées par Abstract.");
      if (c.stereotype === "CodeList" && c.attributes.length) add("info", T, "CodeList avec ses valeurs listées dans le modèle: si la liste est fermée, c'est une «Enumeration»; si elle est extensible, gère les valeurs dans un registre externe.");
      if (c.stereotype === "Union" && c.attributes.length < 2) add("warning", T, "Une «Union» doit proposer au moins deux alternatives.");
    }

    const nameCount = {};
    model.relations.forEach((r) => { if (r.name && ASSOC_KINDS.includes(r.kind)) nameCount[r.name] = (nameCount[r.name] || 0) + 1; });
    for (const r of model.relations) {
      const T = { kind: "rel", id: r.id };
      const f = resolve(model, r.from), t = resolve(model, r.to);
      if (r.kind === "generalization") continue;
      if (!f) add("error", T, `${r.id}: extrémité inconnue ${r.from}.`);
      if (!t) add("error", T, `${r.id}: extrémité inconnue ${r.to}.`);
      if (!ASSOC_KINDS.includes(r.kind)) continue;
      if (!multOK(r.fromMult) || !multOK(r.toMult)) add("error", T, `${r.id} (${r.from} — ${r.to}): multiplicité invalide.`);
      if (!iso) continue;
      for (const e of [f, t]) if (e && !e.external && VALUE_TYPES.includes(e.stereotype)) add("warning", T, `${r.id}: ${e.name} est une «${e.stereotype}». En ISO 19109 une valeur s'utilise comme type d'attribut, pas comme extrémité d'association.`);
      if (!r.toRole && r.nav === "none" && r.kind === "association") add("info", T, `${r.id} (${r.from} — ${r.to}): ni nom de rôle ni navigabilité. ShapeChange en a besoin pour savoir quelle classe porte la propriété GML.`);
      else if (!r.toRole) add("info", T, `${r.id} (${r.from} → ${r.to}): pas de nom de rôle côté cible. ShapeChange en a besoin pour générer la propriété GML.`);
      if (r.name && nameCount[r.name] > 1) add("info", T, `${r.id}: le nom « ${r.name} » est utilisé par ${nameCount[r.name]} associations.`);
    }
    const order = { error: 0, warning: 1, info: 2 };
    I.sort((x, y) => order[x.level] - order[y.level]);
    return I;
  }

  // CityGML reference classes to draw: those a model class is related to (optionally with their whole ancestry)
  function visibleRefs(model, fullChain) {
    const set = new Set();
    const addChain = (n) => {
      let c = LIB[n];
      while (c && !findClass(model, c.name)) { set.add(c.name); if (!fullChain) break; c = c.superclass ? LIB[c.superclass] : null; }
    };
    for (const r of model.relations) for (const n of [r.from, r.to]) if (LIB[n] && !findClass(model, n)) addChain(n);
    return [...set];
  }
