# Contributing

## Reporting an issue

Open an issue: https://github.com/horotat/live-currency-translator/issues/new/choose

Pick the right template:

- **Prices on a site don't convert** — a specific page where amounts stay in the
  original currency, or convert to the wrong number. This is the most common
  report and almost always means the site uses an unusual price layout.
- **Bug report** — the popup, revert, install, or the service worker misbehaves.
- **Feature request** — an improvement.

For anything security-related, use
[private advisories](https://github.com/horotat/live-currency-translator/security/advisories/new),
not a public issue.

### What makes a report actionable

1. **A real URL.** A product page, not the homepage. "Amazon doesn't work" can't
   be reproduced; `https://www.amazon.de/dp/B0XXXXXXX` can.
2. **The target currency** you selected in the popup.
3. **The price text, quoted exactly** as the page shows it — `€ 149​99`,
   `1.234,56 kr`, `USD 1,299.00`. Separators and spacing matter.
4. **A screenshot.** Before/after is ideal.
5. **The quick checks** from the template: you ran it on that exact page, the
   popup showed no error, and `chrome://extensions → Errors` is empty.

### Known limitation

Split-price widgets (currency symbol, whole number and cents in separate page
elements) need per-pattern support. Amazon's `.a-price` is handled. Other
retailers with their own split markup have to be added one at a time — a good
report with the URL and the surrounding HTML is what makes that possible.

## Working on the code

```bash
npm install
npm test        # node:test unit tests
npm run lint     # manifest security check + syntax check
npm run icons    # regenerate icons/*.png from assets/icon.svg
```

- The shipped extension (`src/**`) has **no runtime dependencies** and no build
  step. Keep it that way.
- `src/lib/currency.js` and `src/lib/rates.js` are loaded three ways (service
  worker `importScripts`, page co-injection, Node `require`), so they must stay
  plain scripts wrapped in an IIFE that only assigns `globalThis.<Name>`.
- Every logic change needs a test. Number-format and site-layout fixes
  especially — add the failing case first.
- `scripts/check-manifest.mjs` fails the build if the permission set ever grows
  beyond `activeTab`, `scripting`, `storage`. That's deliberate; don't relax it
  without a discussion.

## Pull requests

Small, focused, with tests. CI must be green. Conventional Commit messages
(`fix:`, `feat:`, `docs:`, …).
