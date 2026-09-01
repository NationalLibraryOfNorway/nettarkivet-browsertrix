class ScrollAndClick {
  static id = "Scroll and Click";
  static maxScrolls = 500;

  selectors = [
    "a", "button", "button.lc-load-more", "span[role=treeitem]",
    "button#load-more-posts", "#pagenation", "brick-button-v9"
  ];

  triggerwords = [
    "se mere", "åbn", "flere kommentarer", "se flere",
    "indlæs flere nyheder", "hent flere", "vis flere", "last flere"
  ].map(t => t.toLowerCase());

  visitedLinks = new Set();

  static isMatch(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    // Ikke kjør adferdsskriptet dersom måladressen er en innloggingsside eller brukerportal
    if (u.includes('/login') || u.includes('/logg-inn') || u.includes('/logginn') || u.includes('/auth/')) {
      return false;
    }
    return u.includes('/vis/personalia') || u.includes('/greetings');
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
    const currentUrl = (window.location.href || "").toLowerCase();
    if (currentUrl.includes('/login') || currentUrl.includes('/logg-inn') || currentUrl.includes('/logginn')) {
      ctx.log({ msg: "Avbryter da gjeldende side er en innloggingsside: " + window.location.href });
      return;
    }

    this.removeConsentOverlay();
    this.fixScroll();

    // Vent på at React / Namaste SPA og Sanity API har lastet inn initialt content
    const maxWaitMs = 10000;
    const intervalMs = 500;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      this.removeConsentOverlay();
      this.fixScroll();

      const links = document.querySelectorAll('a[href*="/greetings/"]');
      if (links.length > 0) {
        ctx.log({ msg: `Namaste SPA lastet inn med ${links.length} initial-lenker etter ${elapsed} ms` });
        break;
      }
      await ctx.Lib.sleep(intervalMs);
      elapsed += intervalMs;
    }

    if (elapsed >= maxWaitMs) {
      ctx.log({ msg: `Venting på Namaste SPA utløp etter ${maxWaitMs} ms` });
    }

    await ctx.Lib.sleep(500);
  }

  // ----------------------------------------------------
  // HOVEDSLØYFE
  // ----------------------------------------------------
  async* run(ctx) {
    const currentUrl = (window.location.href || "").toLowerCase();
    if (currentUrl.includes('/login') || currentUrl.includes('/logg-inn') || currentUrl.includes('/logginn')) {
      ctx.log({ msg: "Hoppet over run() da URL-en er innlogging: " + window.location.href });
      return;
    }

    await this.awaitPageLoad(ctx);

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );

    const countGreetingLinks = () =>
      document.querySelectorAll('a[href*="/greetings/"]').length;

    const cfg = {
      waitMs: 1200,
      stableLimit: 5,
      growthEps: 10
    };

    let click = 0;
    let lastHeight = docHeight();
    let lastLinkCount = countGreetingLinks();
    let stableRounds = 0;
    let pulses = 0;

    ctx.log({ msg: "Starter Scroll & Click behavior for Amedia Personalia (Namaste SPA)" });

    // Scroll sakte nedover for å trigge infinite scroll / Sanity queries
    while (stableRounds < cfg.stableLimit && pulses < 50) {
      const targetY = docHeight() - (window.innerHeight || 800);
      window.scrollTo({ top: targetY > 0 ? targetY : 0, behavior: 'smooth' });

      yield ctx.Lib.getState({ state: "scrolling", data: { pulses, stableRounds } });
      pulses++;
      await ctx.Lib.sleep(cfg.waitMs);

      // Klikk på eventuelle "vis flere"-knapper (også brick-button)
      const elems = document.querySelectorAll(this.selectors.join(","));
      let clicksThisRound = 0;

      for (const elem of elems) {
        const txt = (elem.innerText || elem.textContent || elem.getAttribute('data-label') || "").toLowerCase().trim();
        const href = (elem.getAttribute('href') || elem.getAttribute('data-linkto') || "").toLowerCase();

        // Hopp over innlogging / mine hilsener / send hilsen knapper
        if (href.includes('/login') || href.includes('/logg-inn') || href.includes('/mygreetings') || href.includes('/greetings/new')) continue;
        if (txt.includes('logg inn') || txt.includes('mine hilsener') || txt.includes('send hilsen') || txt.includes('ny hilsen')) continue;

        if (this.triggerwords.some(w => txt.includes(w))) {
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

      // Sjekk om siden eller antall lenker vokser
      const currentHeight = docHeight();
      const currentLinkCount = countGreetingLinks();

      if (Math.abs(currentHeight - lastHeight) < cfg.growthEps && currentLinkCount === lastLinkCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }
      lastHeight = currentHeight;
      lastLinkCount = currentLinkCount;

      if (pulses % 3 === 0) {
        ctx.log({ msg: `Pulse ${pulses}, høyde: ${currentHeight}, antall hilsenlenker: ${currentLinkCount}, stable: ${stableRounds}` });
      }
    }

    ctx.log({ msg: `Scrolling ferdig etter ${pulses} pulses. Fant totalt ${countGreetingLinks()} hilsenlenker` });

    // Scroll tilbake til toppen
    ctx.log({ msg: "Scroller tilbake til toppen" });
    window.scrollTo(0, 0);
    await ctx.Lib.sleep(300);

    // Hent alle lenker
    const allLinks = document.querySelectorAll('a[href]');
    ctx.log({ msg: `Fant ${allLinks.length} totale <a>-tags på siden` });

    let clickedCount = 0;

    for (const link of allLinks) {
      const href = link.href || "";
      const pathname = link.pathname || "";
      const dataLinkto = link.getAttribute('data-linkto') || "";

      // Filtrer - må være en gyldig HTTP-lenke
      if (!href || !href.startsWith('http')) continue;

      // Ekskluder alle innloggings-, bruker-, opprett- og redigeringslenker
      if (
        pathname.includes('/login') ||
        pathname.includes('/logg-inn') ||
        pathname.includes('/logginn') ||
        pathname.includes('/mygreetings') ||
        pathname.includes('/user') ||
        pathname.includes('/auth') ||
        pathname.includes('/greetings/new') ||
        pathname.includes('/greetings/edit') ||
        pathname.endsWith('/greetings/all') ||
        pathname.endsWith('/vis/personalia/') ||
        pathname.endsWith('/vis/personalia') ||
        dataLinkto.includes('/login') ||
        dataLinkto.includes('/logg-inn') ||
        dataLinkto.includes('/mygreetings') ||
        dataLinkto.includes('/greetings/new')
      ) {
        continue;
      }

      // Må gjelde en faktisk hilsen-detaljside (f.eks. /greetings/<kategori>/<id> eller /vis/personalia/greetings/<kategori>/<id>)
      if (!pathname.includes('/greetings/') && !pathname.includes('/vis/personalia/greetings/')) continue;

      if (this.visitedLinks.has(href)) continue;

      this.visitedLinks.add(href);

      try {
        // Scroll inn i viewport
        link.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await ctx.Lib.sleep(200);

        ctx.log({ msg: `Klikker lenke #${clickedCount + 1}: ${href}` });
        
        const initialUrl = window.location.href;

        // Utfør klikk uten e.preventDefault() for at React Router skal fange det opp
        link.click();
        clickedCount++;

        // Vent på at React Router / dialog oppdateres
        await ctx.Lib.sleep(350);

        // Se etter lukkeknapper (brick-button-v9, dialog-close, aria-label="Lukk" etc.)
        const closeSelectors = [
          'brick-button-v9[data-icon-id="close"]',
          'brick-button-v9[data-icon-id="arrow-left"]',
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
          if (closeBtn && (closeBtn.offsetParent !== null || closeBtn.tagName.toLowerCase().startsWith('brick-'))) {
            ctx.log({ msg: `Lukker med selector: ${selector}` });
            closeBtn.click();
            closed = true;
            await ctx.Lib.sleep(250);
            break;
          }
        }

        if (!closed) {
          // Hvis URL-en endret seg, prøv history.back() for å returnere til listen
          if (window.location.href !== initialUrl) {
            ctx.log({ msg: "Tilbakestiller visning med window.history.back()" });
            window.history.back();
            await ctx.Lib.sleep(300);
          } else {
            // Fallback: ESC-tast
            ctx.log({ msg: "Prøver ESC-tast som fallback" });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            await ctx.Lib.sleep(250);
          }
        }

      } catch (e) {
        ctx.log({ msg: `Feil ved klikk: ${e.message}` });
      }
    }

    ctx.log({ msg: `Ferdig! Klikket ${clickedCount} hilsenlenker av ${allLinks.length} totalt` });
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
