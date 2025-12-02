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

      // 2b. Klikk på lenker som åpner lightbox/modal
      if (pulses % 3 === 0) {
        const allLinks = document.querySelectorAll('a[href]');
        ctx.log({ msg: `Fant ${allLinks.length} totale lenker på siden` });
        
        let clickedLinks = 0;
        const maxClicksPerRound = 5;
        
        for (const link of allLinks) {
          if (clickedLinks >= maxClicksPerRound) {
            ctx.log({ msg: `Nådde maks ${maxClicksPerRound} klikk per runde` });
            break;
          }
          
          const href = link.href;
          
          // Debug: logg lenke-info
          if (clickedLinks === 0) {
            ctx.log({ msg: `Sjekker lenke: href="${href}", starts with http: ${href?.startsWith('http')}, already visited: ${this.visitedLinks.has(href)}` });
          }
          
          if (!href || !href.startsWith('http')) continue;
          if (this.visitedLinks.has(href)) continue;
          
          this.visitedLinks.add(href);
          
          try {
            // Scroll lenken inn i viewport
            link.scrollIntoView({ block: 'center', behavior: 'instant' });
            await ctx.Lib.sleep(200);
            
            // Klikk på lenken for å åpne lightbox
            link.click();
            clickedLinks++;
            
            ctx.log({ msg: `✓ Klikket lenke #${clickedLinks}: ${href}` });
            
            // Vent litt for å la lightbox/modal laste
            await ctx.Lib.sleep(1500);
            
            // Prøv å lukke lightbox/modal (vanlige lukkemetoder)
            const closeSelectors = [
              '.close', '[class*="close"]', '[aria-label*="close"]', '[aria-label*="Close"]',
              '.modal-close', '.lightbox-close', 'button[title*="close"]', 'button[title*="Close"]',
              '[class*="overlay"]', '.backdrop', '[data-dismiss]'
            ];
            
            for (const selector of closeSelectors) {
              const closeBtn = document.querySelector(selector);
              if (closeBtn && closeBtn.offsetParent !== null) {
                closeBtn.click();
                ctx.log({ msg: `Lukket lightbox med selector: ${selector}` });
                await ctx.Lib.sleep(300);
                break;
              }
            }
            
            // Fallback: ESC-tast for å lukke
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
            await ctx.Lib.sleep(300);
            
          } catch (e) {
            ctx.log({ msg: `Feil ved klikk på lenke: ${e.message}` });
          }
        }
        
        ctx.log({ msg: `Runde ${pulses}: Åpnet ${clickedLinks} lightboxer av ${allLinks.length} lenker (totalt ${this.visitedLinks.size} unike besøkt)` });
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
