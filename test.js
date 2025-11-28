class ScrollAndClickBehavior
{
  static id = "ScrollAndClick: Infinite Scroll & Link Expansion (Async Fix)";
  
  seenElements = new WeakSet(); 

  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }
  static init() {
    return new ScrollAndClickBehavior();
  }
  static runInIframes = false;
  
  // --- Metoder for Overlays og Scroll-fiksing (Uendret) ---

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
  
  // --- KLIKK-FUNKSJONALITET (ASYNC FIX) ---
  // Bruker async for å tillate 'await' for stabil klikk-forsinkelse
  async clickAllA(ctx) {
    let clicks = 0;
    const allCandidates = document.querySelectorAll('a[href], a:not([href]), img[onclick], img[data-lightbox], img[data-src], img.clickable'); 

    for (const elem of allCandidates) {
        if (this.seenElements.has(elem)) continue;

        let href = elem.getAttribute('href');
        if (elem.tagName === 'IMG') {
            href = elem.getAttribute('data-src') || elem.getAttribute('src'); 
        }
        
        ctx.log({ msg: "Behandler kandidat", tagName: elem.tagName, href: href || "[Ingen href]", level: "info" });
        
        let shouldClick = false;

        if (href === null || href === "") {
            if (elem.tagName === 'IMG' && (!elem.getAttribute('onclick') && !elem.closest('a'))) {
                ctx.log({ msg: "Element ignorert: IMG uten href/onclick/lenke-forelder", level: "debug" });
                continue;
            }
            shouldClick = true; 
        } else if (href.startsWith('#') || href.startsWith('javascript:')) {
            shouldClick = true; 
        } else if (/\.(jpeg|jpg|gif|png|webp|svg)$/i.test(href.split('?')[0])) {
            shouldClick = true;
        } else {
            ctx.log({ msg: "Element ignorert: Navigerende URL (Absolutt/Relativ)", href: href, level: "debug" });
            continue;
        }

        if (!shouldClick) continue;

        try {
            const rect = elem.getBoundingClientRect();
            const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
            if (!isInViewport) continue;
            
            this.seenElements.add(elem); 

            ctx.log({ msg: "Element klikket: Potensiell lightbox/innholdsutvider", tagName: elem.tagName, href: href || "[Ingen href]", level: "warning" });
            
            elem.click();
            clicks++;
            
            // 💡 Bruker 'await' for å pause mellom klikk for stabilitet
            await ctx.Lib.sleep(ctx.cfg.clickDelayMs); 
            
        } catch (e) {
             ctx.log({ msg: "Failed to click element", tagName: elem.tagName, href: href || "[Ingen href]", level: "warning", error: e.message });
        }
    }
    return clicks;
  }

  // --- Hovedutførelsesmetode ---

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
      waitMs: 150,            
      scrollStep: 600,       
      stableLimit: 30,       
      bottomHoldExtra: 5000, 
      growthEps: 1,          
      clickDelayMs: 1000, 
      clickMaxRounds: 50
    };
    // Legg cfg til ctx for tilgang i clickAllA
    ctx.cfg = cfg; 
    // --------------------------

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
    // ## FASE 2: KLIKK PÅ LENKER (ETTER SCROLL)
    // ######################################################
    
    ctx.log({ msg: "FASE 2: Starter klikk på lenker som utvider innhold." });
    
    let clicksThisRound = 0;
    let clickRounds = 0;

    do {
        // 💡 Kaller clickAllA med 'await' da den nå er en ASYNC funksjon
        clicksThisRound = await this.clickAllA(ctx); 

        totalClicks += clicksThisRound;
        clickRounds++;

        if (clicksThisRound > 0) {
            ctx.log({ msg: `Runde ${clickRounds}: Fant og klikket ${clicksThisRound} nye elementer.` });
            // Yield *etter* en runde med klikk (fanger opp alle endringer)
            yield makeState("autoclick: yielded", { status: "loading", msg: `Round ${clickRounds} complete` });
        } else {
            ctx.log({ msg: `Runde ${clickRounds}: Ingen nye elementer å klikke. Avslutter Klikk-fase.` });
        }

    } while (clicksThisRound > 0 && clickRounds < cfg.clickMaxRounds);
    
    ctx.log({ msg: `FASE 2 Fullført: Totalt ${totalClicks} klikk på ${clickRounds} runder.` });
    
    // ######################################################

    yield makeState("autoscroll: finished", { 
        pulses, 
        stableRounds, 
        totalClicks, 
        msg: "Releasing Autoclick Lock" 
    });
  }
}


