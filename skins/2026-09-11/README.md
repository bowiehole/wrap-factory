# Skins — 2026-09-11

**Slug:** `argyle-cut`
**Brief:** Ivory body with a high-contrast argyle diamond lattice in crimson and navy that tiles continuously in vehicle space (u=nose→tail, v=roof→rocker) — intersecting 45° diamonds wrapping around every panel, regenerated impression, no logos.

Not a US holiday eve. Not city series. Deliberately avoids terrazzo-pop chips, slash-field parallel diagonals, bayou-dusk, volt-rail, dusk gradients, neon rails, sunset ribbons, city night grids, champagne, taxi-steam, chi-lake, reef-flash.

## Vehicles

| Folder | Pixels | File size |
|---|---|---|
| `cybertruck` | 1024×768 | 508.3 KB |
| `model3` | 1024×1024 | 714.8 KB |
| `model3-2024-base` | 1024×1024 | 755.6 KB |
| `model3-2024-performance` | 1024×1024 | 759.7 KB |
| `modely` | 1024×1024 | 764.5 KB |
| `modely-2025-base` | 1024×1024 | 553.5 KB |
| `modely-2025-premium` | 1024×1024 | 635.2 KB |
| `modely-2025-performance` | 1024×1024 | 629.1 KB |
| `modely-l` | 1024×1024 | 708.4 KB |
| `models-2021` | 1024×1024 | 583.1 KB |
| `models-2025-plaid` | 1024×1024 | 564.2 KB |
| `modelx-2021` | 1024×1024 | 475.7 KB |

## Atlas / paint

Continuous UV via `buildUVMap` (atlas.js). Diamonds as a function of `(u,v)` — two phase-shifted saw/abs waves so 45° bands CROSS into diamonds (not parallel slash bands). Ivory floor raised for coverage ≥0.97. `dilate4` + fill template alpha. Zero glass/wheel leak.

## Preview

`skins/2026-09-11/argyle-cut/preview/` — swatch + CT hero stills + `preview/{vehicle}/` ×12.
