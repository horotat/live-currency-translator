'use strict';

// Wrapped in an IIFE: this file is loaded via `importScripts()` in the service
// worker (shared global scope) AND co-injected into pages alongside content.js.
// Nothing must leak to the shared scope except the `globalThis` assignment below.
(function () {

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Unambiguous symbol -> ISO 4217 code. */
const SYMBOL_TO_CODE = {
  '€': 'EUR', '£': 'GBP', '₩': 'KRW', '₹': 'INR', '₽': 'RUB', '₺': 'TRY',
  '₪': 'ILS', '฿': 'THB', '₴': 'UAH', '₱': 'PHP', '₫': 'VND',
  'US$': 'USD', 'A$': 'AUD', 'AU$': 'AUD', 'C$': 'CAD', 'CA$': 'CAD',
  'NZ$': 'NZD', 'HK$': 'HKD', 'S$': 'SGD', 'R$': 'BRL', 'MX$': 'MXN',
  'CHF': 'CHF', 'Kč': 'CZK', 'zł': 'PLN', 'RM': 'MYR', 'Rp': 'IDR',
};

/** Ambiguous symbol -> resolution rules. `byHost` keys are TLD/host suffixes. */
const AMBIGUOUS = {
  '$': {
    default: 'USD',
    byHost: { '.ca': 'CAD', '.au': 'AUD', '.nz': 'NZD', '.sg': 'SGD', '.hk': 'HKD', '.mx': 'MXN' },
    byLang: { 'en-ca': 'CAD', 'en-au': 'AUD', 'en-nz': 'NZD' },
  },
  '¥': {
    default: 'JPY',
    byHost: { '.cn': 'CNY', '.jp': 'JPY' },
    byLang: { 'zh': 'CNY', 'ja': 'JPY' },
  },
  'kr': {
    default: 'SEK',
    byHost: { '.no': 'NOK', '.dk': 'DKK', '.is': 'ISK', '.se': 'SEK' },
    byLang: { 'nb': 'NOK', 'nn': 'NOK', 'no': 'NOK', 'da': 'DKK', 'is': 'ISK', 'sv': 'SEK' },
  },
};

/** Symbols we scan for, longest first so `US$` wins over `$`. */
const SYMBOLS = [...Object.keys(SYMBOL_TO_CODE), ...Object.keys(AMBIGUOUS)]
  .sort((a, b) => b.length - a.length);

/**
 * Active ISO 4217 codes. `Intl.NumberFormat` only checks that a currency code is
 * *well-formed* (three ASCII letters), not that it is real — so "ZZZ" would pass.
 * This set is the real allowlist for `isValidCurrencyCode` / `resolveCurrency`.
 */
const CURRENCY_CODES = new Set((
  'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB ' +
  'BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP ' +
  'DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG ' +
  'HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT ' +
  'LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR ' +
  'MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB ' +
  'RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS ' +
  'TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF ' +
  'XPF YER ZAR ZMW ZWL'
).split(' '));

function isValidCurrencyCode(code) {
  return typeof code === 'string' && /^[A-Za-z]{3}$/.test(code) &&
    CURRENCY_CODES.has(code.toUpperCase());
}

/**
 * Turn a human amount string into a Number.
 * Heuristics: if both separators present, the rightmost is the decimal mark.
 * A lone separator with exactly 3 trailing digits is treated as a thousands mark.
 */
function normalizeAmount(raw) {
  let s = String(raw).trim().replace(/[  \s]/g, '');
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // EU: 1.234,56
    } else {
      s = s.replace(/,/g, '');                    // US: 1,234.56
    }
  } else if (hasComma) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      s = s.replace(',', '.');                    // decimal comma: 12,99
    } else {
      s = s.replace(/,/g, '');                    // thousands: 1,234 / 1,234,567
    }
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      s = s.replace(/\./g, '');                   // 1.234.567 -> thousands
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0] !== '0' && /^\d{1,3}$/.test(parts[0])) {
      s = s.replace(/\./g, '');                   // 1.234 -> thousands (EU)
    }
    // otherwise keep as decimal: 12.99 / 0.123
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function resolveCurrency(token, ctx) {
  if (typeof token !== 'string' || !token) return null;
  const ctxObj = ctx || {};
  const host = (ctxObj.host || '').toLowerCase();
  const lang = (ctxObj.lang || '').toLowerCase();

  // An explicit 3-letter ISO code anywhere in the token wins, even when a symbol
  // is attached to it: "CAD $", "USD $", "EUR €" -> the code.
  const embedded = token.match(/[A-Za-z]{3}/);
  if (embedded && isValidCurrencyCode(embedded[0])) return embedded[0].toUpperCase();

  const amb = AMBIGUOUS[token];
  if (amb) {
    for (const suffix of Object.keys(amb.byHost)) {
      if (host.endsWith(suffix)) return amb.byHost[suffix];
    }
    for (const prefix of Object.keys(amb.byLang)) {
      if (lang === prefix || lang.startsWith(prefix + '-')) return amb.byLang[prefix];
    }
    return amb.default;
  }

  return SYMBOL_TO_CODE[token] || null;
}

function convert(amount, from, to, rates) {
  const rFrom = rates && rates[from];
  const rTo = rates && rates[to];
  if (!(typeof rFrom === 'number' && rFrom > 0) || !(typeof rTo === 'number' && rTo > 0)) return NaN;
  if (!Number.isFinite(amount)) return NaN;
  return (amount / rFrom) * rTo;
}

function formatMoney(amount, code, locale) {
  if (!isValidCurrencyCode(code)) return null;
  try {
    return new Intl.NumberFormat(locale || 'en-US', { style: 'currency', currency: code }).format(amount);
  } catch (_) {
    return null;
  }
}

// Every character a locale might use as a thousands separator: '.', ',', the
// Swiss apostrophe, ASCII space and every Unicode space (incl. NBSP, narrow
// NBSP, thin space — common on Russian/European sites like "2 151 ₽").
const GRP = "[.,'\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]";
// Bounded number pattern: grouped thousands OR a plain run, optional 1-2 decimals.
const NUM = '(\\d{1,3}(?:' + GRP + '\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
const SYM = '(?:' + SYMBOLS.map(escapeRegExp).join('|') + '|[A-Z]{3})';
// A prefix token may also be a *real* ISO code with a symbol stuck on: "CAD $".
// Restricting to real codes keeps "THE $100" from being swallowed as one token.
const PRE = '(?:(?:' + [...CURRENCY_CODES].join('|') + ')\\s?[$€£¥₩₹₽₺]|' + SYM + ')';
const RE_PREFIX = new RegExp('(' + PRE + ')\\s?' + NUM, 'g');
const RE_SUFFIX = new RegExp(NUM + '\\s?(' + SYM + ')', 'g');
// Non-global copies for single-match extraction (global regexes are stateful).
const RE_PREFIX_ONE = new RegExp('(' + PRE + ')\\s?' + NUM);
const RE_SUFFIX_ONE = new RegExp(NUM + '\\s?(' + SYM + ')');

/**
 * Find the first currency amount in a string.
 * @returns {{ code: string, amount: number } | null}
 */
function parseAmount(text, ctx) {
  if (typeof text !== 'string' || !text) return null;
  const c = { lang: (ctx && ctx.lang || '').toLowerCase(), host: (ctx && ctx.host || '').toLowerCase() };
  const pick = (re, tokenFirst) => {
    const m = re.exec(text);
    if (!m) return null;
    const token = tokenFirst ? m[1] : m[2];
    const amountStr = tokenFirst ? m[2] : m[1];
    const code = resolveCurrency(token, c);
    const amount = normalizeAmount(amountStr);
    if (!code || !Number.isFinite(amount)) return null;
    return { code, amount };
  };
  return pick(RE_PREFIX_ONE, true) || pick(RE_SUFFIX_ONE, false);
}

/**
 * Format an amount and break it into the pieces a split-price widget needs.
 * @returns {{ symbol: string, whole: string, fraction: string, formatted: string } | null}
 */
function formatParts(amount, code, locale) {
  if (!isValidCurrencyCode(code) || !Number.isFinite(amount)) return null;
  try {
    const parts = new Intl.NumberFormat(locale || 'en-US', { style: 'currency', currency: code })
      .formatToParts(amount);
    let symbol = '', whole = '', fraction = '';
    for (const p of parts) {
      if (p.type === 'currency') symbol += p.value;
      else if (p.type === 'integer' || p.type === 'group') whole += p.value;
      else if (p.type === 'fraction') fraction += p.value;
    }
    return { symbol, whole, fraction, formatted: parts.map((p) => p.value).join('') };
  } catch (_) {
    return null;
  }
}

function translateText(text, opts) {
  if (typeof text !== 'string' || !text) return text;
  const o = opts || {};
  const rates = o.rates;
  const target = o.targetCurrency;
  if (!rates || !target || !(rates[target] > 0)) return text;
  const ctx = { lang: (o.lang || '').toLowerCase(), host: (o.host || '').toLowerCase() };
  const locale = o.locale || 'en-US';

  const sub = (whole, token, amountStr) => {
    const from = resolveCurrency(token, ctx);
    if (!from || !(rates[from] > 0) || from === target) return whole;
    const amount = normalizeAmount(amountStr);
    if (!Number.isFinite(amount)) return whole;
    const converted = convert(amount, from, target, rates);
    if (!Number.isFinite(converted)) return whole;
    const formatted = formatMoney(converted, target, locale);
    return formatted == null ? whole : formatted;
  };

  let out = text.replace(RE_PREFIX, (whole, token, amt) => sub(whole, token, amt));
  out = out.replace(RE_SUFFIX, (whole, amt, token) => sub(whole, token, amt));
  return out;
}

const api = {
  escapeRegExp, isValidCurrencyCode, normalizeAmount, resolveCurrency,
  convert, formatMoney, translateText, parseAmount, formatParts,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.CurrencyLib = api;

})();
