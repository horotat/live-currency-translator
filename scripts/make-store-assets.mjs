// Renders the Chrome Web Store screenshots to PNG (1280x800, no alpha).
// Run locally: `node scripts/make-store-assets.mjs`. Output is committed.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const outDir = new URL('../store-assets/', import.meta.url);
await mkdir(fileURLToPath(outDir), { recursive: true });

const W = 1280;
const H = 800;

// Break a string into <= 2 lines at word boundaries (~58 chars/line).
function wrap2(text, limit = 56) {
  const words = text.split(' ');
  let a = '';
  let i = 0;
  while (i < words.length && (a + ' ' + words[i]).trim().length <= limit) {
    a = (a + ' ' + words[i]).trim();
    i++;
  }
  return [a, words.slice(i).join(' ')];
}

const COINS = `
  <g transform="translate(0,0)">
    <rect width="52" height="52" rx="12" fill="#2563eb"/>
    <circle cx="38" cy="16" r="9" fill="#bfdbfe" stroke="#1e40af" stroke-width="1.6"/>
    <path d="M41 12a4.5 4.5 0 1 0 0 7M33 14h5M33 17h4" fill="none" stroke="#1d4ed8" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="22" cy="31" r="18" fill="#fff" stroke="#1e40af" stroke-width="2.4"/>
    <path d="M22 20v22" stroke="#2563eb" stroke-width="4" stroke-linecap="round"/>
    <path d="M28 25c-1.6-2.4-4-3.6-6.8-3.6-3.6 0-6.4 2-6.4 5.2 0 6.4 13.6 3.6 13.6 10 0 3.6-3.6 5.2-7.2 5.2-3.2 0-6-1.2-7.6-4" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

const screenshot1 = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <rect width="${W}" height="${H}" fill="#eef2f7"/>
  <text x="80" y="92" font-size="40" font-weight="800" fill="#0f172a">Every price, in your currency</text>
  <text x="80" y="132" font-size="20" fill="#64748b">Live rates. Runs only on the tab you click. One-click revert.</text>

  <!-- browser window -->
  <g transform="translate(80,176)">
    <rect width="800" height="548" rx="16" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    <rect width="800" height="46" rx="16" fill="#f1f5f9"/>
    <rect y="30" width="800" height="16" fill="#f1f5f9"/>
    <circle cx="24" cy="23" r="6" fill="#e2e8f0"/>
    <circle cx="44" cy="23" r="6" fill="#e2e8f0"/>
    <circle cx="64" cy="23" r="6" fill="#e2e8f0"/>
    <rect x="92" y="12" width="620" height="22" rx="11" fill="#e2e8f0"/>
    <text x="108" y="28" font-size="13" fill="#64748b">shop.example.com/headphones</text>

    <!-- product -->
    <rect x="40" y="86" width="240" height="240" rx="14" fill="#f1f5f9"/>
    <circle cx="160" cy="206" r="70" fill="#e2e8f0"/>
    <text x="320" y="120" font-size="26" font-weight="700" fill="#0f172a">Wireless Headphones</text>
    <text x="320" y="152" font-size="15" fill="#94a3b8">Over-ear · 40h battery</text>

    <text x="320" y="214" font-size="18" fill="#94a3b8" text-decoration="line-through">&#8364;149.99</text>
    <text x="320" y="266" font-size="44" font-weight="800" fill="#2563eb">kr&#8201;1,712.40</text>
    <rect x="320" y="292" width="150" height="26" rx="13" fill="#dcfce7"/>
    <text x="332" y="310" font-size="13" font-weight="700" fill="#166534">converted from EUR</text>

    <text x="320" y="372" font-size="15" fill="#64748b">Shipping</text>
    <text x="320" y="398" font-size="18" font-weight="600" fill="#0f172a">kr&#8201;39.00</text>
  </g>

  <!-- popup -->
  <g transform="translate(792,150)">
    <rect width="408" height="300" rx="16" fill="#f9fafb" stroke="#e2e8f0" stroke-width="2"/>
    <g transform="translate(22,24) scale(0.62)">${COINS}</g>
    <text x="70" y="46" font-size="20" font-weight="800" fill="#111827">Currency Translator</text>
    <text x="24" y="86" font-size="13" fill="#6b7280">Pick a currency, then convert this tab.</text>

    <rect x="24" y="104" width="360" height="44" rx="10" fill="#ffffff" stroke="#d1d5db" stroke-width="1.6"/>
    <text x="40" y="132" font-size="15" fill="#111827">SEK &#8212; Swedish Krona</text>

    <rect x="24" y="164" width="250" height="48" rx="10" fill="#3b82f6"/>
    <text x="52" y="194" font-size="15" font-weight="700" fill="#ffffff">Translate this page</text>
    <rect x="284" y="164" width="100" height="48" rx="10" fill="#6b7280"/>
    <text x="304" y="194" font-size="15" font-weight="700" fill="#ffffff">Revert</text>

    <text x="24" y="244" font-size="13" fill="#16a34a">Converted 6 prices to SEK</text>
    <text x="24" y="272" font-size="12" fill="#9ca3af">Rates updated 3 min ago · open.er-api.com</text>
  </g>
</svg>`;

const screenshot2 = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <rect width="${W}" height="${H}" fill="#0b1120"/>
  <text x="80" y="100" font-size="40" font-weight="800" fill="#f8fafc">Private by design</text>
  <text x="80" y="140" font-size="20" fill="#94a3b8">No host permissions. No tracking. No accounts. Open source, MIT.</text>

  ${[
    ['activeTab only', 'Reads a page only after you click the icon on it — access ends on navigation.'],
    ['One network call', 'An anonymous GET for exchange rates. No cookies, no identifiers, no page URLs.'],
    ['Works on dynamic pages', 'A MutationObserver converts prices that load in later.'],
    ['One-click revert', 'Every original value is remembered and restored exactly.'],
    ['160+ currencies', 'Rates cached 6 hours, with an ECB fallback source.'],
    ['Zero dependencies', 'No build step, no bundled libraries. Every line is auditable.'],
  ].map((f, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 80 + col * 560;
    const y = 210 + row * 165;
    const lines = wrap2(f[1]);
    return `
      <g transform="translate(${x},${y})">
        <rect width="520" height="140" rx="16" fill="#111a2e" stroke="#1e293b" stroke-width="2"/>
        <circle cx="42" cy="46" r="16" fill="#1d4ed8"/>
        <path d="M34 46l6 6 12-12" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="74" y="42" font-size="20" font-weight="700" fill="#e2e8f0">${f[0]}</text>
        <text x="74" y="74" font-size="14" fill="#94a3b8">${lines[0]}</text>
        <text x="74" y="96" font-size="14" fill="#94a3b8">${lines[1]}</text>
      </g>`;
  }).join('')}
</svg>`;

for (const [name, svg] of [['screenshot-1.png', screenshot1], ['screenshot-2.png', screenshot2]]) {
  const out = fileURLToPath(new URL(name, outDir));
  await sharp(Buffer.from(svg))
    .flatten({ background: '#ffffff' }) // no alpha channel — CWS requirement
    .png()
    .toFile(out);
  console.log('wrote', out);
}

// Small promo tile (440x280) — optional in the listing but nice to have.
const tile = `
<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">
  <rect width="440" height="280" fill="#2563eb"/>
  <g transform="translate(150,54) scale(2.6)">${COINS}</g>
  <text x="220" y="230" text-anchor="middle" font-size="26" font-weight="800" fill="#ffffff">Live Currency Translator</text>
  <text x="220" y="258" text-anchor="middle" font-size="14" fill="#dbeafe">Every price, in your currency</text>
</svg>`;
{
  const out = fileURLToPath(new URL('small-promo-tile.png', outDir));
  await sharp(Buffer.from(tile)).flatten({ background: '#2563eb' }).png().toFile(out);
  console.log('wrote', out);
}
