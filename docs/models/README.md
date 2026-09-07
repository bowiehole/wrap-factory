# Site orbit viewer meshes

Preview GLBs for the dedicated orbit page (`viewer.html`). They are **not** loaded on the browse/index page.

| File | Vehicle id |
|------|------------|
| `cybertruck.glb` | cybertruck |
| `model3.glb` | model3 |
| `model3-2024-base.glb` | model3-2024-base |
| `model3-2024-performance.glb` | model3-2024-performance |
| `modely.glb` | modely |
| `modely-2025-base.glb` | modely-2025-base |
| `modely-2025-premium.glb` | modely-2025-premium |
| `modely-2025-performance.glb` | modely-2025-performance |
| `modely-l.glb` | modely-l |
| `models-2021.glb` | models-2021 |
| `models-2025-plaid.glb` | models-2025-plaid |
| `modelx-2021.glb` | modelx-2021 |

## Contract

- Wrap material name: **`Tesla_Wrap`** only (other materials stay as authored).
- Texture: atlas PNG from the selected vehicle download URL in `catalog.json`.
- `texture.flipY = false`
- Wrapping: `ClampToEdgeWrapping` on S/T
- Front of vehicle ≈ **−Z** (OrbitControls target at model center)
- Units: meters, **+Y** up

These are site preview meshes only — not Paint Shop assets and not official Tesla models.
