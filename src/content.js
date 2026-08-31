'use strict';

(() => {
  if (window.__currencyTranslatorInit) return;
  window.__currencyTranslatorInit = true;

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
  // Split-price widgets: symbol / integer / fraction live in separate elements.
  // Amazon's `.a-price` is the common one and carries the full amount in a
  // visually-hidden `.a-offscreen` child.
  const SPLIT_PRICE_SEL = '.a-price';
  const DONE_ATTR = 'data-lct';

  const originals = new Map(); // Text node -> original nodeValue
  let observer = null;
  let state = null; // { targetCurrency, rates }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'apply') {
      state = { targetCurrency: msg.targetCurrency, rates: msg.rates };
      const opts = currentOpts();
      let replaced = translateSplitPrices(document.body, opts);
      replaced += translateTree(document.body);
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

  // ---- plain text nodes -----------------------------------------------------

  function acceptNode(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
    const parent = node.parentNode;
    if (!parent) return NodeFilter.FILTER_REJECT;
    if (SKIP_TAGS.has(parent.nodeName)) return NodeFilter.FILTER_REJECT;
    if (parent.nodeType === Node.ELEMENT_NODE && parent.isContentEditable) return NodeFilter.FILTER_REJECT;
    // Split-price widgets are handled element-wise; keep the walker out of them.
    if (parent.closest && parent.closest(SPLIT_PRICE_SEL)) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }

  function setNodeText(node, text) {
    if (!node || node.nodeValue === text) return false;
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    node.nodeValue = text;
    return true;
  }

  function translateNode(node, opts) {
    const next = CurrencyLib.translateText(node.nodeValue, opts);
    return next === node.nodeValue ? false : setNodeText(node, next);
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

  // ---- split-price widgets (Amazon .a-price etc.) --------------------------

  function firstTextNode(el) {
    if (!el) return null;
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) return child;
    }
    return null;
  }

  function translateSplitPrices(root, opts) {
    if (!root || !state || !root.querySelectorAll) return 0;
    const list = [];
    if (root.matches && root.matches(SPLIT_PRICE_SEL)) list.push(root);
    for (const el of root.querySelectorAll(SPLIT_PRICE_SEL)) list.push(el);

    let count = 0;
    for (const el of list) {
      if (el.hasAttribute(DONE_ATTR)) continue;

      const symEl = el.querySelector('.a-price-symbol');
      const wholeEl = el.querySelector('.a-price-whole');
      const fracEl = el.querySelector('.a-price-fraction');
      const offEl = el.querySelector('.a-offscreen');
      if (!wholeEl) continue;

      const source = (offEl && offEl.textContent) ||
        ((symEl ? symEl.textContent : '') + wholeEl.textContent + (fracEl ? fracEl.textContent : ''));

      const parsed = CurrencyLib.parseAmount(source, opts);
      if (!parsed || parsed.code === opts.targetCurrency) continue;

      const rFrom = opts.rates[parsed.code];
      const rTo = opts.rates[opts.targetCurrency];
      if (!(rFrom > 0) || !(rTo > 0)) continue;

      const parts = CurrencyLib.formatParts((parsed.amount / rFrom) * rTo, opts.targetCurrency, opts.locale);
      if (!parts) continue;

      const wholeText = (symEl ? '' : (parts.symbol + ' ')) + parts.whole;
      let touched = false;
      if (symEl) touched = setNodeText(firstTextNode(symEl), parts.symbol + ' ') || touched;
      touched = setNodeText(firstTextNode(wholeEl), wholeText) || touched;
      if (fracEl) touched = setNodeText(firstTextNode(fracEl), parts.fraction) || touched;
      if (offEl) touched = setNodeText(firstTextNode(offEl), parts.formatted) || touched;

      el.setAttribute(DONE_ATTR, '1');
      if (touched) count++;
    }
    return count;
  }

  // ---- observer + revert --------------------------------------------------

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
            translateSplitPrices(added, opts);
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
    document.querySelectorAll('[' + DONE_ATTR + ']').forEach((el) => el.removeAttribute(DONE_ATTR));
    return count;
  }
})();
