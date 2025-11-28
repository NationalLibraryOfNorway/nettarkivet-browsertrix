class ScrollAndClick {
  static id = "Scroll and Click";
  static maxScrolls = 500; 
  selectors = [
    "a", "button", "button.lc-load-more", "span[role=treeitem]", 
    "button#load-more-posts", "#pagenation"
  ];
  triggerwords = [
    "se mere", "åbn", "flere kommentarer", "se flere", 
    "indlæs flere nyheder", "hent flere", "vis flere"
  ].map(t => t.toLowerCase());

  static isMatch(url) {
    return true; 
  }

  static init() {
    return {};
  }

  /**
   * Henter lenker fra siden og logger dem før de legges til Browsertrix-køen.
   */
  async extractBrowserLinks(ctx) {
    const allUrls = Array.from(document.links, a => a.href).filter(Boolean);
    const uniqueUrls = new Set(allUrls);
    let addedCount = 0;
    
    await Promise.allSettled(Array.from(uniqueUrls, url => {
        // Logging av URL før den legges til køen
        ctx.log({ msg: "Link extracted", url: url, level: "info" });
        addedCount++;
        return ctx.Lib.addLink(url);
    }));

    if (addedCount > 0) {
        ctx.log({ msg: `Successfully extracted and added ${addedCount} unique links.`, level: "debug" });
    }
  }

  static runInIframes = false;

// ----------------------------------------------------
// CONSENT OG SCROLL FIX METODER
// ----------------------------------------------------

  removeConsentOverlay(ctx) {
    try {
      const consentIframes = document.querySelectorAll('iframe[src*="sp.api.no"], iframe[src*="sourcepoint"], iframe[src*="consent"]');
      let iframeCount = 0;
      consentIframes.forEach(iframe => { iframe.remove(); iframeCount++; });
       
      const overlays = document.querySelectorAll('[id*="sp_message"], [class*="sp_message"], div[style*="z-index: 2147483647"]');
      let overlayCount = 0;
      overlays.forEach(el => { el.remove(); overlayCount++; });
      
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.documentElement.style.overflow = 'auto';
      document.documentElement.style.position = 'static';

      if (iframeCount > 0 || overlayCount > 0) {
        ctx.log({ msg: `Consent: Fjernet ${iframeCount} iframes og ${overlayCount} overlays. Scrolling gjenopprettet.`, level: "warning" });
      }
    } catch (e) {
      ctx.log({ msg: `Consent: Feil under fjerning av overlay: ${e.message}`, level: "error" });
    }
  }
    
  fixScroll(ctx) {
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
      ctx.log({ msg: "Scroll fix påsatt.", level: "debug" });
    } catch (e) {
      ctx.log({ msg: `Scroll fix error: ${e.message}`, level: "debug" });
    }
  }

  async awaitPageLoad(ctx) {
    this.removeConsentOverlay(ctx);
    this.fixScroll(ctx);
    await ctx.Lib.sleep(1000); 
  }

// ----------------------------------------------------
// RUN-metoden (HOVEDSLØYFE)
// ----------------------------------------------------

  async* run(ctx) {
    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
    
    const cfg = {
      waitMs: 900,
      stableLimit: 10,
      bottomHoldExtra: 1500,
      growthEps: 8
    };
    
    let click = 0;
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;

    ctx.log({ msg: "Starting combined Scroll and Click loop" });

    while (stableRounds < cfg.stableLimit && pulses < 100) {
        
        // 1. SCROLL
        const targetY = docHeight() - (window.innerHeight || 800);
        window.scrollTo(0, targetY > 0 ? targetY : 0);
        yield ctx.Lib.getState({ state: "autoscroll: pulse", data: { pulses, stableRounds } });
        pulses++;

        await ctx.Lib.sleep(cfg.waitMs); 
        
        // 2. KLIKK LOGIKK
        const selectstring = this.selectors.join(",");
        const elems = document.querySelectorAll(selectstring);
        let clicksThisRound = 0;
        
        for (const elem of elems) {
          const txt = (elem.innerText || elem.textContent || "").toLowerCase().trim();
          if (this.triggerwords.some(w => w === txt)) {
            elem.click();
            await ctx.Lib.sleep(200);
            click++;
            clicksThisRound++;
          }
        }
        if (clicksThisRound > 0) {
          ctx.log({ msg: "Clicked load more buttons", totalClicks: click, thisRound: clicksThisRound });
        }
        
        // 3. Ekstra venting hvis vi er på bunnen
        const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
        if (atBottom) {
          await ctx.Lib.sleep(cfg.bottomHoldExtra);
        }
        
        // 4. SJEKK STABILITET
        const h = docHeight();
        const grew = (h - lastHeight) > cfg.growthEps;
        
        if (grew) stableRounds = 0;
        else stableRounds++;
        
        lastHeight = h;
        
        await this.extractBrowserLinks(ctx); // <--- Kaller nå den oppdaterte funksjonen
        
        if (pulses >= 100) {
            ctx.log({ msg: `Max pulses (${pulses}) reached. Stopping scroll.`, level: "warning" });
            break;
        }
    }
    
    // Ruller til bunnen ved fullføring
    try {
      window.scrollTo(0, docHeight() - (window.innerHeight || 800));
      yield ctx.Lib.getState({ 
        state: "autoscroll: finished", 
        data: { 
            pulses, 
            stableRounds, 
            totalClicks: click, 
            msg: "Scrolling fullført. Siden er stabil."
        } 
      });
    } catch {}
  }
}
