class ScrollAndClick {
  static id = "Scroll and Click";
  static maxScrolls = 500; // standard maksimalt antall scroll-iterasjoner
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
// DIN ROBUSTE CONSENT-FJERNER
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
      
      // Gjenoppretter scrolling på body og html
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.documentElement.style.overflow = 'auto';
      document.documentElement.style.position = 'static';

      if (iframeCount > 0 || overlayCount > 0) {
        // Bruker ctx.log som forventet i Browsertrix
        ctx.log({ 
          msg: `Consent: Fjernet ${iframeCount} iframes og ${overlayCount} overlays. Scrolling gjenopprettet.`, 
          level: "warning" 
        });
      }

    } catch (e) {
      // Bruker ctx.log som forventet i Browsertrix
      ctx.log({ msg: `Consent: Feil under fjerning av overlay: ${e.message}`, level: "error" });
    }
  }

  /**
   * Browsertrix-standard oppstartsmetode.
   */
  async awaitPageLoad(ctx) {
    // Kjører consent-fjerning før hovedsløyfen
    this.removeConsentOverlay(ctx);
    // Bruker ctx.Lib.sleep som forventet i Browsertrix
    await ctx.Lib.sleep(500); 
  }

// ----------------------------------------------------
// RUN-metoden (Hovedsløyfen)
// ----------------------------------------------------

  async* run(ctx) {
    let click = 0;
    const DomElementsMinimumChange = 10;
    let consecutiveSmallChanges = 0;

    let lastCount = document.body.getElementsByTagName("*").length;
    let stableTime = 0;
    let iterations = 0;

    while (true) {
      if (++iterations > ScrollAndClick.maxScrolls) {
        ctx.log({ msg: "Max scrolls reached", iterations });
        break;
      }

      // scroll to bottom
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      // Bruker yield for å returnere kontroll til kjernen og simulere sleep
      yield ctx.Lib.sleep(1000); 

      // click if matched
      const selectstring = this.selectors.join(",");
      const elems = document.querySelectorAll(selectstring);
      for (const elem of elems) {
        const txt = (elem.innerText || elem.textContent || "").toLowerCase().trim();
        if (this.triggerwords.some(w => w === txt)) {
          elem.click();
          click++;
        }
      }
      if (elems.length > 0) {
        ctx.log({ msg: "Clicked load more buttons", totalClicks: click, thisRound: elems.length });
      }

      // Bruker yield for å returnere kontroll til kjernen og simulere sleep
      yield ctx.Lib.sleep(1000);
      await this.extractBrowserLinks(ctx);

      // detect DOM changes by element count delta
      const newCount = document.body.getElementsByTagName("*").length;
      const delta = newCount - lastCount;
      ctx.log({ msg: "DomElementsAfterScroll", newCount, delta });

      if (delta >= DomElementsMinimumChange) {
        consecutiveSmallChanges = 0;
        stableTime = 0;
      } else {
        consecutiveSmallChanges += 1;
        stableTime += 1000;
      }

      // update baseline for next iteration
      lastCount = newCount;

      // stop if 3 consecutive small changes
      if (consecutiveSmallChanges >= 3) {
        ctx.log({
          msg: "Ending due to consecutive small DOM changes",
          consecutiveSmallChanges,
          threshold: DomElementsMinimumChange
        });
        break;
      }

      // stop if nothing changes for 10s
      if (stableTime >= 10000) {
        ctx.log({ msg: "No significant changes for 10 seconds, stopping scroll" });
        break;
      }
    }
  }
}
