(() => {
  if (customElements.get('cp-variant-picker')) return;
  const formatMoney = (cents, format) => {
    const value = (Number(cents || 0) / 100).toFixed(2);
    const parts = value.split('.');
    const amount = Number(parts[0]).toLocaleString('en-IN');
    const amountNoDecimals = Number(parts[0]).toLocaleString('en-IN');
    if (!format) return `₹${amount}.${parts[1]}`;
    return format
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/, amountNoDecimals)
      .replace(/\{\{\s*amount\s*\}\}/, `${amount}.${parts[1]}`);
  };
  class VariantPicker extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector('[role=dialog]');
      this.variants = JSON.parse(this.querySelector('[data-product-variants]').textContent);
      this.prices = JSON.parse(this.querySelector('[data-variant-prices]').textContent);
      this.selected = [...this.querySelectorAll('[data-option-index]')].map((group) => group.querySelector('[aria-pressed=true]').dataset.value);
      this.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => this.close()));
      this.querySelectorAll('[data-variant-value]').forEach((button) => button.addEventListener('click', () => this.select(button)));
      this.querySelector('product-form').addEventListener('product-form:added', () => {
        const cart = document.querySelector('cart-drawer');
        if (cart && this.trigger) cart.setActiveElement(this.trigger);
        this.close(true);
        this.remove();
      });
      this.update();
    }
    open(trigger) {
      this.trigger = trigger; this.previousOverflow = document.body.style.overflow; this.setAttribute('open', ''); document.body.style.overflow = 'hidden';
      this.dialog.focus();
    }
    close(force = false) {
      if (!force && this.querySelector('[data-popup-add].loading')) return;
      this.removeAttribute('open'); document.body.style.overflow = this.previousOverflow || ''; if (this.trigger) this.trigger.focus();
    }
    select(button) {
      const group = button.closest('[data-option-index]');
      group.querySelectorAll('[data-variant-value]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      this.selected[Number(group.dataset.optionIndex)] = button.dataset.value; this.update();
    }
    update() {
      this.querySelectorAll('[data-option-index]').forEach((group) => {
        const index = Number(group.dataset.optionIndex);
        group.querySelectorAll('[data-variant-value]').forEach((button) => {
          const possible = this.variants.some((variant) => variant.available && variant.options.every((value, optionIndex) => optionIndex === index ? value === button.dataset.value : value === this.selected[optionIndex]));
          button.disabled = !possible;
        });
      });
      const variant = this.variants.find((item) => item.options.every((value, index) => value === this.selected[index]));
      const add = this.querySelector('[data-popup-add]'); const input = this.querySelector('[name=id]');
      add.disabled = !variant || !variant.available; input.disabled = !variant || !variant.available;
      add.querySelector('[data-label]').textContent = variant && variant.available ? add.dataset.addLabel : add.dataset.unavailableLabel;
      if (!variant) return;
      input.value = variant.id;
      const prices = this.prices[String(variant.id)];
      this.querySelector('[data-popup-price]').textContent = prices ? prices.price : formatMoney(variant.price, this.dataset.moneyFormat);
      const compare = this.querySelector('[data-popup-compare]');
      if (variant.compare_at_price && variant.compare_at_price > variant.price) { compare.textContent = prices ? prices.compare : formatMoney(variant.compare_at_price, this.dataset.moneyFormat); compare.hidden = false; } else compare.hidden = true;
      const imageId = variant.featured_image && variant.featured_image.id;
      if (imageId) { const image = this.querySelector(`[data-media-id="${imageId}"]`); if (image) this.querySelector('[data-popup-images]').scrollTo({ left:image.offsetLeft, behavior:'smooth' }); }
    }
  }
  customElements.define('cp-variant-picker', VariantPicker);
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-variant-picker]');
    if (!button) return;
    const id = button.dataset.openVariantPicker;
    let picker = document.getElementById(id);
    if (!picker) {
      const template = document.getElementById(`${id}-template`);
      if (!template) return;
      document.body.appendChild(template.content.cloneNode(true));
      picker = document.getElementById(id);
    }
    picker?.open(button);
  });
  document.addEventListener('keydown', (event) => {
    const picker = document.querySelector('cp-variant-picker[open]'); if (!picker) return;
    if (event.key === 'Escape') picker.close();
    if (event.key === 'Tab') { const items=[...picker.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')]; const first=items[0],last=items[items.length-1]; if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();} }
  });
})();
