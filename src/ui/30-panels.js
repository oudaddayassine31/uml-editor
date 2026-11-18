  /* ---------------- explorer ---------------- */
  const badge = (c) => (c.external ? "X" : { FeatureType: "F", DataType: "D", CodeList: "C", Enumeration: "E", Union: "U", Interface: "I", Type: "F" }[c.stereotype] || "");
  function renderTree() {
    const q = $("#q").value.trim().toLowerCase();
    const groups = new Map();
    for (const c of S.model.classes) {
      if (q && !c.name.toLowerCase().includes(q) && !c.attributes.some((a) => a.name.toLowerCase().includes(q))) continue;
      const p = pkgOf(c);
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(c);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === EXT_PKG) - (b === EXT_PKG) || a.localeCompare(b));
    if (!keys.length) { $("#tree").innerHTML = `<p class="treeempty">${q ? "Aucune classe ne correspond." : "Aucune classe pour l'instant."}</p>`; return; }
    $("#tree").innerHTML = keys.map((p) => {
      const off = S.layout.hiddenPackages.includes(p);
      const rows = groups.get(p).sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
        const hid = S.layout.hidden.includes(c.name), iss = issueIndex[c.name];
        const col = colorOf(c), bst = col && col.fill ? ` style="background:${col.fill};border-color:${shade(col.fill, 0.3)};color:${col.dark ? "#fff" : "#17202a"}"` : "";
        return `<div class="tr${off || hid ? " off" : ""}${sel.nodes.has(c.name) ? " on" : ""}" role="button" tabindex="0" data-cls="${esc(c.name)}"><span class="bdg ${badge(c)}"${bst}>${badge(c) === "X" ? "" : badge(c)}</span><span class="nm${c.abstract ? " abs" : ""}">${esc(c.name)}</span>${iss ? `<span class="dot ${iss.err ? "err" : "warn"}"></span>` : ""}<button class="eye" data-eye="${esc(c.name)}" title="${hid ? "Afficher" : "Masquer"} dans le diagramme" aria-label="${hid ? "Afficher" : "Masquer"} ${esc(c.name)}">${hid ? "○" : "●"}</button></div>`;
      }).join("");
      const pc = p === EXT_PKG ? null : normColor((S.layout.style.packages[p] || {}).fill);
      return `<div class="pk${off ? " off" : ""}"><span class="nm" title="${esc(p)}">${esc(p)}</span><span class="ct">${groups.get(p).length}</span>${p === EXT_PKG ? "" : `<button class="pkc${pc ? "" : " none"}" data-pal="pkg:${esc(p)}" title="Couleur du package" aria-label="Couleur du package ${esc(p)}"${pc ? ` style="background:${pc}"` : ""}></button>`}<button class="eye" data-eyepk="${esc(p)}" title="${off ? "Afficher" : "Masquer"} le package" aria-label="${off ? "Afficher" : "Masquer"} le package ${esc(p)}">${off ? "○" : "●"}</button></div>${rows}`;
    }).join("");
  }
  function renderTreeSel() { for (const el of $$("#tree .tr")) el.classList.toggle("on", sel.nodes.has(el.dataset.cls)); }
  $("#q").addEventListener("input", renderTree);
  $("#tree").addEventListener("click", (ev) => {
    const pal = ev.target.closest("[data-pal]");
    if (pal) { const r = pal.getBoundingClientRect(); openPalette(r.left, r.bottom + 6, pal.dataset.pal); return; }
    const eye = ev.target.closest("[data-eye]"), eyepk = ev.target.closest("[data-eyepk]"), row = ev.target.closest("[data-cls]");
    if (eye) { const n = eye.dataset.eye; layoutChange(() => { const i = S.layout.hidden.indexOf(n); if (i >= 0) S.layout.hidden.splice(i, 1); else { S.layout.hidden.push(n); sel.nodes.delete(n); } }, { inspector: true }); return; }
    if (eyepk) { const p = eyepk.dataset.eyepk; layoutChange(() => { const i = S.layout.hiddenPackages.indexOf(p); if (i >= 0) S.layout.hiddenPackages.splice(i, 1); else S.layout.hiddenPackages.push(p); fixVisibleSel(); }, { inspector: true }); return; }
    if (row) { const n = row.dataset.cls; select({ kind: "node", id: n }, { add: ev.shiftKey || ev.ctrlKey || ev.metaKey }); if (geo[n]) centerOn(n); else toast("Cette classe est masquée: clique ○ pour l'afficher."); }
  });
  $("#tree").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.matches(".tr")) ev.target.click(); });
  function fixVisibleSel() { for (const n of [...sel.nodes]) { const c = Core.findClass(S.model, n); if (c && isHidden(c)) sel.nodes.delete(n); } }

  $$(".tabs button").forEach((b) => b.addEventListener("click", () => {
    $$(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $("#pane-explorer").hidden = b.dataset.tab !== "explorer";
    $("#pane-agent").hidden = b.dataset.tab !== "agent";
  }));

  /* ---------------- inspector ---------------- */
  const insp = $("#inspector");
  wirePalette(insp);
  const fld = (label, inner) => `<label class="fld">${label}${inner}</label>`;
  let shownIssues = [];
  function issueList(list) {
    shownIssues = list;
    if (!list.length) return `<p><span class="dot ok"></span> Aucun problème.</p>`;
    return `<div class="issues">${list.map((i, k) => {
      const where = i.target.kind === "class" ? i.target.name : i.target.id;
      return `<button class="iss" data-iss="${k}"><span class="dot ${i.level === "error" ? "err" : i.level === "warning" ? "warn" : "info"}"></span><span><b>${esc(where)}</b> ${esc(i.msg)}</span></button>`;
    }).join("")}</div>`;
  }
  function issuesFor() {
    const o = selOne();
    if (!o) return selCount() ? [] : issues;
    if (o.kind === "class") return issues.filter((i) => i.target.kind === "class" && i.target.name === o.id);
    if (o.kind === "rel") return issues.filter((i) => i.target.kind === "rel" && i.target.id === o.id);
    return [];
  }
  function refreshIssuesBox() { const b = $("#issuesBox"); if (b) b.innerHTML = issueList(issuesFor()); }
  const PROFILE_NAME = { uml: "UML libre", iso19109: "Schéma ISO 19109", citygml: "ADE CityGML 3.0" };

  function renderInspector() {
    const o = selOne();
    if (!o) return selCount() ? renderMultiPanel() : renderModelPanel();
    if (o.kind === "class") return renderClassPanel(Core.findClass(S.model, o.id));
    if (o.kind === "ref") return renderRefPanel(Core.LIB[o.id]);
    if (o.kind === "rel") return o.id.startsWith("lib:") ? renderLibEdgePanel(o.id.slice(4)) : renderRelPanel(S.model.relations.find((r) => r.id === o.id));
    if (o.kind === "note") return renderNotePanel(S.model.notes.find((n) => n.id === o.id));
  }
  function renderModelPanel() {
    const m = S.model;
    const own = m.classes.filter((c) => !c.external).length;
    insp.innerHTML = `
      <section class="isec"><h3>Modèle</h3>
        ${m.title ? `<p>${esc(m.title)}</p>` : ""}
        <div class="stat"><div><b>${own}</b><span>classes</span></div><div><b>${m.relations.length}</b><span>liens</span></div><div><b>${new Set(m.classes.filter((c) => !c.external).map((c) => c.package)).size}</b><span>packages</span></div></div>
        ${fld("Nom", `<input id="m-name" value="${esc(m.name)}" spellcheck="false">`)}
        ${fld("Règles de validation", `<select id="m-profile">${Core.PROFILES.map((p) => `<option value="${p}" ${m.profile === p ? "selected" : ""}>${PROFILE_NAME[p]}</option>`).join("")}</select>`)}
        <p>${m.profile === "uml" ? "Vérifie seulement la cohérence: doublons, liens cassés, cycles d'héritage, multiplicités." : m.profile === "iso19109" ? "Ajoute les règles ISO 19109/19103: stéréotypes, types connus, rôles, conventions de nommage." : "Règles ISO 19109 + rattachement au modèle CityGML 3.0 (héritage, hooks ADE)."}</p>
        ${m.profile !== "uml" ? fld("Types définis ailleurs (séparés par des virgules)", `<input id="m-ext" class="mono" value="${esc((m.externalTypes || []).join(", "))}" spellcheck="false" placeholder="ex. Identifier, PropertyValue">`) : ""}
      </section>
      <section class="isec"><h3>Validation <span class="sub">${PROFILE_NAME[m.profile]}</span></h3><div id="issuesBox">${issueList(issues)}</div></section>
      ${colorsSection()}
      <section class="isec"><h3>Pour démarrer</h3>
        <p>Double-clic sur le fond: nouvelle classe. Double-clic sur un nom ou une ligne: modifier sur place. Sélectionne une classe puis glisse le point bleu vers une autre pour les relier. Clic droit: toutes les actions.</p>
        <div class="btnrow"><button class="btn small" id="m-help">Raccourcis</button><button class="btn small" id="m-unpin">Tout rendre à l'auto-layout</button></div>
      </section>`;
  }
  function colorsSection() {
    const st = S.layout.style;
    const pkgs = [...new Set(S.model.classes.filter((c) => !c.external).map((c) => c.package))].sort();
    const stereos = [...new Set(S.model.classes.map((c) => c.stereotype).filter(Boolean))].sort();
    const row = (label, target, fill) => { const c = normColor(fill); return `<div class="crow"><span>${esc(label)}</span><button class="pkc${c ? "" : " none"}" data-pal="${esc(target)}" aria-label="Couleur de ${esc(label)}" title="Choisir une couleur"${c ? ` style="background:${c}"` : ""}></button></div>`; };
    const n = Object.keys(st.classes).length + Object.keys(st.packages).length + Object.keys(st.stereotypes).length;
    return `<section class="isec"><h3>Couleurs <span class="sub">classe, puis package, puis stéréotype</span></h3>
      ${pkgs.length ? `<p>Par package</p><div class="crows">${pkgs.map((p) => row(p, "pkg:" + p, (st.packages[p] || {}).fill)).join("")}</div>` : ""}
      ${stereos.length ? `<p>Par stéréotype</p><div class="crows">${stereos.map((s) => row("«" + s + "»", "st:" + s, (st.stereotypes[s] || {}).fill)).join("")}</div>` : ""}
      <p>Une classe garde la couleur qu'on lui donne directement (clic droit → Couleur).</p>
      ${n ? `<div class="btnrow"><button class="btn small" id="m-clearcolors">Effacer toutes les couleurs</button></div>` : ""}
    </section>`;
  }
  function classColorSection(names) {
    const st = S.layout.style;
    const own = names.map((n) => st.classes[n] || {});
    const line = own.every((o) => o.line);
    const c = names.length === 1 ? colorOf(Core.findClass(S.model, names[0])) : null;
    const from = c && c.fill && c.src !== "class" ? `<p>Couleur héritée de son ${c.src === "package" ? "package" : "stéréotype"}. Choisis-en une pour cette classe seule.</p>` : "";
    return `<section class="isec"><h3>Couleur</h3>${from}${swatchesHtml("sel")}
      <label class="chk" for="f-line"><input type="checkbox" id="f-line" ${line ? "checked" : ""}> Bordure de la même couleur</label></section>`;
  }
  function attrRow(c, a, i, lit, bad) {
    const open = openRow === "a:" + i;
    if (lit) return `<div class="arow lit"><input data-ai="${i}" data-af="name" value="${esc(a.name)}" aria-label="Valeur" spellcheck="false"><button class="ib" data-amv="${i}:-1" aria-label="Monter" title="Monter">↑</button><button class="ib" data-amv="${i}:1" aria-label="Descendre" title="Descendre">↓</button><button class="ib x" data-adel="${i}" aria-label="Supprimer" title="Supprimer">×</button></div>`;
    return `<div class="arow"><select data-ai="${i}" data-af="vis" aria-label="Visibilité">${["", "+", "-", "#", "~"].map((v) => `<option value="${v}" ${v === (a.vis || "") ? "selected" : ""}>${v || " "}</option>`).join("")}</select><input data-ai="${i}" data-af="name" value="${esc(a.name)}" aria-label="Nom" spellcheck="false" class="${bad.has(a.name) ? "bad" : ""}"><input data-ai="${i}" data-af="type" list="dl-types" value="${esc(a.type)}" aria-label="Type" spellcheck="false"><input data-ai="${i}" data-af="mult" list="dl-mult" value="${esc(a.mult)}" aria-label="Multiplicité"><button class="ib" data-aopen="a:${i}" aria-label="Plus d'options" aria-expanded="${open}" title="Plus d'options">⋯</button><button class="ib x" data-adel="${i}" aria-label="Supprimer" title="Supprimer">×</button></div>
      ${open ? `<div class="asub"><label>défaut <input type="text" data-ai="${i}" data-af="default" value="${esc(a.default || "")}"></label><label class="chk"><input type="checkbox" data-ai="${i}" data-af="static" ${a.static ? "checked" : ""}> statique</label><label class="chk"><input type="checkbox" data-ai="${i}" data-af="derived" ${a.derived ? "checked" : ""}> dérivé</label><button class="ib" data-amv="${i}:-1" aria-label="Monter" title="Monter">↑</button><button class="ib" data-amv="${i}:1" aria-label="Descendre" title="Descendre">↓</button></div>` : ""}`;
  }
  function opRow(o, i) {
    const open = openRow === "o:" + i;
    return `<div class="arow op"><select data-oi="${i}" data-of="vis" aria-label="Visibilité">${["", "+", "-", "#", "~"].map((v) => `<option value="${v}" ${v === (o.vis || "") ? "selected" : ""}>${v || " "}</option>`).join("")}</select><input data-oi="${i}" data-of="name" value="${esc(o.name)}" aria-label="Nom" spellcheck="false"><input data-oi="${i}" data-of="params" value="${esc(o.params)}" aria-label="Paramètres" placeholder="a: T" spellcheck="false"><input data-oi="${i}" data-of="type" list="dl-types" value="${esc(o.type)}" aria-label="Type de retour" spellcheck="false"><button class="ib" data-aopen="o:${i}" aria-label="Plus d'options" aria-expanded="${open}" title="Plus d'options">⋯</button><button class="ib x" data-odel="${i}" aria-label="Supprimer" title="Supprimer">×</button></div>
      ${open ? `<div class="asub"><label class="chk"><input type="checkbox" data-oi="${i}" data-of="static" ${o.static ? "checked" : ""}> statique</label><label class="chk"><input type="checkbox" data-oi="${i}" data-of="abstract" ${o.abstract ? "checked" : ""}> abstraite</label><button class="ib" data-omv="${i}:-1" aria-label="Monter" title="Monter">↑</button><button class="ib" data-omv="${i}:1" aria-label="Descendre" title="Descendre">↓</button></div>` : ""}`;
  }
  function relLine(r, name) {
    const out = r.from === name, other = out ? r.to : r.from;
    const verb = { generalization: out ? "hérite de" : "parent de", realization: out ? "réalise" : "réalisée par", dependency: out ? "dépend de" : "utilisée par", composition: out ? "composée de" : "partie de", aggregation: out ? "agrège" : "agrégée dans", association: out ? "→" : "←" }[r.kind];
    return `<div class="rel"><button class="go" data-rel="${esc(r.id)}" title="Sélectionner ce lien"><b>${verb}</b> ${esc(other)}${r.name ? ` · ${esc(r.name)}` : ""}</button><button class="ib x" data-rdel="${esc(r.id)}" aria-label="Supprimer le lien" title="Supprimer le lien">×</button></div>`;
  }
  function renderClassPanel(c) {
    if (!c) { clearSel(); return renderModelPanel(); }
    const lit = Core.isLiteralClass(c);
    const own = issues.filter((i) => i.target.kind === "class" && i.target.name === c.name);
    const bad = new Set(own.filter((i) => i.attr && i.level === "error").map((i) => i.attr));
    const inh = Core.inheritedAttributes(S.model, c.name);
    const rels = S.model.relations.filter((r) => r.from === c.name || r.to === c.name);
    const pinned = S.layout.nodes[c.name] && S.layout.nodes[c.name].pinned;
    insp.innerHTML = `
      <section class="isec"><h3>Classe${c.external ? ` <span class="sub">externe</span>` : ""}</h3>
        ${fld("Nom", `<input id="f-name" class="mono" value="${esc(c.name)}" spellcheck="false">`)}
        <div class="row2">
          ${fld("Stéréotype", `<input id="f-st" list="dl-stereo" value="${esc(c.stereotype)}" placeholder="aucun" spellcheck="false">`)}
          ${fld("Package", `<input id="f-pkg" list="dl-pkg" value="${esc(c.package || "")}" spellcheck="false">`)}
        </div>
        <div class="btnrow"><label class="chk" for="f-abs"><input type="checkbox" id="f-abs" ${c.abstract ? "checked" : ""}> Abstraite</label>
        <label class="chk" for="f-ext" title="Classe définie dans un autre modèle, gardée ici comme référence"><input type="checkbox" id="f-ext" ${c.external ? "checked" : ""}> Externe</label></div>
        ${fld("Description", `<textarea id="f-doc" rows="2">${esc(c.doc || "")}</textarea>`)}
      </section>
      ${classColorSection([c.name])}
      <section class="isec"><h3>${lit ? "Valeurs" : "Attributs"} <span class="sub">${c.attributes.length}</span></h3>
        ${!lit && c.attributes.length ? `<div class="ahead"><span>vis.</span><span>nom</span><span>type</span><span>mult.</span><span></span></div>` : ""}
        <div class="rows">${c.attributes.map((a, i) => attrRow(c, a, i, lit, bad)).join("")}</div>
        <div class="btnrow"><button class="btn small" id="f-addattr">+ ${lit ? "Valeur" : "Attribut"}</button></div>
        ${inh.length ? `<details class="inh"><summary>Hérités (${inh.length})</summary>${inh.map((a) => `<div>${esc(a.name)}${a.type ? " : " + esc(a.type) : ""}${a.mult ? " [" + esc(a.mult) + "]" : ""} · ${esc(a.from)}</div>`).join("")}</details>` : ""}
      </section>
      ${lit ? "" : `<section class="isec"><h3>Opérations <span class="sub">${c.operations.length}</span></h3>
        ${c.operations.length ? `<div class="ahead op"><span>vis.</span><span>nom</span><span>paramètres</span><span>retour</span><span></span></div>` : ""}
        <div class="rows">${c.operations.map(opRow).join("")}</div>
        <div class="btnrow"><button class="btn small" id="f-addop">+ Opération</button></div>
      </section>`}
      <section class="isec"><h3>Liens <span class="sub">${rels.length}</span></h3>
        <div class="rows">${rels.map((r) => relLine(r, c.name)).join("")}</div>
        <div class="addrel"><label class="sr" for="r-kind">Type de lien</label><select id="r-kind">${["generalization", "association", "composition", "aggregation", "realization", "dependency"].map((k) => `<option value="${k}">${k === "generalization" ? "hérite de" : KIND_LABEL[k]}</option>`).join("")}</select><label class="sr" for="r-to">Classe cible</label><input id="r-to" class="mono" list="dl-classes" placeholder="classe cible" spellcheck="false"><button class="btn small" id="r-add">Ajouter</button></div>
      </section>
      <section class="isec"><h3>Validation</h3><div id="issuesBox">${issueList(own)}</div></section>
      <section class="isec"><div class="btnrow">
        ${pinned ? `<button class="btn small" id="f-unpin" title="L'auto-layout pourra la déplacer">Rendre à l'auto-layout</button>` : ""}
        <button class="btn small" id="f-hide">Masquer</button><button class="btn small danger" id="f-del">Supprimer</button></div>
      </section>`;
  }
  function renderRefPanel(c) {
    if (!c) { clearSel(); return renderModelPanel(); }
    const E = { classes: [], relations: [] };
    const anc = Core.ancestors(E, c.name).map((a) => a.name);
    const inh = Core.inheritedAttributes(E, c.name);
    insp.innerHTML = `
      <section class="isec"><h3>${esc(c.module)}::${esc(c.name)} <span class="sub">lecture seule</span></h3>
        <p>«${esc(c.stereotype)}»${c.abstract ? " abstraite" : ""} · CityGML 3.0, module ${esc(Core.MODULES[c.module] || c.module)}.</p>
        ${anc.length ? `<p class="inh">${anc.map(esc).join(" → ")}</p>` : ""}
        ${c.hookOf ? `<p>Hook ADE: une «DataType» concrète qui en hérite ajoute ses propriétés à ${esc(c.hookOf)}.</p>` : ""}
      </section>
      ${c.attributes.length || inh.length ? `<section class="isec"><h3>Attributs <span class="sub">${c.attributes.length}</span></h3><div class="inh">${c.attributes.map((a) => `<div>${esc(a.name)}${a.type ? " : " + esc(a.type) + " [" + esc(a.mult) + "]" : ""}</div>`).join("")}</div>
        ${inh.length ? `<details class="inh"><summary>Hérités (${inh.length})</summary>${inh.map((a) => `<div>${esc(a.name)} : ${esc(a.type)} · ${esc(a.from)}</div>`).join("")}</details>` : ""}</section>` : ""}
      ${c.stereotype === "FeatureType" ? `<section class="isec"><h3>Étendre</h3>
        <div class="btnrow"><button class="btn small" id="x-sub">Créer une sous-classe</button><button class="btn small" id="x-hook">Ajouter des propriétés (hook ADE)</button></div>
        <p>Sous-classe: nouveau type d'objet. Hook: propriétés en plus sur ${esc(c.name)} existant.</p></section>` : ""}
      <section class="isec"><p>Sous-ensemble simplifié du modèle conceptuel CityGML 3.0, à vérifier contre le modèle officiel OGC.</p></section>`;
  }
  function renderRelPanel(r) {
    if (!r) { clearSel(); return renderModelPanel(); }
    const own = issues.filter((i) => i.target.kind === "rel" && i.target.id === r.id);
    const assoc = Core.ASSOC_KINDS.includes(r.kind);
    insp.innerHTML = `
      <section class="isec"><h3>Lien <span class="sub">${esc(r.id)}</span></h3>
        <p class="inh">${esc(r.from)} → ${esc(r.to)}</p>
        ${fld("Type", `<select id="a-kind">${Core.REL_KINDS.map((k) => `<option value="${k}" ${k === r.kind ? "selected" : ""}>${KIND_LABEL[k]}</option>`).join("")}</select>`)}
        ${r.kind === "generalization" || r.kind === "realization" ? `<p>${esc(r.from)} ${r.kind === "generalization" ? "hérite de" : "réalise"} ${esc(r.to)}.</p>` : fld("Nom", `<input id="a-name" value="${esc(r.name)}" spellcheck="false">`)}
        ${assoc ? `
        <div class="row2">${fld(`Rôle côté ${esc(r.from)}`, `<input id="a-frole" class="mono" value="${esc(r.fromRole)}" spellcheck="false">`)}${fld(`Rôle côté ${esc(r.to)}`, `<input id="a-role" class="mono" value="${esc(r.toRole)}" spellcheck="false">`)}</div>
        <div class="row2">${fld(`Mult. côté ${esc(r.from)}`, `<input id="a-fm" class="mono" list="dl-mult" value="${esc(r.fromMult)}">`)}${fld(`Mult. côté ${esc(r.to)}`, `<input id="a-tm" class="mono" list="dl-mult" value="${esc(r.toMult)}">`)}</div>
        ${fld("Navigabilité", `<select id="a-nav"><option value="to" ${r.nav === "to" ? "selected" : ""}>vers ${esc(r.to)}</option><option value="both" ${r.nav === "both" ? "selected" : ""}>dans les deux sens</option><option value="none" ${r.nav === "none" ? "selected" : ""}>non précisée</option></select>`)}` : ""}
      </section>
      <section class="isec"><h3>Validation</h3><div id="issuesBox">${issueList(own)}</div></section>
      <section class="isec"><p>Sur le diagramme: glisse les poignées pour déplacer la ligne ou ses extrémités, glisse le nom pour le déplacer.</p>
        <div class="btnrow"><button class="btn small" id="a-flip">Inverser le sens</button><button class="btn small" id="e-reset">Tracé automatique</button><button class="btn small danger" id="a-del">Supprimer</button></div></section>`;
  }
  function renderLibEdgePanel(sub) {
    const c = Core.LIB[sub];
    insp.innerHTML = `<section class="isec"><h3>Héritage CityGML</h3><p class="inh">${esc(sub)} → ${esc(c ? c.superclass : "")}</p><p>Fait partie de CityGML 3.0: lecture seule.</p><div class="btnrow"><button class="btn small" id="e-reset">Tracé automatique</button></div></section>`;
  }
  function renderNotePanel(n) {
    if (!n) { clearSel(); return renderModelPanel(); }
    insp.innerHTML = `
      <section class="isec"><h3>Note</h3>
        ${fld("Texte", `<textarea id="f-note" rows="6">${esc(n.text)}</textarea>`)}
        ${fld("Attachée à la classe", `<input id="f-near" class="mono" list="dl-own" value="${esc(n.near || "")}" placeholder="aucune" spellcheck="false">`)}
        <div class="btnrow"><button class="btn small danger" id="n-del">Supprimer la note</button></div>
      </section>`;
  }
  function renderMultiPanel() {
    const n = sel.nodes.size, k = sel.notes.size;
    insp.innerHTML = `
      <section class="isec"><h3>Sélection <span class="sub">${n} classe${n > 1 ? "s" : ""}${k ? `, ${k} note${k > 1 ? "s" : ""}` : ""}</span></h3>
        <p>Glisse pour déplacer l'ensemble. Flèches du clavier: décalage de 10 px (Alt: 1 px).</p>
        ${n > 1 ? `<div class="align">
          <button class="btn small" data-al="l" title="Aligner à gauche">⇤ Gauche</button><button class="btn small" data-al="c" title="Centrer horizontalement">Centre</button><button class="btn small" data-al="r" title="Aligner à droite">Droite ⇥</button><button class="btn small" data-al="dh" title="Espacer régulièrement en largeur">Répartir ↔</button>
          <button class="btn small" data-al="t" title="Aligner en haut">⤒ Haut</button><button class="btn small" data-al="m" title="Centrer verticalement">Milieu</button><button class="btn small" data-al="b" title="Aligner en bas">Bas ⤓</button><button class="btn small" data-al="dv" title="Espacer régulièrement en hauteur">Répartir ↕</button>
        </div>` : ""}
        ${n ? fld("Déplacer dans le package", `<input id="ms-pkg" list="dl-pkg" placeholder="nom du package" spellcheck="false">`) : ""}
      </section>
      ${[...sel.nodes].some((x) => Core.findClass(S.model, x)) ? classColorSection([...sel.nodes].filter((x) => Core.findClass(S.model, x))) : ""}
      <section class="isec">
        <div class="btnrow"><button class="btn small" id="ms-dup">Dupliquer</button><button class="btn small" id="ms-hide">Masquer</button><button class="btn small danger" id="ms-del">Supprimer</button></div>
      </section>`;
  }

  insp.addEventListener("change", (ev) => {
    const t = ev.target, o = selOne();
    if (t.closest("[data-target]")) return;
    if (t.id === "f-line") { setColorLine(t.checked); return; }
    const fail = (res) => { if (res.failed.length) renderInspector(); };
    if (!selCount()) {
      if (t.id === "m-name") runOps([{ op: "set_model", name: t.value.trim() || "Model" }], { inspector: false });
      else if (t.id === "m-profile") runOps([{ op: "set_model", profile: t.value }]);
      else if (t.id === "m-ext") runOps([{ op: "set_model", externalTypes: t.value.split(/[,\s]+/) }], { inspector: false });
      return;
    }
    if (!o) { if (t.id === "ms-pkg" && t.value.trim()) runOps([...sel.nodes].filter((n) => Core.findClass(S.model, n)).map((n) => ({ op: "update_class", name: n, set: { package: t.value.trim() } }))); return; }
    if (o.kind === "class") {
      const name = o.id;
      const map = { "f-name": "name", "f-st": "stereotype", "f-pkg": "package", "f-doc": "doc" };
      if (map[t.id]) {
        const v = t.id === "f-doc" ? t.value : t.value.trim();
        if (t.id === "f-name" && !v) { t.value = name; return; }
        fail(runOps([{ op: "update_class", name, set: { [map[t.id]]: v } }], { inspector: t.id === "f-st" }));
      }
      else if (t.id === "f-abs") runOps([{ op: "update_class", name, set: { abstract: t.checked } }], { inspector: false });
      else if (t.id === "f-ext") runOps([{ op: "update_class", name, set: { external: t.checked } }]);
      else if (t.dataset.ai != null) {
        const a = Core.findClass(S.model, name).attributes[+t.dataset.ai]; if (!a) return;
        fail(runOps([{ op: "update_attribute", class: name, name: a.name, set: { [t.dataset.af]: t.type === "checkbox" ? t.checked : t.value.trim() } }], { inspector: false }));
      } else if (t.dataset.oi != null) {
        fail(runOps([{ op: "update_operation", class: name, index: +t.dataset.oi, set: { [t.dataset.of]: t.type === "checkbox" ? t.checked : t.value.trim() } }], { inspector: false }));
      }
      return;
    }
    if (o.kind === "rel") {
      const map = { "a-name": "name", "a-role": "toRole", "a-frole": "fromRole", "a-fm": "fromMult", "a-tm": "toMult", "a-kind": "kind", "a-nav": "nav" };
      if (map[t.id]) {
        if (t.id === "a-kind" && (t.value === "generalization" || t.value === "realization")) { const r = S.model.relations.find((x) => x.id === o.id); if (!Core.findClass(S.model, r.from)) { toast("L'héritage doit partir d'une classe du modèle: inverse d'abord le sens."); renderInspector(); return; } }
        runOps([{ op: "update_relation", id: o.id, set: { [map[t.id]]: t.value.trim() } }], { inspector: t.id === "a-kind" });
      }
      return;
    }
    if (o.kind === "note") {
      if (t.id === "f-note") runOps([{ op: "update_note", id: o.id, text: t.value }], { inspector: false });
      else if (t.id === "f-near") { const v = t.value.trim(); if (v && !Core.findClass(S.model, v)) { toast(`Classe inconnue: ${v}`); return; } runOps([{ op: "update_note", id: o.id, near: v || null }], { inspector: false }); }
    }
  });
  insp.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.id === "r-to") { ev.preventDefault(); $("#r-add").click(); } });
  insp.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.iss != null) {
      const i = shownIssues[+b.dataset.iss]; if (!i) return;
      if (i.target.kind === "class") { select({ kind: "node", id: i.target.name }); if (geo[i.target.name]) centerOn(i.target.name); }
      else select({ kind: "rel", id: i.target.id });
      return;
    }
    if (b.dataset.pal) { const r = b.getBoundingClientRect(); openPalette(Math.min(r.left, window.innerWidth - 260), r.bottom + 6, b.dataset.pal); return; }
    if (b.id === "m-clearcolors") return layoutChange(() => { S.layout.style = Core.emptyStyle(); }, { inspector: true });
    if (b.dataset.color != null) return;
    if (b.id === "m-help") return openHelp();
    if (b.id === "m-unpin") { layoutChange(() => { Object.values(S.layout.nodes).forEach((p) => delete p.pinned); runLayout(true); }, { inspector: true }); fit(); return; }
    if (b.dataset.al) return alignSelection(b.dataset.al);
    if (b.id === "ms-dup") { if (copySelection()) pasteClipboard(); return; }
    if (b.id === "ms-hide") return hideClasses([...sel.nodes]);
    if (b.id === "ms-del" || b.id === "f-del" || b.id === "a-del" || b.id === "n-del") return deleteSelection();
    const o = selOne(); if (!o) return;
    if (b.id === "e-reset") return layoutChange(() => { delete S.layout.edges[o.id]; });
    if (o.kind === "class") {
      const name = o.id, c = Core.findClass(S.model, name);
      if (b.dataset.aopen) { openRow = openRow === b.dataset.aopen ? null : b.dataset.aopen; return renderInspector(); }
      if (b.id === "f-addattr" || b.id === "f-addop") {
        const isOp = b.id === "f-addop", arr = isOp ? c.operations : c.attributes, lit = Core.isLiteralClass(c);
        let base = isOp ? "operation" : lit ? "value" : "attribute", n = base, i = 1;
        while (arr.some((a) => a.name === n)) n = base + ++i;
        runOps([isOp ? { op: "add_operation", class: name, name: n } : { op: "add_attribute", class: name, name: n, type: lit ? "" : isIso() ? "CharacterString" : "String", mult: isIso() && !lit ? "0..1" : "" }]);
        const inputs = $$(isOp ? '[data-of="name"]' : '[data-af="name"]', insp); const last = inputs[inputs.length - 1]; if (last) { last.focus(); last.select(); }
        return;
      }
      if (b.dataset.adel != null) return void runOps([{ op: "delete_attribute", class: name, index: +b.dataset.adel }]);
      if (b.dataset.odel != null) return void runOps([{ op: "delete_operation", class: name, index: +b.dataset.odel }]);
      if (b.dataset.amv) { const [i, d] = b.dataset.amv.split(":").map(Number); if (openRow === "a:" + i) openRow = "a:" + clamp(i + d, 0, c.attributes.length - 1); return void runOps([{ op: "move_attribute", class: name, index: i, delta: d }]); }
      if (b.dataset.omv) { const [i, d] = b.dataset.omv.split(":").map(Number); if (openRow === "o:" + i) openRow = "o:" + clamp(i + d, 0, c.operations.length - 1); return void runOps([{ op: "move_operation", class: name, index: i, delta: d }]); }
      if (b.dataset.rel) return select({ kind: "rel", id: b.dataset.rel });
      if (b.dataset.rdel) return void runOps([{ op: "delete_relation", id: b.dataset.rdel }]);
      if (b.id === "r-add") {
        const to = $("#r-to").value.trim(), kind = $("#r-kind").value;
        if (!to) { $("#r-to").focus(); return; }
        if (!Core.resolve(S.model, to)) { toast(`Classe inconnue: ${to}. Crée-la d'abord, ou glisse le point bleu vers le fond du diagramme.`); return; }
        const res = runOps([{ op: "add_relation", kind, from: name, to, ...(Core.ASSOC_KINDS.includes(kind) && isIso() ? { toRole: to.charAt(0).toLowerCase() + to.slice(1), toMult: "0..*" } : {}) }]);
        if (!res.failed.length) { const f = $("#r-to"); if (f) f.focus(); }
        return;
      }
      if (b.id === "f-hide") return hideClasses([name]);
      if (b.id === "f-unpin") return layoutChange(() => { delete S.layout.nodes[name].pinned; }, { inspector: true });
    }
    if (o.kind === "ref" && (b.id === "x-sub" || b.id === "x-hook")) {
      const ref = Core.LIB[o.id], base = ref.name.replace(/^Abstract/, "");
      const name = uniqueName(b.id === "x-sub" ? "My" + base : base + "Extension");
      const op = b.id === "x-sub" ? { op: "add_class", name, stereotype: "FeatureType", superclass: ref.name, abstract: false }
        : { op: "add_class", name, stereotype: "DataType", superclass: "ADEOf" + ref.name, attributes: [{ name: "newProperty", type: "CharacterString", mult: "0..1" }] };
      const res = runOps([op]);
      if (!res.failed.length) { select({ kind: "node", id: name }); centerOn(name); renameClass(name); }
      return;
    }
    if (o.kind === "rel" && b.id === "a-flip") return flipRel(S.model.relations.find((x) => x.id === o.id));
  });
