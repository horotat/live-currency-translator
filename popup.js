document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('currencySearch');
  const dropdownList = document.getElementById('dropdownList');
  const translateBtn = document.getElementById('translateBtn');
  
  let selectedCurrency = 'USD'; // Default fallback
  let allCurrencies = [];

  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    const currencyCodes = Object.keys(data.rates);
    
    // Use native browser API to get friendly names (e.g., "US Dollar" for USD)
    const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
    
    allCurrencies = currencyCodes.map(code => {
      let name = code;
      try { name = displayNames.of(code); } catch(e) {} // Fallback to code if name not found
      return { code, name, label: `${code} - ${name}` };
    });

    searchInput.disabled = false;
    searchInput.placeholder = "Search (e.g. Euro, JPY)...";
  } catch (err) {
    searchInput.placeholder = "Error loading currencies";
    console.error("Failed to fetch currencies:", err);
  }

  function renderList(filterText = '') {
    dropdownList.innerHTML = '';
    const lowerFilter = filterText.toLowerCase();
    
    const filtered = allCurrencies.filter(c => 
      c.label.toLowerCase().includes(lowerFilter)
    );

    filtered.forEach(currency => {
      const div = document.createElement('div');
      div.className = 'currency-item';
      if (currency.code === selectedCurrency) div.classList.add('selected');
      div.textContent = currency.label;
      
      div.addEventListener('click', () => {
        selectedCurrency = currency.code;
        searchInput.value = currency.label;
        dropdownList.classList.remove('show');
        chrome.storage.sync.set({ targetCurrency: selectedCurrency }); // Save preference
      });
      
      dropdownList.appendChild(div);
    });
  }

  chrome.storage.sync.get('targetCurrency', (data) => {
    if (data.targetCurrency) {
      selectedCurrency = data.targetCurrency;
    }
    const initialCurrency = allCurrencies.find(c => c.code === selectedCurrency);
    if (initialCurrency) {
      searchInput.value = initialCurrency.label;
    }
  });

  searchInput.addEventListener('focus', () => {
    searchInput.value = ''; // Clear input to allow fresh searching
    renderList('');
    dropdownList.classList.add('show');
  });

  searchInput.addEventListener('input', (e) => {
    renderList(e.target.value);
    dropdownList.classList.add('show');
  });

  // Close dropdown if user clicks outside of the search area
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
      dropdownList.classList.remove('show');
      const current = allCurrencies.find(c => c.code === selectedCurrency);
      if (current) searchInput.value = current.label; // Restore text if they clicked away
    }
  });

  translateBtn.addEventListener('click', () => {
    const originalText = translateBtn.textContent;
    translateBtn.textContent = "Translating...";
    translateBtn.style.backgroundColor = "#10b981"; // Success green

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'translate', targetCurrency: selectedCurrency }, (response) => {
        setTimeout(() => {
          translateBtn.textContent = originalText;
          translateBtn.style.backgroundColor = "#3b82f6"; // Back to blue
        }, 1000);
      });
    });
  });
});