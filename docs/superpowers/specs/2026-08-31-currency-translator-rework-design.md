# Live Currency Translator — Rework & Publishing Design

**Date:** 2026-08-31
**Status:** Approved (brainstorming)
**Owner:** horotat

## Problem

The current extension (Manifest V3, Gemini-generated) works but has security,
correctness, and distribution gaps:

- A content script is auto-injected into **every page** (`<all_urls>`), and it
  makes a cross-origin `fetch()` from page context on every run.
- No caching of exchange rates; every translate hits the network.
- Correctness bugs: zero-decimal currencies (JPY, KRW) get `.00`; `kr` is
  hard-wired to SEK; `¥` only maps to JPY, never CNY; no handling of dynamic
  pages (prices rendered after load are never converted).
- No repo, no license, no CI, no automated publishing path.

## Goals

1. Rework the architecture so all network access is centralized, rates are
   cached, and the content script runs only on explicit user action.
2. Handle dynamic/SPA pages via `MutationObserver`.
3. One-click revert.
4. Broad currency coverage (160+) without introducing security risk.
5. Public MIT-licensed repo under `github.com/horotat` with CI and
   tag-triggered automated publishing to the Chrome Web Store.
6. Minimize recurring manual work: after one-time setup, releasing is
   `npm version patch && git push --tags`.

## Non-goals (YAGNI)

Per-site auto-translate toggle, a separate options page, UI internationalization,
multiple base currencies, historical rate charts, any monetization backend.

## Architecture

| Component | Responsibility |
|---|---|
| `src/background.js` (service worker) | Sole owner of network access. Fetches, validates, and caches exchange rates in `chrome.storage.local` with a TTL (default 6h). Injects `src/content.js` on toolbar/popup action via `chrome.scripting.executeScript`. Routes messages between popup and content script. |
| `src/content.js` | Injected only under `activeTab` when the user clicks. Walks text nodes, replaces currency amounts, installs a `MutationObserver` for later DOM mutations. Records original text for revert. No network calls. Disconnects observer on revert or navigation. |
| `src/popup.html` / `src/popup.js` | Searchable currency picker, "Translate this page", "Revert", rates last-updated timestamp, source attribution link, donate link. |
| `src/lib/currency.js` | Pure, unit-tested functions: symbol→ISO map, ambiguous-symbol resolution, number normalization (US `1,000.50` vs EU `1.000,50`), conversion math, `Intl.NumberFormat` formatting with correct fraction digits per currency. |
| `src/lib/rates.js` | Fetch primary provider, fall back to secondary, validate response shape, read/write cache. |
| `test/` | Node built-in test runner (`node:test`) over `src/lib/currency.js` and the cache/validation logic in `src/lib/rates.js` (network mocked). |
| `icons/` | 16/32/48/128 PNGs generated from one SVG at build time by `scripts/make-icons.mjs`; generated output committed. |

### Data flow (translate)

1. User clicks the toolbar icon → popup opens.
2. Popup sends `{type: "translate", targetCurrency}` to the background worker.
3. Background: `getRates()` — returns cached rates if fresh, else fetches from
   `open.er-api.com`, else `frankfurter.dev`, validates, caches.
4. Background injects `src/content.js` into the active tab (`activeTab` grant).
5. Background sends `{type: "apply", targetCurrency, rates}` to the tab.
6. Content script converts existing nodes, then observes mutations and converts
   new nodes until navigation or revert.

### Data flow (revert)

Popup → background → `{type: "revert"}` to the tab → content script restores
every recorded original text node and disconnects the observer.

## Exchange-rate source

- **Primary:** `https://open.er-api.com/v6/latest/USD` — no API key, HTTPS,
  160+ currencies. Attribution link required (placed in popup footer + README).
- **Fallback:** `https://api.frankfurter.dev/v1/latest?base=USD` — ECB data,
  ~31 major currencies, no key.

### Why this is safe

- The only outbound request is an unauthenticated `GET .../latest/USD`. No user
  data, no identifiers, no page URL is sent.
- Response is expected to be `{ rates: { "USD": 1, "EUR": 0.9, ... } }` (or the
  provider's documented shape). Validation before use:
  - `AbortController` timeout (8s).
  - Response `Content-Type` is JSON and body parses.
  - `rates` is a non-empty plain object.
  - Every value is a finite number `> 0`; entries that fail are dropped.
  - Base currency present and equal to `1` (within tolerance).
- Nothing from the response is ever inserted as HTML. Target currency code is
  checked against the validated rate keys before being passed to
  `Intl.NumberFormat`.

## Security hardening (vs. current version)

1. Remove `<all_urls>` content script. Permissions become `activeTab`,
   `scripting`, `storage`. No `host_permissions`.
2. Move `fetch()` from page context to the service worker.
3. Rate-response validation as above.
4. Validate target currency against the known set before formatting.
5. Text replacement stays `node.nodeValue = …` only; never `innerHTML`.
6. Regex: bounded quantifiers (no catastrophic backtracking), every symbol
   passed through a regex-escape helper.
7. Keep default MV3 CSP (no `eval`, no remote code, no inline handlers).
8. `MutationObserver` is disconnected on revert and on `pagehide`.
9. Correctness fixes that are also safety-relevant:
   - Per-currency fraction digits from `Intl.NumberFormat` defaults (JPY/KRW → 0).
   - `kr` treated as ambiguous → resolved by page `lang`/domain heuristic,
     defaulting to a single documented choice (SEK) with a code-comment.
   - `¥` ambiguous JPY/CNY → same heuristic approach, default JPY.
   - Only convert when both source and target rates exist.
10. `PRIVACY.md` and a CWS "Privacy practices" statement: preference stored
    locally via `chrome.storage`, no tracking, no data sold, single anonymous
    outbound request documented.
11. Supply chain: GitHub Actions pinned to commit SHAs, least-privilege
    `permissions:` per workflow, Dependabot for Actions + npm.

## Manifest (target)

```jsonc
{
  "manifest_version": 3,
  "name": "Live Currency Translator",
  "version": "0.0.0",            // overwritten from the git tag at release
  "description": "Convert prices on any page to your preferred currency using live exchange rates.",
  "permissions": ["activeTab", "scripting", "storage"],
  "action": { "default_popup": "src/popup.html", "default_title": "Translate currencies on this page" },
  "background": { "service_worker": "src/background.js", "type": "module" },
  "icons": { "16": "icons/icon-16.png", "32": "icons/icon-32.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
}
```

No `content_scripts` block — injection is programmatic.

## Repository layout

```
.
├── src/
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   └── lib/
│       ├── currency.js
│       └── rates.js
├── icons/                 # generated PNGs (committed)
├── assets/icon.svg        # source art
├── test/
│   ├── currency.test.js
│   └── rates.test.js
├── scripts/
│   ├── make-icons.mjs
│   ├── sync-version.mjs   # git tag -> manifest.json version
│   └── get-refresh-token.mjs
├── .github/
│   ├── workflows/ci.yml
│   ├── workflows/release.yml
│   └── dependabot.yml
├── manifest.json
├── package.json
├── README.md
├── PRIVACY.md
├── PUBLISHING.md
├── LICENSE               # MIT
└── .gitignore
```

## CI/CD

### `ci.yml` (pull requests + pushes to main)

- `npm ci`
- `node --test`
- `npx web-ext lint --source-dir .` (with build artifacts excluded)
- Manifest sanity check (valid JSON, MV3, required keys)
- `permissions: { contents: read }`

### `release.yml` (trigger: push tag matching `v*.*.*`)

1. `npm ci`
2. `node scripts/sync-version.mjs` — writes the tag's version into `manifest.json`.
3. `node scripts/make-icons.mjs` — regenerate icons.
4. `node --test` — tests must pass.
5. Build `dist/live-currency-translator-<version>.zip` (source files only, no
   `test/`, `scripts/`, `docs/`, `.github/`, `node_modules/`).
6. Create a GitHub Release for the tag, attach the zip.
7. Publish to the Chrome Web Store via its API (upload new package, then
   publish) using repo secrets `EXTENSION_ID`, `CWS_CLIENT_ID`,
   `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
8. `permissions: { contents: write }` only.
9. Actions pinned to SHAs. CWS step uses a maintained action or a short inline
   `curl` script against the CWS API v1.1 (decided in the plan).

### One-time manual setup (documented in `PUBLISHING.md`)

1. Create Chrome Web Store developer account, pay the one-time $5.
2. Manually upload the first build and complete the store listing (name,
   description, screenshots, category, privacy tab). Note the extension ID.
3. Create a Google Cloud project, enable the Chrome Web Store API, create an
   OAuth client (type "Desktop"), then run `node scripts/get-refresh-token.mjs`
   to obtain a refresh token.
4. Add `EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
   `CWS_REFRESH_TOKEN` to GitHub repo secrets.
5. `git init` (done), create the repo (`gh repo create horotat/live-currency-translator --public --source . --push`).

### Recurring release flow

```
npm version patch     # bumps package.json, creates a git tag
git push --follow-tags
```

GitHub Actions does the rest.

## Testing strategy

- `test/currency.test.js`:
  - US vs EU number normalization (`1,234.56`, `1.234,56`, `1 234,56`, `1234`).
  - Zero-decimal currencies format without fraction digits.
  - Ambiguous symbol resolution (`kr`, `¥`) with and without a `lang` hint.
  - Conversion math round-trips (USD→EUR→USD within tolerance).
  - Regex does not match dates, version numbers, or plain integers without a
    currency token.
- `test/rates.test.js` (fetch mocked):
  - Fresh cache is reused without a network call.
  - Stale cache triggers a refetch.
  - Malformed response (missing `rates`, non-numeric values, negative values)
    is rejected and the fallback provider is tried.
  - Timeout aborts and surfaces a clear error.
- Manual QA checklist in `PUBLISHING.md` (Amazon product page, a EU retailer,
  an SPA that lazy-loads prices, revert).

## Open decisions deferred to the implementation plan

- Exact CWS publish mechanism (existing GitHub Action vs. inline script).
- Icon visual design (simple glyph; not on the critical path).
- Whether `frankfurter.dev` fallback ships in v1 or is a follow-up.
