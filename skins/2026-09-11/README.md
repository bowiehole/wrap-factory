# Skins — 2026-09-11

**Slug:** `kintsugi`
**Brief:** Deep indigo-black lacquer body with luminous gold and copper kintsugi crack veins branching continuously across every panel in shared vehicle-space (u,v) — high-contrast repaired-lacquer graphic, regenerated impression, no logos/seals.

Not a US holiday eve (tomorrow Sep 12 is not a US federal holiday). Not city series. Deliberately avoids terrazzo-pop chips, slash-field diagonals, bayou-dusk, volt-rail neon rails, chi-lake streams, reef-flash scales, la-dusk/sunset ribbons, city night grids, champagne, taxi-steam, norther ice, continuous-stream-on-dark-body, and height-ring thrash.

## Vehicles

| Folder | Pixels | File size |
|---|---|---|
| `cybertruck` | 1024×768 | 691.0 KB |
| `model3` | 1024×1024 | 974.2 KB |
| `model3-2024-base` | 1024×1024 | 1013.8 KB |
| `model3-2024-performance` | 1024×1024 | 1007.0 KB |
| `modely` | 1024×1024 | 710.9 KB |
| `modely-2025-base` | 1024×1024 | 741.3 KB |
| `modely-2025-premium` | 1024×1024 | 858.5 KB |
| `modely-2025-performance` | 1024×1024 | 862.1 KB |
| `modely-l` | 1024×1024 | 964.5 KB |
| `models-2021` | 1024×1024 | 809.4 KB |
| `models-2025-plaid` | 1024×1024 | 774.0 KB |
| `modelx-2021` | 1024×1024 | 637.3 KB |

## Atlas / paint

Continuous UV via `buildUVMap` (atlas.js). Crack field from multi-scale FBM ridge / Voronoi-edge distance in vehicle-space `(u,v)` so veins cross door seams and wrap-around panels. Lacquer floor raised for coverage ≥0.97. `dilate4` + fill template alpha. Zero glass/wheel leak.

## Preview

`skins/2026-09-11/kintsugi/preview/` — swatch + CT hero stills + `preview/{vehicle}/` ×12.

## Remaster (in place)

shared-span UV remaster applied to `argyle-cut.png` (same motif; version in git commit message only — no separate `-v2` catalog card).
