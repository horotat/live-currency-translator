'use strict';

(() => {
  if (window.__currencyTranslatorInit) return;
  window.__currencyTranslatorInit = true;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
  const originals = new Map(); // Text node -> original nodeValue
  let observer = null;
  let state = null; // { targetCurrency, rates }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'apply') {
      state = { targetCurrency: msg.targetCurrency, rates: msg.rates };
      const replaced = translateTree(document.body);
      startObserver();
      window.addEventListener('pagehide', stopObserver, { once: true });
      sendResponse({ replaced });
      return;
    }
    if (msg.type === 'revert') {
      sendResponse({ reverted: revertAll() });
      return;
    }
  });

  function currentOpts() {
    return {
      rates: state.rates,
      targetCurrency: state.targetCurrency,
      lang: (document.documentElement.lang || navigator.language || '').toLowerCase(),
      host: location.hostname.toLowerCase(),
      locale: navigator.language || 'en-US',
    };
  }

  function acceptNode(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
    const parent = node.parentNode;
    if (!parent) return NodeFilter.FILTER_REJECT;
    if (SKIP_TAGS.has(parent.nodeName)) return NodeFilter.FILTER_REJECT;
    if (parent.nodeType === Node.ELEMENT_NODE && parent.isContentEditable) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }

  function translateNode(node, opts) {
    const next = CurrencyLib.translateText(node.nodeValue, opts);
    if (next === node.nodeValue) return false;
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    node.nodeValue = next;
    return true;
  }

  function translateTree(root) {
    if (!root || !state) return 0;
    const opts = currentOpts();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });
    const pending = [];
    let node;
    while ((node = walker.nextNode())) pending.push(node);
    let count = 0;
    for (const n of pending) if (translateNode(n, opts)) count++;
    return count;
  }

  function startObserver() {
    stopObserver();
    observer = new MutationObserver((mutations) => {
      if (!state) return;
      const opts = currentOpts();
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE) {
            if (acceptNode(added) === NodeFilter.FILTER_ACCEPT) translateNode(added, opts);
          } else if (added.nodeType === Node.ELEMENT_NODE) {
            translateTree(added);
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  function revertAll() {
    stopObserver();
    state = null;
    let count = 0;
    for (const [node, original] of originals) {
      try { node.nodeValue = original; count++; } catch (_) { /* node detached */ }
    }
    originals.clear();
    return count;
  }
})();
