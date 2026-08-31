const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../src/lib/currency.js');

const RATES = { USD: 1, EUR: 0.5, JPY: 100, GBP: 0.8, SEK: 10, NOK: 11, CNY: 7 };

test('isValidCurrencyCode', () => {
  assert.equal(C.isValidCurrencyCode('USD'), true);
  assert.equal(C.isValidCurrencyCode('eur'), true);
  assert.equal(C.isValidCurrencyCode('US'), false);
  assert.equal(C.isValidCurrencyCode('ZZZ'), false);
  assert.equal(C.isValidCurrencyCode(42), false);
});

test('normalizeAmount handles US and EU formats', () => {
  assert.equal(C.normalizeAmount('1,234.56'), 1234.56);
  assert.equal(C.normalizeAmount('1.234,56'), 1234.56);
  assert.equal(C.normalizeAmount('1 234,56'), 1234.56);
  assert.equal(C.normalizeAmount('1234'), 1234);
  assert.equal(C.normalizeAmount('12.99'), 12.99);
  assert.equal(C.normalizeAmount('1,234'), 1234);   // ambiguous -> thousands
  assert.equal(C.normalizeAmount('1.234'), 1234);   // ambiguous -> thousands
  assert.equal(C.normalizeAmount('0.99'), 0.99);
  assert.ok(Number.isNaN(C.normalizeAmount('abc')));
});

test('resolveCurrency: codes, unambiguous symbols, ambiguous symbols', () => {
  assert.equal(C.resolveCurrency('USD', {}), 'USD');
  assert.equal(C.resolveCurrency('eur', {}), 'EUR');
  assert.equal(C.resolveCurrency('£', {}), 'GBP');
  assert.equal(C.resolveCurrency('$', {}), 'USD');                       // default
  assert.equal(C.resolveCurrency('$', { host: 'shop.example.ca' }), 'CAD');
  assert.equal(C.resolveCurrency('¥', {}), 'JPY');                       // default
  assert.equal(C.resolveCurrency('¥', { lang: 'zh-cn' }), 'CNY');
  assert.equal(C.resolveCurrency('kr', {}), 'SEK');                      // default
  assert.equal(C.resolveCurrency('kr', { host: 'x.example.no' }), 'NOK');
  assert.equal(C.resolveCurrency('QQQ', {}), null);
});

test('convert uses USD-based rates', () => {
  assert.equal(C.convert(10, 'USD', 'EUR', RATES), 5);
  assert.equal(C.convert(100, 'JPY', 'USD', RATES), 1);
  assert.ok(Number.isNaN(C.convert(1, 'USD', 'ZZZ', RATES)));
});

test('formatMoney: fraction digits per currency', () => {
  assert.equal(C.formatMoney(1234.5, 'USD', 'en-US'), '$1,234.50');
  assert.equal(C.formatMoney(1234.5, 'JPY', 'en-US'), '¥1,235');
  assert.equal(C.formatMoney(1, 'ZZZ', 'en-US'), null);
});

test('translateText: prefix and suffix, skips same currency, idempotent', () => {
  const o = { rates: RATES, targetCurrency: 'USD', lang: 'en-us', host: 'example.com', locale: 'en-US' };
  assert.equal(C.translateText('Price: €10.00 today', o), 'Price: $20.00 today');
  assert.equal(C.translateText('Costs 100 JPY only', o), 'Costs $1.00 only');
  assert.equal(C.translateText('Already $5.00', o), 'Already $5.00');            // from === target
  assert.equal(C.translateText(C.translateText('€10.00', o), o), '$20.00');      // idempotent
  assert.equal(C.translateText('Order #1234 shipped', o), 'Order #1234 shipped'); // no currency token
  assert.equal(C.translateText('Meet at 12:30 pm', o), 'Meet at 12:30 pm');
});

test('translateText: no-op when target rate missing', () => {
  const o = { rates: RATES, targetCurrency: 'ZZZ' };
  assert.equal(C.translateText('€10.00', o), '€10.00');
});

test('parseAmount: extracts first currency amount (prefix and suffix, EU format)', () => {
  assert.deepEqual(C.parseAmount('149,99 €', {}), { code: 'EUR', amount: 149.99 });
  assert.deepEqual(C.parseAmount('€149.99', {}), { code: 'EUR', amount: 149.99 });
  assert.deepEqual(C.parseAmount('now only $1,299.00!', {}), { code: 'USD', amount: 1299 });
  assert.equal(C.parseAmount('no price here', {}), null);
  assert.equal(C.parseAmount('', {}), null);
});

test('formatParts: splits a formatted amount into symbol / whole / fraction', () => {
  const p = C.formatParts(1610.2, 'SEK', 'en-US');
  assert.equal(p.whole, '1,610');
  assert.equal(p.fraction, '20');
  assert.ok(p.symbol.length > 0);
  assert.equal(C.formatParts(1000, 'JPY', 'en-US').fraction, ''); // no minor unit
  assert.equal(C.formatParts(1, 'ZZZ', 'en-US'), null);
});
