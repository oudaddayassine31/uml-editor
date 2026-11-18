  // Generalization is single-inheritance, so the hierarchy is a forest: tidy-tree layout,
  // association-only classes ("satellites") on the right at the row of the class they link to,
  // stand-alone types (CodeList, Enumeration, DataType) in rows underneath.
  function layout(nodes, opt = {}) {
    const HG = opt.hgap || 40, VG = opt.vgap || 72;
    const ids = Object.keys(nodes);
    const parentOf = {}, children = {};
    ids.forEach((id) => {
      const p = (nodes[id].parents || []).find((q) => nodes[q] && q !== id);
      if (p) { parentOf[id] = p; (children[p] = children[p] || []).push(id); }
    });
    ids.forEach((id) => { // cut cycles
      const seen = new Set([id]); let c = parentOf[id];
      while (c) { if (seen.has(c)) { const p = parentOf[id]; children[p] = children[p].filter((x) => x !== id); delete parentOf[id]; break; } seen.add(c); c = parentOf[c]; }
    });
    const realKids = (id) => children[id] || [];
    const inTree = (id) => !!parentOf[id] || realKids(id).length > 0;
    const roots = ids.filter((id) => !parentOf[id] && realKids(id).length);
    // association-only classes hang under the class that reaches them first (BFS over associations),
    // to the right of the real subclasses; components with no generalization get their best-connected class as root
    const links = (id) => (nodes[id].links || []).filter((l) => nodes[l] && l !== id);
    const attached = new Set(ids.filter(inTree));
    const satKids = {};
    const bfs = (start) => {
      const q = [...start];
      while (q.length) {
        const h = q.shift();
        for (const l of links(h)) {
          if (attached.has(l) || nodes[l].type) continue;
          const own = nodes[l].owner;
          if (own && own !== h && nodes[own] && !nodes[own].type) continue; // a part goes under its whole
          attached.add(l); (satKids[h] = satKids[h] || []).push(l); q.push(l);
        }
      }
    };
    bfs(ids.filter(inTree));
    let rest = ids.filter((id) => !attached.has(id) && !nodes[id].type && links(id).length);
    while (rest.length) {
      rest.sort((a, b) => links(b).length - links(a).length);
      const r = rest[0]; attached.add(r); roots.push(r); bfs([r]);
      rest = rest.filter((id) => !attached.has(id));
    }
    const loose = ids.filter((id) => !attached.has(id));
    const kids = (id) => [...realKids(id), ...(satKids[id] || [])];

    const depth = {};
    const setDepth = (id, d) => { depth[id] = d; kids(id).forEach((c) => setDepth(c, d + 1)); };
    roots.forEach((r) => setDepth(r, 0));
    const sw = {};
    const measure = (id) => {
      const ch = kids(id);
      const cw = ch.reduce((s, c) => s + measure(c), 0) + HG * Math.max(0, ch.length - 1);
      return (sw[id] = Math.max(nodes[id].w, cw));
    };
    roots.forEach(measure);
    const size = (id) => 1 + kids(id).reduce((s, c) => s + size(c), 0);
    roots.sort((a, b) => size(b) - size(a));
    const maxD = Math.max(-1, ...Object.values(depth));
    const rowH = Array(maxD + 1).fill(0);
    Object.keys(depth).forEach((id) => (rowH[depth[id]] = Math.max(rowH[depth[id]], nodes[id].h)));
    const rowY = []; let yy = 0;
    for (let d = 0; d <= maxD; d++) { rowY[d] = yy; yy += rowH[d] + VG; }

    const pos = {};
    const place = (id, x0) => {
      const ch = kids(id);
      const cw = ch.reduce((s, c) => s + sw[c], 0) + HG * Math.max(0, ch.length - 1);
      let cx = x0 + (sw[id] - cw) / 2;
      ch.forEach((c) => { place(c, cx); cx += sw[c] + HG; });
      let center = x0 + sw[id] / 2;
      const rk = realKids(id).length ? realKids(id) : ch;
      if (rk.length) {
        const a = rk[0], b = rk[rk.length - 1];
        center = (pos[a].x + nodes[a].w / 2 + pos[b].x + nodes[b].w / 2) / 2;
      }
      const left = Math.max(x0, Math.min(center - nodes[id].w / 2, x0 + sw[id] - nodes[id].w));
      pos[id] = { x: left, y: rowY[depth[id]] };
    };
    let x = 0;
    roots.forEach((r) => { place(r, x); x += sw[r] + HG * 1.5; });

    const placed = Object.keys(pos);
    const bottom = placed.length ? Math.max(...placed.map((id) => pos[id].y + nodes[id].h)) + VG : 0;
    const width = Math.max(560, ...placed.map((id) => pos[id].x + nodes[id].w));
    const order = { DataType: 0, Union: 1, Enumeration: 2, CodeList: 3 };
    let tx = 0, ty = bottom, rh = 0;
    loose.sort((a, b) => (order[nodes[a].kind] ?? 9) - (order[nodes[b].kind] ?? 9) || a.localeCompare(b)).forEach((id) => {
      const n = nodes[id];
      if (tx > 0 && tx + n.w > width) { tx = 0; ty += rh + VG * 0.6; rh = 0; }
      pos[id] = { x: tx, y: ty }; tx += n.w + HG; rh = Math.max(rh, n.h);
    });

    // pins: translate free layout to align with pinned nodes, then push free nodes off pinned ones
    const pinned = ids.filter((id) => nodes[id].fixed);
    if (pinned.length) {
      let dx = 0, dy = 0;
      pinned.forEach((id) => { dx += nodes[id].fixed.x - pos[id].x; dy += nodes[id].fixed.y - pos[id].y; });
      dx /= pinned.length; dy /= pinned.length;
      ids.forEach((id) => { if (!nodes[id].fixed) { pos[id].x += dx; pos[id].y += dy; } });
      pinned.forEach((id) => (pos[id] = { ...nodes[id].fixed }));
      const overlap = (a, b) => pos[a].x < pos[b].x + nodes[b].w + 16 && pos[a].x + nodes[a].w + 16 > pos[b].x && pos[a].y < pos[b].y + nodes[b].h + 16 && pos[a].y + nodes[a].h + 16 > pos[b].y;
      for (const id of ids) {
        if (nodes[id].fixed) continue;
        let guard = 0;
        while (guard++ < 60) {
          const hit = ids.find((o) => o !== id && (nodes[o].fixed || o < id) && overlap(id, o));
          if (!hit) break;
          pos[id].x = pos[hit].x + nodes[hit].w + 24;
        }
      }
    }
    return pos;
  }

