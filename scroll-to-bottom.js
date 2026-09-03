class ScrollToBottomBehavior {
  static id = "ScrollToBottomBehavior";

  static isMatch(url) {
    return true;
  }

  static init() {
    return new ScrollToBottomBehavior();
  }

  static runInIframes = false;

  async awaitPageLoad() {
    await new Promise(r => setTimeout(r, 500));
  }

  async *run(ctx) {
    const sleep = (ms) => {
      const fn = (ctx?.Lib && ctx.Lib.sleep) || ctx?.sleep;
      if (typeof fn === "function") {
        return fn(ms);
      }
      return new Promise(r => setTimeout(r, ms));
    };

    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState) return ctx.getState(payload);
      return payload;
    };

    const log = (msg) => {
      const fn = (ctx?.Lib && ctx.Lib.log) || ctx?.log;
      if (typeof fn === "function") {
        try { fn.call(ctx, { msg }); return; } catch {}
      }
      console.log("[ScrollToBottom]", msg);
    };

    // 1. Lås opp scrolling for SPA-er og nettsider som har låst body/html (f.eks. NTB Mediebank)
    try {
      if (!document.getElementById('force-scroll-fix')) {
        const style = document.createElement('style');
        style.id = 'force-scroll-fix';
        style.textContent = `
          html, body {
            overflow: auto !important;
            overflow-y: auto !important;
            position: static !important;
            height: auto !important;
            min-height: 100% !important;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      }
      if (document.body) {
        document.body.style.setProperty('overflow', 'auto', 'important');
        document.body.style.setProperty('height', 'auto', 'important');
      }
      if (document.documentElement) {
        document.documentElement.style.setProperty('overflow', 'auto', 'important');
        document.documentElement.style.setProperty('height', 'auto', 'important');
      }
    } catch (e) {
      log("Feil ved opplåsing av scroll: " + e.message);
    }

    // 2. Hjelpefunksjoner for måling av høyde og scrollposisjon
    const docHeight = () => Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0,
      document.scrollingElement?.scrollHeight || 0
    );

    const getScrollY = () => window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
    const getViewportH = () => window.innerHeight || document.documentElement?.clientHeight || 800;

    // 3. Konfigurasjon for jevn scrolling
    const cfg = {
      stepSize: 300,            // Piksler per steg for jevn rulling
      stepDelayMs: 80,          // Pause mellom hvert steg i millisekunder
      bottomHoldMs: 1500,       // Ventetid ved bunnen for lasting av mer dynamisk innhold
      stableLimit: 6,           // Antall runder ved bunn uten ny høydevekst før fullført
      growthEps: 15             // Minimum pikselvekst for å registrere nytt innhold
    };

    log("Starter jevn scrolling fra toppen...");

    // 4. Start alltid på toppen
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    await sleep(300);

    let lastHeight = docHeight();
    let stableRounds = 0;
    let totalSteps = 0;

    yield makeState("scroll_to_bottom:start", { initialHeight: lastHeight });

    // 5. Hovedløkke: Scroller jevnt nedover trinn for trinn
    while (stableRounds < cfg.stableLimit) {
      const currentY = getScrollY();
      const currentH = docHeight();
      const viewH = getViewportH();
      const maxScrollY = Math.max(0, currentH - viewH);

      // Er vi ved nåværende bunn av siden?
      const atBottom = (currentY + viewH) >= (currentH - 10);

      if (!atBottom && currentY < maxScrollY) {
        // Ta et jevnt steg nedover
        const nextY = Math.min(currentY + cfg.stepSize, maxScrollY);
        
        try {
          window.scrollBy({ top: cfg.stepSize, left: 0, behavior: 'instant' });
        } catch {
          window.scrollBy(0, cfg.stepSize);
        }

        if (document.documentElement) document.documentElement.scrollTop = nextY;
        if (document.body) document.body.scrollTop = nextY;

        totalSteps++;
        await sleep(cfg.stepDelayMs);

        if (totalSteps % 15 === 0) {
          yield makeState("scroll_to_bottom:scrolling", {
            steps: totalSteps,
            currentY: Math.round(getScrollY()),
            totalHeight: currentH
          });
        }
      } else {
        // Vi er ved bunnen av det nåværende innholdet
        // Vent for å gi lazy-loading / API-kall / IntersectionObservers tid til å laste mer innhold
        await sleep(cfg.bottomHoldMs);

        const newH = docHeight();
        const grew = (newH - lastHeight) > cfg.growthEps;

        if (grew) {
          stableRounds = 0;
          lastHeight = newH;
          log(`Innhold utvidet seg til ${newH}px. Fortsetter scrolling...`);
        } else {
          stableRounds++;
          log(`Stabilitetssjekk ved bunn: ${stableRounds}/${cfg.stableLimit}`);
        }
      }
    }

    // 6. Avsluttende rulling helt til bunns
    try {
      window.scrollTo(0, docHeight());
      yield makeState("scroll_to_bottom:finished", { totalSteps, finalHeight: docHeight() });
    } catch {}

    log(`Jevn scrolling fullført! Totalt ${totalSteps} steg, slutthøyde: ${docHeight()}px.`);
  }
}

// Standalone støtte dersom scriptet kalles direkte uten Browsertrix
if (typeof window !== "undefined") {
  window.ScrollToBottomBehavior = ScrollToBottomBehavior;
  window.scrollToBottom = async function() {
    const behavior = new ScrollToBottomBehavior();
    const runner = behavior.run();
    let res = await runner.next();
    while (!res.done) {
      res = await runner.next();
    }
    return res.value;
  };
}
