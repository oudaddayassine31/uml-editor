import asyncio, json, sys, time
from playwright.async_api import async_playwright
P03 = open('test/p03.puml').read()
fails = []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name, extra if not cond else '')
    if not cond: fails.append(name)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1500, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await pg.goto('file:///home/claude/umlagent/dist/index.html')
        await pg.wait_for_timeout(2800)
        st = lambda expr: pg.evaluate('(() => { const S = window.__uml.state; return ' + expr + '; })()')
        check('example loads', await st('S.model.classes.length') == 6)
        await pg.screenshot(path='test/a-example.png')

        # import P03 through the report dialog
        await pg.evaluate('t => window.__uml.importSources([{name: "P03.puml", text: t}])', P03)
        txt = await pg.inner_text('#mBody')
        check('report: nothing skipped', 'aucune ligne ignorée' in txt, txt[:300])
        await pg.click('#impReplace'); await pg.wait_for_timeout(300)
        check('P03 imported', await st('S.model.classes.length') == 12 and await st('S.model.relations.length') == 8)
        check('pill 0 errors', 'erreur' not in await pg.inner_text('#btnIssues'), await pg.inner_text('#btnIssues'))

        # rename in place
        await pg.dblclick('[data-node="SoilUnit"] [data-part="name"]')
        await pg.fill('#inlineEd', 'SoilClassification'); await pg.keyboard.press('Enter')
        check('rename in place + references follow', await st('S.model.relations.filter(r => r.to === "SoilClassification").length') == 2)

        # edit an attribute line in place
        await pg.dblclick('[data-node="SoilBody"] [data-mem="a:1"]')
        check('inline shows text', await pg.input_value('#inlineEd') == '+description : CharacterString [0..1]', await pg.input_value('#inlineEd'))
        await pg.fill('#inlineEd', '+summary : CharacterString [1]'); await pg.keyboard.press('Enter')
        check('attribute edited', await st('JSON.stringify(S.model.classes.find(c => c.name === "SoilBody").attributes[1])') == '{"name":"summary","type":"CharacterString","mult":"1","vis":"+"}')

        # node bar: add attributes in a row, then an operation
        await pg.click('[data-node="SoilBody"] [data-part="name"]')
        await pg.click('#nodebar [data-nb="attr"]')
        await pg.keyboard.type('depth : Length [0..1]'); await pg.keyboard.press('Enter')
        await pg.keyboard.type('+colour : CharacterString'); await pg.keyboard.press('Enter')
        await pg.keyboard.press('Escape')
        check('two attributes chained', await st('S.model.classes.find(c => c.name === "SoilBody").attributes.length') == 4)
        await pg.click('#nodebar [data-nb="op"]')
        await pg.keyboard.type('+volume(depth: Real) : Volume'); await pg.keyboard.press('Enter'); await pg.keyboard.press('Escape')
        check('operation added', await st('S.model.classes.find(c => c.name === "SoilBody").operations[0].params') == 'depth: Real')

        # drag a box, then link by dragging the blue handle to another class
        box = await pg.locator('[data-node="Pit"]').bounding_box()
        await pg.mouse.move(box['x'] + 20, box['y'] + 12); await pg.mouse.down(); await pg.mouse.move(box['x'] + 120, box['y'] + 80, steps=6); await pg.mouse.up()
        check('drag pins', await st('S.layout.nodes.Pit.pinned') == True)
        conn = await pg.locator('[data-node="Pit"] .conn').bounding_box()
        tgt = await pg.locator('[data-node="SoilLayer"]').bounding_box()
        await pg.mouse.move(conn['x'] + 8, conn['y'] + 8); await pg.mouse.down(); await pg.mouse.move(tgt['x'] + 40, tgt['y'] + 40, steps=8); await pg.mouse.up()
        await pg.click('#ctx button:has-text("Dépendance")')
        check('link by drag', await st('S.model.relations.some(r => r.kind === "dependency" && r.from === "Pit" && r.to === "SoilLayer")'))
        check('new link selected, panel shown', 'Lien' in await pg.inner_text('#inspector h3'))

        # multi-select with shift, align, nudge
        await pg.click('[data-node="SoilOrigin"] [data-part="name"]')
        await pg.click('[data-node="CompactionLevel"] [data-part="name"]', modifiers=['Shift'])
        await pg.click('[data-al="t"]')
        check('align top', await st('S.layout.nodes.SoilOrigin.y === S.layout.nodes.CompactionLevel.y'))
        y0 = await st('S.layout.nodes.SoilOrigin.y'); await pg.keyboard.press('ArrowDown')
        check('nudge', await st('S.layout.nodes.SoilOrigin.y') == y0 + 10)

        # context menu, duplicate, delete, undo
        await pg.click('[data-node="VanGenuchtenParameters"] [data-part="name"]', button='right')
        await pg.click('#ctx button:has-text("Dupliquer")')
        check('duplicate', await st('!!S.model.classes.find(c => c.name === "VanGenuchtenParameters2")'))
        await pg.keyboard.press('Delete')
        check('delete', await st('!S.model.classes.find(c => c.name === "VanGenuchtenParameters2")'))
        await pg.keyboard.press('Control+z')
        check('undo', await st('!!S.model.classes.find(c => c.name === "VanGenuchtenParameters2")'))

        # inspector: add relation by name, edge handles
        await pg.click('[data-cls="SoilLayer"]')
        await pg.select_option('#r-kind', 'generalization'); await pg.fill('#r-to', 'DomainEntity'); await pg.click('#r-add')
        check('inherit via inspector', await st('S.model.relations.some(r => r.kind === "generalization" && r.from === "SoilLayer")'))
        rid = await st('S.model.relations.find(r => r.name === "hasLayer").id')
        await pg.evaluate('id => document.querySelector(`[data-edge="${id}"] .hit`).dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}))', rid)
        await pg.wait_for_timeout(100)
        hb = await pg.locator('#gHandles [data-h="a"]').bounding_box()
        await pg.mouse.move(hb['x'] + 4, hb['y'] + 4); await pg.mouse.down(); await pg.mouse.move(hb['x'] + 44, hb['y'] + 4, steps=4); await pg.mouse.up()
        check('endpoint slides', (await st(f'(S.layout.edges["{rid}"] || {{}}).a')) not in (None, 0))
        await pg.screenshot(path='test/b-p03.png')

        # colours: one class via the inspector swatches, several via the context menu, a package via the explorer
        await pg.click('[data-cls="SoilBody"]')
        await pg.click('#inspector [data-target="sel"] [data-color="#d6efe0"]')
        check('class colour', await st('S.layout.style.classes.SoilBody.fill') == '#d6efe0')
        check('class colour drawn', 'fill:#d6efe0' in (await pg.get_attribute('[data-node="SoilBody"] .head', 'style') or ''))
        await pg.check('#f-line')
        check('coloured border', await st('S.layout.style.classes.SoilBody.line') == True)
        await pg.click('#btnFit')
        await pg.click('[data-node="SoilOrigin"] [data-part="name"]')
        await pg.click('[data-node="CompactionLevel"] [data-part="name"]', modifiers=['Shift'])
        await pg.click('[data-node="CompactionLevel"] [data-part="name"]', button='right')
        await pg.click('#ctx button:has-text("Couleur des 2 classes")')
        await pg.click('#ctx [data-color="#3a4552"]')
        check('multi colour', await st('S.layout.style.classes.SoilOrigin.fill === "#3a4552" && S.layout.style.classes.CompactionLevel.fill === "#3a4552"'))
        check('dark colour -> light text', 'dk' in (await pg.get_attribute('[data-node="SoilOrigin"]', 'class')))
        await pg.click('#tree [data-pal^="pkg:03"]')
        await pg.click('#ctx [data-color="#fde6c4"]')
        check('package colour', await st('S.layout.style.packages["03 Soil and Ground Investigation"].fill') == '#fde6c4')
        check('package colour reaches uncoloured class', 'fill:#fde6c4' in (await pg.get_attribute('[data-node="SoilLayer"] .head', 'style') or ''))
        await pg.keyboard.press('Control+z')
        check('undo colour', await st('!S.layout.style.packages["03 Soil and Ground Investigation"]'))
        await pg.keyboard.press('Control+y')
        await pg.screenshot(path='test/e-colours.png')

        # hide a package member, export formats
        await pg.click('[data-eye="SoilSourceLevel"]')
        check('hidden from diagram', await pg.locator('[data-node="SoilSourceLevel"]').count() == 0)
        for k in ['puml', 'mmd', 'json', 'svg', 'cj']:
            await pg.click('#btnExport'); await pg.click(f'[data-export="{k}"]')
            t = await pg.input_value('#exText'); check('export ' + k, len(t) > 200)
            if k == 'puml': check('puml keeps colours', '#d6efe0' in t and '#3a4552' in t, t[:300])
            if k == 'svg': check('svg keeps colours', 'fill:#d6efe0' in t)
            if k == 'puml':
                async with pg.expect_download() as dl: await pg.click('#exSave')
                d = await dl.value; check('download standalone', d.suggested_filename.endswith('.puml'), d.suggested_filename)
            await pg.click('#mClose')
        await pg.click('#btnExport'); await pg.click('[data-export="png"]'); await pg.wait_for_selector('.pngprev img', timeout=8000); await pg.click('#mClose')
        check('export png', True)

        # merge a second package: stub resolved
        await pg.evaluate('''() => window.__uml.importSources([{name: "P04.puml", text: `@startuml
package "04 Field" as P04 {
  class Pit <<FeatureType>> {
    +depth : Real [1]
    +dig() : void
  }
  class Borehole <<FeatureType>>
}
Pit <|-- Borehole
@enduml`}])''')
        await pg.click('#impMerge'); await pg.wait_for_timeout(300)
        check('merge resolves stub', await st('!S.model.classes.find(c => c.name === "Pit").external && S.model.classes.length === 14'))
        check('merge keeps hand position', await st('S.layout.nodes.Pit.pinned') == True)
        await pg.screenshot(path='test/c-merged.png')

        # mermaid paste, reload persistence
        await pg.evaluate('''() => window.__uml.importSources([{name: null, text: "classDiagram\\n class A {\\n +int x\\n +run() bool\\n }\\n A <|-- B\\n B ..> C : uses"}])''')
        await pg.click('#impReplace'); await pg.wait_for_timeout(200)
        check('mermaid import', await st('S.model.classes.length') == 3 and await st('S.model.profile') == 'uml')
        await pg.reload(); await pg.wait_for_timeout(2600)
        check('persists after reload', await st('S.model.classes.length') == 3)

        # big model
        await pg.evaluate('''() => { let t = "@startuml\\n"; for (let i = 0; i < 300; i++) { t += `package P${i % 10} {\\nclass C${i} {\\n` + Array.from({length: 6}, (_, k) => `+a${k} : String`).join("\\n") + "\\n}\\n}\\n"; if (i > 4) t += `C${Math.floor(i / 5)} <|-- C${i}\\n`; } for (let i = 0; i < 200; i++) t += `C${i * 7 % 300} --> C${i * 13 % 300} : r${i}\\n`; t += "@enduml"; window.__big = t; window.__t0 = performance.now(); window.__uml.importSources([{name: "big.puml", text: t}]); }''')
        await pg.click('#impReplace'); await pg.wait_for_timeout(600)
        check('big import', await st('S.model.classes.length') == 300)
        ms = await pg.evaluate('''() => { const t = performance.now(); document.querySelector('#btnFit').click(); const el = document.querySelector('[data-node="C7"] [data-part="name"]'); el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, button: 0, clientX: 0, clientY: 0})); return performance.now() - t; }''')
        print('     select on 300 classes:', round(ms), 'ms')
        check('big select < 400ms', ms < 400)
        await pg.screenshot(path='test/d-big.png')
        print('ERRORS', errs)
        check('no console errors', not errs)
        await b.close()
    print('FAILED:' if fails else 'ALL OK', fails)
asyncio.run(main())
