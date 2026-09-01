class AmediaPersonaliaBehavior {
  static id = "AmediaPersonaliaBehavior";
  static name = "AmediaPersonaliaBehavior";
  static runInIframe = false;
  static runInIframes = false;

  // Kun rene "last mer"-knapper hvis de mot formodning finnes som klassiske knapper
  selectors = [
    "button.lc-load-more", "button#load-more-posts", "#pagenation", "a.load-more"
  ];

  triggerwords = [
    "se mere", "åbn", "flere kommentarer", "se flere",
    "indlæs flere nyheder", "hent flere", "vis flere", "last flere"
  ].map(t => t.toLowerCase());

  visitedLinks = new Set();

  static isMatch(url) {
    // Returnerer true slik at Browsertrix crawler-rammeverk alltid finner klassen uten TypeErrors.
    return true;
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

  // Blokkerer React Router eller JS fra å navigere til /new, /login, /mygreetings via pushState/replaceState
  setupNavigationGuard() {
    try {
      if (window.__bx_navGuardSet) return;
      window.__bx_navGuardSet = true;

      const isBadUrl = (urlStr) => {
        if (!urlStr || typeof urlStr !== 'string') return false;
        const u = urlStr.toLowerCase();
        return (
          u.includes('/login') ||
          u.includes('/logg-inn') ||
          u.includes('/logginn') ||
          u.includes('/mygreetings') ||
          u.includes('/user') ||
          u.includes('/auth') ||
          u.includes('/new') ||
          u.includes('/edit')
        );
      };

      const origPush = window.history.pushState;
      window.history.pushState = function(state, title, url) {
        if (isBadUrl(url ? url.toString() : '')) {
          console.log('[Browsertrix Guard] Blokkerte pushState til:', url);
          return;
        }
        return origPush.apply(this, arguments);
      };

      const origReplace = window.history.replaceState;
      window.history.replaceState = function(state, title, url) {
        if (isBadUrl(url ? url.toString() : '')) {
          console.log('[Browsertrix Guard] Blokkerte replaceState til:', url);
          return;
        }
        return origReplace.apply(this, arguments);
      };
    } catch (e) {
      console.debug('Error setting up nav guard:', e);
    }
  }

  // Rekursiv fjerning av KUN spesifikke interaktive elementer (a, button, brick-button-v9)
  // som peker til /new, /login osv. Beholder-elementer (som body/main/div) røres ALDRI.
  purgeBadLinks(root = document) {
    try {
      const isBadUrl = (urlStr) => {
        if (!urlStr || typeof urlStr !== 'string') return false;
        const u = urlStr.toLowerCase();
        return (
          u.includes('/login') ||
          u.includes('/logg-inn') ||
          u.includes('/logginn') ||
          u.includes('/mygreetings') ||
          u.includes('/user') ||
          u.includes('/auth') ||
          u.includes('/new') ||
          u.includes('/edit') ||
          u.endsWith('/vis/personalia/') ||
          u.endsWith('/vis/personalia')
        );
      };

      const isBadText = (txtStr) => {
        if (!txtStr || typeof txtStr !== 'string') return false;
        const t = txtStr.toLowerCase().trim();
        return (
          t === 'ny hilsen' ||
          t === 'send hilsen' ||
          t === 'skriv hilsen' ||
          t === 'logg inn' ||
          t === 'mine hilsener'
        );
      };

      const traverse = (node) => {
        if (!node) return;
        
        // MÅ KUN SJEKKE REELLE LENKER OG KNAPPER - ALDRI BEHOLDER-DIV-ER ELLER BODY!
        const interactiveElements = node.querySelectorAll ? Array.from(node.querySelectorAll('a, button, brick-button-v9, [data-linkto], [data-linkTo]')) : [];
        
        for (const el of interactiveElements) {
          const href = el.getAttribute ? (el.getAttribute('href') || "") : "";
          const dataLinkto = el.getAttribute ? (el.getAttribute('data-linkto') || el.getAttribute('data-linkTo') || "") : "";
          const label = el.getAttribute ? (el.getAttribute('data-label') || "") : "";
          const txt = label || (el.innerText || el.textContent || "").trim().toLowerCase();

          if (isBadUrl(href) || isBadUrl(dataLinkto) || isBadText(label) || isBadText(txt)) {
            try {
              el.remove();
            } catch (e) {
              el.removeAttribute && el.removeAttribute('href');
              el.removeAttribute && el.removeAttribute('data-linkto');
              el.style && (el.style.pointerEvents = 'none');
            }
          }
        }

        // Traverser Shadow DOM på Custom Elements dersom det finnes
        if (node.querySelectorAll) {
          const customEls = Array.from(node.querySelectorAll('*')).filter(e => e.shadowRoot);
          for (const c of customEls) {
            traverse(c.shadowRoot);
          }
        }
      };

      traverse(root);
    } catch (e) {
      console.debug('Error in purgeBadLinks:', e);
    }
  }

  // Hjelpefunksjon for å sjekke om en lenke er et ekte Sanity hilsenkort
  isItemCardLink(link) {
    if (!link) return false;
    try {
      const href = link.href || (link.getAttribute && link.getAttribute('href')) || "";
      const pathname = link.pathname || "";
      const dataLinkto = (link.getAttribute && (link.getAttribute('data-linkto') || link.getAttribute('data-linkTo'))) || "";

      if (!href || typeof href !== 'string' || !href.startsWith('http')) return false;

      const low = (href + " " + pathname + " " + dataLinkto).toLowerCase();

      // Ekskluder alt som har med innlogging, oppretting (/new), redigering (/edit), mine hilsener, nyheter eller kategorisider å gjøre
      if (
        low.includes('/login') ||
        low.includes('/logg-inn') ||
        low.includes('/logginn') ||
        low.includes('/mygreetings') ||
        low.includes('/user') ||
        low.includes('/auth') ||
        low.includes('/kind/') ||
        low.includes('/new') ||
        low.includes('/edit') ||
        low.includes('/nyheter') ||
        low.includes('/sport') ||
        low.includes('/kultur') ||
        low.includes('/debatt') ||
        low.includes('/tag/') ||
        low.endsWith('/greetings/all') ||
        low.endsWith('/vis/personalia') ||
        low.endsWith('/vis/personalia/')
      ) {
        return false;
      }

      if (!pathname.includes('/greetings/')) return false;

      const parts = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
      const idx = parts.indexOf('greetings');
      if (idx === -1) return false;

      const remaining = parts.slice(idx + 1);
      // En ekte enkelt-hilsen lenke har nøyaktig 2 stideler etter 'greetings': <type> og <sanity_item_id> (f.eks. /greetings/birthday/5U00iEBl...)
      if (remaining.length === 2) {
        const itemType = remaining[0];
        const itemId = remaining[1];

        // Sanity ID må være minst 10 tegn, ikke inneholde punktum eller domenenavn, og type må ikke være meta
        if (
          itemId.length >= 10 &&
          !itemId.includes('.') &&
          !itemType.includes('.') &&
          !['kind', 'new', 'edit', 'all'].includes(itemType)
        ) {
          return true;
        }
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
    this.setupNavigationGuard();
    this.purgeBadLinks();

    const currentUrl = (window.location.href || "").toLowerCase();
    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/logg-inn') ||
      currentUrl.includes('/logginn') ||
      currentUrl.includes('/auth/') ||
      currentUrl.includes('/new')
    ) {
      this.log(ctx, { msg: "Avbryter da gjeldende side er en innlogging/new side: " + window.location.href });
      return;
    }

    this.removeConsentOverlay();
    this.fixScroll();

    // Vent på at React / Namaste SPA og Sanity API har lastet inn initialt content
    const maxWaitMs = 10000;
    const intervalMs = 300;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      this.removeConsentOverlay();
      this.fixScroll();
      this.purgeBadLinks();

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

    await this.sleep(ctx, 200);
  }

  // ----------------------------------------------------
  // HOVEDSLØYFE - HASTIGHETSOPTIMALISERT
  // ----------------------------------------------------
  async* run(ctx) {
    this.setupNavigationGuard();
    this.purgeBadLinks();

    const currentUrl = (window.location.href || "").toLowerCase();
    if (
      currentUrl.includes('/login') ||
      currentUrl.includes('/logg-inn') ||
      currentUrl.includes('/logginn') ||
      currentUrl.includes('/auth/') ||
      currentUrl.includes('/new')
    ) {
      this.log(ctx, { msg: "Hoppet over run() da URL-en er innlogging/new: " + window.location.href });
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

    // Hastighetsoptimaliserte innstillinger for rulling
    const cfg = {
      waitMs: 700,
      bottomWaitMs: 1200,
      stableLimit: 4,
      maxPulses: 60,
      growthEps: 10
    };

    let click = 0;
    let lastHeight = docHeight();
    let lastLinkCount = countGreetingCards();
    let stableRounds = 0;
    let pulses = 0;
    let currentY = 0;

    this.log(ctx, { msg: "Starter hurtig-rulling for Amedia Personalia (Namaste SPA)..." });

    // FASE 1: HURTIG-RULLING - Rull raskt nedover i steg på 1200px
    while (stableRounds < cfg.stableLimit && pulses < cfg.maxPulses) {
      this.purgeBadLinks();

      const maxDocHeight = docHeight();
      const viewHeight = window.innerHeight || 800;

      // Rull i 1200px jafs for raskere fremdrift
      currentY = Math.min(currentY + 1200, maxDocHeight - viewHeight);
      if (currentY < 0) currentY = 0;

      window.scrollTo(0, currentY);

      yield this.getState(ctx, "scrolling", { pulses, stableRounds, currentY, maxDocHeight });
      pulses++;

      const isNearBottom = (currentY + viewHeight) >= (maxDocHeight - 100);
      
      // Optimalisert ventetid: 1.2s ved bunnen for Sanity batch-fetch, ellers 0.7s
      const delay = isNearBottom ? cfg.bottomWaitMs : cfg.waitMs;
      await this.sleep(ctx, delay);

      // Sjekk om siden har sluttet å vokse
      const newHeight = docHeight();
      const newLinkCount = countGreetingCards();

      if (Math.abs(newHeight - lastHeight) < cfg.growthEps && newLinkCount === lastLinkCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }

      lastHeight = newHeight;
      lastLinkCount = newLinkCount;

      if (pulses % 3 === 0) {
        this.log(ctx, { 
          msg: `Rullepuls ${pulses}, y: ${currentY}/${newHeight}, antall hilsenkort: ${newLinkCount}` 
        });
      }
    }

    this.log(ctx, { msg: `Rulling fullført på ${pulses} pulses. Fant totalt ${countGreetingCards()} hilsenkort.` });

    // FASE 2: SCROLL TILBAKE TIL TOPPEN
    window.scrollTo(0, 0);
    await this.sleep(ctx, 300);

    this.purgeBadLinks();

    // FASE 3: HURTIG KLIKKBEHANDLING PÅ HILSENKORT
    const cardUrls = [];
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    for (const link of allLinks) {
      if (this.isItemCardLink(link)) {
        const href = link.href || "";
        if (href && !cardUrls.includes(href)) {
          cardUrls.push(href);
        }
      }
    }

    this.log(ctx, { msg: `Rulling ferdig. Starter hurtigklikking på ${cardUrls.length} hilsenkort...` });

    let clickedCount = 0;

    for (const href of cardUrls) {
      if (this.visitedLinks.has(href)) continue;
      this.visitedLinks.add(href);

      try {
        // Finn levende DOM-element
        const liveLink = Array.from(document.querySelectorAll('a[href]')).find(l => l.href === href || l.getAttribute('href') === href);
        if (!liveLink) continue;

        liveLink.scrollIntoView({ block: 'center', behavior: 'instant' });
        await this.sleep(ctx, 100);

        this.log(ctx, { msg: `Klikker hilsenkort #${clickedCount + 1}: ${href}` });
        
        const initialUrl = window.location.href;

        liveLink.click();
        clickedCount++;

        // Optimalisert ventetid (500 ms) for at React Router og modal-detaljer skal rendres
        await this.sleep(ctx, 500);

        // Se etter lukkeknapper
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
            closeBtn.click();
            closed = true;
            await this.sleep(ctx, 200);
            break;
          }
        }

        if (!closed) {
          if (window.location.href !== initialUrl) {
            window.history.back();
            await this.sleep(ctx, 200);
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            await this.sleep(ctx, 200);
          }
        }

        await this.sleep(ctx, 150);

      } catch (e) {
        this.log(ctx, { msg: `Feil ved klikk på ${href}: ${e.message}` });
      }
    }

    this.log(ctx, { msg: `Ferdig! Klikket totalt ${clickedCount} hilsenkort` });
    this.log(ctx, { msg: `Unike lenker besøkt: ${this.visitedLinks.size}` });

    window.scrollTo(0, docHeight());

    yield this.getState(ctx, "finished", {
      msg: "Scroll & Click ferdig",
      totalClicks: click,
      totalPulses: pulses
    });
  }
}
