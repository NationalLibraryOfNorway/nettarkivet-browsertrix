/**
 * Generic Scroll-to-Bottom Behavior for Browsertrix
 * 
 * Starter øverst på siden og scroller jevnt nedover til bunnen nås.
 * Håndterer dynamisk lasting av innhold (lazy loading / infinite scroll)
 * ved å vente og sjekke om siden utvider seg når bunnen nås.
 */
class ScrollToBottomBehavior {
  static id = "ScrollToBottomBehavior";

  static isMatch() {
    // Generisk: matcher alle nettsider
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
    const sleep = async (ms) => {
      const fn = (ctx?.Lib && ctx.Lib.sleep) || ctx?.sleep;
      if (typeof fn === "function") {
        await fn(ms);
      } else {
        await new Promise(r => setTimeout(r, ms));
      }
    };

    const log = (msg) => {
      if (typeof ctx?.log === "function") {
        ctx.log(msg);
      } else {
        console.log(`[ScrollToBottom] ${msg}`);
      }
    };

    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState) return ctx.getState(payload);
      return payload;
    };

    // Konfigurasjon for jevn rulling
    const config = {
      stepSize: 300,            // Piksler å rulle per steg
      stepDelayMs: 100,         // Pause mellom hvert steg for jevn bevegelse og lazy-load
      bottomWaitMs: 1200,       // Ventetid ved bunnen for å tillate dynamisk innhold å laste
      maxStableRounds: 5,       // Antall sjekker ved bunn uten ny høydevekst før ferdig
      growthThreshold: 10,      // Minimum pikselvekst for å regnes som nytt innhold
      maxTotalSteps: 2000       // Sikkerhetsgrense mot uendelige loops
    };

    // Hjelpefunksjon for å hente samlet dokumenthøyde
    const getDocHeight = () => {
      return Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        document.documentElement?.offsetHeight || 0,
        document.body?.offsetHeight || 0,
        document.documentElement?.clientHeight || 0
      );
    };

    // Hjelpefunksjon for å hente nåværende vertikal scroll-posisjon
    const getScrollY = () => {
      return window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
    };

    // Hjelpefunksjon for å hente viewport-høyde
    const getViewportHeight = () => {
      return window.innerHeight || document.documentElement?.clientHeight || 800;
    };

    log("Starter jevn scrolling til bunnen...");

    // 1. Sørg for å starte øverst på siden
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    await sleep(200);

    let totalSteps = 0;
    let stableRounds = 0;
    let lastHeight = getDocHeight();

    yield makeState("scroll_to_bottom:start", { initialHeight: lastHeight });

    // 2. Rull jevnt nedover trinn for trinn
    while (stableRounds < config.maxStableRounds && totalSteps < config.maxTotalSteps) {
      const scrollY = getScrollY();
      const viewportHeight = getViewportHeight();
      const currentHeight = getDocHeight();
      const maxScrollY = Math.max(0, currentHeight - viewportHeight);

      // Sjekk om vi er ved nåværende bunn (med 5px feilmargin)
      const isAtBottom = (scrollY + viewportHeight) >= (currentHeight - 5);

      if (!isAtBottom && scrollY < maxScrollY) {
        // Beregn neste posisjon
        const nextY = Math.min(scrollY + config.stepSize, maxScrollY);
        window.scrollTo({ top: nextY, left: 0, behavior: "instant" });
        
        totalSteps++;
        await sleep(config.stepDelayMs);

        if (totalSteps % 10 === 0) {
          yield makeState("scroll_to_bottom:scrolling", {
            currentY: nextY,
            totalHeight: currentHeight,
            steps: totalSteps
          });
        }
      } else {
        // Vi har nådd bunnen for nåværende sidehøyde
        // Vent litt for å gi AJAX / intersection observers tid til å laste mer innhold
        await sleep(config.bottomWaitMs);

        const newHeight = getDocHeight();
        const grew = (newHeight - lastHeight) > config.growthThreshold;

        if (grew) {
          log(`Siden utvidet seg fra ${lastHeight}px til ${newHeight}px. Fortsetter rulling...`);
          stableRounds = 0;
          lastHeight = newHeight;
        } else {
          stableRounds++;
          log(`Ved bunn. Stabilitetssjekk ${stableRounds}/${config.maxStableRounds}`);
        }
      }
    }

    // 3. Avsluttende rull helt til bunns for sikkerhets skyld
    const finalHeight = getDocHeight();
    const finalTargetY = Math.max(0, finalHeight - getViewportHeight());
    window.scrollTo({ top: finalTargetY, left: 0, behavior: "instant" });
    await sleep(300);

    log(`Ferdig med jevn rulling. Totale steg: ${totalSteps}, slutt-høyde: ${finalHeight}px`);
    yield makeState("scroll_to_bottom:finished", {
      totalSteps,
      finalHeight,
      stableRounds
    });
  }
}

// Standalone hjelpefunksjon dersom scriptet kjøres direkte i nettleser/konsoll uten Browsertrix ctx
if (typeof window !== "undefined") {
  window.scrollToBottom = async function(options = {}) {
    const behavior = new ScrollToBottomBehavior();
    const runner = behavior.run();
    let result = await runner.next();
    while (!result.done) {
      result = await runner.next();
    }
    return result.value;
  };
}
