class AutoScrollBehavior
{
  static id = "AutoScroll: infinite scroll (Bx Safe, Robust Status)";
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
    
    // makeState forenklet for å kun sende et status-objekt til Browsertrix-kjernen.
    const makeState = (state, data) => {
      // Browsertrix lytter ofte til 'status' i data-objektet.
      const payload = { state, data: { status: "loading", ...data } }; 
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload; 
    };

    // --------------------------
    // 📌 KONFIGURASJON: VELDIG RASK & JEVN SCROLL
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
      
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;
    
    while (stableRounds < cfg.stableLimit) {
      // VIKTIG ENDRING: makeState er nå den som legger til 'status: loading'
      // Dette tvinger Browsertrix til å vente på at "lastingen" skal fullføres.
      
      yield makeState("autoscroll: pulse", { pulses, stableRounds }); 

      window.scrollBy(0, cfg.scrollStep);

      // Ikke nødvendig med et ekstra yield her, men beholdt for å markere progresjon
      // yield makeState("autoscroll: progress", { pulses, stableRounds }); 
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

    // Sender ferdig-signal UTEN 'status: loading' i data-objektet
    const finishedState = { pulses, stableRounds, status: "finished" };
    if (ctx?.Lib?.getState) return ctx.Lib.getState({ state: "autoscroll: finished", data: finishedState });
    if (ctx?.getState)      return ctx.getState({ state: "autoscroll: finished", data: finishedState });
    
    yield finishedState;
  }
}
