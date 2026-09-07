# Tesla Wrap Factory — GitHub Pages site

This folder is the **GitHub Pages** root for [teslawrapfactory.com](https://teslawrapfactory.com).

Static browse UI for digital UV wraps (Tesla Paint Shop only — not physical vinyl):

- `index.html` / `styles.css` / `app.js` — hybrid catalog browser (stills + swatch default; opt-in 3D)
- `catalog.json` — generated drop index (factory skins + workshop)
- `build-catalog.mjs` — regenerate `catalog.json` from `../skins` + `../workshop`
- `models/` — Cybertruck + Model 3 GLBs for the orbit viewer
- `vendor/` — Three.js r160 (local) for Spin in 3D
- `CNAME` — custom domain `teslawrapfactory.com`
- `.nojekyll` — serve as plain static assets

## Local preview

```bash
cd docs
python3 -m http.server 8877
# open http://127.0.0.1:8877/
# deep link: http://127.0.0.1:8877/?drop=2026-09-06/chi-lake
```

## Regenerate catalog

```bash
node docs/build-catalog.mjs
# or: node scripts/build-docs-catalog.mjs
```

Preview media (when published by Factory) live at `skins/YYYY-MM-DD/{slug}/preview/`. Until those files exist, the UI falls back to atlas PNGs.
