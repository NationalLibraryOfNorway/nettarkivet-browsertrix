class AmediaPersonaliaBehavior {
  static id = "AmediaPersonaliaBehavior";
  static name = "AmediaPersonaliaBehavior";
  static runInIframe = false;
  static runInIframes = false;

  selectors = [
    "a", "button", "button.lc-load-more", "span[role=treeitem]",
    "button#load-more-posts", "#pagenation", "brick-button-v9"
  ];

  triggerwords = [
    "se mere", "åbn", "flere kommentarer", "se flere",
    "indlæs flere nyheder", "hent flere", "vis flere", "last flere"
  ].map(t => t.toLowerCase());

  visitedLinks = new Set();

  static isMatch(url) {
    try {
      if (!url) return false;
      const u = url.toLowerCase();
      // Ikke kjør adferdsskriptet dersom måladressen er en innloggingsside eller brukerportal
      if (u.includes('/login') || u.includes('/logg-inn') || u.includes('/logginn') || u.includes('/auth/')) {
        return false;
      }
      return u.includes('/vis/personalia') || u.includes('/greetings');
    } catch (e) {
      return false;
    }
  }

  static init() {
    return new AmediaPersonaliaBehavior();
  }

  // --- SIKRE HJELPEFUNKSJONER FOR BROWSERTRIX CONTEXT ---
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

  getState(ctx, state, data) {
    const fn = (ctx?.Lib?.getState) || ctx?.getState;
    if (typeof fn === 'function') {
      try {
        return fn.call(ctx, { state, data });
      } catch (e) {}
    }
    return { state, data };
  }

  // Hjelpefunksjon for å sjekke om en lenke er et enkelt hilsenkort
  isItemCardLink(link) {
    if (!link) return false;
    try {
      const href = link.href || (link.getAttribute && link.getAttribute('href')) || "";
      const pathname = link.pathname || "";

      if (!href || typeof href !== 'string' || !href.startsWith('http')) return false;

      const low = href.toLowerCase();
      if (
        low.includes('/login') ||
        low.includes('/logg-inn') ||
        low.includes('/logginn') ||
        low.includes('/mygreetings') ||
        low.includes('/user') ||
        low.includes('/auth') ||
        low.includes('/kind/') ||
        low.includes('/greetings/new') ||
        low.includes('/greetings/edit') ||
        low.endsWith('/greetings/all')
      ) {
        return false;
      }

      if (!pathname.includes('/greetings/')) return false;

      const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
      const idx = parts.indexOf('greetings');
      if (idx === -1) return false;

      const remaining = parts.slice(idx + 1);
      // En enkelt-hilsen lenke har nøyaktig 2 stideler etter 'greetings': <type> og <item_id> (f.eks. /greetings/birthday/5U00iEBl...)
      if (remaining.length === 2 && remaining[0] !== 'kind' && remaining[1] !== 'all') {
        return true;
      }
    } catch (e) {
      return false;
    }

    return false;
  }

  // ----------------------------------------------------
  // CONSENT OG SCROLL FIX
  // ----------------------------------------------------
  removeConsentOverlay() {
    try {
      // Fjern SourcePoint/consent iframes
      const consentIframes = document.querySelectorAll('iframe[src*="sp.api.no"], iframe[src*="sourcepoint"], iframe[src*="consent"]');
      consentIframes.forEach(iframe => iframe.remove());
      
      // Fjern overlays
      const overlays = document.querySelectorAll('[id*="sp_message"], [class*="sp_message"], div[style*="z-index: 2147483647"]');
      overlays.forEach(el => el.remove());
    } catch (e) {
      console.debug('Overlay removal error:', e);
    }
  }

  fixScroll() {
    try {
      // Fjern inline styles
      document.body.removeAttribute('style');
      document.documentElement.removeAttribute('style');
      
      // Sett riktige properties
      document.body.style.setProperty('overflow', 'auto', 'important');
      document.body.style.setProperty('position', 'static', 'important');
      document.body.style.setProperty('height', 'auto', 'important');
      document.body.style.setProperty('width', 'auto', 'important');
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
      
      // Legg til style tag
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
    const currentUrl = (window.location.href || "").toLowerCase();
    if (currentUrl.includes('/login') || currentUrl.includes('/logg-inn') || currentUrl.includes('/logginn')) {
      this.log(ctx, { msg: "Avbryter da gjeldende side er en innloggingsside: " + window.location.href });
      return;
    }

    this.removeConsentOverlay();
    this.fixScroll();

    // Vent på at React / Namaste SPA og Sanity API har lastet inn initialt content
    const maxWaitMs = 10000;
    const intervalMs = 500;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      this.removeConsentOverlay();
      this.fixScroll();

      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      const itemLinks = allLinks.filter(l => this.isItemCardLink(l));
      if (itemLinks.length > 0) {
        this.log(ctx, { msg: `Namaste SPA lastet inn med ${itemLinks.length} hilsenkort etter ${elapsed} ms` });
        break;
      }
      await this.sleep(ctx, intervalMs);
      elapsed += intervalMs;
    }

    if (elapsed >= maxWaitMs) {
      this.log(ctx, { msg: `Venting på Namaste SPA utløp etter ${maxWaitMs} ms` });
    }

    await this.sleep(ctx, 500);
  }

  // ----------------------------------------------------
  // HOVEDSLØYFE
  // ----------------------------------------------------
  async* run(ctx) {
    const currentUrl = (window.location.href || "").toLowerCase();
    if (currentUrl.includes('/login') || currentUrl.includes('/logg-inn') || currentUrl.includes('/logginn')) {
      this.log(ctx, { msg: "Hoppet over run() da URL-en er innlogging: " + window.location.href });
      return;
    }

    await this.awaitPageLoad(ctx);

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );

    const countGreetingCards = () =>
      Array.from(document.querySelectorAll('a[href]')).filter(l => this.isItemCardLink(l)).length;

    const cfg = {
      waitMs: 1200,
      stableLimit: 5,
      growthEps: 10
    };

    let click = 0;
    let lastHeight = docHeight();
    let lastLinkCount = countGreetingCards();
    let stableRounds = 0;
    let pulses = 0;

    this.log(ctx, { msg: "Starter Scroll & Click behavior for Amedia Personalia (Namaste SPA)" });

    // Scroll sakte nedover for å trigge infinite scroll / Sanity queries
    while (stableRounds < cfg.stableLimit && pulses < 50) {
      const targetY = docHeight() - (window.innerHeight || 800);
      window.scrollTo({ top: targetY > 0 ? targetY : 0, behavior: 'smooth' });

      yield this.getState(ctx, "scrolling", { pulses, stableRounds });
      pulses++;
      await this.sleep(ctx, cfg.waitMs);

      // Klikk på eventuelle "vis flere"-knapper (også brick-button)
      const elems = document.querySelectorAll(this.selectors.join(","));
      let clicksThisRound = 0;

      for (const elem of elems) {
        const txt = (elem.innerText || elem.textContent || elem.getAttribute('data-label') || "").toLowerCase().trim();
        const href = (elem.getAttribute('href') || elem.getAttribute('data-linkto') || "").toLowerCase();

        // Hopp over innlogging / mine hilsener / send hilsen knapper
        if (href.includes('/login') || href.includes('/logg-inn') || href.includes('/mygreetings') || href.includes('/greetings/new')) continue;
        if (txt.includes('logg inn') || txt.includes('mine hilsener') || txt.includes('send hilsen') || txt.includes('ny hilsen')) continue;

        if (this.triggerwords.some(w => txt.includes(w))) {
          elem.scrollIntoView({ block: "center" });
          elem.click();
          clicksThisRound++;
          click++;
          await this.sleep(ctx, 300);
        }
      }

      if (clicksThisRound > 0) {
        this.log(ctx, { msg: `Klikket ${clicksThisRound} "vis flere"-knapper (totalt ${click})` });
      }

      // Sjekk om siden eller antall lenker vokser
      const currentHeight = docHeight();
      const currentLinkCount = countGreetingCards();

      if (Math.abs(currentHeight - lastHeight) < cfg.growthEps && currentLinkCount === lastLinkCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }
      lastHeight = currentHeight;
      lastLinkCount = currentLinkCount;

      if (pulses % 3 === 0) {
        this.log(ctx, { msg: `Pulse ${pulses}, høyde: ${currentHeight}, antall hilsenkort: ${currentLinkCount}, stable: ${stableRounds}` });
      }
    }

    this.log(ctx, { msg: `Scrolling ferdig etter ${pulses} pulses. Fant totalt ${countGreetingCards()} hilsenkort` });

    // Scroll tilbake til toppen
    this.log(ctx, { msg: "Scroller tilbake til toppen" });
    window.scrollTo(0, 0);
    await this.sleep(ctx, 300);

    // Hent alle <a> lenker på siden
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    const itemCardLinks = allLinks.filter(l => this.isItemCardLink(l));
    this.log(ctx, { msg: `Fant ${itemCardLinks.length} hilsenkort-lenker av ${allLinks.length} totale <a>-tags` });

    let clickedCount = 0;

    for (const link of itemCardLinks) {
      const href = link.href || "";

      if (this.visitedLinks.has(href)) continue;
      this.visitedLinks.add(href);

      try {
        // Scroll inn i viewport
        link.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await this.sleep(ctx, 200);

        this.log(ctx, { msg: `Klikker hilsenkort #${clickedCount + 1}: ${href}` });
        
        const initialUrl = window.location.href;

        // Utfør klikk uten e.preventDefault() for at React Router skal fange det opp
        link.click();
        clickedCount++;

        // Vent på at React Router / dialog oppdateres
        await this.sleep(ctx, 350);

        // Se etter lukkeknapper (brick-button-v9, dialog-close, aria-label="Lukk" etc.)
        const closeSelectors = [
          'brick-button-v9[data-icon-id="close"]',
          'brick-button-v9[data-icon-id="arrow-left"]',
          'button[aria-label="Lukk"]', '[aria-label="Lukk"]',
          'button[aria-label*="close"]', 'button[aria-label*="Close"]',
          '.close', '[class*="close"]', '[aria-label*="close"]', '[aria-label*="Close"]',
          '.modal-close', '.lightbox-close', 'button[title*="close"]', 'button[title*="Close"]',
          '[class*="overlay"]', '.backdrop', '[data-dismiss]', 'button.btn-close',
          '[onclick*="close"]', 'a[onclick*="close"]'
        ];

        let closed = false;
        for (const selector of closeSelectors) {
          const closeBtn = document.querySelector(selector);
          if (closeBtn && (closeBtn.offsetParent !== null || closeBtn.tagName.toLowerCase().startsWith('brick-'))) {
            this.log(ctx, { msg: `Lukker med selector: ${selector}` });
            closeBtn.click();
            closed = true;
            await this.sleep(ctx, 250);
            break;
          }
        }

        if (!closed) {
          // Hvis URL-en endret seg via pushState, prøv history.back() for å returnere til listen
          if (window.location.href !== initialUrl) {
            this.log(ctx, { msg: "Tilbakestiller visning med window.history.back()" });
            window.history.back();
            await this.sleep(ctx, 300);
          } else {
            // Fallback: ESC-tast
            this.log(ctx, { msg: "Prøver ESC-tast som fallback" });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            await this.sleep(ctx, 250);
          }
        }

      } catch (e) {
        this.log(ctx, { msg: `Feil ved klikk: ${e.message}` });
      }
    }

    this.log(ctx, { msg: `Ferdig! Klikket ${clickedCount} hilsenkort` });
    this.log(ctx, { msg: `Unike lenker besøkt: ${this.visitedLinks.size}` });

    window.scrollTo(0, docHeight());

    yield this.getState(ctx, "finished", {
      msg: "Scroll & Click ferdig",
      totalClicks: click,
      totalPulses: pulses
    });
  }
}
