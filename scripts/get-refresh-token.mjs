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
