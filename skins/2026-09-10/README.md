# Skins — 2026-09-10

**Slug:** `terrazzo-pop`
**Brief:** Warm parchment body densely speckled with multi-color terrazzo chips (coral, teal, mustard, indigo, charcoal) — irregular chips of varying size that feel continuous across door seams via shared (u,v) noise; high-contrast graphic stone, regenerated impression, no logos.

Not a US holiday eve. Not city series. Deliberately avoids bayou-dusk, slash-field, dusk gradients, neon rails, sunset ribbons, city night grids, champagne, taxi-steam, volt-rail streams, and diagonal slash families.

## Vehicles

| Folder | Pixels | File size |
|---|---|---|
| `cybertruck` | 1024×768 | 746.1 KB |
| `model3` | 1024×1024 | 957.8 KB |
| `model3-2024-base` | 1024×1024 | 993.2 KB |
| `model3-2024-performance` | 1024×1024 | 986.2 KB |
| `modely` | 1024×1024 | 781.0 KB |
| `modely-2025-base` | 1024×1024 | 725.5 KB |
| `modely-2025-premium` | 1024×1024 | 845.5 KB |
| `modely-2025-performance` | 1024×1024 | 860.4 KB |
| `modely-l` | 1024×1024 | 959.1 KB |
| `models-2021` | 1024×1024 | 801.0 KB |
| `models-2025-plaid` | 1024×1024 | 764.4 KB |
| `modelx-2021` | 1024×1024 | 626.6 KB |

## Atlas / paint

Continuous UV via `buildUVMap` (atlas.js). Chip field from hash/fbm in vehicle-space `(u,v)` with anisotropic multi-scale cells so chips read as irregular stones (not streaks) on long side panels. Cream/parchment floor raised for coverage ≥0.97. `dilate4` + fill template alpha. Zero glass/wheel leak.

## Preview

`skins/2026-09-10/terrazzo-pop/preview/` — swatch + CT hero stills + `preview/{vehicle}/` ×12.

## terrazzo-pop-v2 (WORLD-BAKE wrap-around remaster)

**Slug:** `terrazzo-pop-v2`
**Brief:** same warm parchment multi-color terrazzo chips; world-bake wrap-around remaster

Same motif as v1; remastered by baking from GLB world space `(along, height)` so chips wrap continuously across hood, sides, and rear. v1 `terrazzo-pop.png` files left intact.

