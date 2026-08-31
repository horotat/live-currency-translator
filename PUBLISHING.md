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
`manifest.json`, rebuilds icons, validates, zips, creates a GitHub Release, and
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
