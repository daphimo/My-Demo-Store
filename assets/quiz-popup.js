(() => {
  if (window.quizPopupController) return;

  const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let activePopup = null;
  let activeTrigger = null;
  let closeTimer = null;

  const close = (restoreFocus = true) => {
    if (!activePopup) return;
    const popup = activePopup;
    const trigger = activeTrigger;
    activePopup = null;
    activeTrigger = null;
    popup.classList.remove('is-open');
    popup.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('quiz-popup-open');
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      popup.hidden = true;
      if (restoreFocus && trigger?.isConnected) trigger.focus();
    }, 200);
  };

  const open = (trigger) => {
    const popup = trigger.closest('[data-quiz-section]')?.querySelector('[data-quiz-popup]');
    if (!popup) return;
    if (activePopup) close(false);
    activePopup = popup;
    activeTrigger = trigger;
    document.body.classList.add('quiz-popup-open');
    popup.hidden = false;
    popup.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      popup.classList.add('is-open');
      popup.querySelector('.quiz-popup__close')?.focus();
    });
  };

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-quiz-open]');
    if (opener) {
      event.preventDefault();
      open(opener);
    } else if (event.target.closest('[data-quiz-close]')) {
      event.preventDefault();
      close();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!activePopup) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...activePopup.querySelectorAll(focusableSelector)].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('shopify:section:unload', (event) => {
    if (activePopup?.closest(`#shopify-section-${event.detail.sectionId}`)) close(false);
  });

  window.quizPopupController = { open, close };
})();
