# Site orbit viewer meshes

Preview GLBs for the teslawrapfactory.com detail modal (“Spin in 3D”).

| File | Vehicle |
|------|---------|
| `cybertruck.glb` | Cybertruck |
| `model3.glb` | Model 3 |

## Contract

- Wrap material name: **`Tesla_Wrap`** only (other materials stay as authored).
- Texture: atlas PNG from the selected vehicle download URL.
- `texture.flipY = false`
- Wrapping: `ClampToEdgeWrapping` on S/T
- Front of vehicle ≈ **−Z** (OrbitControls target at model center)

These are site preview meshes only — not Paint Shop assets and not official Tesla models.
