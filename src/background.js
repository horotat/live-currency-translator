'use strict';

// Shared libraries. Paths are relative to this worker file (src/).
importScripts('./lib/rates.js', './lib/currency.js');

const localStorageArea = chrome.storage.local;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === 'listCurrencies') {
    RatesLib.getRates({ storage: localStorageArea })
      .then((r) => sendResponse({
        ok: true,
        codes: Object.keys(r.rates).sort(),
        fetchedAt: r.fetchedAt,
        stale: r.stale,
      }))
      .catch((e) => sendResponse({ ok: false, error: errMsg(e) }));
    return true;
  }

  if (msg.type === 'translate') {
    handleTranslate(msg.targetCurrency)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: errMsg(e) }));
    return true;
  }

  if (msg.type === 'revert') {
    handleRevert()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: errMsg(e) }));
    return true;
  }
});

async function handleTranslate(targetCurrency) {
  if (!CurrencyLib.isValidCurrencyCode(targetCurrency)) {
    return { ok: false, error: 'invalid currency code' };
  }
  const tabId = await activeTabId();
  if (!tabId) return { ok: false, error: 'no active tab' };

  const { rates, fetchedAt, stale } = await RatesLib.getRates({ storage: localStorageArea });
  if (!(rates[targetCurrency] > 0)) {
    return { ok: false, error: 'no rate for ' + targetCurrency };
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/lib/currency.js', 'src/content.js'],
  });

  const resp = await chrome.tabs.sendMessage(tabId, {
    type: 'apply',
    targetCurrency,
    rates,
  });

  return { ok: true, replaced: (resp && resp.replaced) || 0, fetchedAt, stale };
}

async function handleRevert() {
  const tabId = await activeTabId();
  if (!tabId) return { ok: false, error: 'no active tab' };
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: 'revert' });
    return { ok: true, reverted: (resp && resp.reverted) || 0 };
  } catch (_) {
    // Content script was never injected on this tab — nothing to revert.
    return { ok: true, reverted: 0 };
  }
}

async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] && tabs[0].id;
}

function errMsg(e) {
  return String((e && e.message) || e);
}
