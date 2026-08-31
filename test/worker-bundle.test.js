const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// The service worker loads both libraries with importScripts(), which evaluates
// every file in ONE shared global scope. Concatenating the files reproduces that:
// any top-level `const`/`let`/`class` collision (e.g. two `const api`) becomes a
// SyntaxError at compile time, exactly as Chrome reports it.
test('rates.js + currency.js coexist in one worker scope (importScripts simulation)', () => {
  const dir = path.join(__dirname, '..', 'src', 'lib');
  const combined =
    fs.readFileSync(path.join(dir, 'rates.js'), 'utf8') + '\n;\n' +
    fs.readFileSync(path.join(dir, 'currency.js'), 'utf8');

  const sandbox = { console, fetch: () => {}, AbortController, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;

  assert.doesNotThrow(
    () => vm.runInNewContext(combined, sandbox, { filename: 'worker-bundle.js' }),
    'libraries must not collide in a shared scope',
  );

  assert.equal(typeof sandbox.RatesLib, 'object');
  assert.equal(typeof sandbox.RatesLib.getRates, 'function');
  assert.equal(typeof sandbox.CurrencyLib, 'object');
  assert.equal(typeof sandbox.CurrencyLib.translateText, 'function');
});
