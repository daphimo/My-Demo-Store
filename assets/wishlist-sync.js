(() => {
  if (window.__shopifyWishlistSyncLoaded) return;
  window.__shopifyWishlistSyncLoaded = true;

  const KEY = 'shopify-wishlist';
  const OWNER_KEY = 'shopify-wishlist-customer';
  const MAX_ITEMS = 250;
  const RETRY_DELAYS = [1000, 3000, 10000];
  const config = window.ShopifyWishlistConfig || {};
  const customerId = config.customerId ? String(config.customerId) : null;
  const endpoint = config.endpoint || '/apps/wishlist';
  const validHandle = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(value);
  const normalize = (items) => [...new Set((Array.isArray(items) ? items : []).map((item) => typeof item === 'string' ? item.trim() : item).filter(validHandle))].slice(0, MAX_ITEMS);
  let revision = null;
  let baseline = [];
  let changeVersion = 0;
  let authenticated = false;
  let initializing = true;
  let timer = null;
  let running = false;
  let queued = false;

  function debugEnabled() {
    if (window.WISHLIST_DEBUG || window.ShopifyWishlistDebug) return true;
    try {
      return localStorage.getItem('shopify-wishlist-debug') === 'true';
    } catch (_) {
      return false;
    }
  }

  function debug(message, details) {
    if (!debugEnabled()) return;
    if (details === undefined) console.info(`[Wishlist Debug] ${message}`);
    else console.info(`[Wishlist Debug] ${message}`, details);
  }

  function requestId() {
    const random = globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10);
    return `wishlist-debug-${Date.now()}-${random}`;
  }

  function read(key = KEY) {
    try {
      const value = localStorage.getItem(key);
      if (key !== KEY) return value;
      const wishlist = normalize((value || '').split(','));
      debug('Local wishlist loaded', { key: KEY, storageAvailable: true, wishlist });
      return wishlist;
    } catch (error) {
      debug('localStorage unavailable', { key, error: error?.name || 'StorageError' });
      return key === KEY ? [] : null;
    }
  }

  function write(wishlist, source) {
    const normalized = normalize(wishlist);
    try {
      if (normalized.length) localStorage.setItem(KEY, normalized.join(','));
      else localStorage.removeItem(KEY);
    } catch (error) {
      debug('localStorage write failed', { error: error?.name || 'StorageError' });
      return false;
    }
    document.dispatchEvent(new CustomEvent('shopify-wishlist:updated', { detail: { wishlist: normalized, source } }));
    debug('Local wishlist updated', { source, wishlist: normalized });
    return true;
  }

  function setOwner(value) {
    try {
      if (value) localStorage.setItem(OWNER_KEY, value);
      else localStorage.removeItem(OWNER_KEY);
    } catch (error) {
      debug('Customer boundary could not be persisted', { error: error?.name || 'StorageError' });
    }
  }

  async function request(method, body) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const debugRequestId = requestId();
    debug('API REQUEST', { requestId: debugRequestId, endpoint, method, body: body || null });
    try {
      const response = await fetch(endpoint, {
        method,
        credentials: 'same-origin',
        headers: body
          ? { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Wishlist-Debug-Request-Id': debugRequestId }
          : { Accept: 'application/json', 'X-Wishlist-Debug-Request-Id': debugRequestId },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const responseRequestId = response.headers.get('X-Wishlist-Debug-Request-Id') || debugRequestId;
      let data;
      try {
        data = await response.json();
      } catch (_) {
        debug('API ERROR', { requestId: responseRequestId, status: response.status, error: 'INVALID_JSON_RESPONSE' });
        throw Object.assign(new Error('Backend returned invalid JSON.'), { status: response.status });
      }
      debug('API RESPONSE', {
        requestId: responseRequestId,
        status: response.status,
        ok: response.ok,
        method,
        wishlist: normalize(data.wishlist),
        error: data.error?.code,
      });
      if (!response.ok) {
        debug('API ERROR', {
          requestId: responseRequestId,
          status: response.status,
          error: data.error?.code || 'REQUEST_FAILED',
          message: data.error?.message || 'Wishlist request failed.',
        });
        throw Object.assign(new Error(data.error?.message || 'Wishlist request failed.'), {
          status: response.status,
          code: data.error?.code,
          data,
        });
      }
      return data;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function applyDelta(server, base, desired) {
    const baseSet = new Set(base);
    const desiredSet = new Set(desired);
    const removed = new Set([...baseSet].filter((item) => !desiredSet.has(item)));
    const result = normalize(server).filter((item) => !removed.has(item));
    for (const item of desiredSet) if (!baseSet.has(item) && !result.includes(item)) result.push(item);
    return normalize(result);
  }

  async function save(attempt = 0) {
    const desired = read();
    const requestBase = [...baseline];
    const requestVersion = changeVersion;
    try {
      const data = await request('POST', { wishlist: desired, revision });
      revision = typeof data.revision === 'string' ? data.revision : null;
      baseline = normalize(data.wishlist);
      debug('Sync successful', { wishlist: baseline, revisionAvailable: Boolean(revision) });
      if (changeVersion !== requestVersion || JSON.stringify(read()) !== JSON.stringify(baseline)) queued = true;
    } catch (error) {
      if (error.code === 'WISHLIST_CONFLICT' && Array.isArray(error.data?.wishlist)) {
        const current = read();
        baseline = normalize(error.data.wishlist);
        revision = typeof error.data.revision === 'string' ? error.data.revision : null;
        const resolved = applyDelta(baseline, requestBase, current);
        write(resolved, 'conflict-resolution');
        debug('Conflict resolved against latest backend state', { backend: baseline, resolved });
        if (attempt < 1) return save(attempt + 1);
      }
      if ((!error.status || error.status === 429 || error.status >= 500) && attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt];
        debug('Sync retry scheduled', { attempt: attempt + 1, delay, reason: error.code || error.name });
        await new Promise((resolve) => window.setTimeout(resolve, delay));
        return save(attempt + 1);
      }
      debug('Sync failed; local wishlist retained', { status: error.status, code: error.code, message: error.message });
    }
  }

  async function flush() {
    if (!customerId || !authenticated) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    queued = false;
    await save();
    running = false;
    if (queued) schedule(0);
  }

  function schedule(delay = 600) {
    if (!customerId || !authenticated || initializing) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, delay);
    debug('Sync scheduled', { delay });
  }

  async function initialize() {
    debug('Initializing wishlist', {
      customerId,
      loggedIn: Boolean(customerId),
      customerConfigPresent: Boolean(config.customerId),
      endpoint,
      storageKey: KEY,
    });
    const previousOwner = read(OWNER_KEY);
    if (!customerId) {
      if (previousOwner) {
        write([], 'logout');
        setOwner(null);
        debug('Logout boundary applied; customer-owned cache cleared');
      }
      initializing = false;
      return;
    }

    if (previousOwner && previousOwner !== customerId) {
      write([], 'customer-change');
      debug('Customer identity changed; previous customer cache cleared');
    }

    try {
      const data = await request('GET');
      if (!data.authenticated) {
        debug('Backend did not resolve an authenticated customer');
        initializing = false;
        return;
      }
      authenticated = true;
      revision = typeof data.revision === 'string' ? data.revision : null;
      baseline = normalize(data.wishlist);
      const local = read();
      const merged = normalize([...local, ...baseline]);
      debug('REFRESH SYNC START', { localWishlist: local, remoteWishlist: baseline });
      debug('SYNC RESULT', { source: 'unique-union', finalWishlist: merged });
      setOwner(customerId);
      write(merged, 'initial-merge');
      initializing = false;
      if (JSON.stringify(merged) !== JSON.stringify(baseline)) schedule(0);
      debug('Initialization complete', { wishlist: merged });
    } catch (error) {
      initializing = false;
      debug('Initialization failed; local wishlist retained', { status: error.status, code: error.code, message: error.message });
    }
  }

  document.addEventListener('shopify-wishlist:updated', (event) => {
    if (event.detail?.source) return;
    changeVersion += 1;
    schedule();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    changeVersion += 1;
    debug('Cross-tab wishlist update received', { wishlist: normalize((event.newValue || '').split(',')) });
    schedule();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
