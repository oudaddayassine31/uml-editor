  /* ---------------- agent (optional; the editor works without it) ---------------- */
  const chat = $("#chat");
  function addMsg(role, text, cls = "") {
    const d = document.createElement("div");
    d.className = `msg ${role} ${cls}`.trim();
    d.textContent = text;
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
    return d;
  }
  function addActivity(text, level = "ok") {
    const d = document.createElement("div");
    d.className = "act";
    d.innerHTML = `<span class="dot ${level}"></span><span>${esc(text)}</span>`;
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
  }
  const CHIPS = ["Corrige les problèmes signalés par le validateur", "Ajoute les noms de rôle manquants sur les associations", "Propose les attributs qui manquent à la classe sélectionnée"];
  $("#chips").innerHTML = CHIPS.map((c) => `<button class="chip" type="button">${esc(c)}</button>`).join("");
  $("#chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; $("#ask").value = b.textContent; $("#ask").focus(); });

  function systemBlock(jsonMode) {
    const cg = S.model.profile === "citygml";
    return `You are the modelling agent inside "UML Agent", a web editor for UML class diagrams, with extra support for ISO 19109 application schemas and CityGML 3.0 / CityJSON extensions (ADE).
The diagram is a structured model, never an image. ${jsonMode ? "You change it by returning operations." : "You change it ONLY by calling the tool apply_ops with a batch of operations."} The user also edits the same model by hand on a canvas, so always start from the CURRENT MODEL in the last message and keep the user's manual changes unless asked otherwise.

${jsonMode ? `OUTPUT: reply with ONLY one JSON object, no prose around it:
{"message": "<2-4 short sentences for the user, in the user's language: what you changed and at most 2 modelling questions>", "ops": [ ...operations... ]}`
  : `WORKFLOW:
1. ${cg ? "If you need attributes or ancestors of CityGML classes, call get_citygml_classes (only when needed)." : "Read the current model."}
2. Call apply_ops ONCE with all operations for the request.
3. If the result lists failed ops or validator errors caused by your change, call apply_ops once more to fix them.
4. Finish with a short reply (2-4 sentences, in the user's language): what you changed and at most 2 modelling questions. No list of all classes, no PlantUML, no JSON in the reply.`}

${Core.OPS_DOC}

${S.model.profile === "uml" ? "The model is a plain UML class diagram: keep the user's naming and typing conventions, no ISO stereotypes unless asked." : Core.RULES_DOC}${cg ? `

CITYGML 3.0 LIBRARY (read-only; use these exact names as relation targets; every «FeatureType» X also has the ADE hook «DataType» ADEOfX):
${Core.libraryIndex()}` : ""}`;
  }
  function stateBlock(request) {
    const where = (i) => (i.target.kind === "class" ? i.target.name : i.target.id);
    const issuesTxt = issues.length ? issues.slice(0, 30).map((i) => `- ${i.level} [${where(i)}] ${i.msg}`).join("\n") : "none";
    const o = selOne();
    return `CURRENT MODEL:
${JSON.stringify(Core.compactModel(S.model), null, 1)}

VALIDATOR ISSUES:
${issuesTxt}

SELECTED IN THE EDITOR: ${o ? o.kind + " " + o.id : selCount() ? [...sel.nodes].join(", ") : "nothing"}

REQUEST:
${request}`;
  }
  function agentApply(ops, label) {
    const res = runOps(ops, { source: "agent" });
    const errs = issues.filter((i) => i.level === "error"), warns = issues.filter((i) => i.level === "warning");
    addActivity(`${label} · ${res.applied} ops${res.failed.length ? ` · ${res.failed.length} rejetées` : ""} · ${errs.length} erreur${errs.length > 1 ? "s" : ""} · ${warns.length} avert.`, res.failed.length || errs.length ? "warn" : "ok");
    return {
      applied: res.applied, failed: res.failed,
      validator: issues.filter((i) => i.level !== "info").slice(0, 20).map((i) => `${i.level} [${i.target.kind === "class" ? i.target.name : i.target.id}] ${i.msg}`),
      classes: S.model.classes.length
    };
  }
  const ERR_COPY = {
    not_granted: "Accès à Claude non autorisé pour cette page. L'éditeur fonctionne sans.",
    sampling_disabled: "Claude n'est pas disponible pour ce compte ici.",
    rate_limited: "Trop de demandes ou limite d'usage atteinte. Réessaie dans un moment.",
    session_expired: "Session expirée: reconnecte-toi à Claude puis réessaie.",
    refused: "Claude a refusé cette demande. Reformule-la.",
    empty_completion: "Réponse vide. Simplifie la demande.",
    invalid_json: "Réponse JSON illisible. Réessaie ou demande moins à la fois.",
    prompt_too_large: "Modèle trop gros pour une seule requête. Masque des packages ou découpe la demande.",
    tools_unavailable: "Les outils ne sont pas disponibles ici: mode JSON activé, renvoie ta demande."
  };
  const DISABLE_CODES = ["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"];

  async function runAgent(text) {
    if (!sample || agentCtl) return;
    const ctl = new AbortController(); agentCtl = ctl;
    addMsg("user", text);
    const bubble = addMsg("agent", "Réflexion…", "pending");
    $("#btnSend").disabled = true; $("#btnStop").hidden = false;
    const startSnap = snapshot(), undoDepth = undoStack.length;
    recent = fresh(); render();
    const tier = $("#tier").value, jsonMode = !toolsOK;
    const input = [{ role: "user", content: systemBlock(jsonMode) }, ...chatTurns.slice(-6), { role: "user", content: stateBlock(text) }];
    let finalText = "";
    try {
      if (!jsonMode) {
        const tools = [{
          name: "apply_ops", description: "Apply a batch of edit operations to the UML model (the only way to change the diagram). Returns applied count, failed ops with reasons, and validator issues after the batch.",
          inputSchema: { type: "object", properties: { ops: { type: "array", description: "Operations, see OPS in the instructions.", items: { type: "object" } } }, required: ["ops"] },
          execute: (input, context) => {
            if (context && context.signal && context.signal.aborted) throw new Error("stopped by user");
            let ops = input.ops;
            if (typeof ops === "string") ops = extractJSON(ops);
            if (!Array.isArray(ops)) throw new Error("ops must be an array");
            return agentApply(ops, "apply_ops");
          }
        }];
        if (S.model.profile === "citygml") tools.push({
          name: "get_citygml_classes", description: "Look up CityGML 3.0 classes by name: module, ancestors, own and inherited attributes, ADE hook name.",
          inputSchema: { type: "object", properties: { names: { type: "array", items: { type: "string" } } }, required: ["names"] },
          execute: (input) => { const names = Array.isArray(input.names) ? input.names.map(String) : [String(input.names || "")]; addActivity(`get_citygml_classes · ${names.join(", ")}`, "info"); return Core.libraryDetails(names); }
        });
        const res = await sample(input, { tools, signal: ctl.signal, modelTier: tier, onText: ({ text: t }) => { bubble.classList.remove("pending"); bubble.textContent = t; chat.scrollTop = chat.scrollHeight; } });
        finalText = res.text.trim();
        bubble.textContent = finalText;
        if (res.truncated) addActivity("réponse coupée (limite de longueur)", "warn");
      } else {
        const out = await sample.json(input, { signal: ctl.signal, modelTier: tier, cache: false });
        const ops = Array.isArray(out) ? out : out && Array.isArray(out.ops) ? out.ops : [];
        agentApply(ops, "ops");
        finalText = out && out.message ? String(out.message) : `${ops.length} opérations appliquées.`;
        bubble.textContent = finalText;
      }
      bubble.classList.remove("pending");
      chatTurns.push({ role: "user", content: text }, { role: "assistant", content: finalText });
      if (undoStack.length > undoDepth) {
        const foot = document.createElement("div"); foot.className = "mfoot2";
        foot.innerHTML = `<button class="btn small" type="button">Annuler cette réponse</button>`;
        foot.querySelector("button").addEventListener("click", (e) => { const before = snapshot(); S = JSON.parse(startSnap); pushUndo(before); recent = fresh(); fixSel(); afterChange(); e.target.disabled = true; e.target.textContent = "Réponse annulée"; });
        bubble.appendChild(foot);
      }
    } catch (e) {
      const code = e && e.code ? e.code : "upstream_error";
      bubble.classList.remove("pending");
      if (code === "cancelled") bubble.textContent = (e.text ? e.text + "\n\n" : "") + "Arrêté.";
      else { bubble.classList.add("err"); bubble.textContent = (e.text ? e.text + "\n\n" : "") + (ERR_COPY[code] || "Erreur du service. Réessaie."); }
      if (code === "tools_unavailable") toolsOK = false;
      if (DISABLE_CODES.includes(code)) setAgentAvailable(false, ERR_COPY[code] || "Agent indisponible ici.");
    } finally {
      agentCtl = null; $("#btnSend").disabled = !sample; $("#btnStop").hidden = true;
      render();
    }
  }
  $("#askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = $("#ask").value.trim(); if (!t) return;
    if (!sample) { $("#ext").open = true; toast("Agent intégré indisponible ici: utilise « Autre LLM »."); return; }
    $("#ask").value = "";
    runAgent(t);
  });
  $("#ask").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#askForm").requestSubmit(); } });
  $("#btnStop").addEventListener("click", () => { if (agentCtl) agentCtl.abort(); });
  function setAgentAvailable(on, why) {
    const a = $("#avail");
    a.classList.toggle("off", !on);
    a.textContent = on ? "Claude, sur ton compte. Chaque réponse s'annule d'un clic." : why;
    $("#btnSend").disabled = !on;
    if (!on) $("#ext").open = true;
  }
  $("#btnCopyPrompt").addEventListener("click", async (e) => {
    const prompt = systemBlock(true) + "\n\n" + stateBlock($("#ask").value.trim() || "(décris ta demande ici)");
    await copyText(prompt, e.target, null);
    if (e.target.textContent.startsWith("Ctrl")) openModal("Prompt à copier", `<textarea readonly>${esc(prompt)}</textarea>`, "");
  });
  $("#btnApplyExt").addEventListener("click", () => {
    try {
      const data = extractJSON($("#extOps").value);
      const ops = Array.isArray(data) ? data : data && Array.isArray(data.ops) ? data.ops : null;
      if (!ops) throw new Error('il faut {"ops": [...]} ou un tableau');
      recent = fresh();
      if (data.message) addMsg("agent", String(data.message));
      agentApply(ops, "autre LLM");
      $("#extOps").value = "";
    } catch (err) { addActivity("réponse illisible · " + err.message, "err"); }
  });
