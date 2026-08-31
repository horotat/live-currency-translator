const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const script = path.join(__dirname, '..', 'scripts', 'check-manifest.mjs');

test('check-manifest passes for the committed manifest', () => {
  const out = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.match(out, /manifest check passed/);
  assert.match(out, /"activeTab","scripting","storage"/);
});
