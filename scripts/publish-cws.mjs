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
