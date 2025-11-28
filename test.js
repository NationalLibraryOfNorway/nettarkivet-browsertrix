class AutoScrollBehavior
{
  static id = "AutoScroll: infinite scroll + full exploration";
  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new AutoScrollBehavior();
  }
  static runInIframes = false;
  
  // Brukes for å spore alle elementer (både knapper og lenker) som er klikket
  seenElem = new WeakSet();

  async awaitPageLoad() {
    this.removeConsentOverlay();
    this.fixScroll();
    
    await new Promise(r => setTimeout(r, 500));
  }
  
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

  /**
   * Finner den neste usynlige, same-origin lenken ('a' tagg).
   */
  nextSameOriginLink(selector = "a"): HTMLElement | null {
    try {
      const allLinks = document.querySelectorAll(selector);
      for (const el of allLinks) {
        const element = el; 

        // Sjekk for same-origin (kun interne lenker)
        if (element.href && !element.href.startsWith(window.location.origin)) {
          continue;
        }
        if (!element.isConnected) {
          continue;
        }
        
        // Sjekk for synlighet (enkel fallback hvis checkVisibility mangler)
        if (typeof element.checkVisibility === 'function') {
            if (!element.checkVisibility()) {
                continue;
            }
        } else if (element.offsetParent === null) {
            continue;
        }
        
        // Sjekk om den er klikket før
        if (this.seenElem.has(element)) {
          continue;
        }
        
        // Marker som sett (blir klikket i processElem) og returner
        return element;
      }
    } catch (e) {
      console.debug('Link selection error:', e.toString());
    }

    return null;
  }
  
  /**
   * Utfører klikk og håndterer eventuell navigasjon (går tilbake).
   */
  async processElem(elem: HTMLElement, sleep: (ms: number) => Promise<void>) {
    // Legg til i settet FØR klikk (Browsertrix-stil)
    this.seenElem.add(elem);

    if (elem.getAttribute('target') === '_blank') {
      return;
    }

    const origHref = window.location.href;
    const origHistoryLen = window.history.length;

    // Klikk elementet
    if (elem.click) {
      elem.click();
    } else if (elem.dispatchEvent) {
      elem.dispatchEvent(new MouseEvent("click"));
    }

    await sleep(250);

    // Gå tilbake i historikken hvis det har vært navigasjon
    if (
      window.history.length === origHistoryLen + 1 &&
      window.location.href != origHref
    ) {
      await new Promise((resolve) => {
        window.addEventListener(
          "popstate",
          () => {
            resolve(null);
          },
          { once: true },
        );

        window.history.back();
      });
    }
  }

  /**
   * Finner og klikker på en dedikert "Last inn mer"-knapp.
   * Returnerer true hvis en knapp ble klikket.
   */
  autoClickLoadMore() {
    const textPatterns = /load more|vis mer|last inn|flere|more|next|continue|show/i;
    
    const selectors = [
      'button:not([disabled])',
      'a[role="button"]:not([disabled])',
      'a[aria-label*="load more"]',
      '[class*="load-more"]',
      '[id*="load-more"]',
      '[class*="show-more"]',
      '[class*="next-page"]',
      '[class*="pagination"] button'
    ];
    
    const allSelectors = selectors.join(', ');
    
    const candidates = document.querySelectorAll(allSelectors);
    
    for (const el of candidates) {
      if (this.seenElem.has(el)) {
        continue;
      }
      
      const element = el; 

      if (element.offsetParent !== null && element.offsetWidth > 10 && element.offsetHeight > 10) {
        
        const text = element.textContent ? element.textContent.trim() : '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        
        if (textPatterns.test(text) || textPatterns.test(ariaLabel)) {
          console.log(`[AutoScroll] Klikket på "Load More" knapp: ${text.substring(0, 30)}`);
          element.click();
          this.seenElem.add(element); // Marker som klikket
          return true; 
        }
      }
    }
    
    return false;
  }

  async* run(ctx) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload; 
    };

    // --------------------------
    // 📌 KONFIGURASJON
    // --------------------------
    const cfg = {
      waitMs: 400,           
      scrollStep: 400,       
      stableLimit: 25,       
      bottomHoldExtra: 2000, 
      growthEps: 1,          
      clickDelayMs: 500      
    };
    // --------------------------

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;
    
    while (stableRounds < cfg.stableLimit) {
      window.scrollBy(0, cfg.scrollStep);

      yield makeState("autoscroll: pulse", { pulses });
      pulses++;

      await sleep(cfg.waitMs);

      const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
      
      if (atBottom) {
        let actionTaken = false;
        
        // 1. Prioriter: Prøv å klikke på en "Last inn mer"-knapp
        if (this.autoClickLoadMore()) {
            actionTaken = true;
        }
        
        // 2. Utforsk: Klikk et par same-origin lenker
        let linksExplored = 0;
        let elem: HTMLElement | null;
        
        // Utforsk maks 5 lenker per puls ved bunnen
        const maxLinksToExplore = 5; 
        
        while ((elem = this.nextSameOriginLink('a')) && linksExplored < maxLinksToExplore) {
            await this.processElem(elem, sleep);
            linksExplored++;
            actionTaken = true;
        }
        
        // 3. Vent ekstra tid uansett
        await sleep(cfg.bottomHoldExtra);

        // 4. Hvis en handling ble utført (klikk/utforsk), vent ekstra før vektsjekk
        if (actionTaken) {
             await sleep(cfg.clickDelayMs);
        }
      }

      const h = docHeight();
      const grew = (h - lastHeight) > cfg.growthEps;
      
      // Hvis siden vokste, nullstill telleren
      if (grew) stableRounds = 0;
      else      stableRounds++;
      
      lastHeight = h;
    }

    yield makeState("autoscroll: finished", { pulses, stableRounds });
  }
}
