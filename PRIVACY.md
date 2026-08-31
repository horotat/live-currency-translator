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
