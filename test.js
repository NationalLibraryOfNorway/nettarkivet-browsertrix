class AutoScrollBehavior
{
  static id = "AutoScroll: infinite scroll (Fast & Smooth, Bx Safe)";
  // ... (unchanged methods: isMatch, init, runInIframes) ...
  
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
      waitMs: 500,            // Redusert ventetid = Jevn og rask bevegelse
      scrollStep: 600,       // Stort steg = Rask fremdrift
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
      
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;
    
    while (stableRounds < cfg.stableLimit) {
      // VIKTIG: Sender busy-signal til Browsertrix
      yield makeState("autoscroll: busy", { pulses, status: "scrolling" }); 

      window.scrollBy(0, cfg.scrollStep);

      yield makeState("autoscroll: pulse", { pulses });
      pulses++;

      await sleep(cfg.waitMs);

      const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
      
      if (atBottom) {
        await sleep(cfg.bottomHoldExtra);
      }

      const h = docHeight();
      const grew = (h - lastHeight) > cfg.growthEps;
      
      if (grew) stableRounds = 0;
      else      stableRounds++;
      
      lastHeight = h;
    }

    // Sender ferdig-signal, og Browsertrix kan nå vurdere klikk
    yield makeState("autoscroll: finished", { pulses, stableRounds });
  }
}
