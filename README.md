# UML Agent

Éditeur de diagrammes de classes UML dans le navigateur. On importe un fichier PlantUML ou Mermaid (même imparfait),
on le corrige à la main sur le canevas, on exporte. Aucune dépendance, aucun serveur: `dist/index.html` est toute l'application.

## Déployer

Copier `dist/index.html` sur n'importe quel hébergement statique (GitHub Pages, Netlify, un dossier partagé, ou ouverture directe du fichier).
Les polices viennent de Google Fonts; sans réseau, l'application retombe sur les polices du système.

## Développer

    python3 build.py            # assemble src/ -> dist/index.html et dist/core.cjs
    node test/core.test.js      # modèle, imports, exports, validation (Node, sans navigateur)
    python3 test/ui.test.py     # parcours complet dans Chromium (pip install playwright)

- `src/core/` : logique sans DOM. Modèle v2, opérations, validateur (profils UML libre / ISO 19109 / ADE CityGML),
  imports PlantUML et Mermaid, exports, mise en page.
- `src/ui/` : canevas SVG, édition en place, explorateur, inspecteur, import/export, onglet Agent.
- Tout changement du modèle passe par `Core.applyOps(state, ops)`: l'interface, l'import d'opérations et l'agent
  utilisent le même protocole (voir `OPS_DOC` dans `src/core/50-export.js`).

## Format de fichier

`*.uml.json` = `{ model, layout }`. `model` contient classes, relations, notes; `layout` les positions, le tracé des liens
et ce qui est masqué. Les fichiers de la version 1 (associations + superclass) sont convertis à l'ouverture.

## Limites connues

- Import: diagrammes de classes uniquement. `!include`, classes d'association, qualificateurs et liens n-aires ne sont pas lus.
- La bibliothèque CityGML 3.0 embarquée est un sous-ensemble simplifié, à vérifier contre le modèle conceptuel OGC.
- L'agent intégré ne fonctionne que lorsque la page est ouverte dans Claude; ailleurs, « Autre LLM » passe par copier-coller.
