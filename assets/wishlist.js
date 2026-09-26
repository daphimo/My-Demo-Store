(() => {
  const KEY = 'shopify-wishlist';
  const BUTTON = '[button-wishlist]';
  const CARD = '.wishlist-product-card';
  const validHandle = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value);
  let memoryWishlist = [];
  const gridRevisions = new WeakMap();
  const cardCache = new Map();

  function debug(message, details) {
    let enabled = Boolean(window.WISHLIST_DEBUG || window.ShopifyWishlistDebug);
    try { enabled ||= localStorage.getItem('shopify-wishlist-debug') === 'true'; } catch (_) { /* unavailable */ }
    if (!enabled) return;
    if (details === undefined) console.info(`[Wishlist Debug] ${message}`);
    else console.info(`[Wishlist Debug] ${message}`, details);
  }

  function read() {
    try {
      memoryWishlist = [...new Set((localStorage.getItem(KEY) || '').split(',').filter(validHandle))].slice(0, 250);
      return [...memoryWishlist];
    } catch (_) {
      return [...memoryWishlist];
    }
  }

  function write(handles) {
    handles = [...new Set(handles.filter(validHandle))].slice(0, 250);
    memoryWishlist = handles;
    try {
      if (handles.length) localStorage.setItem(KEY, handles.join(','));
      else localStorage.removeItem(KEY);
    } catch (_) {
      announce('Wishlist could not be saved on this device.');
    }
    document.dispatchEvent(new CustomEvent('shopify-wishlist:updated', { detail: { wishlist: handles } }));
    return true;
  }

  function announce(message) {
    document.querySelectorAll('[data-wishlist-status]').forEach((node) => { node.textContent = message; });
  }

  function syncButtons() {
    const saved = new Set(read());
    document.querySelectorAll(BUTTON).forEach((button) => {
      const active = saved.has(button.dataset.productHandle);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', `${active ? 'Remove' : 'Add'} ${button.dataset.productTitle || 'product'} ${active ? 'from' : 'to'} wishlist`);
    });
    document.querySelectorAll('.wishlist-count-bubble').forEach((badge) => {
      badge.textContent = String(saved.size);
      badge.hidden = saved.size === 0;
    });
    document.dispatchEvent(new CustomEvent('shopify-wishlist:init-buttons', { detail: { wishlist: [...saved] } }));
  }

  async function fetchCard(handle) {
    if (cardCache.has(handle)) return cardCache.get(handle).then((card) => card?.cloneNode(true) || null);
    const pending = requestCard(handle);
    cardCache.set(handle, pending);
    const card = await pending;
    if (!card) cardCache.delete(handle);
    return card?.cloneNode(true) || null;
  }

  async function requestCard(handle) {
    try {
      const root = window.Shopify?.routes?.root || '/';
      const response = await fetch(`${root}products/${encodeURIComponent(handle)}?view=card`, { credentials: 'same-origin' });
      if (!response.ok) return null;
      const documentFragment = new DOMParser().parseFromString(await response.text(), 'text/html');
      const card = documentFragment.querySelector(CARD);
      return card?.dataset.productHandle === handle ? card : null;
    } catch (_) {
      return null;
    }
  }

  async function renderGrid(section) {
    const grid = section.querySelector('[grid-wishlist]');
    if (!grid) return;
    const current = (gridRevisions.get(grid) || 0) + 1;
    gridRevisions.set(grid, current);
    const handles = read();
    grid.setAttribute('aria-busy', 'true');
    if (!handles.length) grid.replaceChildren();
    const cards = handles.length ? await Promise.all(handles.map(fetchCard)) : [];
    if (current !== gridRevisions.get(grid) || !section.isConnected) return;
    grid.replaceChildren(...cards.filter(Boolean));
    grid.removeAttribute('aria-busy');
    section.querySelector('[data-wishlist-empty]').hidden = cards.some(Boolean);
    const addAll = section.querySelector('[data-wishlist-add-all]');
    if (addAll) addAll.hidden = !cards.some(Boolean);
    syncButtons();
    document.dispatchEvent(new CustomEvent('shopify-wishlist:init-product-grid', { detail: { wishlist: handles } }));
    if (handles.length && !cards.some(Boolean)) announce('Saved products are unavailable right now.');
  }

  async function addAll(button) {
    if (button.disabled) return;
    const section = button.closest('[data-wishlist-section]');
    const items = [...section.querySelectorAll(CARD)]
      .filter((card) => card.dataset.productAvailable === 'true')
      .map((card) => ({ id: Number(card.dataset.variantId), quantity: 1 }))
      .filter((item) => Number.isSafeInteger(item.id) && item.id > 0);
    if (!items.length) { announce('No wishlist items are currently available.'); return; }
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const root = window.Shopify?.routes?.root || '/';
      const response = await fetch(`${root}cart/add.js`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error('Unable to add wishlist items to cart.');
      announce('Wishlist items added to cart.');
      window.location.assign(window.Shopify?.routes?.cart_url || `${root}cart`);
    } catch (error) {
      announce(error.message);
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest(BUTTON) : null;
    if (button) {
      const handle = button.dataset.productHandle;
      if (!validHandle(handle)) return;
      event.preventDefault();
      event.stopPropagation();
      const handles = read();
      const next = handles.includes(handle) ? handles.filter((item) => item !== handle) : [...handles, handle];
      debug(next.includes(handle) ? 'ADD wishlist item' : 'REMOVE wishlist item', {
        productHandle: handle,
        wishlistBefore: handles,
        wishlistAfter: next,
      });
      if (write(next)) announce(`${button.dataset.productTitle || 'Product'} ${next.includes(handle) ? 'added to' : 'removed from'} wishlist.`);
      return;
    }
    const addAllButton = event.target instanceof Element ? event.target.closest('[data-wishlist-add-all]') : null;
    if (addAllButton) addAll(addAllButton);
  });

  function init() {
    syncButtons();
    document.querySelectorAll('[data-wishlist-section]').forEach(renderGrid);
  }
  document.addEventListener('shopify-wishlist:updated', init);
  document.addEventListener('shopify:section:load', init);
  window.addEventListener('storage', (event) => { if (event.key === KEY) init(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
