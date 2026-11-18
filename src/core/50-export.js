  function toCityJSONExtension(model) {
    const ext = {
      type: "CityJSONExtension", name: model.name, url: `https://example.org/${model.name}.ext.json`, version: "0.1.0", versionCityJSON: "2.0",
      description: `Généré depuis le modèle UML ${model.name} (squelette à relire).`,
      extraRootProperties: {}, extraAttributes: {}, extraCityObjects: {}, extraSemanticSurfaces: {}
    };
    const assocs = model.relations.filter((r) => ASSOC_KINDS.includes(r.kind));
    const props = (c) => {
      const p = {};
      const anc = ancestors(model, c.name);
      for (const a of [...anc].reverse()) if (a && !a.ref && a.attributes) a.attributes.forEach((x) => (p["+" + x.name] = attrSchema(model, x)));
      c.attributes.forEach((a) => (p["+" + a.name] = attrSchema(model, a)));
      assocs.filter((s) => s.from === c.name || anc.some((x) => x && x.name === s.from)).forEach((s) => {
        const role = s.toRole || s.name || s.to.charAt(0).toLowerCase() + s.to.slice(1);
        p["+" + role] = attrSchema(model, { type: s.to, mult: s.toMult });
      });
      return p;
    };
    for (const c of model.classes) {
      if (c.external) continue;
      const anc = ancestors(model, c.name);
      const hook = anc.find((a) => a && a.hookOf);
      if (c.stereotype === "DataType" && hook) {
        const targets = cjTargetsOf(model, hook.hookOf);
        const surf = CJ_SURFACES[hook.hookOf];
        const p = props(c);
        if (surf) ext.extraSemanticSurfaces[surf] = { ...(ext.extraSemanticSurfaces[surf] || {}), ...p };
        (targets.length ? targets : ["/* aucune correspondance CityJSON pour " + hook.hookOf + " */"]).forEach((t) => (ext.extraAttributes[t] = { ...(ext.extraAttributes[t] || {}), ...p }));
        continue;
      }
      if (c.stereotype !== "FeatureType" || c.abstract) continue;
      if (anc.some((a) => a && a.name === "AbstractThematicSurface")) {
        ext.extraSemanticSurfaces["+" + c.name] = { type: "object", properties: { type: { enum: ["+" + c.name] }, ...props(c) }, required: ["type"] };
      } else {
        ext.extraCityObjects["+" + c.name] = {
          allOf: [
            { $ref: "cityobjects.schema.json#/_AbstractCityObject" },
            { properties: { type: { enum: ["+" + c.name] }, attributes: { type: "object", properties: props(c) }, geometry: { type: "array", items: { $ref: "geomprimitives.schema.json#/Solid" } } }, required: ["type"] }
          ]
        };
      }
    }
    return ext;
  }

  /* ---------- context handed to an agent (built-in or external) ---------- */
  function libraryIndex() {
    const lines = [];
    for (const [mod, label] of Object.entries(MODULES)) {
      const cs = Object.values(LIB).filter((c) => c.module === mod && !c.hookOf && c.stereotype !== "CodeList");
      if (!cs.length) continue;
      lines.push(`# ${mod} (${label})`);
      cs.forEach((c) => lines.push(`${c.name} «${c.stereotype}»${c.abstract ? " abstract" : ""}${c.superclass ? " <- " + c.superclass : ""}`));
    }
    lines.push("# CodeLists CityGML: " + Object.values(LIB).filter((c) => c.stereotype === "CodeList").map((c) => c.name).join(", "));
    return lines.join("\n");
  }
  function libraryDetails(names) {
    const E = { classes: [], relations: [] };
    return (names || []).slice(0, 12).map((n) => {
      const c = LIB[stripPrefix(n)];
      if (!c) return { name: n, error: "inconnue" };
      return {
        name: c.name, module: c.module, stereotype: c.stereotype, abstract: c.abstract, superclass: c.superclass,
        ancestors: ancestors(E, c.name).map((a) => a.name),
        attributes: c.attributes.map((a) => (a.type ? `${a.name}: ${a.type} [${a.mult}]` : a.name)),
        inherited: inheritedAttributes(E, c.name).map((a) => `${a.name}: ${a.type} [${a.mult}] (${a.from})`),
        adeHook: c.stereotype === "FeatureType" ? "ADEOf" + c.name : undefined
      };
    });
  }
  const PROFILE_LABEL = { uml: "plain UML class diagram (no domain rules)", iso19109: "ISO 19109 application schema", citygml: "CityGML 3.0 ADE" };
  function compactModel(model) {
    return {
      name: model.name, profile: PROFILE_LABEL[model.profile] || model.profile,
      externalTypes: (model.externalTypes || []).length ? model.externalTypes : undefined,
      classes: model.classes.map((c) => ({
        name: c.name, stereotype: c.stereotype || undefined, abstract: c.abstract || undefined,
        external: c.external ? "stub of a class defined elsewhere (read-only)" : undefined,
        package: c.package !== model.name ? c.package : undefined,
        attributes: c.attributes.length ? c.attributes.map((a) => attrText(a, isLiteralClass(c))) : undefined,
        operations: c.operations.length ? c.operations.map(opText) : undefined
      })),
      relations: model.relations.map((r) => `${r.id}: ${r.from} ${r.fromMult ? "[" + r.fromMult + "] " : ""}${r.kind}${ASSOC_KINDS.includes(r.kind) ? "(nav " + r.nav + ")" : ""} -> ${r.to}${r.toMult ? " [" + r.toMult + "]" : ""}${r.name ? " name=" + r.name : ""}${r.toRole ? " toRole=" + r.toRole : ""}${r.fromRole ? " fromRole=" + r.fromRole : ""}`),
      notes: model.notes.map((n) => `${n.id}${n.near ? " (on " + n.near + ")" : ""}: ${n.text.slice(0, 80)}`)
    };
  }

  const OPS_DOC = `OPS (JSON objects, field "op"):
- {"op":"add_class","name":"GreenRoof","stereotype":"FeatureType|DataType|CodeList|Enumeration|Union|Interface|\\"\\"","abstract":false,"superclass":"AbstractOccupiedSpace","attributes":[{"name":"substrateDepth","type":"Length","mult":"0..1"}],"operations":[{"name":"area","params":"","type":"Real"}],"doc":"..."}
  Enumeration values go in "attributes" as {"name":"literal"}.
- {"op":"update_class","name":"GreenRoof","set":{"name":"NewName","stereotype":"...","abstract":true,"package":"...","doc":"..."}}
- {"op":"delete_class","name":"X"}
- {"op":"add_attribute","class":"GreenRoof","name":"vegetatedArea","type":"Area","mult":"0..1","vis":"+"}
- {"op":"update_attribute","class":"GreenRoof","name":"vegetatedArea","set":{"name":"...","type":"...","mult":"..."}} / {"op":"delete_attribute","class":"GreenRoof","name":"vegetatedArea"}
- {"op":"add_operation","class":"X","name":"compute","params":"depth: Real","type":"Volume"} / update_operation / delete_operation
- {"op":"add_relation","kind":"association|aggregation|composition|generalization|realization|dependency","from":"GreenRoof","to":"RoofSurface","name":"installedOn","toRole":"roofSurface","fromMult":"0..*","toMult":"1..*","nav":"to|both|none"}
  generalization/realization: "from" is the subclass. composition/aggregation: "from" is the whole.
- {"op":"update_relation","id":"R3","set":{...}} / {"op":"delete_relation","id":"R3"}
- {"op":"add_note","text":"...","near":"GreenRoof"} / {"op":"delete_note","id":"N4"}
- {"op":"set_model","name":"NBS_ADE","profile":"uml|iso19109|citygml","externalTypes":["TypeDefinedElsewhere"]}
Classes marked external are stubs from other packages: reference them, do not edit or delete them.`;

  const RULES_DOC = `MODELLING RULES when the profile is ISO 19109 or CityGML (skip them for a plain UML model):
- Every new «FeatureType» of a CityGML ADE inherits (directly or not) from a CityGML class: choose the most specific one (spaces: AbstractOccupiedSpace / AbstractUnoccupiedSpace / AbstractLogicalSpace; surfaces: AbstractThematicSurface or a concrete surface).
- To ADD PROPERTIES to an existing CityGML class (e.g. Building), do NOT subclass it: create a concrete «DataType» that generalizes to the ADE hook "ADEOf<Class>" and put the properties there.
- Abstract classes are named Abstract*. Class names UpperCamelCase, attribute names lowerCamelCase.
- Attribute types: ISO 19103 / CityGML basic types (CharacterString, Integer, Real, Boolean, Date, DateTime, URI, Length, Area, Volume, Measure, Code, GM_Solid, GM_MultiSurface ...), or a «DataType»/«CodeList»/«Enumeration» of the model or of CityGML. Create missing CodeLists (names end with "Value").
- Relations between «FeatureType» are associations with a role name, never attributes. DataTypes are attribute types, not association ends.
- Multiplicities: "1", "0..1", "0..*", "1..*". Single inheritance.
- Never touch layout: the user positions boxes by hand; the page lays out new boxes itself.`;
