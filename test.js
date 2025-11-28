class ScrollAndClickBehavior
{
  static id = "ScrollAndClick: Complete Browsertrix Logic";
  
  seenElements = new WeakSet(); 
  
  // Variabler for Navigasjonskontroll (Likt AutoClick)
  _beforeUnloadHandler = null; 
  origPath = document.location.pathname;

  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new ScrollAndClickBehavior();
  }
  static runInIframes = false;
  
  // --- Opprydding og Scroll Fix ---
  
  async awaitPageLoad() {
    this.removeConsentOverlay();
    this.fixScroll();
    await new Promise(r => setTimeout(r, 500));
  }
  
  removeConsentOverlay() {
    try {
      const selectors = [ '[id*="sp_message"]', '[class*="sp_message"]', '[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]', 'iframe[src*="sp.api.no"]', 'iframe[src*="sourcepoint"]', 'iframe[src*="consent"]' ];
      document.querySelectorAll(selectors.join(', ')).forEach(el => { el.remove(); });
      const possibleBackdrops = document.querySelectorAll('div[style*="position: fixed"][style*="z-index"]');
      possibleBackdrops.forEach(el => {
          if (el.innerText.length < 50 || el.innerText.includes("cookie") || el.innerText.includes("samtykke")) { el.remove(); }
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
        style.textContent = ` body, html { overflow: auto !important; position: static !important; height: auto !important; width: auto !important; } `;
        document.head.appendChild(style);
      }
    } catch (e) {
      console.debug('Scroll fix error:', e);
    }
  }

  // --- NAVIGATION CONTROL (Fra AutoClick) ---

  addBeforeUnloadListener() {
    this._beforeUnloadHandler = (event) => {
      event.preventDefault(); 
      return false;
    };
    window.addEventListener("beforeunload", this._beforeUnloadHandler);
  }

  removeBeforeUnloadListener() {
    if (this._beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
  }

  // --- KLIKK-FUNKSJONALITET (FOKUS PÅ INNHOLDSUTVIDELSE) ---
  
  async clickAllA(ctx) {
    let clicks = 0;
    const allCandidates = document.querySelectorAll('a[href], a:not([href]), img[onclick], [role="button"], button, a img'); 

    for (const elem of allCandidates) {
        if (this.seenElements.has(elem)) continue;

        let targetElem = elem;
        let href = elem.getAttribute('href');
        
        if (elem.tagName === 'IMG' && elem.closest('a')) {
            targetElem = elem.closest('a');
            href = targetElem.getAttribute('href');
        }

        let shouldClick = false;
        let isNavigatingLink = false;

        if (href === null || href === "" || targetElem.tagName === 'BUTTON' || targetElem.getAttribute('role') === 'button') {
            shouldClick = true; 
        } else if (href.startsWith('#') || href.startsWith('javascript:')) {
            shouldClick = true; 
        } else if (/\.(jpeg|jpg|gif|png|webp|svg)$/i.test(href.split('?')[0])) {
            shouldClick = true; 
        } else if (href && href.startsWith(self.location.origin) && href !== this.origPath) {
             shouldClick = true;
             isNavigatingLink = true;
        } else {
            continue;
        }

        if (!shouldClick) continue;

        try {
            const rect = targetElem.getBoundingClientRect();
            const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
            if (!isInViewport) continue;
            
            this.seenElements.add(targetElem); 

            if (isNavigatingLink) {
                ctx.log({ msg: `Navigerende Lenke Klikket (Simulert AutoClick): ${href}.`, level: "warning" });
            } else {
                ctx.log({ msg: "Element klikket: Bursdagshilsen Utvidelse", tagName: targetElem.tagName, href: href || "[Ingen href]", level: "warning" });
            }
            
            const origHref = self.location.href;
            const origHistoryLen = self.history.length;
            
            targetElem.click();
            clicks++;

            await ctx.Lib.sleep(ctx.cfg.clickDelayMs); 
            
            if (isNavigatingLink) {
                if (self.history.length === origHistoryLen + 1 && self.location.href != origHref) {
                     ctx.log({ msg: "Navigasjon oppdaget (SPA/pushState). Simulerer history.back().", level: "info" });
                }
            }

        } catch (e) {
             ctx.log({ msg: "Failed to click element", tagName: targetElem.tagName, href: href || "[Ingen href]", level: "warning", error: e.message });
        }
    }
    return clicks;
  }

  // --- HOVEDUTFØRELSE (MED ROBUST SCROLLING OG NAVIGATION LYTTER) ---

  async* run(ctx) {
    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload; 
    };

    const cfg = {
      waitMs: 150,            
      scrollStep: 600,       
      stableLimit: 30,       
      bottomHoldExtra: 5000, 
      growthEps: 1,          
      clickDelayMs: 1000, 
      clickMaxRounds: 50
    };
    ctx.cfg = cfg; 
    
    this.addBeforeUnloadListener();
    this.origPath = document.location.pathname;

    const docHeight = () => Math.max( document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0 );
      
    let totalClicks = 0;
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;
      
    yield makeState("autoscroll: started", { status: "loading", msg: "Locking Autoclick" }); 
    
    // ######################################################
    // ## FASE 1: INFINITE SCROLLING
    // ######################################################
    
    ctx.log({ msg: "FASE 1: Starter scrolling til stabil høyde er nådd." });

    while (stableRounds < cfg.stableLimit) {
      if (document.location.pathname !== this.origPath) {
          ctx.log({ msg: "FASE 1: Lokasjon endret under scroll. Stopper.", level: "warning" });
          break;
      }

      yield makeState("autoscroll: progress", { pulses, stableRounds, status: "loading" }); 

      window.scrollBy(0, cfg.scrollStep);
      await ctx.Lib.sleep(cfg.waitMs); 
      
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
      
      if (atBottom && !grew) {
          ctx.log({ msg: "FASE 1: Stabil ved bunn av side. Bryter loop tidlig.", level: "warning" });
          break;
      }
    }

    ctx.log({ msg: `FASE 1 Fullført: Siden er stabil etter ${stableRounds} runder.` });

    // ######################################################
    // ## FASE 2: KLIKK PÅ LENKER
    // ######################################################
    
    ctx.log({ msg: "FASE 2: Starter klikk på utvidende elementer." });
    
    let clicksThisRound = 0;
    let clickRounds = 0;

    do {
        clicksThisRound = await this.clickAllA(ctx); 

        totalClicks += clicksThisRound;
        clickRounds++;

        if (clicksThisRound > 0) {
            ctx.log({ msg: `Runde ${clickRounds}: Fant og klikket ${clicksThisRound} nye elementer.` });
            yield makeState("autoclick: yielded", { status: "loading", msg: `Round ${clickRounds} complete, capturing content.` });
        } else {
            ctx.log({ msg: `Runde ${clickRounds}: Ingen nye elementer å klikke. Avslutter Klikk-fase.` });
        }

    } while (clicksThisRound > 0 && clickRounds < cfg.clickMaxRounds);
    
    ctx.log({ msg: `FASE 2 Fullført: Totalt ${totalClicks} klikk på ${clickRounds} runder.` });
    
    // ######################################################

    this.removeBeforeUnloadListener();
    
    yield makeState("autoscroll: finished", { 
        pulses, 
        stableRounds, 
        totalClicks, 
        msg: "Releasing Autoclick Lock" 
    });
  }
}


// --- START SKRIPTET (Wrapper for Chrome Console) ---
(async function() {
    console.log("--- Bx Scroll and Click Initiert ---");
    
    // Simulerer Browsertrix-miljøet (ctx)
    const ctx = {
        Lib: {
            // Asynkrone funksjoner
            sleep: (ms) => new Promise(r => setTimeout(r, ms)),
            getState: (payload) => payload
        },
        log: (data) => console.log(`[Bx Log] ${data.msg}`, data) 
    };

    if (!ScrollAndClickBehavior.isMatch()) {
        console.log("URL matcher ikke ScrollAndClickBehavior. Avslutter.");
        return;
    }
    
    const behavior = ScrollAndClickBehavior.init();
    await behavior.awaitPageLoad();

    // Kjører den asynkrone generatorfunksjonen
    const generator = behavior.run(ctx);
    let result = await generator.next();

    while (!result.done) {
        if (result.value instanceof Promise) {
            await result.value; 
        }
        console.log(`[Bx State]`, result.value);
        result = await generator.next();
    }

    console.log("--- Bx Scroll and Click Fullført ---");
    console.log("Endelig Tilstand:", result.value);
})();
