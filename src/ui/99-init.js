  /* ---------------- start ---------------- */
  async function init() {
    $("#defs").innerHTML = `<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle class="grid-dot" cx="1" cy="1" r="0.9"/></pattern>` + markerDefs();
    const st = document.createElement("style"); st.textContent = svgCss(PAGE_P); document.head.appendChild(st);
    try {
      await Promise.race([
        Promise.all([document.fonts.load(`600 13px "IBM Plex Sans"`), document.fonts.load(`italic 600 13px "IBM Plex Sans"`), document.fonts.load(`400 11.5px "IBM Plex Mono"`), document.fonts.load(`400 10.5px "IBM Plex Sans"`)]),
        new Promise((r) => setTimeout(r, 2500))
      ]);
    } catch (e) { /* fonts optional */ }
    twCache.clear();
    S = load() || prepare(exampleState());
    syncViewMenu();
    addMsg("agent", "Je modifie le modèle par petites opérations, jamais une image: tout ce que je fais reste éditable à la main et s'annule d'un clic.");
    afterChange();
    fit();
    window.addEventListener("resize", () => applyView());
    window.__uml = { get state() { return S; }, importSources };

    if (inClaude) {
      try { sample = await window.claude.use("sample"); } catch (e) { sample = null; }
      if (sample) { try { const lim = await sample.limits(); toolsOK = !!(lim && lim.tools); } catch (e) { toolsOK = false; } }
      setAgentAvailable(!!sample, "Agent intégré indisponible dans cette vue. « Autre LLM » ci-dessous fonctionne partout.");
      try { downloads = await window.claude.use("downloads"); } catch (e) { downloads = null; }
    } else {
      setAgentAvailable(false, "L'agent intégré ne fonctionne que dans Claude. « Autre LLM » ci-dessous fonctionne partout.");
    }
  }
  init();
