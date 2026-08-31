# Chrome Web Store listing — copy/paste content

Fields marked **(required)** must be filled before "Submit for review" is enabled.

---

## Store listing tab

### Title (required) — auto-filled from the package
`Live Currency Translator`

### Summary — auto-filled from the package
`Convert prices on any page to your preferred currency using live exchange rates.`

### Description (required)

```
Live Currency Translator rewrites the prices on any web page into the currency
you actually think in, using live exchange rates.

How it works
1. Click the toolbar icon and choose your currency.
2. Press "Translate this page" — prices are converted in place.
3. Press "Revert" to restore the originals exactly.

It also keeps converting prices that appear after you scroll: infinite-scroll
shops, single-page apps, and Amazon's lazy-loaded price widgets.

Private by design
- No host permissions. The extension can read a page only after you click the
  icon on that tab (activeTab), and that access ends when you navigate away.
- No analytics, no accounts, nothing sold. The only network request is an
  anonymous lookup of exchange rates.
- Rates are cached locally for six hours, with a European Central Bank fallback
  source.

Good to know
- More than 20 currencies use the "$" sign. When a page shows "$" with no
  country code, the extension assumes US dollars (it uses the site's domain and
  language as hints). Prices labelled "CAD $", "A$", "AUD 12.00" etc. convert
  correctly. Same idea for a bare "kr" (assumed SEK) and "¥" (assumed JPY).
- Exchange rates update about once a day and are cached for six hours. This is
  for everyday reference, not trading.

Open source (MIT), zero third-party dependencies. Full code, privacy policy and
issue tracker on GitHub:
https://github.com/horotat/live-currency-translator
```

### Category (required)
`Shopping`  (second choice: `Productivity`)

### Language (required)
`English (United States)`

---

## Graphic assets

| Asset | Requirement | File to upload |
|---|---|---|
| Store icon (required) | 128×128 PNG | `icons/icon-128.png` |
| Screenshots (required, ≥1) | 1280×800 PNG, no alpha | `store-assets/screenshot-1.png`, `store-assets/screenshot-2.png` |
| Small promo tile (optional) | 440×280 PNG, no alpha | `store-assets/small-promo-tile.png` |
| Marquee promo tile (optional) | 1400×560 | — skip |
| Global promo video (optional) | YouTube URL | — skip |

---

## Additional fields

| Field | Value |
|---|---|
| Official URL (optional) | `ali.mk` if you want it verified on the listing, otherwise `None` |
| Homepage URL (optional) | `https://ali.mk/live-currency-translator/` once GitHub Pages is serving; until then `https://github.com/horotat/live-currency-translator` |
| Support URL (optional) | `https://github.com/horotat/live-currency-translator/issues` |
| Mature content | Off |

---

## Privacy practices tab (all required to submit)

### Single purpose

```
Convert the monetary amounts displayed on the web page the user is viewing into
a target currency the user selects, using publicly published exchange-rate data.
```

### Permission justifications

**activeTab**
```
Used only when the user clicks the extension's toolbar button. It grants
temporary access to the current tab so the extension can read the visible price
text and replace it with the converted amount. No access is retained after the
user navigates away.
```

**scripting**
```
Used to inject the conversion script into the current tab on demand
(chrome.scripting.executeScript) when the user clicks the toolbar button. No
script is injected automatically or on any page the user has not acted on.
```

**storage**
```
Stores two things locally: the user's chosen target currency
(chrome.storage.sync) and a cached copy of exchange rates refreshed at most once
every six hours (chrome.storage.local). Neither is transmitted anywhere.
```

**Remote code**: **No.**
```
All executable code ships inside the package. The extension fetches only JSON
exchange-rate data from open.er-api.com (fallback: api.frankfurter.dev); that
data is parsed as numbers and never executed.
```

### Data usage

For every data category (personally identifiable info, health, financial,
authentication, personal communications, location, web history, user activity,
website content): **not collected**.

Note on "website content": the extension reads price text on the current page in
order to modify it, but that text is processed locally and is never stored or
transmitted, so nothing is collected.

Tick all three certifications:
- I do not sell or transfer user data to third parties, apart from the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL (required)
`https://github.com/horotat/live-currency-translator/blob/main/PRIVACY.md`

---

## Distribution tab

| Field | Value |
|---|---|
| Visibility | Public |
| Pricing | Free |
| Regions | All regions |

---

## After submitting

- Review is usually a few hours to a few days for an extension this small.
- First-time developers may get an extra identity-verification step and a trust
  delay before the listing is publicly visible.
- Copy the **Item ID** from the dashboard URL — it's the `EXTENSION_ID` secret
  the release pipeline needs.
