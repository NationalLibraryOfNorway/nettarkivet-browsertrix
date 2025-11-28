class ScrollAndClick {
  static id = "Scroll and Click";
  static maxScrolls = 500; // standard maksimalt antall scroll-iterasjoner (brukes ikke i ny logikk)
  selectors = [
    "a",
    "button",
    "button.lc-load-more",
    "span[role=treeitem]",
    "button#load-more-posts",
    "#pagenation"
  ];
  triggerwords = [
    "se mere",
    "åbn",
    "flere kommentarer",
    "se flere",
    "indlæs flere nyheder",
    "hent flere",
    "vis flere"
  ].map(t => t.toLowerCase());

  static isMatch(url) {
    return true; // kjører på alle sider
  }

  static init() {
    return {};
  }

  async extractBrowserLinks(ctx) {
    const urls = new Set(Array.from(document.links, a => a.href).filter(Boolean));
    await Promise.allSettled(Array.from(urls, url => ctx.Lib.addLink(url)));
  }

  static runInIframes = false;

// ----------------------------------------------------
// CONSENT OG SCROLL FIX METODER (FRA NY LOGIKK)
// ----------------------------------------------------

  removeConsentOverlay(ctx) {
    try {
      // Fjern SourcePoint/consent iframes
      const consentIframes = document.querySelectorAll('iframe[src*="sp.api.no"], iframe[src*="sourcepoint"], iframe[src*="consent"]');
      let iframeCount = 0;
      consentIframes.forEach(iframe => {
        iframe.remove();
        iframeCount++;
      });
       
      // Fjern overlays (inkludert høy z-index og sp_message)
      const overlays = document.querySelectorAll('[id*="sp_message"], [class*="sp_message"], div[style*="z-index: 2147483647"]');
      let overlayCount = 0;
      overlays.forEach(el => {
        el.remove();
        overlayCount++;
      });
      
      // Gjenoppretter scrolling (Fullt sett)
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.documentElement.style.overflow = 'auto';
      document.documentElement.style.position = 'static';

      if (iframeCount > 0 || overlayCount > 0) {
        ctx.log({ 
          msg: `Consent: Fjernet ${iframeCount} iframes og ${overlayCount} overlays. Scrolling gjenopprettet.`, 
          level: "warning" 
        });
      }

    } catch (e) {
      ctx.log({ msg: `Consent: Feil under fjerning av overlay: ${e.message}`, level: "error" });
    }
  }
    
  fixScroll(ctx) {
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
      ctx.log({ msg: "Scroll fix påsatt.", level: "debug" });
    } catch (e) {
      ctx.log({ msg: `Scroll fix error: ${e.message}`, level: "debug" });
    }
  }


  /**
   * Browsertrix-standard oppstartsmetode.
   */
  async awaitPageLoad(ctx) {
    // Kjører consent-fjerning og scroll-fikser
    this.removeConsentOverlay(ctx);
    this.fixScroll(ctx); // Legg til fixScroll her
    // Bruker ctx.Lib.sleep som forventet i Browsertrix
    await ctx.Lib.sleep(1000);  // Litt lengre ventetid for å la siden stabilisere seg
  }

// ----------------------------------------------------
// RUN-metoden (NY SCROLL & KLIKK SLØYFE)
// ----------------------------------------------------

  async* run(ctx) {
    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
    
    // Konfigurasjon for Scroll/Stabilitet
    const cfg = {
      waitMs: 900,
      stableLimit: 10,       // Antall runder uten vekst før stopp
      bottomHoldExtra: 1500, // Ekstra ventetid når vi når bunnen
      growthEps: 8           // Minimum vekst i px for å regnes som vekst
    };
    
    let click = 0;
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;

    ctx.log({ msg: "Starting combined Scroll and Click loop" });

    while (stableRounds < cfg.stableLimit && pulses < 100) { // Begrens pulser til 100 for sikkerhet
        
        // 1. SCROLL
        const targetY = docHeight() - (window.innerHeight || 800);
        window.scrollTo(0, targetY > 0 ? targetY : 0);
        yield ctx.Lib.getState({ state: "autoscroll: pulse", data: { pulses, stableRounds } });
        pulses++;

        // Vent etter scroll
        await ctx.Lib.sleep(cfg.waitMs); 
        
        // 2. KLIKK LOGIKK
        const selectstring = this.selectors.join(",");
        const elems = document.querySelectorAll(selectstring);
        let clicksThisRound = 0;
        
        for (const elem of elems) {
          const txt = (elem.innerText || elem.textContent || "").toLowerCase().trim();
          if (this.triggerwords.some(w => w === txt)) {
            elem.click();
            await ctx.Lib.sleep(200); // Kort pause etter klikk for å trigge lasting
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
        else      stableRounds++;
        
        lastHeight = h;
        
        await this.extractBrowserLinks(ctx); // Legg til lenker i hver runde

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
