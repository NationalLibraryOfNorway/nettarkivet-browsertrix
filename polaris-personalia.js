class PolarisPersonaliaBehavior {
  static id = "PolarisPersonaliaBehavior";
  static name = "PolarisPersonaliaBehavior";
  static runInIframe = false;
  static runInIframes = false;

  visitedLinks = new Set();
  queuedUrls = new Set();

  static isMatch(url) {
    // Returnerer true slik at Browsertrix crawler-rammeverket alltid finner klassen uten TypeErrors.
    return true;
  }

  static init() {
    return new PolarisPersonaliaBehavior();
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

  // Hjelpefunksjon for å hente ut en full, absolutt URL fra ethvert lenkeelement
  extractHref(link) {
    if (!link) return null;
    let raw = link.href || (link.getAttribute && link.getAttribute('href')) || "";
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

  // Sikrer at alle oppdagede innlegg alltid finnes som gyldige <a href="..."> i DOM-en
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

  // Sjekker om en lenke er et ekte personalia-innlegg på Polaris "Folk"-sider
  // (f.eks. folk.rbnett.no/publications/285665). Numerisk ID etter /publications/.
  isItemCardLink(link) {
    if (!link) return false;
    try {
      const fullUrl = this.extractHref(link);
      if (!fullUrl) return false;

      const parsed = new URL(fullUrl);

      if (parsed.hostname !== window.location.hostname) {
        return false;
      }

      const pathname = parsed.pathname || "";
      const match = pathname.match(/^\/publications\/(\d+)\/?$/i);
      return !!match;
    } catch (e) {
      return false;
    }
  }

  // Blokkerer navigasjon til innlogging/opprett-nytt-innlegg via pushState/replaceState
  setupNavigationGuard() {
    try {
      if (window.__bx_navGuardSet) return;
      window.__bx_navGuardSet = true;

      const isBadUrl = (urlStr) => {
        if (!urlStr || typeof urlStr !== 'string') return false;
        const u = urlStr.toLowerCase();
        return (
          /\/(auth|user)(\/|$)/i.test(u) ||
          /\/publications\/new(\/|$)/i.test(u) ||
          /^\/?categories\/?(\?|$)/i.test(u)
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

  // Fjerner lenker/knapper som peker til innlogging, "Opprett innlegg" eller andre administrative sider
  purgeBadLinks(root = document) {
    try {
      const isBadUrl = (urlStr) => {
        if (!urlStr || typeof urlStr !== 'string') return false;
        const u = urlStr.toLowerCase();
        return (
          /\/(auth|user)(\/|$)/i.test(u) ||
          /\/publications\/new(\/|$)/i.test(u) ||
          /^\/?categories\/?$/i.test(u)
        );
      };

      const isBadText = (txtStr) => {
        if (!txtStr || typeof txtStr !== 'string') return false;
        const t = txtStr.toLowerCase().trim();
        return (
          t === 'opprett innlegg' ||
          t === 'logg inn' ||
          t === 'mine innlegg'
        );
      };

      const interactiveElements = root.querySelectorAll ? Array.from(root.querySelectorAll('a, button')) : [];
      for (const el of interactiveElements) {
        const href = el.getAttribute ? (el.getAttribute('href') || "") : "";
        const txt = (el.innerText || el.textContent || "").trim();

        if (isBadUrl(href) || isBadText(txt)) {
          try {
            el.remove();
          } catch (e) {
            el.removeAttribute && el.removeAttribute('href');
            el.style && (el.style.pointerEvents = 'none');
          }
        }
      }
    } catch (e) {
      console.debug('Error in purgeBadLinks:', e);
    }
  }

  // ----------------------------------------------------
  // CONSENT OG SCROLL FIX (defensivt - Polaris kan kjøre Sourcepoint/CMP på enkelte aviser)
  // ----------------------------------------------------
  removeConsentOverlay() {
    try {
      const consentIframes = document.querySelectorAll('iframe[src*="sp.api.no"], iframe[src*="sourcepoint"], iframe[src*="consent"], iframe[title*="samtykke" i]');
      consentIframes.forEach(iframe => iframe.remove());

      const overlays = document.querySelectorAll('[id*="sp_message"], [class*="sp_message"], div[style*="z-index: 2147483647"], #cmpwrapper, .cmp-consent-layer');
      overlays.forEach(el => el.remove());
    } catch (e) {
      console.debug('Overlay removal error:', e);
    }
  }

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

  // Samler inn alle nye innleggslenker fra DOM-en og sender dem til Browsertrix sin kø
  async collectAndQueueLinks(ctx) {
    let addedCount = 0;
    try {
      const candidates = Array.from(document.querySelectorAll('a[href]'));
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

  isSkippableUrl(urlStr) {
    const u = (urlStr || "").toLowerCase();
    return (
      u.includes('/auth/') ||
      u.includes('/user/') ||
      u.includes('/publications/new') ||
      /\/?categories\/?(\?|$)/i.test(new URL(urlStr, window.location.href).pathname)
    );
  }

  // ----------------------------------------------------
  // HOVEDSLØYFE
  // ----------------------------------------------------
  async* run(ctx) {
    this.setupNavigationGuard();
    this.purgeBadLinks();

    const currentUrl = window.location.href || "";
    if (this.isSkippableUrl(currentUrl)) {
      this.log(ctx, { msg: "Hoppet over run() da URL-en er innlogging/opprett-side: " + currentUrl });
      return;
    }

    this.removeConsentOverlay();
    this.fixScroll();

    await this.collectAndQueueLinks(ctx);

    // "Folk"-forsiden og enkeltinnlegg har ingen infinite-scroll-container og trenger ikke rulling.
    // Kategorisidene (/categories/<id>/publications) laster inn flere innlegg via XHR når man
    // ruller til bunnen av #hr-publications-container (se app.js: window scroll -> XHR ?page=N).
    const container = document.getElementById('hr-publications-container');

    if (!container) {
      this.log(ctx, { msg: `Ingen infinite-scroll-container funnet på ${currentUrl}, samlet ${this.queuedUrls.size} innleggslenker direkte.` });
      this.injectDiscoveredLinks();
      yield this.getState(ctx, "finished", { msg: "Ingen rulling nødvendig", queuedLinks: this.queuedUrls.size });
      return;
    }

    const totalPages = parseInt(container.dataset.totalPages || container.getAttribute('data-total-pages') || "1", 10) || 1;

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );

    const countItemLinks = () => {
      const candidates = Array.from(document.querySelectorAll('a[href]'));
      return candidates.filter(l => this.isItemCardLink(l)).length;
    };

    const cfg = {
      scrollStep: 2000,
      waitMs: 350,
      bottomWaitMs: 900,
      stableLimit: 3,
      maxPulses: Math.min(Math.max(totalPages * 3, 20), 120),
      growthEps: 10,
      // Ekstra "roligere" verifiseringsrunder etter at rullingen virker stabil. Nødvendig fordi
      // listen under en enkelt gratulasjon/jubilant henter neste side via et sekundært XHR-kall
      // som iblant er tregere enn de vanlige kategorisidene, og da ble rullingen avsluttet for tidlig.
      settleRounds: 3,
      settleWaitMs: 1500
    };

    let lastHeight = docHeight();
    let lastLinkCount = countItemLinks();
    let stableRounds = 0;
    let pulses = 0;
    let currentY = 0;

    this.log(ctx, { msg: `Starter rulling for Polaris Personalia (totalt ${totalPages} sider ifølge data-total-pages)...` });

    while (stableRounds < cfg.stableLimit && pulses < cfg.maxPulses) {
      this.purgeBadLinks();

      const maxDocHeight = docHeight();
      const viewHeight = window.innerHeight || 800;

      currentY = Math.min(currentY + cfg.scrollStep, maxDocHeight - viewHeight);
      if (currentY < 0) currentY = 0;

      window.scrollTo(0, currentY);
      // Sikrer at scroll-eventet Polaris sin egen infinite-scroll-kode lytter på faktisk utløses
      window.dispatchEvent(new Event('scroll'));

      const newlyAdded = await this.collectAndQueueLinks(ctx);
      if (newlyAdded > 0) {
        this.log(ctx, { msg: `Lagt til ${newlyAdded} nye innleggslenker i Browsertrix-køen (totalt i kø: ${this.queuedUrls.size})` });
      }

      yield this.getState(ctx, "scrolling", { pulses, stableRounds, currentY, maxDocHeight, queuedLinks: this.queuedUrls.size });
      pulses++;

      const isNearBottom = (currentY + viewHeight) >= (maxDocHeight - 100);
      const delay = isNearBottom ? cfg.bottomWaitMs : cfg.waitMs;
      await this.sleep(ctx, delay);

      await this.collectAndQueueLinks(ctx);

      const newHeight = docHeight();
      const newLinkCount = countItemLinks();

      if (Math.abs(newHeight - lastHeight) < cfg.growthEps && newLinkCount === lastLinkCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }

      lastHeight = newHeight;
      lastLinkCount = newLinkCount;

      if (pulses % 5 === 0) {
        this.log(ctx, {
          msg: `Rullepuls ${pulses}, y: ${currentY}/${newHeight}, antall innlegg i DOM: ${newLinkCount}, totalt i kø: ${this.queuedUrls.size}`
        });
      }
    }

    // Verifiseringsfase: dobbeltsjekk med lengre ventetid at ingen sene innlegg dukker opp
    // etter at rullingen ser stabil ut (se kommentar ved cfg.settleRounds).
    let settled = 0;
    while (settled < cfg.settleRounds && pulses < cfg.maxPulses) {
      window.scrollTo(0, docHeight());
      window.dispatchEvent(new Event('scroll'));
      await this.sleep(ctx, cfg.settleWaitMs);

      await this.collectAndQueueLinks(ctx);

      const verifyHeight = docHeight();
      const verifyLinkCount = countItemLinks();

      if (Math.abs(verifyHeight - lastHeight) < cfg.growthEps && verifyLinkCount === lastLinkCount) {
        settled++;
      } else {
        this.log(ctx, { msg: `Nytt innhold dukket opp under verifisering, fortsetter rulling (i kø: ${this.queuedUrls.size})` });
        settled = 0;
        pulses++;
      }

      lastHeight = verifyHeight;
      lastLinkCount = verifyLinkCount;
    }

    this.log(ctx, { msg: `Rulling fullført på ${pulses} pulses. Lagt til totalt ${this.queuedUrls.size} innleggslenker i Browsertrix-køen.` });

    this.injectDiscoveredLinks();
    window.scrollTo(0, 0);
    await this.sleep(ctx, 50);

    yield this.getState(ctx, "finished", {
      msg: "Rulling ferdig",
      totalPulses: pulses,
      queuedLinks: this.queuedUrls.size
    });
  }
}
