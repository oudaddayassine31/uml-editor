  function jsonSchemaForType(model, t, depth = 0) {
    if (!t) return { type: "string" };
    if (["Integer", "IntegerBetween0and3"].includes(t)) return { type: "integer" };
    if (["Real", "Decimal", "Number", "Measure", "Length", "Area", "Volume", "Angle", "Velocity", "Scale", "DoubleBetween0and1"].includes(t)) return { type: "number" };
    if (t === "Boolean") return { type: "boolean" };
    if (t === "Date") return { type: "string", format: "date" };
    if (t === "DateTime") return { type: "string", format: "date-time" };
    if (["DoubleList", "MeasureOrNilReasonList"].includes(t)) return { type: "array", items: { type: "number" } };
    if (PRIMITIVES.includes(t)) return { type: "string" };
    const c = resolve(model, t);
    if (!c) return { type: "string" };
    if (c.stereotype === "Enumeration") return { type: "string", enum: c.attributes.map((a) => a.name) };
    if (c.stereotype === "CodeList") return { type: "string", description: `codelist ${c.name}` };
    if (c.stereotype === "FeatureType") return { type: "string", description: `CityObject id (${c.name})` };
    if (depth > 3) return { type: "object" };
    const all = [...inheritedAttributes(model, c.name), ...c.attributes];
    const props = {}, req = [];
    all.forEach((a) => { props[a.name] = attrSchema(model, a, depth + 1); if (/^[1-9]/.test(a.mult || "")) req.push(a.name); });
    const s = { type: "object", properties: props };
    if (req.length) s.required = req;
    if (c.stereotype === "Union") { delete s.properties; s.oneOf = all.map((a) => ({ type: "object", properties: { [a.name]: attrSchema(model, a, depth + 1) }, required: [a.name] })); }
    return s;
  }
  function attrSchema(model, a, depth = 0) {
    const base = jsonSchemaForType(model, a.type, depth);
    const up = (a.mult || "").split("..").pop();
    return up === "*" || (+up > 1) ? { type: "array", items: base } : base;
  }
  function cjTargetsOf(model, refName) {
    // concrete CityJSON types under a CityGML class
    const out = new Set();
    for (const [n, types] of Object.entries(CJ_OBJECTS)) {
      if (n === refName || ancestors(model, n).some((a) => a && a.name === refName)) types.forEach((t) => out.add(t));
    }
    return [...out];
  }
