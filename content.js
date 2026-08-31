// Map common currency symbols to their standard ISO codes
const currencyMap = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  'kr': 'SEK',
  'USD': 'USD',
  'EUR': 'EUR',
  'GBP': 'GBP',
  'JPY': 'JPY',
  'SEK': 'SEK',
  'AUD': 'AUD',
  'CAD': 'CAD',
  'CHF': 'CHF'
};

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    translateCurrencies(request.targetCurrency)
      .then(() => sendResponse({ success: true }))
      .catch(err => {
        console.error("Currency translation failed:", err);
        sendResponse({ success: false });
      });
    return true; // Keeps the message channel open for async response
  }
});

async function translateCurrencies(targetCurrency) {
  // Fetch real-time exchange rates (Base: USD)
  const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
  const data = await response.json();
  const rates = data.rates;

  // Walk through all text nodes in the DOM, avoiding scripts and styles
  const walk = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentNode.nodeName.toLowerCase();
        if (['script', 'style', 'noscript'].includes(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let node;
  const nodesToReplace = [];

  // Patterns to match: Prefix (e.g., $100.50) and Suffix (e.g., 100.50 USD)
  const currencyKeys = Object.keys(currencyMap).map(k => k.replace('$', '\\$')).join('|');
  const regexPrefix = new RegExp(`(${currencyKeys})\\s*(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d+)?)`, 'gi');
  const regexSuffix = new RegExp(`(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d+)?)\\s*(${currencyKeys})`, 'gi');

  while ((node = walk.nextNode())) {
    let text = node.nodeValue;
    let newText = text;

    // Helper function to process regex matches
    const replacer = (match, p1, p2, isPrefix) => {
      let sym = isPrefix ? p1.toUpperCase() : p2.toUpperCase();
      let amountStr = isPrefix ? p2 : p1;

      const fromCurr = currencyMap[sym];
      if (!fromCurr || !rates[fromCurr] || !rates[targetCurrency]) return match;

      // Normalize number formats (handle both US '1,000.50' and EU '1.000,50' styles gracefully)
      let normalized = amountStr;
      if (normalized.indexOf(',') > -1 && normalized.indexOf('.') > -1) {
        if (normalized.indexOf(',') > normalized.indexOf('.')) {
          normalized = normalized.replace(/\./g, '').replace(',', '.'); // EU
        } else {
          normalized = normalized.replace(/,/g, ''); // US
        }
      } else if (normalized.indexOf(',') > -1) {
        const parts = normalized.split(',');
        if (parts[parts.length - 1].length === 2) {
          normalized = normalized.replace(',', '.'); // Likely decimals
        } else {
          normalized = normalized.replace(/,/g, ''); // Likely thousands
        }
      }
      
      const amount = parseFloat(normalized);
      if (isNaN(amount)) return match;

      // Convert to Base (USD) then to Target
      const amountInUSD = amount / rates[fromCurr];
      const finalAmount = amountInUSD * rates[targetCurrency];
      
      // Format the output beautifully using native Intl API
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: targetCurrency 
      }).format(finalAmount);
    };

    newText = newText.replace(regexPrefix, (m, p1, p2) => replacer(m, p1, p2, true));
    newText = newText.replace(regexSuffix, (m, p1, p2) => replacer(m, p1, p2, false));

    if (newText !== text) {
      nodesToReplace.push({ node, newText });
    }
  }

  // Apply all changes to the DOM safely
  nodesToReplace.forEach(item => {
    item.node.nodeValue = item.newText;
  });
}