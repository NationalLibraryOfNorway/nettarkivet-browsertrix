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
    return new ScrollAndClick();
  }

  static runInIframes = false;

<<<<<<< HEAD
  // Samle og rapporter lenker direkte til Browsertrix
  async collectLinks(ctx) {
    try {
      const links = Array.from(document.querySelectorAll("a[href]"))
        .map(a => {
          try {
            return new URL(a.href, location.href).href;
          } catch {
            return null;
          }
        })
        .filter(href => href && href.startsWith("http"));
      
      const uniqueLinks = [...new Set(links)];
      
      // Yield hver lenke som "discovered link" state
      for (const link of uniqueLinks) {
        yield ctx.Lib.getState({ 
          state: "link-discovered", 
          data: { url: link } 
        });
=======
  // Riktig metode for å legge URL i køen i Browsertrix
  queueUrl(url, ctx) {
    try {
      const cleanUrl = url.split("#")[0];
      
      // I Browsertrix behaviors bruker vi self.__bx_behaviors.addLink
      // eller ctx.Lib kan ha en metode for dette
      if (typeof self !== 'undefined' && self.__bx_behaviors && self.__bx_behaviors.addLink) {
        self.__bx_behaviors.addLink(cleanUrl);
      } else if (ctx?.Lib?.addLink) {
        ctx.Lib.addLink(cleanUrl);
      } else {
        // Prøv global addLink
        if (typeof addLink === 'function') {
          addLink(cleanUrl);
        }
      }
    } catch (e) {
      // Silent fail - ikke stopp behavior ved feil
    }
  }

  async extractAndQueueLinks(ctx) {
    const currentOrigin = location.origin;

    // Henter alle <a href=""> på siden
    const allLinks = Array.from(document.querySelectorAll("a[href]"))
      .map(a => a.href)
      .filter(href => href && href.length > 0);

    const uniqueLinks = [...new Set(allLinks)];

    let queuedCount = 0;
    let externalCount = 0;

    for (const url of uniqueLinks) {
      // Hopp over mailto:, tel:, javascript: osv.
      if (!url.startsWith("http")) {
        continue;
      }

      // Kun interne lenker (same origin) – du kan endre til same domain hvis du vil ha subdomener også
      if (url.startsWith(currentOrigin)) {
        this.queueUrl(url, ctx);
        queuedCount++;
      } else {
        externalCount++;
        ctx.log({ msg: "Ekstern lenke hoppet over", url, level: "debug" });
>>>>>>> 9932dd36ca6af8ff07d0c840f168db992bb905f2
      }
      
      ctx.log({ msg: `Samlet ${uniqueLinks.length} lenker` });
    } catch (e) {
      ctx.log({ msg: `Feil ved lenkesamling: ${e.message}` });
    }
  }

  // ----------------------------------------------------
  // CONSENT OG SCROLL FIX
  // ----------------------------------------------------
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

  async awaitPageLoad(ctx) {
    this.removeConsentOverlay();
    this.fixScroll();
    await ctx.Lib.sleep(1000);
  }

  // ----------------------------------------------------
  // HOVEDSLØYFE – nå med skikkelig kø-legging
  // ----------------------------------------------------
  async* run(ctx) {
    await this.awaitPageLoad(ctx);

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );

    const cfg = {
      waitMs: 900,
      stableLimit: 12,
      bottomHoldExtra: 1500,
      growthEps: 10
    };

    let click = 0;
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;

    ctx.log({ msg: "Starter Scroll & Click + Queue behavior" });

    while (stableRounds < cfg.stableLimit && pulses < 150) {
      // 1. Scroll til nesten bunnen
      const targetY = docHeight() - (window.innerHeight || 800);
      window.scrollTo(0, targetY > 0 ? targetY : 0);

      yield ctx.Lib.getState({ state: "autoscroll", data: { pulses, stableRounds } });
      pulses++;
      await ctx.Lib.sleep(cfg.waitMs);

      // 2. Klikk på "vis flere"-knapper
      const elems = document.querySelectorAll(this.selectors.join(","));
      let clicksThisRound = 0;

      for (const elem of elems) {
        const txt = (elem.innerText || elem.textContent || "").toLowerCase().trim();
        if (this.triggerwords.some(w => txt.includes(w))) {  // includes er ofte bedre enn ===
          elem.scrollIntoView({ block: "center" });
          elem.click();
          clicksThisRound++;
          click++;
          await ctx.Lib.sleep(300);
        }
      }

      if (clicksThisRound > 0) {
        ctx.log({ msg: `Klikket ${clicksThisRound} "vis flere"-knapper (totalt ${click})` });
      }

      // 3. Sjekk om siden har sluttet å vokse
      const h = docHeight();
      if (h - lastHeight > cfg.growthEps) {
        stableRounds = 0;
        lastHeight = h;
      } else {
        stableRounds++;
      }

      // Ekstra ventetid når vi er på bunnen
      if ((window.innerHeight + window.scrollY) >= (docHeight() - 10)) {
        await ctx.Lib.sleep(cfg.bottomHoldExtra);
      }
    }

    window.scrollTo(0, docHeight());
    
    // Samle alle lenker FØR vi signaliserer at vi er ferdig
    ctx.log({ msg: "Samler alle lenker på siden..." });
    yield* this.collectLinks(ctx);

    yield ctx.Lib.getState({
      state: "finished",
      data: {
        msg: "Scroll & Click + Queue ferdig",
        totalClicks: click,
        totalPulses: pulses
      }
    });
  }
<<<<<<< HEAD
}
=======
}
>>>>>>> 9932dd36ca6af8ff07d0c840f168db992bb905f2
