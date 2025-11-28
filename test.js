class AutoScrollBehavior
{
  static id = "AutoScroll: simple infinite scroll + autoclick";
  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new AutoScrollBehavior();
  }
  static runInIframes = false;
  
  // NY VARIABEL: For å spore hvilke knapper som allerede er klikket
  seenClickElem = new WeakSet();

  async awaitPageLoad() {
    // Fjern consent overlay og fiks scroll
    this.removeConsentOverlay();
    this.fixScroll();
    
    await new Promise(r => setTimeout(r, 500));
  }
  
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
  
  /**
   * Finner og klikker på en "Last inn mer"-knapp.
   * Bruker WeakSet for å unngå å klikke på samme knapp flere ganger.
   * Returnerer true hvis en knapp ble klikket.
   */
  autoClickLoadMore() {
    const textPatterns = /load more|vis mer|last inn|flere|more|next|continue|show/i;
    
    // Kombinert liste over vanlige selektorer for "last inn mer"-knapper
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
      // Sjekk om elementet er klikket før
      if (this.seenClickElem.has(el)) {
        continue;
      }
      
      // LØSNING: Fjern 'as HTMLElement' for å unngå SyntaxError
      const element = el; 

      // 1. Sjekk synlighet (offsetParent !== null betyr at elementet er i layouten)
      if (element.offsetParent !== null && element.offsetWidth > 10 && element.offsetHeight > 10) {
        
        const text = element.textContent ? element.textContent.trim() : '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        
        // 2. Sjekk om teksten matcher et "last inn mer"-mønster
        if (textPatterns.test(text) || textPatterns.test(ariaLabel)) {
          console.log(`[AutoScroll] Klikket på "Load More" knapp: ${text.substring(0, 30)}`);
          element.click();
          this.seenClickElem.add(element); // Marker som klikket
          // Vi klikker KUN én knapp per sjekk for å unngå race conditions
          return true; 
        }
      }
    }
    
    return false; // Ingen knapp klikket
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
    // 📌 KONFIGURASJON FOR STABIL SCROLLING OG KLIKK
    // --------------------------
    const cfg = {
      waitMs: 750,           // Ventetid mellom scroll-steg
      scrollStep: 150,       // Scroll 150px ned per puls
      stableLimit: 25,       // Antall runder uten vekst før stopp
      bottomHoldExtra: 2000, // Ekstra ventetid når bunnen er nådd (gir tid til å laste inn)
      growthEps: 1,          // Minimum vekst i piksler for å nullstille teller
      clickDelayMs: 500      // Ventetid etter et klikk før fortsettelse
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
      // 👇 Smooth incremental scroll:
      window.scrollBy(0, cfg.scrollStep);

      yield makeState("autoscroll: pulse", { pulses });
      pulses++;

      await sleep(cfg.waitMs);

      const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
      
      if (atBottom) {
        // 1. Prøv å klikke på en "Last inn mer"-knapp
        const clicked = this.autoClickLoadMore();
        
        // 2. Vent ekstra tid uansett (for treig innlasting)
        await sleep(cfg.bottomHoldExtra);

        // 3. Hvis vi klikket, vent litt ekstra for at siden skal reagere
        if (clicked) {
             await sleep(cfg.clickDelayMs);
        }
      }

      const h = docHeight();
      const grew = (h - lastHeight) > cfg.growthEps;
      
      // Hvis siden vokste ELLER vi akkurat klikket på en knapp, nullstill telleren
      if (grew) stableRounds = 0;
      else      stableRounds++;
      
      lastHeight = h;
    }

    yield makeState("autoscroll: finished", { pulses, stableRounds });
  }
}
