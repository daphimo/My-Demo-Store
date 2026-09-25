  (() => {
    const root = document.querySelector('[data-cp-header]');
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';
    const opener = root.querySelector('[data-drawer-open]');
    const drawer = root.querySelector('[data-drawer]');
    const closeButtons = root.querySelectorAll('[data-drawer-close]');
    const firstAccordion = root.querySelector('[data-first-accordion]');
    const shouldOpenFirst = root.dataset.openFirst === 'true';
    let previousFocus = null;
    let previousBodyOverflow = '';
    const syncAncestors = (panel) => {
      let ancestor = panel.parentElement && panel.parentElement.closest('.cp-accordion-panel');
      while (ancestor) {
        const trigger = root.querySelector(`[aria-controls="${ancestor.id}"]`);
        if (trigger && trigger.getAttribute('aria-expanded') === 'true') ancestor.style.height = `${ancestor.scrollHeight}px`;
        ancestor = ancestor.parentElement && ancestor.parentElement.closest('.cp-accordion-panel');
      }
    };
    const setAccordion = (trigger, expand) => {
      const panel = root.querySelector(`#${CSS.escape(trigger.getAttribute('aria-controls'))}`);
      if (!panel) return;
      trigger.setAttribute('aria-expanded', String(expand));
      panel.setAttribute('aria-hidden', String(!expand));
      panel.style.height = `${panel.scrollHeight}px`;
      if (!expand) requestAnimationFrame(() => { panel.style.height = '0px'; syncAncestors(panel); });
      else syncAncestors(panel);
    };
    const resetAccordions = () => {
      root.querySelectorAll('[data-accordion-trigger]').forEach((trigger) => setAccordion(trigger, false));
      if (shouldOpenFirst && firstAccordion) requestAnimationFrame(() => setAccordion(firstAccordion, true));
    };
    const openDrawer = () => {
      previousFocus = document.activeElement; resetAccordions(); root.classList.add('is-drawer-open');
      opener.setAttribute('aria-expanded', 'true'); drawer.setAttribute('aria-hidden', 'false');
      previousBodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => drawer.querySelector('[data-drawer-close]').focus());
    };
    const closeDrawer = () => {
      root.classList.remove('is-drawer-open'); opener.setAttribute('aria-expanded', 'false'); drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = previousBodyOverflow; if (previousFocus) previousFocus.focus();
    };
    opener.addEventListener('click', openDrawer);
    closeButtons.forEach((button) => button.addEventListener('click', closeDrawer));
    root.addEventListener('click', (event) => { const trigger = event.target.closest('[data-accordion-trigger]'); if (trigger) setAccordion(trigger, trigger.getAttribute('aria-expanded') !== 'true'); });
    root.querySelectorAll('[data-desktop-disclosure]').forEach((details) => {
      const summary = details.querySelector('summary');
      details.addEventListener('toggle', () => { summary.setAttribute('aria-expanded', String(details.open)); if (details.open) root.querySelectorAll('[data-desktop-disclosure][open]').forEach((other) => { if (other !== details) other.removeAttribute('open'); }); });
      details.addEventListener('pointerenter', () => { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) details.open = true; });
      details.addEventListener('pointerleave', () => { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) details.open = false; });
    });
    document.addEventListener('click', (event) => { if (!root.contains(event.target)) root.querySelectorAll('[data-desktop-disclosure][open]').forEach((details) => details.removeAttribute('open')); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (root.classList.contains('is-drawer-open')) closeDrawer();
        root.querySelectorAll('[data-desktop-disclosure][open]').forEach((details) => details.removeAttribute('open'));
      }
      if (event.key === 'Tab' && root.classList.contains('is-drawer-open')) {
        const focusable = [...drawer.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((item) => item.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('resize', () => { if (window.innerWidth >= 990 && root.classList.contains('is-drawer-open')) closeDrawer(); });
  })();

  if (!customElements.get('sticky-header')) {
    customElements.define('sticky-header', class StickyHeader extends HTMLElement {
      connectedCallback() {
        this.header = document.querySelector('.section-header'); this.type = this.dataset.stickyType;
        this.always = this.type === 'always' || this.type === 'reduce-logo-size'; this.lastScroll = window.scrollY;
        this.onScroll = this.handleScroll.bind(this); document.documentElement.style.setProperty('--header-height', `${this.header.offsetHeight}px`);
        if (this.always) this.header.classList.add('shopify-section-header-sticky');
        window.addEventListener('scroll', this.onScroll, { passive: true });
      }
      disconnectedCallback() { window.removeEventListener('scroll', this.onScroll); }
      handleScroll() {
        const current = window.scrollY;
        if (!this.always && current > this.offsetHeight && current > this.lastScroll) this.header.classList.add('shopify-section-header-hidden', 'shopify-section-header-sticky');
        else if (current < this.lastScroll || current <= this.offsetHeight) this.header.classList.remove('shopify-section-header-hidden');
        if (current <= 0 && !this.always) this.header.classList.remove('shopify-section-header-sticky'); this.lastScroll = current;
      }
    });
  }
