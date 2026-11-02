class AmediaPersonaliaBehavior {
  static id = "AmediaPersonaliaBehavior";
  static name = "AmediaPersonaliaBehavior";
  static runInIframe = false;

  // List page, e.g. /vis/personalia/greetings/all
  static LIST_PATH = /^\/vis\/personalia\/greetings(?:\/all)?\/?$/i;
  // Single greeting, e.g. /vis/personalia/greetings/all/<22 character id>
  static CARD_PATH = /^\/vis\/personalia\/greetings\/all\/([A-Za-z0-9_-]{16,})\/?$/;

  cfg = {
    scrollStepFactor: 3,      // viewport heights per scroll step
    scrollWaitMs: 400,
    maxScrollPulses: 60,
    stablePulses: 5,          // pulses without new cards before giving up
    cardTimeoutMs: 4000,      // wait for the detail dialog and its API request
    closeTimeoutMs: 2000,
    cardAttempts: 2,
    budgetMs: 8 * 60 * 1000,  // own time budget, the crawler's behavior timeout still applies
    logEvery: 25
  };

  cardIds = new Set();

  // Called without arguments by browsertrix-behaviors, so the page location is used.
  static isMatch() {
    return AmediaPersonaliaBehavior.LIST_PATH.test(window.location.pathname);
  }

  static init() {
    return { state: { cardsFound: 0, cardsOpened: 0, cardsFailed: 0 } };
  }

  // --- HELPERS THAT WORK WITH THE BROWSERTRIX CONTEXT ---
  async sleep(ctx, ms) {
    const fn = (ctx?.Lib?.sleep) || ctx?.sleep;
    if (typeof fn === 'function') {
      await fn(ms);
    } else {
      await new Promise(r => setTimeout(r, ms));
    }
  }

  log(ctx, msgObj) {
    const fn = (ctx?.Lib?.log) || ctx?.log;
    if (typeof fn === 'function') {
      try {
        fn.call(ctx, msgObj);
        return;
      } catch (e) {}
    }
    console.log(typeof msgObj === 'string' ? msgObj : (msgObj?.msg || msgObj));
  }

  // Updates the shared behavior state and returns the step that run() yields.
  getState(ctx, msg, patch) {
    if (patch && ctx?.state) {
      Object.assign(ctx.state, patch);
    }
    const fn = ctx?.Lib?.getState;
    if (typeof fn === 'function') {
      try {
        return fn(ctx, msg);
      } catch (e) {}
    }
    return { state: ctx?.state, msg };
  }

  async waitFor(ctx, predicate, timeoutMs, intervalMs = 50) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (predicate()) return true;
      } catch (e) {}
      await this.sleep(ctx, intervalMs);
    }
    try {
      return !!predicate();
    } catch (e) {
      return false;
    }
  }

  // --- PAGE CLASSIFICATION ---
  isListPage() {
    return AmediaPersonaliaBehavior.LIST_PATH.test(window.location.pathname);
  }

  // Returns the greeting id if the link points to a single greeting on the same host.
  static cardId(link) {
    try {
      const url = new URL(link.getAttribute('href') || '', window.location.href);
      if (url.hostname !== window.location.hostname) return null;
      const match = AmediaPersonaliaBehavior.CARD_PATH.exec(url.pathname);
      return match ? match[1] : null;
    } catch (e) {
      return null;
    }
  }

  // Adds all greeting ids currently in the DOM to cardIds and returns the total.
  collectCardIds() {
    for (const link of document.querySelectorAll('a[href]')) {
      const id = AmediaPersonaliaBehavior.cardId(link);
      if (id) this.cardIds.add(id);
    }
    return this.cardIds.size;
  }

  findCardLink(id) {
    for (const link of document.querySelectorAll(`a[href*="${id}"]`)) {
      if (AmediaPersonaliaBehavior.cardId(link) === id) return link;
    }
    return null;
  }

  // The site shows "Du har sett alle N." when the last loaded greeting is rendered.
  listEndReached() {
    const el = document.getElementById('client-snackbar');
    return !!el && /sett alle/i.test(el.textContent || '');
  }

  docHeight() {
    return Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    );
  }

  // ----------------------------------------------------
  // CONSENT AND SCROLL FIX
  // ----------------------------------------------------
  removeConsentOverlay() {
    try {
      const consentIframes = document.querySelectorAll('iframe[src*="sp.api.no"], iframe[src*="sourcepoint"], iframe[src*="consent"]');
      consentIframes.forEach(iframe => iframe.remove());

      const overlays = document.querySelectorAll('[id*="sp_message"], [class*="sp_message"], div[style*="z-index: 2147483647"]');
      overlays.forEach(el => el.remove());
    } catch (e) {
      console.debug('Overlay removal error:', e);
    }
  }

  // The consent layer locks the body (overflow hidden, position fixed), which stops the list from rendering more cards.
  fixScroll() {
    try {
      document.body.removeAttribute('style');
      document.documentElement.removeAttribute('style');

      document.body.style.setProperty('overflow', 'auto', 'important');
      document.body.style.setProperty('position', 'static', 'important');
      document.body.style.setProperty('height', 'auto', 'important');
      document.body.style.setProperty('width', 'auto', 'important');
      document.documentElement.style.setProperty('overflow', 'auto', 'important');

      if (!document.getElementById('force-scroll-fix')) {
        const style = document.createElement('style');
        style.id = 'force-scroll-fix';
        style.textContent = `
          body, html {
            overflow: auto !important;
            position: static !important;
            height: auto !important;
            width: auto !important;
          }
        `;
        document.head.appendChild(style);
      }
    } catch (e) {
      console.debug('Scroll fix error:', e);
    }
  }

  async awaitPageLoad(ctx) {
    if (!this.isListPage()) return;

    this.removeConsentOverlay();
    this.fixScroll();

    // Wait for the SPA and the Sanity API to render the first cards.
    const found = await this.waitFor(ctx, () => {
      this.removeConsentOverlay();
      this.fixScroll();
      return this.collectCardIds() > 0;
    }, 10000, 100);

    this.log(ctx, { msg: found
      ? `List rendered with ${this.cardIds.size} greeting cards`
      : 'Timed out waiting for greeting cards' });
  }

  // ----------------------------------------------------
  // PHASE 1: SCROLL UNTIL THE LIST HAS RENDERED ALL CARDS
  // ----------------------------------------------------
  async* loadAllCards(ctx) {
    const { scrollStepFactor, scrollWaitMs, maxScrollPulses, stablePulses } = this.cfg;

    let pulses = 0;
    let stable = 0;
    let lastCount = this.collectCardIds();

    while (pulses < maxScrollPulses && stable < stablePulses && !this.listEndReached()) {
      this.fixScroll();

      const viewHeight = window.innerHeight || 800;
      const maxY = Math.max(0, this.docHeight() - viewHeight);
      window.scrollTo(0, Math.min(window.scrollY + Math.round(viewHeight * scrollStepFactor), maxY));
      // The list renders more rows on window scroll events, so make sure one fires at the bottom too.
      window.dispatchEvent(new Event('scroll'));

      await this.sleep(ctx, scrollWaitMs);

      const count = this.collectCardIds();
      stable = count === lastCount ? stable + 1 : 0;
      lastCount = count;
      pulses++;

      if (pulses % 5 === 0) {
        yield this.getState(ctx, `Scrolling, ${count} cards after ${pulses} pulses`, { cardsFound: count });
      }
    }

    const reason = this.listEndReached() ? 'end of list reached' : (stable >= stablePulses ? 'no new cards' : 'pulse limit');
    this.log(ctx, { msg: `Scrolling done after ${pulses} pulses (${reason}), ${lastCount} cards` });
    yield this.getState(ctx, `Scrolling done, ${lastCount} cards`, { cardsFound: lastCount });
  }

  // ----------------------------------------------------
  // PHASE 2: OPEN EACH CARD SO THE DETAIL REQUEST IS RECORDED
  // ----------------------------------------------------
  dialogElement() {
    return document.querySelector('.MuiDialog-root');
  }

  dialogHasContent() {
    const dialog = this.dialogElement();
    return !!dialog && (dialog.textContent || '').trim().length > 0;
  }

  detailRequestCount() {
    return performance.getEntriesByType('resource')
      .filter(e => e.name.includes('sanity.io') && e.name.includes('/data/query/')).length;
  }

  async closeCard(ctx) {
    const closeSelectors = [
      '.MuiDialog-root [aria-label="Lukk"]',
      '.MuiDialog-root brick-button-v9[data-icon-id="close"]',
      '[aria-label="Lukk"]',
      'brick-button-v9[data-icon-id="close"]'
    ];

    for (const selector of closeSelectors) {
      const closeBtn = document.querySelector(selector);
      if (closeBtn) {
        closeBtn.click();
        break;
      }
    }

    let closed = await this.waitFor(ctx, () => !this.dialogElement(), this.cfg.closeTimeoutMs);
    if (!closed) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
      closed = await this.waitFor(ctx, () => !this.dialogElement(), this.cfg.closeTimeoutMs);
    }

    // The dialog is a route, so the list URL must be back before the next card is opened.
    if (!this.isListPage()) {
      window.history.back();
      await this.waitFor(ctx, () => this.isListPage() && !this.dialogElement(), this.cfg.closeTimeoutMs);
    }
    return closed;
  }

  // Returns true if the detail dialog rendered and its API request completed.
  async captureCard(ctx, id) {
    const link = this.findCardLink(id);
    if (!link) return false;

    link.scrollIntoView({ block: 'center', behavior: 'instant' });
    // Keeps the resource timing buffer from filling up, so new requests are always visible.
    performance.clearResourceTimings();
    link.click();

    const loaded = await this.waitFor(
      ctx,
      () => this.dialogHasContent() && this.detailRequestCount() > 0,
      this.cfg.cardTimeoutMs
    );
    await this.closeCard(ctx);
    return loaded;
  }

  async* captureCards(ctx, deadline) {
    const { cardAttempts, logEvery } = this.cfg;
    const ids = Array.from(this.cardIds);
    let opened = 0;
    let failed = 0;

    for (let i = 0; i < ids.length; i++) {
      if (Date.now() > deadline) {
        this.log(ctx, { msg: `Time budget used up after ${i} of ${ids.length} cards` });
        break;
      }

      let ok = false;
      for (let attempt = 0; attempt < cardAttempts && !ok; attempt++) {
        try {
          ok = await this.captureCard(ctx, ids[i]);
        } catch (e) {
          this.log(ctx, { msg: `Error opening card ${ids[i]}: ${e.message}` });
        }
      }

      if (ok) {
        opened++;
      } else {
        failed++;
        this.log(ctx, { msg: `Could not capture card ${ids[i]}` });
      }

      if ((i + 1) % logEvery === 0) {
        yield this.getState(ctx, `Opened ${opened} of ${ids.length} cards (${failed} failed)`,
          { cardsOpened: opened, cardsFailed: failed });
      }
    }

    this.log(ctx, { msg: `Cards opened: ${opened}, failed: ${failed}, found: ${ids.length}` });
    yield this.getState(ctx, 'Card capture done', { cardsOpened: opened, cardsFailed: failed });
  }

  // ----------------------------------------------------
  // MAIN LOOP
  // ----------------------------------------------------
  async* run(ctx) {
    if (!this.isListPage()) {
      this.log(ctx, { msg: 'Skipping, not a greeting list page: ' + window.location.href });
      return;
    }

    const deadline = Date.now() + this.cfg.budgetMs;

    // The crawler normally calls awaitPageLoad() first, so this only runs if it was skipped.
    if (this.cardIds.size === 0) {
      await this.awaitPageLoad(ctx);
    }
    yield* this.loadAllCards(ctx);
    yield* this.captureCards(ctx, deadline);

    yield this.getState(ctx, 'Finished');
  }
}
