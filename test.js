class ScrollAndClickBehavior
{
  static id = "ScrollAndClick: Infinite Scroll & Link Expansion";
  static maxScrolls = 500; 
  
  // Brukes for å spore elementer som allerede er klikket
  seenElements = new WeakSet(); 

  // --- Nødvendige Statiske Metoder ---
  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new ScrollAndClickBehavior();
  }
  static runInIframes = false;
  // ------------------------------------

  // Metode for å fjerne overlays og cookiebokser
  removeOverlays() {
    try {
      // 1. Fjerner vanlige cookie-bokser og samtykke-iframes
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

      // 2. Fjerner potensielle blokkerende bakgrunner (dimmers)
      const possibleBackdrops = document.querySelectorAll('div[style*="position: fixed"][style*="z-index: 2147483647"]');
      possibleBackdrops.forEach(el => {
          if (el.innerText.length < 50) {
              el.remove();
          }
      });
      
      // 3. Fikser scrolling som ofte blir blokkert av overlays
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.documentElement.style.overflow = 'auto';

    } catch (e) {
      console.error('[Bx] Feil under fjerning av overlays:', e);
    }
  }

  // Din originale fixScroll, beholdt for ekstra robusthet
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

  async awaitPageLoad() {
    this.removeOverlays(); 
    this.fixScroll();
    await new Promise(r => setTimeout(r, 500)); 
  }
  
  // Hjelpefunksjon for å klikke på alle synlige <a> uten navigasjon
  clickAllA(ctx) {
    let clicks = 0;
    const allCandidates = document.querySelectorAll('a');

    for (const elem of allCandidates) {
        if (this.seenElements.has(elem)) continue;

        const href = elem.getAttribute('href');
        
        // 🛑 Sikkerhetssjekk: Klikk KUN på lenker som IKKE navigerer vekk fra siden.
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            continue; 
        }

        try {
            // Sjekk om elementet er i viewport
            const rect = elem.getBoundingClientRect();
            if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                
                elem.click();
                this.seenElements.add(elem);
                clicks++;
            }
        } catch (e) {
             ctx.log({ msg: "Failed to click <a> tag", level: "warning", error: e.message });
        }
    }
    return clicks;
  }

  async* run(ctx) {
    // makeState er nøytral for å tillate full kontroll over 'status: loading'
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
    const DomElementsMinimumChange = 10;
    
    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      
    // --------------------------
    // ✅ INITIALISERING AV TILSTAND (Fikset ReferenceError)
    let totalClicks = 0;
    let stableRounds = 0; // Høyde-stabilitet
    let consecutiveSmallChanges = 0; // DOM-element-stabilitet
    let pulses = 0;
    
    let lastHeight = docHeight(); // Første initialisering
    let lastCount = document.body.getElementsByTagName("*").length; // Første initialisering
    // --------------------------

    // 🛑 FØRSTE KOMMANDO: SENDER STATUSEN UMIDDELBART
    yield makeState("autoscroll: started", { status: "loading", msg: "Locking Autoclick" }); 
    
    // Kjører fjerning igjen
    this.removeOverlays(); 
    
    while (stableRounds < cfg.stableLimit) {
      
      // Fortsett å sende busy/loading signal
      yield makeState("autoscroll: progress", { pulses, stableRounds, status: "loading" }); 

      // --- SCROLLING ---
      window.scrollBy(0, cfg.scrollStep);
      await ctx.Lib.sleep(cfg.waitMs); 

      // --- KLIKKING ---
      const clicksThisRound = this.clickAllA(ctx);
      totalClicks += clicksThisRound;
      
      if (clicksThisRound > 0) {
        ctx.log({ msg: `Clicked ${clicksThisRound} new <a> elements`, totalClicks });
        await ctx.Lib.sleep(cfg.clickDelayMs); 
      }
      
      // --- STABILITETSSJEKK ---
      const newCount = document.body.getElementsByTagName("*").length;
      const delta = newCount - lastCount;
      
      if (delta >= DomElementsMinimumChange) {
        consecutiveSmallChanges = 0;
      } else {
        consecutiveSmallChanges += 1;
      }
      
      const h = docHeight();
      const grew = (h - lastHeight) > cfg.growthEps;
      
      if (grew) stableRounds = 0;
      else      stableRounds++;
      
      // Oppdaterer for NESTE iterasjon
      lastCount = newCount;
      lastHeight = h;
      pulses++;

      // Oppretthold lås
      yield makeState("autoscroll: pulse", { 
          pulses, 
          stableRounds: stableRounds, 
          DOMStableRounds: consecutiveSmallChanges,
          status: "loading" 
      }); 
      
      const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
      if (atBottom) {
        await ctx.Lib.sleep(cfg.bottomHoldExtra); 
      }

      // 🛑 TIDLIG STOPP BASERT PÅ DOM-TELLING (Økt fra 3 til 5)
      if (consecutiveSmallChanges >= 5) { 
        ctx.log({ msg: "Ending due to consecutive small DOM changes (DOM count)", consecutiveSmallChanges: consecutiveSmallChanges });
        break;
      }
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
