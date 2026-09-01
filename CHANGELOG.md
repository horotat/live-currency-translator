# Changelog

All notable changes are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions follow
[SemVer](https://semver.org/).

## [1.0.0] — 2026-09-01

First public release on the Chrome Web Store.

### Features
- Convert prices on the current tab to a chosen currency, on click, under
  `activeTab` only — no host permissions.
- `MutationObserver` keeps converting prices that load in after scroll (SPAs,
  infinite scroll).
- One-click revert restores every original value.
- Exchange rates cached 6 h in `chrome.storage.local`, primary
  `open.er-api.com` with a `frankfurter.dev` (ECB) fallback.
- Amazon `.a-price` split-price widgets handled via `Intl.NumberFormat` parts.
- 160+ currencies; correct fraction digits per currency (JPY/KRW show none).
- Number parsing for US (`1,234.56`), EU (`1.234,56`), and space-grouped
  (`2 151 ₽`, incl. narrow/thin Unicode spaces) formats.
- Currency tokens: symbols, ISO codes, and code-plus-symbol (`CAD $`).

### Known limitations
- A bare `$` with no ISO code is assumed USD (`kr` → SEK, `¥` → JPY); the
  site's country domain and language are used as hints.
- Split-price widgets other than Amazon's need per-site support.

### Engineering
- Zero runtime dependencies, no build step for the extension itself.
- `node:test` unit suite; `scripts/check-manifest.mjs` locks the permission set.
- GitHub Actions: CI on every PR, tag-triggered release + Chrome Web Store
  publish.

[1.0.0]: https://github.com/horotat/live-currency-translator/releases/tag/v1.0.0
