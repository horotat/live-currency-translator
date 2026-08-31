// Chrome MV3 sanity + security checks. Fails (exit 1) on any violation.
// Intentionally strict about permissions: this extension must stay minimal.
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const ALLOWED_PERMISSIONS = new Set(['activeTab', 'scripting', 'storage']);

const raw = await readFile(new URL('manifest.json', root), 'utf8');
let m;
try {
  m = JSON.parse(raw);
} catch (e) {
  console.error('manifest.json is not valid JSON:', e.message);
  process.exit(1);
}

ok(m.manifest_version === 3, `manifest_version must be 3 (got ${m.manifest_version})`);
ok(m.name === 'Live Currency Translator', `unexpected name: ${JSON.stringify(m.name)}`);
ok(typeof m.version === 'string' && /^\d+\.\d+(\.\d+)?$/.test(m.version), `bad version: ${JSON.stringify(m.version)}`);
ok(typeof m.description === 'string' && m.description.length > 10 && m.description.length <= 132,
  'description must be 11-132 chars (Chrome Web Store limit)');

ok(Array.isArray(m.permissions), 'permissions must be an array');
for (const p of m.permissions || []) {
  ok(ALLOWED_PERMISSIONS.has(p), `permission "${p}" is not in the allowed set {${[...ALLOWED_PERMISSIONS].join(', ')}}`);
}
ok(!('host_permissions' in m), 'host_permissions must not be declared (activeTab only)');
ok(!('optional_host_permissions' in m), 'optional_host_permissions must not be declared');
ok(!('content_scripts' in m), 'content_scripts must not be declared (inject programmatically)');
ok(!('externally_connectable' in m), 'externally_connectable must not be declared');
ok(!m.content_security_policy, 'do not override the default MV3 CSP');

ok(m.background && typeof m.background.service_worker === 'string', 'background.service_worker is required');
ok(!(m.background && m.background.type === 'module'),
  'background must be a classic worker (uses importScripts, not ES modules)');

ok(m.action && m.action.default_popup === 'src/popup.html', 'action.default_popup must be src/popup.html');

const referenced = [
  m.background && m.background.service_worker,
  m.action && m.action.default_popup,
  ...Object.values(m.icons || {}),
].filter(Boolean);

for (const rel of referenced) {
  try {
    await access(fileURLToPath(new URL(rel, root)));
  } catch {
    problems.push(`manifest references missing file: ${rel}`);
  }
}

for (const size of ['16', '32', '48', '128']) {
  ok(m.icons && m.icons[size], `icons.${size} is required`);
}

if (problems.length) {
  console.error('manifest check FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('manifest check passed (permissions:', JSON.stringify(m.permissions) + ')');
