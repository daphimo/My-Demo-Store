(() => {
  const cache = new Map();

  const escapeHtml = (value) => {
    const node = document.createElement('span');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  };

  const initChecker = (root) => {
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';
    const form = root.querySelector('[data-cust-pincode-form]');
    const input = root.querySelector('[data-cust-pincode-input]');
    const button = root.querySelector('[data-cust-pincode-submit]');
    const result = root.querySelector('[data-cust-pincode-result]');
    if (!form || !input || !button || !result) return;

    const messages = {
      loading: root.dataset.loadingText,
      success: root.dataset.successMessage,
      unavailable: root.dataset.unavailableMessage,
      invalid: root.dataset.invalidMessage,
      error: root.dataset.errorMessage,
    };
    const showCod = root.dataset.showCod === 'true';
    const showPrepaid = root.dataset.showPrepaid === 'true';
    const showLocation = root.dataset.showLocation === 'true';
    let controller = null;

    const setLoading = (loading) => {
      root.classList.toggle('is-loading', loading);
      root.setAttribute('aria-busy', String(loading));
      button.disabled = loading;
    };
    const render = (type, lines) => {
      result.className = `cust-pincode-checker__result is-${type}`;
      result.innerHTML = lines.map((line) => `<p class="cust-pincode-checker__status"><span class="cust-pincode-checker__symbol" aria-hidden="true">${type === 'success' ? '✓' : '✕'}</span><span>${escapeHtml(line)}</span></p>`).join('');
      result.hidden = false;
    };
    const renderResponse = (data, pincode) => {
      if (!data || typeof data.serviceable !== 'boolean') throw new Error('Unexpected proxy response');
      if (!data.serviceable) { render('error', [data.message || messages.unavailable]); return; }
      const lines = [(messages.success || 'Delivery available to [pincode].').replace('[pincode]', pincode)];
      if (showLocation) {
        const location = [data.city, data.district, data.stateCode].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(', ');
        if (location) lines.push(`Delivering to ${location}`);
      }
      if (showCod && data.cod === true) lines.push('Cash on Delivery available');
      if (showPrepaid && data.prepaid === true) lines.push('Online payment available');
      if (data.oda === true) lines.push('This is an out-of-delivery-area location; delivery may take longer.');
      render('success', lines);
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const pincode = input.value.trim();
      if (!/^\d{6}$/.test(pincode)) { render('error', [messages.invalid]); input.focus(); return; }
      if (!root.dataset.endpoint) { render('error', [messages.error]); return; }
      if (cache.has(pincode)) { renderResponse(cache.get(pincode), pincode); return; }
      controller?.abort();
      controller = new AbortController();
      result.className = 'cust-pincode-checker__result'; result.textContent = messages.loading; result.hidden = false;
      setLoading(true);
      try {
        const endpoint = new URL(root.dataset.endpoint, window.location.origin);
        if (endpoint.origin !== window.location.origin) throw new Error('Proxy endpoint must be same-origin');
        endpoint.searchParams.set('pincode', pincode);
        const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error(`Proxy returned ${response.status}`);
        const data = await response.json();
        cache.set(pincode, data);
        renderResponse(data, pincode);
      } catch (error) {
        if (error.name !== 'AbortError') { console.warn('[Pincode checker] Serviceability request failed.'); render('error', [messages.error]); }
      } finally { setLoading(false); controller = null; }
    });
  };

  const initAll = (scope = document) => scope.querySelectorAll('[data-cust-pincode-checker]').forEach(initChecker);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
  document.addEventListener('shopify:section:load', (event) => initAll(event.target));
})();
