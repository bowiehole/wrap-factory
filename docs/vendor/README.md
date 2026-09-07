# Vendored Three.js (r160)

Local copies for the opt-in “Spin in 3D” viewer so the site does not depend on a CDN at runtime.

- `three.module.js` — core
- `controls/OrbitControls.js`
- `loaders/GLTFLoader.js`
- `utils/BufferGeometryUtils.js` (GLTFLoader dependency)

Import map in `index.html` maps bare specifier `three` → `./vendor/three.module.js`.
