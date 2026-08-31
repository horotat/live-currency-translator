# Live Currency Translator — Rework & Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Manifest V3 currency-converter extension with a centralized, cached, click-to-run architecture, then ship it as a public MIT repo with tag-triggered automated Chrome Web Store publishing.

**Architecture:** A classic (non-module) service worker owns all network access — it fetches, validates, and caches USD-based exchange rates in `chrome.storage.local` with a 6h TTL, and injects the content script on demand under `activeTab`. The content script (also classic, injected alongside a shared pure-logic library) walks text nodes, converts amounts, watches the DOM with a `MutationObserver`, and supports one-click revert. All shared parsing/formatting/conversion logic lives in one dependency-free file consumed three ways: `importScripts` in the worker, co-injection in the page, and `require` in tests.

**Tech Stack:** Vanilla JS (no framework, no bundler for extension code), Node.js built-in test runner (`node:test`), `web-ext` for linting, `sharp` for build-time icon rasterization, GitHub Actions, Chrome Web Store API v1.1.

## Global Constraints

- Manifest V3 only. `"permissions": ["activeTab", "scripting", "storage"]`. No `host_permissions`. No `content_scripts` block (programmatic injection only).
- Extension runtime code (`src/**`) is dependency-free vanilla JS, CommonJS-compatible. `package.json` has **no** `"type"` field, so `.js` = CommonJS.
- Shared library files assign their API to `globalThis.<Name>` **and** `module.exports` (when `module` exists), so the same file works in the worker, the page, and tests.
- Node scripts under `scripts/` are ESM (`.mjs`), Node-only, never loaded by the extension.
- Never insert response data or converted values as HTML. Text replacement is `textNode.nodeValue = …` exclusively.
- Only outbound network request is an unauthenticated `GET .../latest/USD` to `open.er-api.com` (primary) or `api.frankfurter.dev` (fallback). No API keys. No user data, identifiers, or page URLs sent.
- Rate provider: primary `https://open.er-api.com/v6/latest/USD`, fallback `https://api.frankfurter.dev/v1/latest?base=USD`.
- Cache TTL: `6 * 60 * 60 * 1000` ms. Fetch timeout: `8000` ms via `AbortController`.
- License: MIT, `Copyright (c) 2026 horotat`. Repo: `github.com/horotat/live-currency-translator`.
- Extension name string (verbatim): `Live Currency Translator`.
- Attribution string (verbatim, shown in popup + README): `Rates by open.er-api.com`.
- Node version for CI and scripts: `20`.
- Commit style: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`).

---

## File Structure

| Path | Responsibility |
|---|---|
| `manifest.json` | MV3 manifest. Version is `0.0.0` in-repo, overwritten from the git tag at release. |
| `src/background.js` | Service worker (classic). Message router; owns rate fetching via `RatesLib`; injects content script; relays `apply`/`revert` to the tab. |
| `src/content.js` | Injected on demand (classic, IIFE, self-guarded against double-init). Tree-walk + convert, `MutationObserver`, revert. Uses `globalThis.CurrencyLib`. |
| `src/lib/currency.js` | Pure, dependency-free logic: symbol resolution, number normalization, conversion, `Intl` formatting, `translateText`. CJS + `globalThis.CurrencyLib`. |
| `src/lib/rates.js` | Fetch (primary + fallback), response validation, cache read/write. CJS + `globalThis.RatesLib`. |
| `src/popup.html` | Popup markup + styles. |
| `src/popup.js` | Currency picker, Translate / Revert buttons, rate freshness line. Talks only to `src/background.js`. |
| `assets/icon.svg` | Source icon art. |
| `icons/icon-{16,32,48,128}.png` | Generated from `assets/icon.svg`; committed. |
| `scripts/make-icons.mjs` | Rasterize `assets/icon.svg` → the four PNGs. |
| `scripts/sync-version.mjs` | `versionFromTag(tag)` + CLI that writes the version into `manifest.json`. |
| `scripts/publish-cws.mjs` | Upload + publish the zip to the Chrome Web Store; no-op (exit 0) when secrets are absent. |
| `scripts/get-refresh-token.mjs` | One-time local helper: OAuth loopback flow to mint `CWS_REFRESH_TOKEN`. |
| `test/currency.test.js` | Unit tests for `src/lib/currency.js`. |
| `test/rates.test.js` | Unit tests for `src/lib/rates.js` (fetch + storage mocked). |
| `test/sync-version.test.js` | Unit tests for `versionFromTag`. |
| `.github/workflows/ci.yml` | Lint + tests on PR / push to main. |
| `.github/workflows/release.yml` | On tag `v*.*.*`: version sync, icons, tests, zip, GitHub Release, CWS publish. |
| `.github/dependabot.yml` | Weekly updates for `github-actions` and `npm`. |
| `package.json` | Scripts + devDependencies (`sharp`, `web-ext`). No `"type"`. |
| `.gitignore` | `node_modules/`, `dist/`, `*.zip`, `.DS_Store`. |
| `LICENSE` | MIT. |
| `README.md` | What it is, install-from-source, how it works, attribution, contributing, license. |
| `PRIVACY.md` | Privacy statement (also pasted into the CWS "Privacy practices" tab). |
| `PUBLISHING.md` | One-time setup + recurring release flow. |
| _deleted:_ `popup.js`, `popup.html`, `content.js` (root) | Superseded by `src/**`. |

---

## Task 1: Project scaffolding & tooling

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE`
- Create: `test/smoke.test.js` (temporary, deleted at end of this task's last step)
- Create dirs (via the files placed in them in later tasks): `src/lib/`, `scripts/`, `icons/`, `assets/`, `.github/workflows/`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm ci` installs `sharp` + `web-ext`; `npm test` runs `node --test`; `npm run icons` / `npm run lint` exist.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "live-currency-translator",
  "version": "1.0.0",
  "private": true,
  "description": "Convert prices on any page to your preferred currency using live exchange rates.",
  "license": "MIT",
  "author": "horotat",
  "repository": { "type": "git", "url": "https://github.com/horotat/live-currency-translator.git" },
  "scripts": {
    "test": "node --test",
    "lint": "web-ext lint --source-dir . --ignore-files \"test/**\" \"scripts/**\" \"docs/**\" \".github/**\" \"assets/**\" \"*.md\" \"package*.json\"",
    "icons": "node scripts/make-icons.mjs",
    "build": "node scripts/sync-version.mjs && node scripts/make-icons.mjs"
  },
  "devDependencies": {
    "sharp": "^0.33.5",
    "web-ext": "^8.3.0"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
dist/
*.zip
.DS_Store
```

- [ ] **Step 3: Write `LICENSE`** (standard MIT text)

```
MIT License

Copyright (c) 2026 horotat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Write `test/smoke.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');

test('tooling smoke', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 5: Install and run**

Run: `npm install && npm test`
Expected: `sharp` and `web-ext` install; test output shows `tests 1`, `pass 1`, `fail 0`.

- [ ] **Step 6: Delete the smoke test**

Run: `rm test/smoke.test.js`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore LICENSE
git commit -m "chore: scaffold tooling (node:test, web-ext, sharp)"
```

---

## Task 2: `src/lib/currency.js` — pure conversion logic (TDD)

**Files:**
- Create: `src/lib/currency.js`
- Test: `test/currency.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces `globalThis.CurrencyLib` / `module.exports`:
  - `escapeRegExp(str: string) -> string`
  - `isValidCurrencyCode(code: any) -> boolean`
  - `normalizeAmount(raw: string) -> number` (`NaN` on failure)
  - `resolveCurrency(token: string, ctx: { lang?: string, host?: string }) -> string | null` (uppercase ISO code)
  - `convert(amount: number, from: string, to: string, rates: Record<string,number>) -> number` (`NaN` on failure)
  - `formatMoney(amount: number, code: string, locale?: string) -> string | null`
  - `translateText(text: string, opts: { rates: Record<string,number>, targetCurrency: string, lang?: string, host?: string, locale?: string }) -> string`

- [ ] **Step 1: Write the failing test file**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../src/lib/currency.js');

const RATES = { USD: 1, EUR: 0.5, JPY: 100, GBP: 0.8, SEK: 10, NOK: 11, CNY: 7 };

test('isValidCurrencyCode', () => {
  assert.equal(C.isValidCurrencyCode('USD'), true);
  assert.equal(C.isValidCurrencyCode('eur'), true);
  assert.equal(C.isValidCurrencyCode('US'), false);
  assert.equal(C.isValidCurrencyCode('ZZZ'), false);
  assert.equal(C.isValidCurrencyCode(42), false);
});

test('normalizeAmount handles US and EU formats', () => {
  assert.equal(C.normalizeAmount('1,234.56'), 1234.56);
  assert.equal(C.normalizeAmount('1.234,56'), 1234.56);
  assert.equal(C.normalizeAmount('1 234,56'), 1234.56);
  assert.equal(C.normalizeAmount('1234'), 1234);
  assert.equal(C.normalizeAmount('12.99'), 12.99);
  assert.equal(C.normalizeAmount('1,234'), 1234);   // ambiguous -> thousands
  assert.equal(C.normalizeAmount('1.234'), 1234);   // ambiguous -> thousands
  assert.equal(C.normalizeAmount('0.99'), 0.99);
  assert.ok(Number.isNaN(C.normalizeAmount('abc')));
});

test('resolveCurrency: codes, unambiguous symbols, ambiguous symbols', () => {
  assert.equal(C.resolveCurrency('USD', {}), 'USD');
  assert.equal(C.resolveCurrency('eur', {}), 'EUR');
  assert.equal(C.resolveCurrency('£', {}), 'GBP');
  assert.equal(C.resolveCurrency('$', {}), 'USD');                       // default
  assert.equal(C.resolveCurrency('$', { host: 'shop.example.ca' }), 'CAD');
  assert.equal(C.resolveCurrency('¥', {}), 'JPY');                       // default
  assert.equal(C.resolveCurrency('¥', { lang: 'zh-cn' }), 'CNY');
  assert.equal(C.resolveCurrency('kr', {}), 'SEK');                      // default
  assert.equal(C.resolveCurrency('kr', { host: 'x.example.no' }), 'NOK');
  assert.equal(C.resolveCurrency('QQQ', {}), null);
});

test('convert uses USD-based rates', () => {
  assert.equal(C.convert(10, 'USD', 'EUR', RATES), 5);
  assert.equal(C.convert(100, 'JPY', 'USD', RATES), 1);
  assert.ok(Number.isNaN(C.convert(1, 'USD', 'ZZZ', RATES)));
});

test('formatMoney: fraction digits per currency', () => {
  assert.equal(C.formatMoney(1234.5, 'USD', 'en-US'), '$1,234.50');
  assert.equal(C.formatMoney(1234.5, 'JPY', 'en-US'), '¥1,235');
  assert.equal(C.formatMoney(1, 'ZZZ', 'en-US'), null);
});

test('translateText: prefix and suffix, skips same currency, idempotent', () => {
  const o = { rates: RATES, targetCurrency: 'USD', lang: 'en-us', host: 'example.com', locale: 'en-US' };
  assert.equal(C.translateText('Price: €10.00 today', o), 'Price: $20.00 today');
  assert.equal(C.translateText('Costs 100 JPY only', o), 'Costs $1.00 only');
  assert.equal(C.translateText('Already $5.00', o), 'Already $5.00');            // from === target
  assert.equal(C.translateText(C.translateText('€10.00', o), o), '$20.00');      // idempotent
  assert.equal(C.translateText('Order #1234 shipped', o), 'Order #1234 shipped'); // no currency token
  assert.equal(C.translateText('Meet at 12:30 pm', o), 'Meet at 12:30 pm');
});

test('translateText: no-op when target rate missing', () => {
  const o = { rates: RATES, targetCurrency: 'ZZZ' };
  assert.equal(C.translateText('€10.00', o), '€10.00');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/currency.test.js`
Expected: FAIL — `Cannot find module '../src/lib/currency.js'`.

- [ ] **Step 3: Implement `src/lib/currency.js`**

```js
'use strict';

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Unambiguous symbol -> ISO 4217 code. */
const SYMBOL_TO_CODE = {
  '€': 'EUR', '£': 'GBP', '₩': 'KRW', '₹': 'INR', '₽': 'RUB', '₺': 'TRY',
  '₪': 'ILS', '฿': 'THB', '₴': 'UAH', '₱': 'PHP', '₫': 'VND',
  'US$': 'USD', 'A$': 'AUD', 'AU$': 'AUD', 'C$': 'CAD', 'CA$': 'CAD',
  'NZ$': 'NZD', 'HK$': 'HKD', 'S$': 'SGD', 'R$': 'BRL', 'MX$': 'MXN',
  'CHF': 'CHF', 'Kč': 'CZK', 'zł': 'PLN', 'RM': 'MYR', 'Rp': 'IDR',
};

/** Ambiguous symbol -> resolution rules. `byHost` keys are TLD/host suffixes. */
const AMBIGUOUS = {
  '$': {
    default: 'USD',
    byHost: { '.ca': 'CAD', '.au': 'AUD', '.nz': 'NZD', '.sg': 'SGD', '.hk': 'HKD', '.mx': 'MXN' },
    byLang: { 'en-ca': 'CAD', 'en-au': 'AUD', 'en-nz': 'NZD' },
  },
  '¥': {
    default: 'JPY',
    byHost: { '.cn': 'CNY', '.jp': 'JPY' },
    byLang: { 'zh': 'CNY', 'ja': 'JPY' },
  },
  'kr': {
    default: 'SEK',
    byHost: { '.no': 'NOK', '.dk': 'DKK', '.is': 'ISK', '.se': 'SEK' },
    byLang: { 'nb': 'NOK', 'nn': 'NOK', 'no': 'NOK', 'da': 'DKK', 'is': 'ISK', 'sv': 'SEK' },
  },
};

/** Symbols we scan for, longest first so `US$` wins over `$`. */
const SYMBOLS = [...Object.keys(SYMBOL_TO_CODE), ...Object.keys(AMBIGUOUS)]
  .sort((a, b) => b.length - a.length);

function isValidCurrencyCode(code) {
  if (typeof code !== 'string' || !/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(1);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Turn a human amount string into a Number.
 * Heuristics: if both separators present, the rightmost is the decimal mark.
 * A lone separator with exactly 3 trailing digits is treated as a thousands mark.
 */
function normalizeAmount(raw) {
  let s = String(raw).trim().replace(/[  \s]/g, '');
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // EU: 1.234,56
    } else {
      s = s.replace(/,/g, '');                    // US: 1,234.56
    }
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      s = s.replace(',', '.');                    // decimal comma: 12,99
    } else {
      s = s.replace(/,/g, '');                    // thousands: 1,234 / 1,234,567
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = s.replace(/\./g, '');                   // 1.234.567 -> thousands
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0] !== '0' && /^\d{1,3}$/.test(parts[0])) {
      s = s.replace(/\./g, '');                   // 1.234 -> thousands (EU)
    }
    // otherwise keep as decimal: 12.99 / 0.123
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function resolveCurrency(token, ctx) {
  if (typeof token !== 'string' || !token) return null;
  const ctxObj = ctx || {};
  const host = (ctxObj.host || '').toLowerCase();
  const lang = (ctxObj.lang || '').toLowerCase();

  if (/^[A-Za-z]{3}$/.test(token)) {
    const up = token.toUpperCase();
    return isValidCurrencyCode(up) ? up : null;
  }

  const amb = AMBIGUOUS[token];
  if (amb) {
    for (const suffix of Object.keys(amb.byHost)) {
      if (host.endsWith(suffix)) return amb.byHost[suffix];
    }
    for (const prefix of Object.keys(amb.byLang)) {
      if (lang === prefix || lang.startsWith(prefix + '-')) return amb.byLang[prefix];
    }
    return amb.default;
  }

  return SYMBOL_TO_CODE[token] || null;
}

function convert(amount, from, to, rates) {
  const rFrom = rates && rates[from];
  const rTo = rates && rates[to];
  if (!(typeof rFrom === 'number' && rFrom > 0) || !(typeof rTo === 'number' && rTo > 0)) return NaN;
  if (!Number.isFinite(amount)) return NaN;
  return (amount / rFrom) * rTo;
}

function formatMoney(amount, code, locale) {
  try {
    return new Intl.NumberFormat(locale || 'en-US', { style: 'currency', currency: code }).format(amount);
  } catch (_) {
    return null;
  }
}

// Bounded number pattern: grouped thousands OR a plain run, optional 1-2 decimals.
const NUM = '(\\d{1,3}(?:[.,\\u00A0\\u202F ]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
const SYM = '(?:' + SYMBOLS.map(escapeRegExp).join('|') + '|[A-Z]{3})';
const RE_PREFIX = new RegExp('(' + SYM + ')\\s?' + NUM, 'g');
const RE_SUFFIX = new RegExp(NUM + '\\s?(' + SYM + ')', 'g');

function translateText(text, opts) {
  if (typeof text !== 'string' || !text) return text;
  const o = opts || {};
  const rates = o.rates;
  const target = o.targetCurrency;
  if (!rates || !target || !(rates[target] > 0)) return text;
  const ctx = { lang: (o.lang || '').toLowerCase(), host: (o.host || '').toLowerCase() };
  const locale = o.locale || 'en-US';

  const sub = (whole, token, amountStr) => {
    const from = resolveCurrency(token, ctx);
    if (!from || !(rates[from] > 0) || from === target) return whole;
    const amount = normalizeAmount(amountStr);
    if (!Number.isFinite(amount)) return whole;
    const converted = convert(amount, from, target, rates);
    if (!Number.isFinite(converted)) return whole;
    const formatted = formatMoney(converted, target, locale);
    return formatted == null ? whole : formatted;
  };

  let out = text.replace(RE_PREFIX, (whole, token, amt) => sub(whole, token, amt));
  out = out.replace(RE_SUFFIX, (whole, amt, token) => sub(whole, token, amt));
  return out;
}

const api = {
  escapeRegExp, isValidCurrencyCode, normalizeAmount, resolveCurrency,
  convert, formatMoney, translateText,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.CurrencyLib = api;
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/currency.test.js`
Expected: PASS — all tests green. If `formatMoney(1234.5, 'JPY')` differs from `'¥1,235'` on the runner's ICU, adjust the assertion to the actual Node 20 output and note it in a comment (the behavior — zero fraction digits — is what matters).

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency.js test/currency.test.js
git commit -m "feat: add pure currency parsing/conversion library"
```

---

## Task 3: `src/lib/rates.js` — fetch, validate, cache (TDD)

**Files:**
- Create: `src/lib/rates.js`
- Test: `test/rates.test.js`

**Interfaces:**
- Consumes: nothing (fetch + storage injected).
- Produces `globalThis.RatesLib` / `module.exports`:
  - `validateRates(raw: object) -> Record<string,number>` (throws on garbage)
  - `getRates(deps: { storage: { get, set }, fetchImpl?: typeof fetch, now?: () => number }) -> Promise<{ rates: Record<string,number>, fetchedAt: number, source: string, stale: boolean }>`
  - Constants: `TTL_MS`, `PRIMARY_URL`, `FALLBACK_URL`, `CACHE_KEY`
- `storage` is the `chrome.storage.local` shape: `get(key, cb)` and `set(obj, cb)`.

- [ ] **Step 1: Write the failing test file**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../src/lib/rates.js');

function fakeStorage(initial) {
  let store = { ...(initial || {}) };
  return {
    get: (key, cb) => cb(key in store ? { [key]: store[key] } : {}),
    set: (obj, cb) => { store = { ...store, ...obj }; cb && cb(); },
    _dump: () => store,
  };
}

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

const OK_ERAPI = { result: 'success', base_code: 'USD', rates: { USD: 1, EUR: 0.9, JPY: 150, GBP: 0.8, SEK: 10 } };

test('validateRates drops junk, forces USD=1, needs >=5', () => {
  const v = R.validateRates({ USD: 1, EUR: 0.9, JPY: 150, GBP: 0.8, SEK: 10, BAD: -1, LOW: 'x', toolong: 2 });
  assert.equal(v.USD, 1);
  assert.equal(v.EUR, 0.9);
  assert.equal('BAD' in v, false);
  assert.equal('LOW' in v, false);
  assert.throws(() => R.validateRates({ USD: 1, EUR: 0.9 }));
});

test('getRates uses fresh cache without fetching', async () => {
  const now = () => 1_000_000;
  const storage = fakeStorage({
    [R.CACHE_KEY]: { rates: { USD: 1, EUR: 0.9, JPY: 1, GBP: 1, SEK: 1 }, fetchedAt: now(), source: 'cache' },
  });
  let called = false;
  const fetchImpl = () => { called = true; return jsonResponse(OK_ERAPI); };
  const out = await R.getRates({ storage, fetchImpl, now });
  assert.equal(called, false);
  assert.equal(out.stale, false);
  assert.equal(out.rates.EUR, 0.9);
});

test('getRates fetches when cache is stale and writes it back', async () => {
  const now = () => 10 * R.TTL_MS;
  const storage = fakeStorage({
    [R.CACHE_KEY]: { rates: { USD: 1, EUR: 1, JPY: 1, GBP: 1, SEK: 1 }, fetchedAt: 0, source: 'old' },
  });
  const fetchImpl = (url) => { assert.equal(url, R.PRIMARY_URL); return jsonResponse(OK_ERAPI); };
  const out = await R.getRates({ storage, fetchImpl, now });
  assert.equal(out.stale, false);
  assert.equal(out.rates.JPY, 150);
  assert.equal(storage._dump()[R.CACHE_KEY].rates.JPY, 150);
});

test('getRates falls back to secondary provider on primary failure', async () => {
  const storage = fakeStorage({});
  const fetchImpl = (url) => {
    if (url === R.PRIMARY_URL) return jsonResponse({}, false, 500);
    return jsonResponse({ base: 'USD', rates: { EUR: 0.9, JPY: 150, GBP: 0.8, SEK: 10 } });
  };
  const out = await R.getRates({ storage, fetchImpl, now: () => 0 });
  assert.equal(out.source, R.FALLBACK_URL);
  assert.equal(out.rates.USD, 1);
  assert.equal(out.rates.EUR, 0.9);
});

test('getRates returns stale cache when all providers fail', async () => {
  const now = () => 10 * R.TTL_MS;
  const storage = fakeStorage({
    [R.CACHE_KEY]: { rates: { USD: 1, EUR: 2, JPY: 2, GBP: 2, SEK: 2 }, fetchedAt: 0, source: 'old' },
  });
  const fetchImpl = () => jsonResponse({}, false, 503);
  const out = await R.getRates({ storage, fetchImpl, now });
  assert.equal(out.stale, true);
  assert.equal(out.rates.EUR, 2);
});

test('getRates throws when no cache and all providers fail', async () => {
  const storage = fakeStorage({});
  const fetchImpl = () => jsonResponse({}, false, 503);
  await assert.rejects(() => R.getRates({ storage, fetchImpl, now: () => 0 }));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/rates.test.js`
Expected: FAIL — `Cannot find module '../src/lib/rates.js'`.

- [ ] **Step 3: Implement `src/lib/rates.js`**

```js
'use strict';

const PRIMARY_URL = 'https://open.er-api.com/v6/latest/USD';
const FALLBACK_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';
const CACHE_KEY = 'ratesCache';
const TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

function validateRates(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('rates: not an object');
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (/^[A-Z]{3}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = v;
    }
  }
  if (!out.USD || Math.abs(out.USD - 1) > 1e-6) out.USD = 1;
  if (Object.keys(out).length < 5) throw new Error('rates: too few valid entries');
  return out;
}

function parseErApi(data) {
  if (!data || data.result !== 'success' || typeof data.rates !== 'object') {
    throw new Error('er-api: unexpected shape');
  }
  return data.rates;
}

function parseFrankfurter(data) {
  if (!data || typeof data.rates !== 'object') throw new Error('frankfurter: unexpected shape');
  return Object.assign({ USD: 1 }, data.rates);
}

function readCache(storage) {
  return new Promise((resolve) => {
    storage.get(CACHE_KEY, (obj) => resolve(obj && obj[CACHE_KEY] ? obj[CACHE_KEY] : null));
  });
}

function writeCache(storage, entry) {
  return new Promise((resolve) => {
    storage.set({ [CACHE_KEY]: entry }, () => resolve());
  });
}

async function fetchProvider(fetchImpl, url, parse, now) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, {
      signal: controller ? controller.signal : undefined,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const rates = validateRates(parse(data));
    return { rates, fetchedAt: now(), source: url, stale: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchFresh(fetchImpl, now) {
  try {
    return await fetchProvider(fetchImpl, PRIMARY_URL, parseErApi, now);
  } catch (primaryErr) {
    try {
      return await fetchProvider(fetchImpl, FALLBACK_URL, parseFrankfurter, now);
    } catch (fallbackErr) {
      throw new Error('rate providers failed: ' + primaryErr.message + ' / ' + fallbackErr.message);
    }
  }
}

async function getRates(deps) {
  const storage = deps.storage;
  const fetchImpl = deps.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const now = deps.now || Date.now;
  if (!fetchImpl) throw new Error('no fetch implementation available');

  const cached = await readCache(storage);
  if (cached && cached.rates && (now() - cached.fetchedAt) < TTL_MS) {
    return { rates: cached.rates, fetchedAt: cached.fetchedAt, source: cached.source, stale: false };
  }

  try {
    const fresh = await fetchFresh(fetchImpl, now);
    await writeCache(storage, fresh);
    return fresh;
  } catch (err) {
    if (cached && cached.rates) {
      return { rates: cached.rates, fetchedAt: cached.fetchedAt, source: cached.source, stale: true };
    }
    throw err;
  }
}

const api = {
  PRIMARY_URL, FALLBACK_URL, CACHE_KEY, TTL_MS,
  validateRates, getRates,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.RatesLib = api;
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/rates.test.js`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: `currency.test.js` + `rates.test.js` all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rates.js test/rates.test.js
git commit -m "feat: add rate fetching with validation, caching, and fallback"
```

---

## Task 4: `src/background.js` — service worker

**Files:**
- Create: `src/background.js`

**Interfaces:**
- Consumes: `globalThis.RatesLib.getRates`, `globalThis.CurrencyLib.isValidCurrencyCode` (via `importScripts`).
- Produces (message API for `src/popup.js`):
  - `{ type: 'listCurrencies' }` → `{ ok: true, codes: string[], fetchedAt: number, stale: boolean } | { ok: false, error: string }`
  - `{ type: 'translate', targetCurrency: string }` → `{ ok: true, replaced: number, fetchedAt: number, stale: boolean } | { ok: false, error: string }`
  - `{ type: 'revert' }` → `{ ok: true, reverted: number } | { ok: false, error: string }`
- Produces (message API sent to the tab, handled in Task 5):
  - `{ type: 'apply', targetCurrency: string, rates: Record<string,number> }` → `{ replaced: number }`
  - `{ type: 'revert' }` → `{ reverted: number }`

- [ ] **Step 1: Implement `src/background.js`**

```js
'use strict';

// Shared libraries. Paths are relative to this worker file (src/).
importScripts('./lib/rates.js', './lib/currency.js');

const localStorageArea = chrome.storage.local;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'listCurrencies') {
    RatesLib.getRates({ storage: localStorageArea })
      .then((r) => sendResponse({
        ok: true,
        codes: Object.keys(r.rates).sort(),
        fetchedAt: r.fetchedAt,
        stale: r.stale,
      }))
      .catch((e) => sendResponse({ ok: false, error: errMsg(e) }));
    return true;
  }

  if (msg.type === 'translate') {
    handleTranslate(msg.targetCurrency)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: errMsg(e) }));
    return true;
  }

  if (msg.type === 'revert') {
    handleRevert()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: errMsg(e) }));
    return true;
  }
});

async function handleTranslate(targetCurrency) {
  if (!CurrencyLib.isValidCurrencyCode(targetCurrency)) {
    return { ok: false, error: 'invalid currency code' };
  }
  const tabId = await activeTabId();
  if (!tabId) return { ok: false, error: 'no active tab' };

  const { rates, fetchedAt, stale } = await RatesLib.getRates({ storage: localStorageArea });
  if (!(rates[targetCurrency] > 0)) {
    return { ok: false, error: 'no rate for ' + targetCurrency };
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/lib/currency.js', 'src/content.js'],
  });

  const resp = await chrome.tabs.sendMessage(tabId, {
    type: 'apply',
    targetCurrency,
    rates,
  });

  return { ok: true, replaced: (resp && resp.replaced) || 0, fetchedAt, stale };
}

async function handleRevert() {
  const tabId = await activeTabId();
  if (!tabId) return { ok: false, error: 'no active tab' };
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'revert' });
    return { ok: true, reverted: (resp && resp.reverted) || 0 };
  } catch (_) {
    // Content script was never injected on this tab — nothing to revert.
    return { ok: true, reverted: 0 };
  }
}

async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] && tabs[0].id;
}

function errMsg(e) {
  return String((e && e.message) || e);
}
```

- [ ] **Step 2: Static sanity check**

Run: `node --check src/background.js`
Expected: no output (syntax OK). `importScripts` / `chrome` are undefined in Node but `--check` only parses.

- [ ] **Step 3: Commit**

```bash
git add src/background.js
git commit -m "feat: add service worker message router and injection flow"
```

---

## Task 5: `src/content.js` — DOM translation, observer, revert

**Files:**
- Create: `src/content.js`

**Interfaces:**
- Consumes: `globalThis.CurrencyLib.translateText` (co-injected `src/lib/currency.js`).
- Consumes messages: `{ type: 'apply', targetCurrency, rates }`, `{ type: 'revert' }`.
- Produces responses: `{ replaced: number }`, `{ reverted: number }`.

- [ ] **Step 1: Implement `src/content.js`**

```js
'use strict';

(() => {
  if (window.__currencyTranslatorInit) return;
  window.__currencyTranslatorInit = true;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
  const originals = new Map(); // Text node -> original nodeValue
  let observer = null;
  let state = null; // { targetCurrency, rates }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'apply') {
      state = { targetCurrency: msg.targetCurrency, rates: msg.rates };
      const replaced = translateTree(document.body);
      startObserver();
      window.addEventListener('pagehide', stopObserver, { once: true });
      sendResponse({ replaced });
      return;
    }
    if (msg.type === 'revert') {
      sendResponse({ reverted: revertAll() });
      return;
    }
  });

  function currentOpts() {
    return {
      rates: state.rates,
      targetCurrency: state.targetCurrency,
      lang: (document.documentElement.lang || navigator.language || '').toLowerCase(),
      host: location.hostname.toLowerCase(),
      locale: navigator.language || 'en-US',
    };
  }

  function acceptNode(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
    const parent = node.parentNode;
    if (!parent) return NodeFilter.FILTER_REJECT;
    if (SKIP_TAGS.has(parent.nodeName)) return NodeFilter.FILTER_REJECT;
    if (parent.nodeType === Node.ELEMENT_NODE && parent.isContentEditable) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }

  function translateNode(node, opts) {
    const next = CurrencyLib.translateText(node.nodeValue, opts);
    if (next === node.nodeValue) return false;
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    node.nodeValue = next;
    return true;
  }

  function translateTree(root) {
    if (!root || !state) return 0;
    const opts = currentOpts();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });
    const pending = [];
    let node;
    while ((node = walker.nextNode())) pending.push(node);
    let count = 0;
    for (const n of pending) if (translateNode(n, opts)) count++;
    return count;
  }

  function startObserver() {
    stopObserver();
    observer = new MutationObserver((mutations) => {
      if (!state) return;
      const opts = currentOpts();
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE) {
            if (acceptNode(added) === NodeFilter.FILTER_ACCEPT) translateNode(added, opts);
          } else if (added.nodeType === Node.ELEMENT_NODE) {
            translateTree(added);
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  function revertAll() {
    stopObserver();
    state = null;
    let count = 0;
    for (const [node, original] of originals) {
      try { node.nodeValue = original; count++; } catch (_) { /* node detached */ }
    }
    originals.clear();
    return count;
  }
})();
```

- [ ] **Step 2: Static sanity check**

Run: `node --check src/content.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/content.js
git commit -m "feat: add content script with tree-walk, MutationObserver, and revert"
```

---

## Task 6: `src/popup.html` + `src/popup.js`

**Files:**
- Create: `src/popup.html`
- Create: `src/popup.js`

**Interfaces:**
- Consumes: `chrome.runtime.sendMessage` with `listCurrencies` / `translate` / `revert` (Task 4). `chrome.storage.sync` key `targetCurrency`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write `src/popup.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { width: 320px; margin: 0; padding: 16px; background: #f9fafb; color: #1f2937;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    h2 { margin: 0 0 4px; font-size: 18px; color: #111827; }
    p { margin: 0 0 14px; font-size: 13px; line-height: 1.4; color: #4b5563; }
    .search-wrapper { position: relative; margin-bottom: 12px; }
    input[type="text"] { width: 100%; box-sizing: border-box; padding: 10px; font-size: 14px;
      border: 1px solid #d1d5db; border-radius: 8px; background: #fff; outline: none; }
    input[type="text"]:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.2); }
    .currency-list { position: absolute; left: 0; right: 0; top: 100%; margin-top: 4px; z-index: 10;
      max-height: 168px; overflow-y: auto; background: #fff; border: 1px solid #d1d5db;
      border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,.1); display: none; }
    .currency-list.show { display: block; }
    .currency-item { padding: 8px 12px; font-size: 14px; cursor: pointer; }
    .currency-item:hover, .currency-item.selected { background: #eff6ff; color: #1d4ed8; }
    .row { display: flex; gap: 8px; }
    button { flex: 1; padding: 11px; font-size: 14px; font-weight: 600; color: #fff;
      background: #3b82f6; border: none; border-radius: 8px; cursor: pointer; }
    button:hover { background: #2563eb; }
    button.secondary { background: #6b7280; }
    button.secondary:hover { background: #4b5563; }
    button:disabled { opacity: .5; cursor: default; }
    .status { margin-top: 10px; font-size: 12px; color: #6b7280; min-height: 16px; }
    .footer { margin-top: 12px; font-size: 11px; text-align: center; color: #9ca3af; }
    .footer a { color: #9ca3af; }
  </style>
</head>
<body>
  <h2>🌍 Currency Translator</h2>
  <p>Pick a currency, then convert the prices on the current tab.</p>

  <div class="search-wrapper">
    <input type="text" id="search" placeholder="Loading currencies…" autocomplete="off" disabled>
    <div id="dropdown" class="currency-list"></div>
  </div>

  <div class="row">
    <button id="translateBtn" disabled>Translate this page</button>
    <button id="revertBtn" class="secondary" type="button">Revert</button>
  </div>

  <div class="status" id="status"></div>
  <div class="footer">
    <span id="rateAge"></span><br>
    <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates by open.er-api.com</a>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `src/popup.js`**

```js
'use strict';

const els = {
  search: document.getElementById('search'),
  dropdown: document.getElementById('dropdown'),
  translateBtn: document.getElementById('translateBtn'),
  revertBtn: document.getElementById('revertBtn'),
  status: document.getElementById('status'),
  rateAge: document.getElementById('rateAge'),
};

let currencies = [];        // [{ code, label }]
let selected = 'USD';
let displayNames = null;
try { displayNames = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch (_) { /* older engines */ }

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function getSync(key) {
  return new Promise((resolve) => chrome.storage.sync.get(key, (o) => resolve(o[key])));
}

function labelFor(code) {
  let name = code;
  if (displayNames) { try { name = displayNames.of(code) || code; } catch (_) { /* keep code */ } }
  return code + ' — ' + name;
}

function setStatus(text, isError) {
  els.status.textContent = text;
  els.status.style.color = isError ? '#b91c1c' : '#6b7280';
}

function renderRateAge(fetchedAt, stale) {
  if (!fetchedAt) { els.rateAge.textContent = ''; return; }
  const mins = Math.round((Date.now() - fetchedAt) / 60000);
  const when = mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : Math.round(mins / 60) + ' h ago';
  els.rateAge.textContent = (stale ? 'Rates (offline copy) updated ' : 'Rates updated ') + when;
}

function renderDropdown(filter) {
  const q = (filter || '').toLowerCase();
  els.dropdown.innerHTML = '';
  for (const c of currencies) {
    if (q && !c.label.toLowerCase().includes(q)) continue;
    const div = document.createElement('div');
    div.className = 'currency-item' + (c.code === selected ? ' selected' : '');
    div.textContent = c.label;
    div.addEventListener('click', () => {
      selected = c.code;
      els.search.value = c.label;
      els.dropdown.classList.remove('show');
      chrome.storage.sync.set({ targetCurrency: selected });
    });
    els.dropdown.appendChild(div);
  }
}

function setSelectedLabel() {
  const match = currencies.find((c) => c.code === selected);
  if (match) els.search.value = match.label;
}

async function init() {
  selected = (await getSync('targetCurrency')) || 'USD';

  const meta = await send({ type: 'listCurrencies' });
  if (!meta || !meta.ok) {
    els.search.placeholder = 'Offline — cannot load currency list';
    setStatus((meta && meta.error) || 'Could not load rates', true);
    return;
  }

  currencies = meta.codes.map((code) => ({ code, label: labelFor(code) }));
  if (!currencies.some((c) => c.code === selected)) selected = 'USD';

  els.search.disabled = false;
  els.search.placeholder = 'Search (Euro, JPY, …)';
  els.translateBtn.disabled = false;
  setSelectedLabel();
  renderRateAge(meta.fetchedAt, meta.stale);
}

els.search.addEventListener('focus', () => {
  els.search.value = '';
  renderDropdown('');
  els.dropdown.classList.add('show');
});

els.search.addEventListener('input', (e) => {
  renderDropdown(e.target.value);
  els.dropdown.classList.add('show');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) {
    els.dropdown.classList.remove('show');
    setSelectedLabel();
  }
});

els.translateBtn.addEventListener('click', async () => {
  els.translateBtn.disabled = true;
  setStatus('Translating…');
  const res = await send({ type: 'translate', targetCurrency: selected });
  els.translateBtn.disabled = false;
  if (!res || !res.ok) {
    setStatus((res && res.error) || 'Translation failed', true);
    return;
  }
  setStatus('Converted ' + res.replaced + ' price' + (res.replaced === 1 ? '' : 's') + ' to ' + selected +
    (res.stale ? ' (offline rates)' : ''));
  renderRateAge(res.fetchedAt, res.stale);
});

els.revertBtn.addEventListener('click', async () => {
  setStatus('Reverting…');
  const res = await send({ type: 'revert' });
  setStatus(res && res.ok ? 'Restored ' + res.reverted + ' price' + (res.reverted === 1 ? '' : 's') : 'Nothing to revert');
});

init();
```

- [ ] **Step 3: Static sanity check**

Run: `node --check src/popup.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/popup.html src/popup.js
git commit -m "feat: add popup UI with searchable picker and revert"
```

---

## Task 7: Manifest, icons, and removal of legacy files

**Files:**
- Create: `manifest.json` (replaces the root one)
- Create: `assets/icon.svg`
- Create: `scripts/make-icons.mjs`
- Create: `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-128.png` (generated)
- Delete: `popup.js`, `popup.html`, `content.js` (root)

**Interfaces:**
- Consumes: `sharp` (devDependency from Task 1).
- Produces: a loadable unpacked extension.

- [ ] **Step 1: Write `assets/icon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="26" fill="#3b82f6"/>
  <path d="M40 44h34a14 14 0 0 1 0 28H50l14-14M88 84H54a14 14 0 0 1 0-28h24L64 70"
        fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 2: Write `scripts/make-icons.mjs`**

```js
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const svgPath = new URL('assets/icon.svg', root);
const outDir = new URL('icons/', root);

await mkdir(fileURLToPath(outDir), { recursive: true });
const svg = await readFile(svgPath);

for (const size of [16, 32, 48, 128]) {
  const out = fileURLToPath(new URL(`icon-${size}.png`, outDir));
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}
```

- [ ] **Step 3: Generate the icons**

Run: `npm run icons`
Expected: four `wrote …/icons/icon-*.png` lines; `ls icons` shows the four PNGs.

- [ ] **Step 4: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Live Currency Translator",
  "version": "0.0.0",
  "description": "Convert prices on any page to your preferred currency using live exchange rates.",
  "permissions": ["activeTab", "scripting", "storage"],
  "action": {
    "default_popup": "src/popup.html",
    "default_title": "Translate currencies on this page"
  },
  "background": {
    "service_worker": "src/background.js"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 5: Remove the legacy root files**

Run: `git rm popup.js popup.html content.js`
Expected: three deletions staged.

- [ ] **Step 6: Lint the extension**

Run: `npm run lint`
Expected: `web-ext lint` reports **0 errors**. Warnings about a missing `content_scripts` block or `activeTab` usage are acceptable. If any error appears, fix it before continuing.

- [ ] **Step 7: Manual load test (documented, run by the implementer)**

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → select the repo root.
2. Confirm the service worker registers with no errors (click "service worker" link → Console clean).
3. Open `https://www.bbc.com/news` or any page with `$`/`€` prices, click the extension icon, pick `EUR`, click **Translate this page**. Prices change; status shows a count.
4. Click **Revert**. Prices return to the originals.
5. Scroll a lazy-loading page (e.g. an infinite-scroll shop) after translating; newly loaded prices also convert.

- [ ] **Step 8: Commit**

```bash
git add manifest.json assets/icon.svg scripts/make-icons.mjs icons/
git commit -m "feat: add MV3 manifest, generated icons, and remove legacy root files"
```

---

## Task 8: Release/build scripts

**Files:**
- Create: `scripts/sync-version.mjs`
- Create: `scripts/publish-cws.mjs`
- Create: `scripts/get-refresh-token.mjs`
- Test: `test/sync-version.test.js`

**Interfaces:**
- `scripts/sync-version.mjs` exports `versionFromTag(tag: string) -> string` (throws on non-`x.y.z`). As a CLI it writes `manifest.json`'s `version`.
- `scripts/publish-cws.mjs`: CLI `node scripts/publish-cws.mjs <zipPath>`. Reads env `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `EXTENSION_ID`. Exits `0` with a notice if any is missing.
- `scripts/get-refresh-token.mjs`: CLI `node scripts/get-refresh-token.mjs <client_id> <client_secret>`; prints `CWS_REFRESH_TOKEN=…`.

- [ ] **Step 1: Write the failing test `test/sync-version.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert');

test('versionFromTag parses vX.Y.Z and rejects the rest', async () => {
  const { versionFromTag } = await import('../scripts/sync-version.mjs');
  assert.equal(versionFromTag('v1.2.3'), '1.2.3');
  assert.equal(versionFromTag('2.0.0'), '2.0.0');
  assert.throws(() => versionFromTag('v1.2'));
  assert.throws(() => versionFromTag('release-1'));
  assert.throws(() => versionFromTag(''));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/sync-version.test.js`
Expected: FAIL — `Cannot find module '../scripts/sync-version.mjs'`.

- [ ] **Step 3: Write `scripts/sync-version.mjs`**

```js
export function versionFromTag(tag) {
  const v = String(tag || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`invalid version tag: "${tag}"`);
  return v;
}

// CLI: node scripts/sync-version.mjs [tag]  (falls back to $GITHUB_REF_NAME)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
  const version = versionFromTag(tag);
  const manifestUrl = new URL('../manifest.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  manifest.version = version;
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest.json version -> ${version}`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/sync-version.test.js`
Expected: PASS.

- [ ] **Step 5: Write `scripts/publish-cws.mjs`**

```js
import { readFile } from 'node:fs/promises';

const [zipPath] = process.argv.slice(2);
const { CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, EXTENSION_ID } = process.env;

if (!zipPath) {
  console.error('usage: node scripts/publish-cws.mjs <zipPath>');
  process.exit(1);
}
if (!CWS_CLIENT_ID || !CWS_CLIENT_SECRET || !CWS_REFRESH_TOKEN || !EXTENSION_ID) {
  console.log('Chrome Web Store secrets not set — skipping publish step (this is expected before first-time setup).');
  process.exit(0);
}

const token = await accessToken();
await uploadPackage(token);
await publishItem(token);
console.log('Uploaded and submitted to the Chrome Web Store. Google review is pending.');

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CWS_CLIENT_ID,
      client_secret: CWS_CLIENT_SECRET,
      refresh_token: CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) throw new Error('token exchange failed: ' + JSON.stringify(body));
  return body.access_token;
}

async function uploadPackage(token) {
  const zip = await readFile(zipPath);
  const res = await fetch(`https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2' },
    body: zip,
  });
  const body = await res.json();
  if (!res.ok || body.uploadState === 'FAILURE') {
    throw new Error('CWS upload failed: ' + JSON.stringify(body));
  }
  console.log('upload state:', body.uploadState);
}

async function publishItem(token) {
  const res = await fetch(`https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-goog-api-version': '2', 'Content-Length': '0' },
  });
  const body = await res.json();
  if (!res.ok) throw new Error('CWS publish failed: ' + JSON.stringify(body));
  console.log('publish status:', (body.status || []).join(', ') || 'OK');
}
```

- [ ] **Step 6: Write `scripts/get-refresh-token.mjs`**

```js
import http from 'node:http';

const CLIENT_ID = process.argv[2] || process.env.CWS_CLIENT_ID;
const CLIENT_SECRET = process.argv[3] || process.env.CWS_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('usage: node scripts/get-refresh-token.mjs <client_id> <client_secret>');
  process.exit(1);
}

const PORT = 3000;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
authUrl.search = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
}).toString();

console.log('\n1. Open this URL, pick your developer account, and approve:\n');
console.log(authUrl.toString() + '\n');

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) { res.statusCode = 400; res.end('No ?code in redirect.'); return; }
  res.end('Received. You can close this tab and return to the terminal.');
  server.close();

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    }),
  });
  const body = await tokenRes.json();
  if (body.refresh_token) {
    console.log('\nAdd this to your GitHub repo secrets:\n');
    console.log('CWS_REFRESH_TOKEN=' + body.refresh_token + '\n');
  } else {
    console.error('\nNo refresh_token returned. Full response:\n', body);
    process.exit(1);
  }
});

server.listen(PORT, () => console.log(`2. Waiting for the redirect on ${REDIRECT} …`));
```

- [ ] **Step 7: Sanity-check the scripts parse**

Run: `for f in scripts/*.mjs; do node --check "$f" && echo "ok $f"; done`
Expected: `ok scripts/get-refresh-token.mjs`, `ok scripts/make-icons.mjs`, `ok scripts/publish-cws.mjs`, `ok scripts/sync-version.mjs`.

- [ ] **Step 8: Verify the skip path of the publish script**

Run: `node scripts/publish-cws.mjs dist/whatever.zip`
Expected: prints `Chrome Web Store secrets not set — skipping publish step …` and exits `0`.

- [ ] **Step 9: Commit**

```bash
git add scripts/sync-version.mjs scripts/publish-cws.mjs scripts/get-refresh-token.mjs test/sync-version.test.js
git commit -m "feat: add version-sync, CWS publish, and refresh-token scripts"
```

---

## Task 9: GitHub Actions + Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/dependabot.yml`

**Interfaces:**
- Consumes: `package.json` scripts, `scripts/*.mjs`, repo secrets `EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
- Produces: CI status checks; a GitHub Release + CWS submission per `v*.*.*` tag.

**Note on action pinning:** first-party `actions/*` are referenced at the `@v4` major tag and kept current by Dependabot. The Chrome Web Store step calls our own `scripts/publish-cws.mjs` over `curl`-free `fetch`, so there is **no third-party action** in the release path to pin.

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
      - run: npm ci
      - run: node --test
      - run: npm run icons
      - name: Fail if icons changed (regenerate and commit them)
        run: git diff --exit-code -- icons/
      - run: npm run lint
```

- [ ] **Step 2: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ['v*.*.*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - run: npm ci
      - run: node --test

      - name: Sync manifest version from tag
        run: node scripts/sync-version.mjs "${GITHUB_REF_NAME}"

      - name: Regenerate icons
        run: npm run icons

      - name: Lint packaged extension
        run: npm run lint

      - name: Build zip
        run: |
          mkdir -p dist
          zip -r "dist/live-currency-translator-${GITHUB_REF_NAME}.zip" \
            manifest.json src icons LICENSE PRIVACY.md README.md

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "${GITHUB_REF_NAME}" \
          "dist/live-currency-translator-${GITHUB_REF_NAME}.zip" \
          --generate-notes

      - name: Publish to Chrome Web Store
        env:
          EXTENSION_ID: ${{ secrets.EXTENSION_ID }}
          CWS_CLIENT_ID: ${{ secrets.CWS_CLIENT_ID }}
          CWS_CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
          CWS_REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
        run: node scripts/publish-cws.mjs "dist/live-currency-translator-${GITHUB_REF_NAME}.zip"
```

- [ ] **Step 3: Write `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
```

- [ ] **Step 4: Validate YAML parses**

Run: `node -e "for (const f of ['.github/workflows/ci.yml','.github/workflows/release.yml','.github/dependabot.yml']) { const s=require('fs').readFileSync(f,'utf8'); if(!s.includes('\t')) console.log('ok',f); else throw new Error('tab in '+f); }"`
Expected: three `ok` lines (a lightweight check; full YAML lint happens once pushed to GitHub).

- [ ] **Step 5: Commit**

```bash
git add .github/
git commit -m "ci: add CI, tag-triggered release, and Dependabot"
```

---

## Task 10: Documentation

**Files:**
- Create: `README.md`
- Create: `PRIVACY.md`
- Create: `PUBLISHING.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Write `README.md`**

````markdown
# Live Currency Translator

A Chrome extension (Manifest V3) that converts the prices shown on any web page
into your preferred currency, using live exchange rates.

## How it works

- Click the toolbar icon and pick a target currency.
- The extension asks for one-time access to the **current tab only**
  (`activeTab`) and injects a small script that rewrites currency amounts in the
  page's text.
- A `MutationObserver` keeps converting prices that load in later (infinite
  scroll, single-page apps).
- **Revert** restores every original value.

Exchange rates are fetched once and cached for 6 hours in local extension
storage. The only network request is an unauthenticated
`GET https://open.er-api.com/v6/latest/USD` (fallback:
`https://api.frankfurter.dev`). No account, no API key, no tracking — see
[PRIVACY.md](PRIVACY.md).

## Install from source

```bash
git clone https://github.com/horotat/live-currency-translator.git
cd live-currency-translator
npm install
npm run icons
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select this folder.

## Develop

```bash
npm test      # node:test unit tests
npm run lint  # web-ext lint
```

Extension code in `src/` is dependency-free vanilla JS with no build step. The
only tooling (`sharp`, `web-ext`) is for icons and linting.

- `src/lib/currency.js` — parsing, symbol resolution, conversion, formatting (pure, unit-tested)
- `src/lib/rates.js` — fetch + validate + cache (unit-tested with mocks)
- `src/background.js` — service worker: owns all network access, injects the content script
- `src/content.js` — DOM walk, observer, revert
- `src/popup.*` — UI

## Releasing

See [PUBLISHING.md](PUBLISHING.md). Once set up: `npm version patch && git push --follow-tags`.

## Credits

Rates by [open.er-api.com](https://www.exchangerate-api.com).

## License

MIT — see [LICENSE](LICENSE).
````

- [ ] **Step 2: Write `PRIVACY.md`**

```markdown
# Privacy Policy — Live Currency Translator

_Last updated: 2026-08-31_

## What the extension stores

- **Your preferred currency code** (e.g. `EUR`), saved with `chrome.storage.sync`
  so it follows your Chrome profile.
- **A cached copy of exchange rates**, saved with `chrome.storage.local` and
  refreshed at most once every 6 hours.

Both stay on your device / in your Chrome sync account. Neither is transmitted
to the developer.

## What the extension sends

One HTTP request, only when rates need refreshing:

- `GET https://open.er-api.com/v6/latest/USD` (fallback:
  `GET https://api.frankfurter.dev/v1/latest?base=USD`)

These requests contain **no** query parameters, cookies, identifiers, page URLs,
or personal data. They are anonymous rate lookups.

## What the extension does NOT do

- No analytics, telemetry, or crash reporting.
- No ads, no affiliate links, no injected marketing.
- No selling or sharing of data (there is no data to sell).
- No access to any tab until you click the toolbar icon on that tab
  (`activeTab`). The extension declares **no** host permissions.

## Contact

Open an issue at https://github.com/horotat/live-currency-translator/issues.
```

- [ ] **Step 3: Write `PUBLISHING.md`**

````markdown
# Publishing

## One-time setup (about 20–30 minutes; only you can do these)

### 1. Chrome Web Store developer account
- Go to https://chrome.google.com/webstore/devconsole and pay the one-time **$5**
  registration fee. This covers your whole account, not each extension.

### 2. First manual upload
- `npm run icons`
- Zip the runtime files:
  ```bash
  zip -r upload.zip manifest.json src icons LICENSE PRIVACY.md README.md
  ```
- In the developer console: **New item** → upload `upload.zip`.
- Fill in the store listing: description, at least one 1280×800 screenshot,
  category (**Productivity** or **Shopping**), language.
- In the **Privacy practices** tab: declare a single purpose ("convert prices on
  the current page to the user's preferred currency"), justify `activeTab`,
  `scripting`, `storage`, tick "does not sell or transfer user data", and paste
  the URL of `PRIVACY.md`.
- Save the draft (you can publish this first version by hand, or let the CI do it
  on the next tag).
- Copy the **Item ID** from the URL — that is `EXTENSION_ID`.

### 3. Chrome Web Store API credentials
- https://console.cloud.google.com → create a project.
- **APIs & Services → Library** → enable **Chrome Web Store API**.
- **APIs & Services → OAuth consent screen** → External → add yourself as a test
  user.
- **Credentials → Create credentials → OAuth client ID → Desktop app**. Note the
  **Client ID** and **Client secret**.
- Mint a refresh token locally:
  ```bash
  node scripts/get-refresh-token.mjs <client_id> <client_secret>
  ```
  Open the printed URL, approve, and copy the `CWS_REFRESH_TOKEN=…` line.

### 4. GitHub repository secrets
`Settings → Secrets and variables → Actions → New repository secret`, four times:

| Name | Value |
|---|---|
| `EXTENSION_ID` | the Item ID from step 2 |
| `CWS_CLIENT_ID` | OAuth client ID from step 3 |
| `CWS_CLIENT_SECRET` | OAuth client secret from step 3 |
| `CWS_REFRESH_TOKEN` | from `get-refresh-token.mjs` |

Until all four exist, the release workflow still runs and still creates the
GitHub Release — it just skips the store upload with a notice.

### 5. Create the repo (if not done yet)
```bash
gh repo create horotat/live-currency-translator --public --source . --push
```

## Every release after that

```bash
npm version patch      # 1.0.0 -> 1.0.1, creates a git tag
git push --follow-tags
```

The `Release` workflow then: runs tests, writes the tag's version into
`manifest.json`, rebuilds icons, lints, zips, creates a GitHub Release, and
uploads + submits to the Chrome Web Store. Google review typically takes a few
hours to a few days.

## Manual QA checklist before tagging

- [ ] Amazon product page: prices convert, `$`/`€`/`£` all handled.
- [ ] A `.de` or `.fr` retailer: `1.234,56 €` parses correctly.
- [ ] An infinite-scroll page: prices loaded after translating still convert.
- [ ] Revert restores originals exactly.
- [ ] JPY / KRW targets show no decimal places.
- [ ] Offline (DevTools → Network → Offline) after one online run: still converts
      using the cached rates, popup notes "offline rates".
````

- [ ] **Step 4: Commit**

```bash
git add README.md PRIVACY.md PUBLISHING.md
git commit -m "docs: add README, privacy policy, and publishing guide"
```

---

## Final verification (run after all tasks)

- [ ] `npm ci && npm test` — all suites pass.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run icons && git diff --exit-code -- icons/` — icons reproducible.
- [ ] Manual load test from Task 7, Step 7 passes end to end.
- [ ] `git log --oneline` shows one commit per task, Conventional Commit style.
- [ ] No `popup.js` / `popup.html` / `content.js` at repo root; all logic under `src/`.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Architecture table (worker / content / popup / currency.js / rates.js / tests / icons) → Tasks 2–7. ✔
- Translate + revert data flows → Tasks 4 (`handleTranslate`/`handleRevert`) & 5. ✔
- Rate source primary + fallback, validation rules (HTTPS, timeout, shape, finite > 0, USD=1, min count) → Task 3 `rates.js` + tests. ✔
- Security hardening items 1–11 → `activeTab`-only manifest (Task 7), fetch in worker (Task 4), validation (Task 3), currency-code check before `Intl` (Task 2 `isValidCurrencyCode`, used in Task 4), `nodeValue`-only writes + bounded regex + escaped symbols (Task 2/5), observer disconnect on revert/`pagehide` (Task 5), JPY/KRW zero-decimal via `Intl` defaults + ambiguous `kr`/`¥` resolution (Task 2), `PRIVACY.md` (Task 10), Dependabot + least-privilege workflow `permissions:` (Task 9). ✔
- Manifest shape → Task 7 matches the spec (note: spec showed `"type": "module"`; plan deliberately uses a **classic** worker with `importScripts` — recorded in Global Constraints and Task 4 — because the shared lib must also load via co-injection and `require`, and a classic worker avoids a bundler). ✔ (intentional deviation, documented)
- Repo layout → Tasks 1/7/8/9/10 create every path in the spec's tree; `options.html` correctly absent (folded into popup per spec non-goals). ✔
- CI (`ci.yml`) and tag release (`release.yml`) behavior, one-time manual steps, recurring `npm version` flow → Tasks 9 & 10. ✔
- Testing strategy (number formats, zero-decimal, ambiguous symbols, round-trips, non-matches, cache reuse/refetch/malformed/timeout) → Task 2 & Task 3 test files. ✔
- Deferred decisions: CWS mechanism → resolved to own `publish-cws.mjs` (Task 8); icon design → simple glyph SVG (Task 7); `frankfurter` fallback → shipped in v1 (Task 3). ✔

**Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N" — every code step contains full code. ✔

**Type consistency:** `CurrencyLib` / `RatesLib` method names and signatures in Tasks 4–6 match their definitions in Tasks 2–3 (`getRates({storage,fetchImpl,now})`, `isValidCurrencyCode`, `translateText(text, opts)`); message shapes (`listCurrencies`→`{ok,codes,fetchedAt,stale}`, `translate`→`{ok,replaced,fetchedAt,stale}`, `apply`→`{replaced}`, `revert`→`{reverted}`) are identical across background, popup, and content. ✔
