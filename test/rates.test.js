const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../src/lib/rates.js');

function fakeStorage(initial) {
  let store = { ...(initial || {}) };
  return {
    get: (key, cb) => cb(key in store ? { [key]: store[key] } : {}),
    set: (obj, cb) => { store = { ...store, ...obj }; cb && cb(); },
    _dump: () => store,
  };
}

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

const OK_ERAPI = { result: 'success', base_code: 'USD', rates: { USD: 1, EUR: 0.9, JPY: 150, GBP: 0.8, SEK: 10 } };

test('validateRates drops junk, forces USD=1, needs >=5', () => {
  const v = R.validateRates({ USD: 1, EUR: 0.9, JPY: 150, GBP: 0.8, SEK: 10, BAD: -1, LOW: 'x', toolong: 2 });
  assert.equal(v.USD, 1);
  assert.equal(v.EUR, 0.9);
  assert.equal('BAD' in v, false);
  assert.equal('LOW' in v, false);
  assert.throws(() => R.validateRates({ USD: 1, EUR: 0.9 }));
});

test('getRates uses fresh cache without fetching', async () => {
  const now = () => 1_000_000;
  const storage = fakeStorage({
    [R.CACHE_KEY]: { rates: { USD: 1, EUR: 0.9, JPY: 1, GBP: 1, SEK: 1 }, fetchedAt: now(), source: 'cache' },
  });
  let called = false;
  const fetchImpl = () => { called = true; return jsonResponse(OK_ERAPI); };
  const out = await R.getRates({ storage, fetchImpl, now });
  assert.equal(called, false);
  assert.equal(out.stale, false);
  assert.equal(out.rates.EUR, 0.9);
});

test('getRates fetches when cache is stale and writes it back', async () => {
  const now = () => 10 * R.TTL_MS;
  const storage = fakeStorage({
    [R.CACHE_KEY]: { rates: { USD: 1, EUR: 1, JPY: 1, GBP: 1, SEK: 1 }, fetchedAt: 0, source: 'old' },
  });
  const fetchImpl = (url) => { assert.equal(url, R.PRIMARY_URL); return jsonResponse(OK_ERAPI); };
  const out = await R.getRates({ storage, fetchImpl, now });
  assert.equal(out.stale, false);
  assert.equal(out.rates.JPY, 150);
  assert.equal(storage._dump()[R.CACHE_KEY].rates.JPY, 150);
});

test('getRates falls back to secondary provider on primary failure', async () => {
  const storage = fakeStorage({});
  const fetchImpl = (url) => {
    if (url === R.PRIMARY_URL) return jsonResponse({}, false, 500);
    return jsonResponse({ base: 'USD', rates: { EUR: 0.9, JPY: 150, GBP: 0.8, SEK: 10 } });
  };
  const out = await R.getRates({ storage, fetchImpl, now: () => 0 });
  assert.equal(out.source, R.FALLBACK_URL);
  assert.equal(out.rates.USD, 1);
  assert.equal(out.rates.EUR, 0.9);
});

test('getRates returns stale cache when all providers fail', async () => {
  const now = () => 10 * R.TTL_MS;
  const storage = fakeStorage({
    [R.CACHE_KEY]: { rates: { USD: 1, EUR: 2, JPY: 2, GBP: 2, SEK: 2 }, fetchedAt: 0, source: 'old' },
  });
  const fetchImpl = () => jsonResponse({}, false, 503);
  const out = await R.getRates({ storage, fetchImpl, now });
  assert.equal(out.stale, true);
  assert.equal(out.rates.EUR, 2);
});

test('getRates throws when no cache and all providers fail', async () => {
  const storage = fakeStorage({});
  const fetchImpl = () => jsonResponse({}, false, 503);
  await assert.rejects(() => R.getRates({ storage, fetchImpl, now: () => 0 }));
});
