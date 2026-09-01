# Security Policy

## Reporting a vulnerability

Please report security issues **privately** through
[GitHub Security Advisories](https://github.com/horotat/live-currency-translator/security/advisories/new)
— not as a public issue.

You can expect an initial response within a few days. Once a fix is ready it
ships as a patch release and the advisory is published with credit (unless you
prefer to stay anonymous).

## Scope

This is a client-only Manifest V3 extension with no backend.

In scope:

- The content script (`src/content.js`) and its DOM manipulation
- The service worker (`src/background.js`) and how it handles rate-API responses
- The popup (`src/popup.*`)
- The parsing/validation logic in `src/lib/`
- The release pipeline (`.github/workflows/`, `scripts/`)

Design choices that are intentional (not vulnerabilities):

- The extension holds only `activeTab`, `scripting`, and `storage`. It has **no**
  host permissions and injects nothing until the user clicks the toolbar icon.
  `scripts/check-manifest.mjs` fails the build if that ever changes.
- Text is replaced via `Node.nodeValue` only — never `innerHTML`. Rate-API
  responses are validated to be finite positive numbers and are never executed
  or inserted as markup.
- The only network request is an unauthenticated `GET .../latest/USD` to
  `open.er-api.com` (fallback `api.frankfurter.dev`). No user data is sent.

## Supported versions

The latest published version is the only one supported. Older versions are not
patched.
