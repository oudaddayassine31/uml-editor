  /* ---------------- modal ---------------- */
  function openModal(title, bodyHtml, footHtml) {
    closeInline(true);
    $("#mTitle").textContent = title; $("#mBody").innerHTML = bodyHtml; $("#mFoot").innerHTML = footHtml || ""; $("#mFoot").hidden = !footHtml; $("#modal").hidden = false;
    const f = $("#mBody textarea, #mBody input, #mFoot .primary"); if (f) f.focus();
  }
  function closeModal() { $("#modal").hidden = true; }
  $("#mClose").addEventListener("click", closeModal);
  $("#modal").addEventListener("pointerdown", (e) => { if (e.target.id === "modal") closeModal(); });

  function openHelp() {
    openModal("Aide et raccourcis", `<dl class="keys">
      <dt>Double-clic sur le fond</dt><dd>Nouvelle classe à cet endroit</dd>
      <dt>Double-clic sur un nom, une ligne, un lien, une note</dt><dd>Modifier sur place. Ligne vide: supprime la ligne.</dd>
      <dt>+ Attribut / + Opération</dt><dd>Tape <code>nom : Type [0..1]</code> ou <code>nom(p: T) : Retour</code>, Entrée enchaîne sur la ligne suivante</dd>
      <dt>Point bleu d'une classe sélectionnée</dt><dd>Glisse vers une classe pour créer un lien, vers le fond pour créer la classe cible</dd>
      <dt>Clic sur un lien</dt><dd>Poignées: milieu pour déplacer la ligne, bouts pour glisser le long du bord. Le nom se déplace aussi.</dd>
      <dt>Maj+clic, Maj+glisser sur le fond</dt><dd>Sélection multiple, puis déplacer, aligner, répartir</dd>
      <dt>Glisser le fond, molette</dt><dd>Naviguer, zoomer</dd>
      <dt>Flèches</dt><dd>Décaler la sélection de 10 px (Alt: 1 px)</dd>
      <dt>Ctrl+C, Ctrl+V, Ctrl+D</dt><dd>Copier, coller, dupliquer des classes</dd>
      <dt>Ctrl+V d'un texte PlantUML ou Mermaid</dt><dd>L'importer directement</dd>
      <dt>Ctrl+Z, Ctrl+Y</dt><dd>Annuler, rétablir</dd>
      <dt>Suppr, F2, Échap</dt><dd>Supprimer, renommer, désélectionner</dd>
      <dt>Clic droit</dt><dd>Toutes les actions de l'élément</dd>
      <dt>Couleurs</dt><dd>Clic droit → Couleur, bouton Couleur au-dessus d'une classe, ou carré de couleur d'un package dans l'explorateur. Priorité: classe, puis package, puis stéréotype. Gardées à l'export PNG, SVG, PlantUML et Mermaid.</dd>
      <dt>Boîte déplacée à la main</dt><dd>Elle garde sa place: ni l'auto-layout ni un ré-import ne la bougent</dd>
    </dl><p>Le modèle est enregistré automatiquement dans ce navigateur. Exporte le fichier .json pour le garder ou le partager.</p>`, "");
  }
  $("#btnHelp").addEventListener("click", openHelp);

  /* ---------------- export ---------------- */
  async function saveFile(filename, data, btn) {
    const done = (t) => { if (btn) { const o = btn.textContent; btn.textContent = t; setTimeout(() => (btn.textContent = o), 1800); } };
    if (downloads) {
      try { await downloads.save({ filename, data }); done("Enregistré"); }
      catch (e) { done(e && e.code === "declined" ? "Annulé" : "Indisponible"); }
      return;
    }
    try {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      done("Enregistré");
    } catch (e) { done("Indisponible"); }
  }
  const canSave = () => !!downloads || !inClaude;
  async function copyText(text, btn, area) {
    const o = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copié"; }
    catch (e) { if (area) { area.focus(); area.select(); } btn.textContent = "Ctrl+C pour copier"; }
    setTimeout(() => (btn.textContent = o), 1800);
  }
  function exportSvg() {
    computeGeo();
    const bb = bbox(), pad = 28;
    const inner = framesSvg() + noteLinks() + edgeList().map((e) => edgeSvg(e, true)).join("") + Object.keys(geo).map((n) => nodeSvg(n, true)).join("") + S.model.notes.map((n) => noteSvg(n, true)).join("");
    const vb = [bb.x - pad, bb.y - pad - (opts.frames ? 30 : 0), bb.w + pad * 2, bb.h + pad * 2 + (opts.frames ? 46 : 0)].map((v) => Math.round(v));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(" ")}"><style>${svgCss(EXPORT_P)}</style><defs>${markerDefs()}</defs><rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>${inner}</svg>`;
  }
  const fileBase = () => S.model.name.replace(/[^\w.\- ]+/g, "_").trim() || "model";
  const EXPORTS = {
    json: { title: "Modèle + positions (JSON)", file: () => `${fileBase()}.uml.json`, text: () => JSON.stringify(S, null, 2), note: "Format de sauvegarde: réimportable ici sans perte." },
    puml: { title: "PlantUML", file: () => `${fileBase()}.puml`, text: () => Core.toPlantUML(S.model, { ...opts, style: S.layout.style }), note: "Sans les positions: PlantUML refait sa mise en page." },
    mmd: { title: "Mermaid", file: () => `${fileBase()}.mmd`, text: () => Core.toMermaid(S.model, { style: S.layout.style }), note: "classDiagram. Les noms de package perdent leurs espaces." },
    cj: { title: "Extension CityJSON 2.0", file: () => `${fileBase()}.ext.json`, text: () => JSON.stringify(Core.toCityJSONExtension(S.model), null, 2), note: "Squelette généré pour une ADE CityGML: relis les types et les contraintes avant usage." },
    svg: { title: "Diagramme SVG", file: () => `${fileBase()}.svg`, text: exportSvg, note: "Vectoriel, tel qu'affiché (classes masquées exclues)." }
  };
  async function svgToPng(svgText) {
    const m = svgText.match(/width="(\d+)" height="(\d+)"/);
    const w = +m[1], h = +m[2];
    const scale = Math.max(0.3, Math.min(2, Math.sqrt(16e6 / (w * h))));
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("Rendu de l'image impossible.")); img.src = url; });
      const cv = document.createElement("canvas");
      cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("PNG impossible."))), "image/png"));
      return { blob, width: cv.width, height: cv.height };
    } finally { URL.revokeObjectURL(url); }
  }
  let pngUrl = null;
  async function openPng() {
    openModal("Image PNG", `<p>Génération…</p>`, "");
    try {
      const { blob, width, height } = await svgToPng(exportSvg());
      if (pngUrl) URL.revokeObjectURL(pngUrl);
      pngUrl = URL.createObjectURL(blob);
      $("#mBody").innerHTML = `<div class="pngprev"><img src="${pngUrl}" alt="Diagramme ${esc(S.model.name)}"></div>`;
      $("#mFoot").hidden = false;
      $("#mFoot").innerHTML = `<span class="note">${width} × ${height} px · fond blanc${canSave() ? "" : " · clic droit sur l'image pour l'enregistrer"}</span><button class="btn" id="pngCopy">Copier l'image</button>${canSave() ? `<button class="btn primary" id="pngSave">Télécharger</button>` : ""}`;
      $("#pngCopy").addEventListener("click", async (e) => {
        try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); e.target.textContent = "Copiée"; }
        catch (err) { e.target.textContent = "Copie refusée ici"; }
      });
      const sv = $("#pngSave");
      if (sv) sv.addEventListener("click", () => saveFile(`${fileBase()}.png`, blob, sv));
    } catch (err) { $("#mBody").innerHTML = `<p>${esc(err.message)}</p>`; }
  }
  function openExport(kind) {
    if (kind === "png") return openPng();
    const ex = EXPORTS[kind];
    const text = ex.text();
    openModal(ex.title, `<label for="exText" class="sr">${esc(ex.title)}</label><textarea id="exText" readonly spellcheck="false">${esc(text)}</textarea>`,
      `<span class="note">${esc(ex.note)}</span><button class="btn" id="exCopy">Copier</button>${canSave() ? `<button class="btn primary" id="exSave">Télécharger</button>` : ""}`);
    $("#exCopy").addEventListener("click", () => copyText(text, $("#exCopy"), $("#exText")));
    const sv = $("#exSave");
    if (sv) sv.addEventListener("click", () => saveFile(ex.file(), text, sv));
  }
  $("#exportMenu").addEventListener("click", (e) => { const b = e.target.closest("[data-export]"); if (!b) return; $("#exportMenu").hidden = true; openExport(b.dataset.export); });

  /* ---------------- import ---------------- */
  function extractJSON(text) {
    const s = String(text).trim();
    try { return JSON.parse(s); } catch (e) { /* continue */ }
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* continue */ } }
    const i = Math.min(...["{", "["].map((ch) => { const k = s.indexOf(ch); return k < 0 ? Infinity : k; }));
    const j = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    if (i < Infinity && j > i) return JSON.parse(s.slice(i, j + 1));
    throw new Error("Aucun JSON trouvé");
  }
  function replaceState(st, { keepLayoutFrom = null } = {}) {
    const before = S ? snapshot() : null;
    prepare(st);
    if (keepLayoutFrom) carryLayout(keepLayoutFrom, st);
    S = st;
    if (before) pushUndo(before);
    clearSel(); recent = fresh(); closeInline(false);
    afterChange(); fit();
  }
  // positions and line shapes placed by hand survive a re-import of a regenerated file
  function carryLayout(old, st) {
    let kept = 0;
    for (const c of st.model.classes) { const p = old.layout.nodes[c.name]; if (p && p.pinned) { st.layout.nodes[c.name] = { ...p }; kept++; } }
    const key = (r) => [r.kind, r.from, r.to, r.name].join("|");
    const oldIds = new Map(old.model.relations.map((r) => [key(r), r.id]));
    for (const r of st.model.relations) { const oid = oldIds.get(key(r)); if (oid && old.layout.edges[oid]) st.layout.edges[r.id] = { ...old.layout.edges[oid] }; }
    st.layout.hidden = (old.layout.hidden || []).filter((n) => Core.findClass(st.model, n));
    // colours chosen by hand stay, unless the new file sets its own
    const os = Core.normStyle(old.layout.style), ns = st.layout.style;
    for (const [k, v] of Object.entries(os.classes)) if (!ns.classes[k] && Core.findClass(st.model, k)) ns.classes[k] = v;
    for (const k of ["packages", "stereotypes"]) for (const [n, v] of Object.entries(os[k])) if (!ns[k][n]) ns[k][n] = v;
    return kept;
  }

  function importSources(sources) {
    const parsed = [], problems = [];
    for (const src of sources) {
      const text = String(src.text || "");
      if (!text.trim()) continue;
      const fmt = Core.detectFormat(text);
      const base = src.name ? src.name.replace(/\.[^.]+$/, "") : undefined;
      try {
        if (fmt === "json") {
          const data = extractJSON(text);
          if (data && data.model && Array.isArray(data.model.classes)) { parsed.push({ name: src.name, saved: data }); continue; }
          if (data && Array.isArray(data.classes)) { parsed.push({ name: src.name, saved: { model: data } }); continue; }
          const ops = Array.isArray(data) ? data : data && data.ops;
          if (Array.isArray(ops)) { parsed.push({ name: src.name, ops }); continue; }
          problems.push(`${src.name || "Texte"}: JSON non reconnu (attendu: modèle exporté ou liste d'opérations).`);
        } else if (fmt) {
          const r = Core.importText(text, { name: base });
          if (!r.state.model.classes.length) problems.push(`${src.name || "Texte"}: aucune classe trouvée.`);
          else parsed.push({ name: src.name, ...r });
        } else problems.push(`${src.name || "Texte"}: format non reconnu (PlantUML, Mermaid classDiagram ou JSON).`);
      } catch (e) { problems.push(`${src.name || "Texte"}: ${e.message}`); }
    }
    if (!parsed.length) { openModal("Import impossible", `<ul class="replist">${problems.map((p) => `<li><span class="dot err"></span><span>${esc(p)}</span></li>`).join("") || "<li><span></span><span>Rien à importer.</span></li>"}</ul>`, `<button class="btn primary" id="repOk">Fermer</button>`); $("#repOk").addEventListener("click", closeModal); return; }
    // a saved model or a list of operations is applied as is
    if (parsed.length === 1 && parsed[0].saved) { try { replaceState(parsed[0].saved); toast("Modèle chargé."); } catch (e) { toast(e.message); } return; }
    if (parsed.length === 1 && parsed[0].ops) { const r = runOps(parsed[0].ops, { source: "import", quiet: true }); toast(`${r.applied} opération${r.applied > 1 ? "s" : ""} appliquée${r.applied > 1 ? "s" : ""}${r.failed.length ? `, ${r.failed.length} rejetée${r.failed.length > 1 ? "s" : ""}` : ""}.`); return; }
    const texts = parsed.filter((p) => p.state);
    if (!texts.length) { toast("Importe les fichiers .json un par un."); return; }
    const inc = texts[0].state;
    for (const p of texts.slice(1)) Core.mergeState(inc, p.state);
    if (texts.length > 1) inc.model.name = "Model";
    showImportReport(texts, inc, problems);
  }
  function showImportReport(texts, inc, problems) {
    const M = inc.model;
    const sum = (k) => texts.reduce((t, p) => t + p.report[k], 0);
    const own = M.classes.filter((c) => !c.external).length, ext = M.classes.length - own;
    const li = (lvl, html) => `<li><span class="dot ${lvl}"></span><span>${html}</span></li>`;
    const rows = [];
    for (const p of problems) rows.push(li("err", esc(p)));
    for (const p of texts) {
      const tag = texts.length > 1 && p.name ? `<b>${esc(p.name)}</b> · ` : "";
      p.report.warnings.forEach((w) => rows.push(li("warn", tag + esc(w))));
      p.report.skipped.forEach((k) => rows.push(li("warn", `${tag}ligne ${k.line}, ${esc(k.why)}: <code>${esc(k.text)}</code>`)));
    }
    const hasModel = S.model.classes.length > 0;
    const same = hasModel && S.model.name === M.name;
    const pinned = hasModel ? M.classes.filter((c) => { const p = S.layout.nodes[c.name]; return p && p.pinned; }).length : 0;
    openModal("Import",
      `<p>${texts.map((p) => esc(p.name || "Texte collé") + " (" + p.report.format + ")").join(", ")}</p>
       <div class="stat"><div><b>${own}</b><span>classes</span></div><div><b>${M.relations.length}</b><span>liens</span></div><div><b>${sum("attributes") + sum("operations")}</b><span>attributs et opérations</span></div></div>
       <p>${ext ? `${ext} classe${ext > 1 ? "s" : ""} référencée${ext > 1 ? "s" : ""} mais définie${ext > 1 ? "s" : ""} ailleurs (en gris pointillé). ` : ""}${M.notes.length ? `${M.notes.length} note${M.notes.length > 1 ? "s" : ""}. ` : ""}Règles de validation proposées: ${PROFILE_NAME[M.profile]}.</p>
       ${M.externalTypes.length ? `<p>Types utilisés mais définis ailleurs: <span class="mono">${esc(M.externalTypes.join(", "))}</span></p>` : ""}
       <h4>${rows.length ? `À vérifier (${rows.length})` : "Tout a été lu, aucune ligne ignorée."}</h4>
       ${rows.length ? `<ul class="replist">${rows.join("")}</ul>` : ""}
       ${hasModel ? `<p>${same && pinned ? `Même modèle que celui ouvert: en le remplaçant, les ${pinned} boîtes placées à la main gardent leur position.` : "Un modèle est déjà ouvert. « Ajouter » le complète: une classe importée remplace son stub externe du même nom."}</p>` : ""}`,
      hasModel ? `<button class="btn" id="impCancel">Annuler</button><button class="btn${same ? "" : " primary"}" id="impMerge">Ajouter au modèle ouvert</button><button class="btn${same ? " primary" : ""}" id="impReplace">Remplacer le modèle ouvert</button>`
        : `<button class="btn" id="impCancel">Annuler</button><button class="btn primary" id="impReplace">Importer</button>`);
    $("#impCancel").addEventListener("click", closeModal);
    $("#impReplace").addEventListener("click", () => { closeModal(); const old = S; replaceState(inc, { keepLayoutFrom: old }); });
    const mg = $("#impMerge");
    if (mg) mg.addEventListener("click", () => {
      closeModal();
      const before = snapshot();
      const rep = Core.mergeState(S, inc);
      pushUndo(before);
      recent = fresh(); M.classes.forEach((c) => recent.added.add(c.name));
      clearSel();
      afterChange(); fit();
      toast(`${rep.added} classe${rep.added > 1 ? "s" : ""} ajoutée${rep.added > 1 ? "s" : ""}${rep.resolved.length ? `, ${rep.resolved.length} stub${rep.resolved.length > 1 ? "s" : ""} remplacé${rep.resolved.length > 1 ? "s" : ""}` : ""}${rep.updated.length ? `, ${rep.updated.length} mise${rep.updated.length > 1 ? "s" : ""} à jour` : ""}.`);
    });
  }
  async function readFiles(fileList) {
    const out = [];
    for (const f of [...fileList].slice(0, 40)) out.push({ name: f.name, text: await f.text() });
    return out;
  }
  function openImport() {
    openModal("Importer",
      `<p>PlantUML, Mermaid <span class="mono">classDiagram</span>, ou modèle enregistré ici (.json). Plusieurs fichiers à la fois: ils sont fusionnés en un modèle. Tu peux aussi glisser les fichiers sur le diagramme ou coller le texte avec Ctrl+V.</p>
       <label class="fld">Fichiers<input type="file" id="imFile" multiple accept=".puml,.plantuml,.pu,.iuml,.wsd,.mmd,.mermaid,.md,.txt,.json,application/json,text/plain"></label>
       <label for="imText" class="fld">Ou colle le texte ici<textarea id="imText" spellcheck="false" placeholder="@startuml … @enduml     ou     classDiagram …"></textarea></label>`,
      `<button class="btn" id="imNew">Nouveau modèle vide</button><button class="btn" id="imEx">Charger l'exemple</button><button class="btn primary" id="imGo">Importer</button>`);
    $("#imFile").addEventListener("change", async (e) => { const files = await readFiles(e.target.files); if (files.length) { closeModal(); importSources(files); } });
    $("#imNew").addEventListener("click", () => { closeModal(); replaceState(Core.emptyState("Model", "uml")); });
    $("#imEx").addEventListener("click", () => { closeModal(); replaceState(exampleState()); });
    $("#imGo").addEventListener("click", () => { const t = $("#imText").value; if (!t.trim()) { $("#imText").focus(); return; } closeModal(); importSources([{ name: null, text: t }]); });
  }
  $("#btnImport").addEventListener("click", openImport);
  $("#emptyImport").addEventListener("click", openImport);
  $("#emptyExample").addEventListener("click", () => replaceState(exampleState()));
  stage.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) { e.preventDefault(); stage.classList.add("drop"); } });
  stage.addEventListener("dragleave", (e) => { if (e.target === stage || !stage.contains(e.relatedTarget)) stage.classList.remove("drop"); });
  stage.addEventListener("drop", async (e) => {
    e.preventDefault(); stage.classList.remove("drop");
    if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
    importSources(await readFiles(e.dataTransfer.files));
  });

  /* ---------------- example ---------------- */
  function exampleState() {
    const st = Core.emptyState("NBS_ADE", "citygml");
    st.model.prefix = "nbs";
    st.layout.hidden = [];
    Core.applyOps(st, [
      { op: "add_class", name: "AbstractNatureBasedSolution", stereotype: "FeatureType", superclass: "AbstractOccupiedSpace", doc: "Solution fondée sur la nature implantée dans l'espace urbain.",
        attributes: ["nbsType : NBSTypeValue [0..1]", "ecosystemService : EcosystemServiceValue [0..*]", "implementationDate : Date [0..1]", "maintenanceRegime : CharacterString [0..1]"] },
      { op: "add_class", name: "GreenRoof", stereotype: "FeatureType", superclass: "AbstractNatureBasedSolution", attributes: ["substrateDepth : Length [0..1]", "vegetatedArea : Area [0..1]", "waterRetentionCapacity : Volume [0..1]"] },
      { op: "add_class", name: "RainGarden", stereotype: "FeatureType", superclass: "AbstractNatureBasedSolution", attributes: ["infiltrationRate : Velocity [0..1]", "catchmentArea : Area [0..1]"] },
      { op: "add_class", name: "NBSTypeValue", stereotype: "CodeList" },
      { op: "add_class", name: "EcosystemServiceValue", stereotype: "Enumeration", attributes: ["stormwaterRetention", "urbanCooling", "biodiversity", "airQuality", "carbonSequestration"] },
      { op: "add_class", name: "BuildingNBSProperties", stereotype: "DataType", superclass: "ADEOfAbstractBuilding", attributes: ["greenRoofShare : Real [0..1]", "hasRainwaterHarvesting : Boolean [0..1]"] },
      { op: "add_relation", from: "GreenRoof", to: "RoofSurface", name: "installedOn", toRole: "roofSurface", toMult: "1..*" },
      { op: "add_relation", kind: "composition", from: "AbstractNatureBasedSolution", to: "PlantCover", name: "vegetation", toRole: "vegetation", toMult: "0..*" },
      { op: "add_note", text: "Exemple: une petite ADE CityGML. Importe ton propre fichier PlantUML ou Mermaid pour le remplacer.", near: "BuildingNBSProperties" }
    ]);
    return st;
  }
