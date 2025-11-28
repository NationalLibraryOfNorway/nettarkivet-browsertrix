class AutoScrollBehavior
{
  static id = "AutoScroll: infinite scroll (Bx Safe, Robust Sleep)";
  
  // Nødvendige statiske metoder for Browsertrix
  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new AutoScrollBehavior();
  }
  static runInIframes = false;

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

  async* run(ctx) {
    // makeState er nøytral for å tillate full kontroll over 'status: loading'
    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload; 
    };

    // --------------------------
    // 📌 KONFIGURASJON (Rask & Jevn Scrolling)
    // --------------------------
    const cfg = {
      waitMs: 500,            // Ventetid mellom steg
      scrollStep: 600,       // Størrelse på scroll-steg
      stableLimit: 60,       // Antall pulser uten vekst før stopp
      bottomHoldExtra: 5000, // Ekstra ventetid når bunnen er nådd
      growthEps: 1,          
      clickDelayMs: 500      
    };
    // --------------------------

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      
    // 🛑 FØRSTE KOMMANDO: SENDER STATUSEN UMIDDELBART
    yield makeState("autoscroll: started", { status: "loading", msg: "Locking Autoclick" }); 
    
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;
    
    while (stableRounds < cfg.stableLimit) {
      
      // Fortsett å sende busy/loading signal
      yield makeState("autoscroll: progress", { pulses, stableRounds, status: "loading" }); 

      window.scrollBy(0, cfg.scrollStep);

      // Sørg for at 'status: loading' sendes i hver yield
      yield makeState("autoscroll: pulse", { pulses, status: "loading" }); 
      pulses++;

      // 🔄 BRUKER ctx.Lib.sleep() for å låse Browsertrix-konteksten
      await ctx.Lib.sleep(cfg.waitMs); 

      const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
      
      if (atBottom) {
        // 🔄 BRUKER ctx.Lib.sleep()
        await ctx.Lib.sleep(cfg.bottomHoldExtra); 
      }

      const h = docHeight();
      const grew = (h - lastHeight) > cfg.growthEps;
      
      if (grew) stableRounds = 0;
      else      stableRounds++;
      
      lastHeight = h;
    }

    // 🔓 Siste yield: Sender ferdig-signal UTEN status: loading
    yield makeState("autoscroll: finished", { pulses, stableRounds, msg: "Releasing Autoclick Lock" });
  }
}
