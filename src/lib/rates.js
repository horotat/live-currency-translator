'use strict';

const PRIMARY_URL = 'https://open.er-api.com/v6/latest/USD';
const FALLBACK_URL = 'https://api.frankfurter.dev/v1/latest?base=USD';
const CACHE_KEY = 'ratesCache';
const TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

function validateRates(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('rates: not an object');
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (/^[A-Z]{3}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = v;
    }
  }
  if (!out.USD || Math.abs(out.USD - 1) > 1e-6) out.USD = 1;
  if (Object.keys(out).length < 5) throw new Error('rates: too few valid entries');
  return out;
}

function parseErApi(data) {
  if (!data || data.result !== 'success' || typeof data.rates !== 'object') {
    throw new Error('er-api: unexpected shape');
  }
  return data.rates;
}

function parseFrankfurter(data) {
  if (!data || typeof data.rates !== 'object') throw new Error('frankfurter: unexpected shape');
  return Object.assign({ USD: 1 }, data.rates);
}

function readCache(storage) {
  return new Promise((resolve) => {
    storage.get(CACHE_KEY, (obj) => resolve(obj && obj[CACHE_KEY] ? obj[CACHE_KEY] : null));
  });
}

function writeCache(storage, entry) {
  return new Promise((resolve) => {
    storage.set({ [CACHE_KEY]: entry }, () => resolve());
  });
}

async function fetchProvider(fetchImpl, url, parse, now) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, {
      signal: controller ? controller.signal : undefined,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const rates = validateRates(parse(data));
    return { rates, fetchedAt: now(), source: url, stale: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchFresh(fetchImpl, now) {
  try {
    return await fetchProvider(fetchImpl, PRIMARY_URL, parseErApi, now);
  } catch (primaryErr) {
    try {
      return await fetchProvider(fetchImpl, FALLBACK_URL, parseFrankfurter, now);
    } catch (fallbackErr) {
      throw new Error('rate providers failed: ' + primaryErr.message + ' / ' + fallbackErr.message);
    }
  }
}

async function getRates(deps) {
  const storage = deps.storage;
  const fetchImpl = deps.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const now = deps.now || Date.now;
  if (!fetchImpl) throw new Error('no fetch implementation available');

  const cached = await readCache(storage);
  if (cached && cached.rates && (now() - cached.fetchedAt) < TTL_MS) {
    return { rates: cached.rates, fetchedAt: cached.fetchedAt, source: cached.source, stale: false };
  }

  try {
    const fresh = await fetchFresh(fetchImpl, now);
    await writeCache(storage, fresh);
    return fresh;
  } catch (err) {
    if (cached && cached.rates) {
      return { rates: cached.rates, fetchedAt: cached.fetchedAt, source: cached.source, stale: true };
    }
    throw err;
  }
}

const api = {
  PRIMARY_URL, FALLBACK_URL, CACHE_KEY, TTL_MS,
  validateRates, getRates,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.RatesLib = api;
