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
  queuedUrls = new Set();

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

  // Hjelpefunksjon for å hente ut en full, absolutt URL fra ethvert lenke- eller knappelement
  extractHref(link) {
    if (!link) return null;
    let raw = link.href || (link.getAttribute && (link.getAttribute('href') || link.getAttribute('data-linkto') || link.getAttribute('data-linkTo'))) || "";
    if (!raw || typeof raw !== 'string') return null;
    raw = raw.trim();
    if (!raw || raw === '#' || raw.startsWith('javascript:')) return null;
    try {
      return new URL(raw, window.location.href).href;
    } catch (e) {
      return null;
    }
  }

  // Legger til en URL direkte i Browsertrix Crawler sin opptakskø
  async addLink(ctx, url) {
    const fn = (ctx?.Lib?.addLink) || ctx?.addLink || (typeof self !== 'undefined' && self.__bx_addLink) || (typeof window !== 'undefined' && window.__bx_addLink);
    if (typeof fn === 'function') {
      try {
        await fn(url);
        return true;
      } catch (e) {
        this.log(ctx, { msg: `addLink feilet for ${url}: ${e.message}` });
      }
    }
    return false;
  }

  // Sikrer at alle oppdagede hilsenkort alltid finnes som gyldige <a href="..."> i DOM-en
  // slik at alle typer Browsertrix-utlenke-ekstraktorer (både synlige og rå DOM-parsere) fanger dem opp.
  injectDiscoveredLinks() {
    try {
      let container = document.getElementById('__bx_discovered_links');
      if (!container) {
        container = document.createElement('div');
        container.id = '__bx_discovered_links';
        container.setAttribute('aria-hidden', 'true');
        container.style.cssText = 'position: absolute; bottom: 0; left: 0; opacity: 0.01; pointer-events: none; height: 1px; overflow: hidden; z-index: -9999;';
        (document.body || document.documentElement).appendChild(container);
      }
      for (const url of this.queuedUrls) {
        if (!container.querySelector(`a[href="${url}"]`)) {
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          container.appendChild(a);
        }
      }
    } catch (e) {
      console.debug('Error in injectDiscoveredLinks:', e);
    }
  }

  // Hjelpefunksjon for å sjekke om en lenke er et ekte hilsenkort på Amedia personalia (f.eks. ranablad.no/vis/personalia/greetings/all/...)
  isItemCardLink(link) {
    if (!link) return false;
    try {
      const fullUrl = this.extractHref(link);
      if (!fullUrl) return false;

      const parsed = new URL(fullUrl);
      
      // Sjekk at vi er på samme domene
      if (parsed.hostname !== window.location.hostname && !parsed.hostname.endsWith('.' + window.location.hostname)) {
        return false;
      }

      const pathname = parsed.pathname || "";
      const low = pathname.toLowerCase();

      // Ekskluder administrative stier, innlogging, redigering, kategorifiltre (/kind) og vanlige avisseksjoner
      if (
        low.includes('/login') ||
        low.includes('/logg-inn') ||
        low.includes('/logginn') ||
        low.includes('/mygreetings') ||
        low.includes('/mine-hilsener') ||
        low.includes('/user') ||
        low.includes('/auth') ||
        low.includes('/new') ||
        low.includes('/edit') ||
        low.includes('/kind') ||
        low.includes('/nyheter') ||
        low.includes('/sport') ||
        low.includes('/kultur') ||
        low.includes('/debatt') ||
        low.includes('/tag/')
      ) {
        return false;
      }

      // Må inneholde 'greetings'
      if (!low.includes('greetings')) return false;

      const parts = pathname.split('/').filter(Boolean);
      const idx = parts.findIndex(p => p.toLowerCase() === 'greetings');
      if (idx === -1) return false;

      let remaining = parts.slice(idx + 1);

      // Fjern eventuell 'all' prefiks (f.eks. /greetings/all/birthday/<id> eller /greetings/all/<id>)
      if (remaining.length > 0 && remaining[0].toLowerCase() === 'all') {
        remaining = remaining.slice(1);
      }

      // Hvis det ikke er noen ledd igjen etter greetings/all, er det selve oversiktssiden
      if (remaining.length === 0) return false;

      const reservedWords = [
        'all', 'kind', 'new', 'ny', 'edit', 'endre', 'login', 'logginn', 'logg-inn',
        'mine', 'mygreetings', 'user', 'auth', 'birthday', 'bursdag', 'wedding', 'bryllup',
        'giftemal', 'jubileum', 'anniversary', 'memorial', 'minneord', 'birth', 'nyfodt',
        'dasp', 'gratulerer', 'general', 'obituary', 'dodsfall'
      ];

      // Siste ledd er alltid hilsenens unike ID
      const lastSeg = remaining[remaining.length - 1].toLowerCase();
      if (reservedWords.includes(lastSeg) || lastSeg.length < 5) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  // Samler inn alle nye hilsenkort fra DOM-en undervegs i rullingen og sender dem til Browsertrix sin kø
  async collectAndQueueLinks(ctx) {
    let addedCount = 0;
    try {
      const candidates = [];
      candidates.push(...Array.from(document.querySelectorAll('a[href], [data-linkto], [data-linkTo]')));

      // Inkluder også kandidater fra Shadow DOM
      const findShadowCandidates = (root) => {
        if (!root || !root.querySelectorAll) return [];
        let res = [];
        const customEls = Array.from(root.querySelectorAll('*')).filter(e => e.shadowRoot);
        for (const c of customEls) {
          res.push(...Array.from(c.shadowRoot.querySelectorAll('a[href], [data-linkto], [data-linkTo]')));
          res.push(...findShadowCandidates(c.shadowRoot));
        }
        return res;
      };
      candidates.push(...findShadowCandidates(document));

      for (const link of candidates) {
        if (this.isItemCardLink(link)) {
          const href = this.extractHref(link);
          if (href && !this.queuedUrls.has(href)) {
            this.queuedUrls.add(href);
            await this.addLink(ctx, href);
            addedCount++;
          }
        }
      }
    } catch (e) {
      console.debug('Error in collectAndQueueLinks:', e);
    }
    return addedCount;
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
          /\/(new|edit|login|logg-inn|logginn|mygreetings|mine-hilsener|auth)(\/|$)/i.test(u) ||
          u.includes('/kind/') ||
          u.endsWith('/kind')
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
          /\/(new|edit|login|logg-inn|logginn|mygreetings|mine-hilsener|auth)(\/|$)/i.test(u) ||
          u.includes('/kind/') ||
          u.endsWith('/kind') ||
          u.endsWith('/vis/personalia/') ||
          u.endsWith('/vis/personalia') ||
          u.endsWith('/greetings/all') ||
          u.endsWith('/greetings/all/')
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
    const intervalMs = 100;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      this.removeConsentOverlay();
      this.fixScroll();
      this.purgeBadLinks();
      await this.collectAndQueueLinks(ctx);

      const allCandidates = Array.from(document.querySelectorAll('a[href], [data-linkto], [data-linkTo]'));
      const itemLinks = allCandidates.filter(l => this.isItemCardLink(l));
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

    await this.sleep(ctx, 50);
  }

  // ----------------------------------------------------
  // HOVEDSLØYFE - MED KØ-STRØMMING (ctx.Lib.addLink)
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

    const countGreetingCards = () => {
      const candidates = Array.from(document.querySelectorAll('a[href], [data-linkto], [data-linkTo]'));
      return candidates.filter(l => this.isItemCardLink(l)).length;
    };

    // Maksimalt hastighetsoptimaliserte innstillinger for rulling
    const cfg = {
      scrollStep: 2500,
      waitMs: 250,
      bottomWaitMs: 600,
      stableLimit: 3,
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

    // FASE 1: HURTIG-RULLING & LENKESTRØMMING TIL BROWSERTRIX-KØ
    while (stableRounds < cfg.stableLimit && pulses < cfg.maxPulses) {
      this.purgeBadLinks();

      const maxDocHeight = docHeight();
      const viewHeight = window.innerHeight || 800;

      // Rull i 2500px jafs for superrask fremdrift
      currentY = Math.min(currentY + cfg.scrollStep, maxDocHeight - viewHeight);
      if (currentY < 0) currentY = 0;

      window.scrollTo(0, currentY);

      // Legg fortløpende til alle nye hilsenkort-lenker i Browsertrix sin crawler-kø!
      const newlyAdded = await this.collectAndQueueLinks(ctx);
      if (newlyAdded > 0) {
        this.log(ctx, { msg: `Lagt til ${newlyAdded} nye hilsenkort-lenker i Browsertrix-køen (totalt i kø: ${this.queuedUrls.size})` });
      }

      yield this.getState(ctx, "scrolling", { pulses, stableRounds, currentY, maxDocHeight, queuedLinks: this.queuedUrls.size });
      pulses++;

      const isNearBottom = (currentY + viewHeight) >= (maxDocHeight - 100);
      
      // Ventetid: 600ms ved bunnen for Sanity batch-fetch, ellers 250ms
      const delay = isNearBottom ? cfg.bottomWaitMs : cfg.waitMs;
      await this.sleep(ctx, delay);

      // Sjekk om flere hilsenkort har dukket opp etter ventetiden
      await this.collectAndQueueLinks(ctx);

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

      if (pulses % 5 === 0) {
        this.log(ctx, { 
          msg: `Rullepuls ${pulses}, y: ${currentY}/${newHeight}, antall hilsenkort i DOM: ${newLinkCount}, totalt i kø: ${this.queuedUrls.size}` 
        });
      }
    }

    this.log(ctx, { msg: `Rulling fullført på ${pulses} pulses. Lagt til totalt ${this.queuedUrls.size} hilsenkort i Browsertrix-køen.` });

    // Sørg for at alle oppdagede lenker er tilstede i DOM-en for Browsertrix crawler
    this.injectDiscoveredLinks();

    // FASE 2: SCROLL TILBAKE TIL TOPPEN
    window.scrollTo(0, 0);
    await this.sleep(ctx, 50);

    this.purgeBadLinks();

    // FASE 3: HURTIG KLIKKBEHANDLING PÅ HILSENKORT
    const cardUrls = Array.from(this.queuedUrls);
    this.log(ctx, { msg: `Starter hurtigklikking på ${cardUrls.length} hilsenkort for MODAL/WARC snapshot-opptak...` });

    let clickedCount = 0;

    for (const href of cardUrls) {
      if (this.visitedLinks.has(href)) continue;
      this.visitedLinks.add(href);

      try {
        // Finn levende DOM-element som matcher denne URL-en
        const candidates = [
          ...Array.from(document.querySelectorAll('a[href], [data-linkto], [data-linkTo]'))
        ];
        const liveLink = candidates.find(l => this.extractHref(l) === href);
        if (!liveLink) continue;

        liveLink.scrollIntoView({ block: 'center', behavior: 'instant' });
        await this.sleep(ctx, 25);

        this.log(ctx, { msg: `Klikker hilsenkort #${clickedCount + 1}: ${href}` });
        
        const initialUrl = window.location.href;

        liveLink.click();
        clickedCount++;

        // Optimalisert ventetid (120 ms) for at React Router og modal-detaljer skal rendres
        await this.sleep(ctx, 120);

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
            await this.sleep(ctx, 50);
            break;
          }
        }

        if (!closed) {
          if (window.location.href !== initialUrl) {
            window.history.back();
            await this.sleep(ctx, 50);
          } else {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            await this.sleep(ctx, 50);
          }
        }

        await this.sleep(ctx, 25);

      } catch (e) {
        this.log(ctx, { msg: `Feil ved klikk på ${href}: ${e.message}` });
      }
    }

    this.log(ctx, { msg: `Ferdig! Klikket totalt ${clickedCount} hilsenkort` });
    this.log(ctx, { msg: `Unike lenker lagt i kø: ${this.queuedUrls.size}` });

    // Garanter at samtlige oppdagede URL-er ligger som rene <a href> i DOM-en når crawleren høster utlenker
    this.injectDiscoveredLinks();

    window.scrollTo(0, docHeight());

    yield this.getState(ctx, "finished", {
      msg: "Scroll & Click ferdig",
      totalClicks: click,
      totalPulses: pulses
    });
  }
}
