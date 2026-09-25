class CartDrawer extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    if (!cartLink) return;

    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    if (this.classList.contains('active') || this.classList.contains('opening')) return;
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    this.classList.add('opening');
    this.openFrame = requestAnimationFrame(() => {
      this.classList.remove('opening');
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true },
    );

    document.body.classList.add('overflow-hidden');

    // cart-drawer-items is a CartItems subclass that extends createViewEventElement.
    // Its `view-event-trigger="manual"` skips auto-dispatch on connect; we fire
    // it here when the drawer opens, with `context: 'dialog'` from the payload attribute.
    this.querySelector('cart-drawer-items')?.dispatchViewEvent?.();
  }

  close() {
    if (this.openFrame) cancelAnimationFrame(this.openFrame);
    this.classList.remove('opening');
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  async renderContents(parsedState) {
    const renderSequence = this.renderSequence = (this.renderSequence || 0) + 1;
    this.productId = parsedState.id;
    let sections = parsedState.sections;
    if (!sections?.['cart-drawer'] || !sections?.['cart-icon-bubble']) {
      const cartRoot = window.Shopify?.routes?.root || window.routes.cart_url.replace(/cart\/?$/, '');
      const url = `${cartRoot}cart?sections=cart-drawer,cart-icon-bubble`;
      const response = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        console.error('Cart sections returned an unexpected response', { url: response.url || url, status: response.status, expected: 'application/json', received: contentType || 'unknown' });
        throw new Error('Cart sections unavailable');
      }
      sections = await response.json();
    }
    if (renderSequence !== this.renderSequence) return;
    const drawerHtml = sections['cart-drawer'];
    const drawerContent = drawerHtml && this.getSectionDOM(drawerHtml, '#CartDrawer');
    const drawerTarget = this.querySelector('#CartDrawer');
    if (!drawerContent || !drawerTarget) throw new Error('Cart drawer section missing');
    drawerTarget.innerHTML = drawerContent.innerHTML;

    // The header uses its own bag SVG. Refresh only the count, preserving its icon and listeners.
    const headerCart = document.getElementById('cart-icon-bubble');
    const bubbleHtml = sections['cart-icon-bubble'];
    if (headerCart && bubbleHtml) {
      const nextBubble = this.getSectionDOM(bubbleHtml)?.querySelector('.cart-count-bubble');
      headerCart.querySelector('.cart-count-bubble')?.remove();
      if (nextBubble) headerCart.appendChild(nextBubble);
    }

    this.querySelector('#CartDrawer-Overlay')?.addEventListener('click', this.close.bind(this));
    this.classList.remove('is-empty');
    this.open();
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'CartDrawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);
