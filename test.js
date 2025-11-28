class ScrollAndClickBehavior
{
  static id = "ScrollAndClick: Infinite Scroll & Link Expansion"; // Oppdatert ID
  
  // Brukes for å spore elementer som allerede er klikket
  seenElements = new WeakSet(); 

  // Nødvendige statiske metoder for Browsertrix
  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new ScrollAndClickBehavior(); // Returnerer ny klasse
  }
  static runInIframes = false;
  
  // --- Metoder fra originalen (uendret) ---

  async awaitPageLoad() {
    this.removeConsentOverlay();
    this.fixScroll();
    
    // Bruker standard JS sleep her, da ctx.Lib er kun tilgjengelig i run()
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
  
  // --- NY KLIKK-FUNKSJONALITET ---

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

  // --- Oppdatert run(ctx) ---

  async* run(ctx) {
    // ⚠️ Fjernet din manuelle 'sleep' definisjon, bruker ctx.Lib.sleep i stedet for robusthet.
    
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
      // Fortsett å sende busy/loading signal gjennom hele loopen
      yield makeState("autoscroll: progress", { pulses, stableRounds, status: "loading" }); 

      // --- SCROLLING ---
      window.scrollBy(0, cfg.scrollStep);
      // Bruker ctx.Lib.sleep for å opprettholde låsen
      await ctx.Lib.sleep(cfg.waitMs); 
      
      // --- KLIKKING (NYTT) ---
      const clicksThisRound = this.clickAllA(ctx);
      totalClicks += clicksThisRound;

      if (clicksThisRound > 0) {
        ctx.log({ msg: `Clicked ${clicksThisRound} new <a> elements`, totalClicks });
        await ctx.Lib.sleep(cfg.clickDelayMs); // Vent etter klikk
      }

      // ------------------------

      yield makeState("autoscroll: pulse", { pulses, status: "loading" }); 
      pulses++;

      const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
      
      if (atBottom) {
        await ctx.Lib.sleep(cfg.bottomHoldExtra); // Bruker ctx.Lib.sleep
      }

      const h = docHeight();
      const grew = (h - lastHeight) > cfg.growthEps;
      
      if (grew) stableRounds = 0;
      else      stableRounds++;
      
      lastHeight = h;
    }

    // Sender ferdig-signal UTEN status: loading
    yield makeState("autoscroll: finished", { 
        pulses, 
        stableRounds, 
        totalClicks, 
        msg: "Releasing Autoclick Lock" 
    });
  }
}
