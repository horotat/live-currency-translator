// One-shot: read a downloaded Google OAuth "Desktop app" client JSON, mint a
// Chrome Web Store refresh token via the loopback flow, and push all three
// values straight into GitHub repo secrets. Nothing sensitive is printed to the
// terminal; the JSON file is deleted at the end.
//
//   node scripts/setup-cws-secrets.mjs ~/Downloads/client_secret_XXXX.json
//
// Prereqs: `gh` authenticated with repo access, and EXTENSION_ID already set as
// a repo secret (done separately).

import http from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const REPO = 'horotat/live-currency-translator';
const PORT = 3000;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('usage: node scripts/setup-cws-secrets.mjs <path-to-client_secret_*.json>');
  process.exit(1);
}

const parsed = JSON.parse(await readFile(jsonPath, 'utf8'));
const cfg = parsed.installed || parsed.web || parsed;
const CLIENT_ID = cfg.client_id;
const CLIENT_SECRET = cfg.client_secret;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('could not find client_id / client_secret in that JSON');
  process.exit(1);
}

const authUrl = 'https://accounts.google.com/o/oauth2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
});

console.log('\n1. Open this URL and approve. You will see a "Google hasn\'t verified');
console.log('   this app" screen — click Advanced, then "Go to Live Currency');
console.log('   Translator (unsafe)". It is your own app.\n');
console.log(authUrl + '\n');

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const c = new URL(req.url, REDIRECT).searchParams.get('code');
    res.end(c ? 'Done. Return to the terminal.' : 'No code in redirect.');
    server.close();
    c ? resolve(c) : reject(new Error('no ?code in redirect'));
  });
  server.listen(PORT, () => console.log(`2. Waiting for the redirect on ${REDIRECT} ...`));
  setTimeout(() => { server.close(); reject(new Error('timed out after 5 minutes')); }, 300_000);
});

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
const tok = await tokenRes.json();
if (!tok.refresh_token) {
  console.error('token exchange did not return a refresh_token (HTTP ' + tokenRes.status + ').');
  console.error('If it says invalid_grant, the OAuth consent screen is still in "Testing".');
  process.exit(1);
}

function setSecret(name, value) {
  execFileSync('gh', ['secret', 'set', name, '--repo', REPO], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  console.log('   set ' + name);
}

console.log('\n3. Writing GitHub repo secrets (values piped via stdin, never printed):');
setSecret('CWS_CLIENT_ID', CLIENT_ID);
setSecret('CWS_CLIENT_SECRET', CLIENT_SECRET);
setSecret('CWS_REFRESH_TOKEN', tok.refresh_token);

await rm(jsonPath, { force: true });
console.log('\n4. Deleted ' + jsonPath);
console.log('\nDone. CWS_CLIENT_ID, CWS_CLIENT_SECRET and CWS_REFRESH_TOKEN are set');
console.log('(EXTENSION_ID was set earlier). Automated publishing is ready.');
