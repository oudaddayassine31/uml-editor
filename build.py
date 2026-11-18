import pathlib, glob
src = pathlib.Path('src')
core = 'const Core = (() => {\n  "use strict";\n' + '\n'.join(pathlib.Path(f).read_text() for f in sorted(glob.glob('src/core/*.js'))) + '})();\n'
ui = '(() => {\n  "use strict";\n' + '\n'.join(pathlib.Path(f).read_text() for f in sorted(glob.glob('src/ui/*.js'))) + '})();\n'
t = (src/'template.html').read_text()
t = t.replace('/*CSS*/', (src/'style.css').read_text()).replace('/*CORE*/', core).replace('/*UI*/', ui)
pathlib.Path('dist').mkdir(exist_ok=True)
(pathlib.Path('dist')/'index.html').write_text(t)
(pathlib.Path('dist')/'core.cjs').write_text(core + 'module.exports = Core;\n')
print('built', len(t))
