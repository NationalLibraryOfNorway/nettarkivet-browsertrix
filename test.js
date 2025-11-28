class ScrollAndClickBehavior
{
  static id = "ScrollAndClick: Infinite Scroll & Link Expansion (Sub-path Restricted)";
  
  // Brukes for å spore elementer som allerede er klikket
  seenElements = new WeakSet(); 

  // Nødvendige statiske metoder for Browsertrix
  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new ScrollAndClickBehavior();
  }
  static runInIframes = false;
  
  // --- Metoder for Overlays og Scroll-fiksing ---

  async awaitPageLoad() {
    this.removeConsentOverlay();
    this.fixScroll();
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  removeConsentOverlay() {
    try {
      const selectors = [
        '[id*="sp_message"]', 
        '[class*="sp_message"]', 
        '[id*="cookie"]', 
        '[class*="cookie"]', 
        '[id*="consent"]', 
        '[class*="consent"]',
        'iframe[src*="sp.api.no"]',
        'iframe[src*="sourcepoint"]'
      ];
      
      document.querySelectorAll(selectors.join(', ')).forEach(el => {
        el.remove();
      });

      const possibleBackdrops = document.querySelectorAll('div[style*="position: fixed"][style*="z-index: 2147483647"]');
      possibleBackdrops.forEach(el => {
          if (el.innerText.length < 50) {
              el.remove();
          }
      });
      
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.documentElement.style.overflow = 'auto';

    } catch (e) {
      console.error('[Bx] Feil under fjerning av overlays:', e);
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
  
  // --- KLIKK-FUNKSJONALITET MED SUB-PATH REGLER ---

  clickAllA(ctx) {
    let clicks = 0;
    const allCandidates = document.links; 
    const currentPath = window.location.pathname; // Henter nåværende sti

    for (const elem of allCandidates) {
        if (this.seenElements.has(elem)) continue;

        const href = elem.getAttribute('href');
        
        ctx.log({ msg: "Behandler lenke", href: href || "[Ingen href]", level: "info" });
        
        // --- NY SIKKERHETSSJEKK: KLIKK KUN PÅ: ---
        let shouldClick = false;

        if (href === null || href === "") {
            ctx.log({ msg: "Lenke ignorert: Mangler href", level: "debug" });
            continue;
        } else if (href.startsWith('#') || href.startsWith('javascript:')) {
            // Anker eller JS-kall (klikk)
            shouldClick = true;
        } else if (href.startsWith('/')) {
            // Relativ lenke: Sjekk om den starter med nåværende URL-sti
            if (href.startsWith(currentPath)) {
                shouldClick = true; // Lenken er /sti/til/side når vi er på /sti/til
            } else {
                ctx.log({ msg: "Lenke ignorert: Relativ, men utenfor nåværende sti", href: href, level: "debug" });
            }
        } else {
            // Absolutt lenke (http/https/mailto osv.) -> IGNORER
            ctx.log({ msg: "Lenke ignorert: Absolutt/Ekstern URL", href: href, level: "debug" });
        }

        if (!shouldClick) {
            continue;
        }
        // ------------------------------------------

        // Sjekk om elementet er i viewport (før klikkforsøk)
        const rect = elem.getBoundingClientRect();
        const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
        
        if (!isInViewport) {
            ctx.log({ msg: "Lenke ignorert: Ikke i viewport", href: href, level: "debug" });
            continue;
        }

        try {
            // Logger at den skal klikkes på og klikk
            ctx.log({ msg: "Lenke klikket: OK (Innenfor sti)", href: href, level: "warning" });
            
            elem.click();
            this.seenElements.add(elem);
            clicks++;
        } catch (e) {
             ctx.log({ msg: "Failed to click <a> tag", href: href, level: "warning", error: e.message });
        }
    }
    return clicks;
  }

  // --- Hovedutførelsesmetode (uendret) ---

  async* run(ctx) {
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
      waitMs: 500,            
      scrollStep: 600,       
      stableLimit: 60,       
      bottomHoldExtra: 5000, 
      growthEps: 1,          
      clickDelayMs: 500      
    };
    // --------------------------

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      
    // --- INITIALISERING ---
    let totalClicks = 0;
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;
    // ----------------------
      
    // 🛑 FØRSTE KOMMANDO TIL BROWSERTRIX
    yield makeState("autoscroll: started", { status: "loading", msg: "Locking Autoclick" }); 
    
    while (stableRounds < cfg.stableLimit) {
      yield makeState("autoscroll: progress", { pulses, stableRounds, status: "loading" }); 

      // --- SCROLLING ---
      window.scrollBy(0, cfg.scrollStep);
      await ctx.Lib.sleep(cfg.waitMs); 
      
      // --- KLIKKING ---
      const clicksThisRound = this.clickAllA(ctx);
      totalClicks += clicksThisRound;

      if (clicksThisRound > 0) {
        await ctx.Lib.sleep(cfg.clickDelayMs); 
      }

      yield makeState("autoscroll: pulse", { pulses, status: "loading" }); 
      pulses++;

      const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
      
      if (atBottom) {
        await ctx.Lib.sleep(cfg.bottomHoldExtra); 
      }

      const h = docHeight();
      const grew = (h - lastHeight) > cfg.growthEps;
      
      if (grew) stableRounds = 0;
      else      stableRounds++;
      
      lastHeight = h;
    }

    // 🔓 Siste yield: Sender ferdig-signal UTEN status: loading
    yield makeState("autoscroll: finished", { 
        pulses, 
        stableRounds, 
        totalClicks, 
        msg: "Releasing Autoclick Lock" 
    });
  }
}
