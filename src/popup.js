'use strict';

const els = {
  search: document.getElementById('search'),
  dropdown: document.getElementById('dropdown'),
  translateBtn: document.getElementById('translateBtn'),
  revertBtn: document.getElementById('revertBtn'),
  status: document.getElementById('status'),
  rateAge: document.getElementById('rateAge'),
};

let currencies = [];        // [{ code, label }]
let selected = 'USD';
let displayNames = null;
try { displayNames = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch (_) { /* older engines */ }

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function getSync(key) {
  return new Promise((resolve) => chrome.storage.sync.get(key, (o) => resolve(o[key])));
}

function labelFor(code) {
  let name = code;
  if (displayNames) { try { name = displayNames.of(code) || code; } catch (_) { /* keep code */ } }
  return code + ' — ' + name;
}

function setStatus(text, isError) {
  els.status.textContent = text;
  els.status.style.color = isError ? '#b91c1c' : '#6b7280';
}

function renderRateAge(fetchedAt, stale) {
  if (!fetchedAt) { els.rateAge.textContent = ''; return; }
  const mins = Math.round((Date.now() - fetchedAt) / 60000);
  const when = mins < 1 ? 'just now' : mins < 60 ? mins + ' min ago' : Math.round(mins / 60) + ' h ago';
  els.rateAge.textContent = (stale ? 'Rates (offline copy) updated ' : 'Rates updated ') + when;
}

function renderDropdown(filter) {
  const q = (filter || '').toLowerCase();
  els.dropdown.innerHTML = '';
  for (const c of currencies) {
    if (q && !c.label.toLowerCase().includes(q)) continue;
    const div = document.createElement('div');
    div.className = 'currency-item' + (c.code === selected ? ' selected' : '');
    div.textContent = c.label;
    div.addEventListener('click', () => {
      selected = c.code;
      els.search.value = c.label;
      els.dropdown.classList.remove('show');
      chrome.storage.sync.set({ targetCurrency: selected });
    });
    els.dropdown.appendChild(div);
  }
}

function setSelectedLabel() {
  const match = currencies.find((c) => c.code === selected);
  if (match) els.search.value = match.label;
}

async function init() {
  selected = (await getSync('targetCurrency')) || 'USD';

  const meta = await send({ type: 'listCurrencies' });
  if (!meta || !meta.ok) {
    els.search.placeholder = 'Offline — cannot load currency list';
    setStatus((meta && meta.error) || 'Could not load rates', true);
    return;
  }

  currencies = meta.codes.map((code) => ({ code, label: labelFor(code) }));
  if (!currencies.some((c) => c.code === selected)) selected = 'USD';

  els.search.disabled = false;
  els.search.placeholder = 'Search (Euro, JPY, …)';
  els.translateBtn.disabled = false;
  setSelectedLabel();
  renderRateAge(meta.fetchedAt, meta.stale);
}

els.search.addEventListener('focus', () => {
  els.search.value = '';
  renderDropdown('');
  els.dropdown.classList.add('show');
});

els.search.addEventListener('input', (e) => {
  renderDropdown(e.target.value);
  els.dropdown.classList.add('show');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) {
    els.dropdown.classList.remove('show');
    setSelectedLabel();
  }
});

els.translateBtn.addEventListener('click', async () => {
  els.translateBtn.disabled = true;
  setStatus('Translating…');
  const res = await send({ type: 'translate', targetCurrency: selected });
  els.translateBtn.disabled = false;
  if (!res || !res.ok) {
    setStatus((res && res.error) || 'Translation failed', true);
    return;
  }
  setStatus('Converted ' + res.replaced + ' price' + (res.replaced === 1 ? '' : 's') + ' to ' + selected +
    (res.stale ? ' (offline rates)' : ''));
  renderRateAge(res.fetchedAt, res.stale);
});

els.revertBtn.addEventListener('click', async () => {
  setStatus('Reverting…');
  const res = await send({ type: 'revert' });
  setStatus(res && res.ok ? 'Restored ' + res.reverted + ' price' + (res.reverted === 1 ? '' : 's') : 'Nothing to revert');
});

init();
