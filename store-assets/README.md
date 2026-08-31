# Store assets

Generated marketing images for the Chrome Web Store listing. Not part of the
packaged extension.

Regenerate with:

```bash
npm run store-assets
```

| File | Size | Where it goes in the listing |
|---|---|---|
| `screenshot-1.png` | 1280×800 | Screenshots (required, at least one) |
| `screenshot-2.png` | 1280×800 | Screenshots |
| `small-promo-tile.png` | 440×280 | Small promo tile (optional) |

The **store icon** (128×128) is `../icons/icon-128.png`.

All PNGs are flattened onto a solid background (no alpha) — a Chrome Web Store
requirement for screenshots and promo tiles.
