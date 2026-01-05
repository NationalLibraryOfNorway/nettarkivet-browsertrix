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

  visitedLinks = new Set();

  static isMatch(url) {
    return true;
  }

  static init() {
    return new ScrollAndClick();
  }

  static runInIframes = false;

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
    await ctx.Lib.sleep(250);
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
      waitMs: 450,
      stableLimit: 6,
      bottomHoldExtra: 1000,
      growthEps: 10
    };

    let click = 0;
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;

    ctx.log({ msg: "Starter Scroll & Click behavior" });

    // Scroll sakte nedover
    while (stableRounds < cfg.stableLimit && pulses < 50) {
      const targetY = docHeight() - (window.innerHeight || 800);
      window.scrollTo(0, targetY > 0 ? targetY : 0);

      yield ctx.Lib.getState({ state: "scrolling", data: { pulses, stableRounds } });
      pulses++;
      await ctx.Lib.sleep(cfg.waitMs);

      // Klikk på "vis flere"-knapper
      const elems = document.querySelectorAll(this.selectors.join(","));
      let clicksThisRound = 0;

      for (const elem of elems) {
        const txt = (elem.innerText || elem.textContent || "").toLowerCase().trim();
        if (this.triggerwords.some(w => txt.includes(w))) {
          elem.scrollIntoView({ block: "center" });
          elem.click();
          clicksThisRound++;
          click++;
          await ctx.Lib.sleep(150);
        }
      }

      if (clicksThisRound > 0) {
        ctx.log({ msg: `Klikket ${clicksThisRound} "vis flere"-knapper (totalt ${click})` });
      }

      // Sjekk om siden har sluttet å vokse
      const currentHeight = docHeight();
      if (Math.abs(currentHeight - lastHeight) < cfg.growthEps) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }
      lastHeight = currentHeight;

      if (pulses % 5 === 0) {
        ctx.log({ msg: `Pulse ${pulses}, height: ${currentHeight}, stable: ${stableRounds}` });
      }
    }

    ctx.log({ msg: `Scrolling ferdig etter ${pulses} pulses` });
    
    // Scroll tilbake til toppen
    ctx.log({ msg: "Scroller tilbake til toppen" });
    window.scrollTo(0, 0);
    await ctx.Lib.sleep(200);

    // Klikk på alle lenker
    const allLinks = document.querySelectorAll('a[href]');
    ctx.log({ msg: `Fant ${allLinks.length} totale lenker på siden` });

    let clickedCount = 0;

    for (const link of allLinks) {
      const href = link.href;

      // Debug første lenke
      if (clickedCount === 0) {
        ctx.log({ msg: `Første lenke: href="${href}", pathname="${link.pathname}", matcher prefix: ${link.pathname?.startsWith('/vis/personalia/greetings/all')}` });
      }

      // Filtrer - kun lenker under /vis/personalia/greetings/all
      if (!href || !href.startsWith('http')) continue;
      if (!link.pathname?.startsWith('/vis/personalia/greetings/all')) continue;
      if (this.visitedLinks.has(href)) continue;

      this.visitedLinks.add(href);

      try {
        // Scroll inn i viewport
        link.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await ctx.Lib.sleep(300);

        // Klikk med preventDefault for å unngå navigering
        ctx.log({ msg: `Klikker lenke #${clickedCount + 1}: ${href}` });
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        
        const preventNav = (e) => {
          e.preventDefault();
        };
        link.addEventListener('click', preventNav, { once: false });
        link.dispatchEvent(clickEvent);

        clickedCount++;

        // Vent på lightbox
        await ctx.Lib.sleep(150);

        // Se etter lightbox/modal
        const lightbox = document.querySelector('[class*="lightbox"], [class*="modal"], [class*="overlay"], [class*="popup"]');
        if (lightbox) {
          ctx.log({ msg: `Fant lightbox: ${lightbox.className}` });
        }

        // Prøv å lukke
        const closeSelectors = [
          'button[aria-label="Lukk"]', '[aria-label="Lukk"]',
          'button[aria-label*="close"]', 'button[aria-label*="Close"]',
          '.close', '[class*="close"]', '[aria-label*="close"]', '[aria-label*="Close"]',
          '.modal-close', '.lightbox-close', 'button[title*="close"]', 'button[title*="Close"]',
          '[class*="overlay"]', '.backdrop', '[data-dismiss]', 'button.btn-close',
          '[onclick*="close"]', 'a[onclick*="close"]'
        ];

        let closed = false;
        for (const selector of closeSelectors) {
          const closeBtn = document.querySelector(selector);
          if (closeBtn && closeBtn.offsetParent !== null) {
            ctx.log({ msg: `Lukker med selector: ${selector}` });
            closeBtn.click();
            closed = true;
            await ctx.Lib.sleep(150);
            break;
          }
        }

        if (!closed) {
          // Fallback: ESC-tast
          ctx.log({ msg: "Prøver ESC-tast" });
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
          await ctx.Lib.sleep(150);
        }

      } catch (e) {
        ctx.log({ msg: `Feil ved klikk: ${e.message}` });
      }
    }

    ctx.log({ msg: `Ferdig! Klikket ${clickedCount} lenker av ${allLinks.length} totalt` });
    ctx.log({ msg: `Unike lenker besøkt: ${this.visitedLinks.size}` });

    window.scrollTo(0, docHeight());

    yield ctx.Lib.getState({
      state: "finished",
      data: {
        msg: "Scroll & Click ferdig",
        totalClicks: click,
        totalPulses: pulses
      }
    });
  }
}
