class AutoScrollBehavior
{
  static id = "AutoScroll: simple infinite scroll";
  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new AutoScrollBehavior();
  }
  static runInIframes = false;
  
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
  
  async* run(ctx) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload; 
    };
    const cfg = {
      waitMs: 900,
      stableLimit: 10,
      bottomHoldExtra: 1500,
      growthEps: 8
    };
    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;
    while (stableRounds < cfg.stableLimit) {
      const targetY = docHeight() - (window.innerHeight || 800);
      window.scrollTo(0, targetY > 0 ? targetY : 0);
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
      else      stableRounds++;
      lastHeight = h;
    }
    try {
      window.scrollTo(0, docHeight() - (window.innerHeight || 800));
      yield makeState("autoscroll: finished", { pulses, stableRounds });
    } catch {}
  }
}
