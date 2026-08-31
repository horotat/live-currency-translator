const { test } = require('node:test');
const assert = require('node:assert');

test('versionFromTag parses vX.Y.Z and rejects the rest', async () => {
  const { versionFromTag } = await import('../scripts/sync-version.mjs');
  assert.equal(versionFromTag('v1.2.3'), '1.2.3');
  assert.equal(versionFromTag('2.0.0'), '2.0.0');
  assert.throws(() => versionFromTag('v1.2'));
  assert.throws(() => versionFromTag('release-1'));
  assert.throws(() => versionFromTag(''));
});
