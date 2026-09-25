(() => {
  const STATUS_LABELS = {
    ORDER_CONFIRMED: 'Order Confirmed',
    PICKED_UP: 'Picked Up',
    IN_TRANSIT: 'In Transit',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
    FAILED: 'Delivery Attempted',
    CANCELLED: 'Cancelled',
    UNKNOWN: 'Shipment Update',
  };

  const STATUS_COPY = {
    ORDER_CONFIRMED: 'Your order has been confirmed.',
    PICKED_UP: 'Your package has been collected by the delivery partner.',
    IN_TRANSIT: 'Your package is moving through the delivery network.',
    OUT_FOR_DELIVERY: 'Your package is on the way to you.',
    DELIVERED: 'Your package has been delivered.',
    FAILED: 'The delivery partner could not complete delivery.',
    CANCELLED: 'This shipment has been cancelled.',
    UNKNOWN: 'A shipment update is available.',
  };

  const formatDate = (value, includeTime = false) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    if (includeTime) Object.assign(options, { hour: 'numeric', minute: '2-digit' });
    return new Intl.DateTimeFormat('en-IN', options).format(date);
  };

  const safeTrackingUrl = (value) => {
    if (!value) return '';
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  };

  const appendTextElement = (parent, tagName, className, text) => {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  };

  const initializeTracking = (root) => {
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    const form = root.querySelector('[data-cust-tracking-form]');
    const orderInput = root.querySelector('[data-cust-tracking-order]');
    const contactInput = root.querySelector('[data-cust-tracking-contact]');
    const submit = root.querySelector('[data-cust-tracking-submit]');
    const message = root.querySelector('[data-cust-tracking-message]');
    const results = root.querySelector('[data-cust-tracking-results]');
    let controller = null;

    if (!form || !orderInput || !contactInput || !submit || !message || !results) return;

    const setLoading = (loading) => {
      root.classList.toggle('is-loading', loading);
      root.setAttribute('aria-busy', String(loading));
      submit.disabled = loading;
      orderInput.disabled = loading;
      contactInput.disabled = loading;
    };

    const showMessage = (text) => {
      results.hidden = true;
      results.replaceChildren();
      message.textContent = text;
      message.hidden = false;
    };

    const errorMessage = (code) => {
      if (['ORDER_NOT_FOUND', 'VERIFICATION_FAILED'].includes(code)) return root.dataset.notFoundMessage;
      if (code === 'NOT_FULFILLED') return root.dataset.unshippedMessage;
      if (code === 'NO_TRACKING') return root.dataset.noTrackingMessage;
      if (code === 'UNKNOWN_CARRIER') return root.dataset.unknownCarrierMessage;
      return root.dataset.errorMessage;
    };

    const addFact = (container, label, value) => {
      if (!value) return;
      const item = document.createElement('div');
      item.className = 'cust-order-tracking__fact';
      appendTextElement(item, 'dt', '', label);
      appendTextElement(item, 'dd', '', value);
      container.appendChild(item);
    };

    const renderTimeline = (shipment) => {
      const events = Array.isArray(shipment.events) ? shipment.events : [];
      if (root.dataset.showTimeline !== 'true' || !events.length) return null;

      const wrap = document.createElement('div');
      wrap.className = 'cust-order-tracking__timeline-wrap';
      appendTextElement(wrap, 'h3', 'cust-order-tracking__timeline-title', 'Tracking timeline');
      const list = document.createElement('ol');
      list.className = 'cust-order-tracking__timeline';

      events.forEach((event, index) => {
        const item = document.createElement('li');
        item.className = 'cust-order-tracking__event';
        const dot = appendTextElement(item, 'span', 'cust-order-tracking__event-dot', index === 0 ? '●' : '✓');
        dot.setAttribute('aria-hidden', 'true');
        const content = document.createElement('div');
        const eventStatus = STATUS_LABELS[event.status] || event.label || STATUS_LABELS.UNKNOWN;
        appendTextElement(content, 'p', 'cust-order-tracking__event-title', eventStatus);
        const eventMeta = [formatDate(event.timestamp, true), event.location].filter(Boolean).join(' · ');
        if (eventMeta) appendTextElement(content, 'p', 'cust-order-tracking__event-meta', eventMeta);
        item.appendChild(content);
        list.appendChild(item);
      });

      wrap.appendChild(list);
      return wrap;
    };

    const renderShipment = (shipment, index, total) => {
      const card = document.createElement('article');
      card.className = 'cust-order-tracking__shipment';
      if (total > 1) appendTextElement(card, 'p', 'cust-order-tracking__shipment-number', `Shipment ${index + 1} of ${total}`);

      const status = STATUS_LABELS[shipment.status] ? shipment.status : 'UNKNOWN';
      const statusCard = document.createElement('div');
      statusCard.className = 'cust-order-tracking__status-card';
      appendTextElement(statusCard, 'p', 'cust-order-tracking__status-label', 'Current status');
      appendTextElement(statusCard, 'h3', 'cust-order-tracking__status', shipment.statusLabel || STATUS_LABELS[status]);
      appendTextElement(statusCard, 'p', 'cust-order-tracking__status-copy', STATUS_COPY[status]);
      card.appendChild(statusCard);

      const facts = document.createElement('dl');
      facts.className = 'cust-order-tracking__facts';
      addFact(facts, 'Delivery Partner', shipment.carrierName);
      addFact(facts, 'AWB', shipment.awb);
      addFact(facts, 'Estimated Delivery', formatDate(shipment.estimatedDelivery));
      if (facts.children.length) card.appendChild(facts);

      const trackingUrl = safeTrackingUrl(shipment.trackingUrl);
      if (trackingUrl) {
        const link = appendTextElement(card, 'a', 'cust-order-tracking__shipment-link', 'Track Shipment');
        link.href = trackingUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }

      const timeline = renderTimeline(shipment);
      if (timeline) card.appendChild(timeline);
      return card;
    };

    const render = (data) => {
      if (!data?.success) {
        showMessage(errorMessage(data?.code));
        return;
      }

      const shipments = Array.isArray(data.shipments) && data.shipments.length
        ? data.shipments
        : data.tracking
          ? [data.tracking]
          : [];
      if (!shipments.length) {
        showMessage(root.dataset.noTrackingMessage);
        return;
      }

      results.replaceChildren();
      appendTextElement(results, 'h2', 'cust-order-tracking__order', `Order ${data.order?.number || ''}`.trim());
      shipments.forEach((shipment, index) => results.appendChild(renderShipment(shipment, index, shipments.length)));
      message.hidden = true;
      results.hidden = false;
    };

    const track = async () => {
      const orderNumber = orderInput.value.trim();
      const contact = contactInput.value.trim();
      if (!orderNumber || !contact) {
        showMessage('Please enter your order number and email or phone number.');
        (!orderNumber ? orderInput : contactInput).focus();
        return;
      }
      if (orderNumber.length > 64 || contact.length > 254 || /[<>\r\n]/.test(`${orderNumber}${contact}`)) {
        showMessage(root.dataset.notFoundMessage);
        return;
      }
      if (!root.dataset.endpoint) {
        showMessage(root.dataset.errorMessage);
        return;
      }

      controller?.abort();
      controller = new AbortController();
      message.textContent = root.dataset.loadingMessage;
      message.hidden = false;
      results.hidden = true;
      setLoading(true);

      try {
        const endpoint = new URL(root.dataset.endpoint, window.location.origin);
        if (endpoint.origin !== window.location.origin) throw new Error('Proxy must be same-origin');
        const response = await fetch(endpoint.toString(), {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ orderNumber, contact }),
          signal: controller.signal,
        });
        let data = null;
        try { data = await response.json(); } catch (error) { /* Sanitized fallback below. */ }
        if (!response.ok && !data?.code) throw new Error(`Proxy returned ${response.status}`);
        render(data);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.warn('[Order tracking] Tracking request failed.');
          showMessage(root.dataset.errorMessage);
        }
      } finally {
        setLoading(false);
        controller = null;
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!submit.disabled) track();
    });
  };

  const initAll = (scope = document) => scope.querySelectorAll('[data-cust-order-tracking]').forEach(initializeTracking);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initAll(), { once: true });
  else initAll();
  document.addEventListener('shopify:section:load', (event) => initAll(event.target));
})();
