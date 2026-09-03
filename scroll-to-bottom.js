/**
 * Generic Scroll-to-Bottom Behavior for Browsertrix
 * 
 * - Starter øverst på siden (Y = 0).
 * - Scroller jevnt nedover trinn for trinn (jevn scrolling).
 * - Låser opp eventuell blokkert scroll (f.eks. overflow: hidden på body/html).
 * - Sørger for at scroll trigges både via window og document.scrollingElement.
 * - Håndterer lazy loading og infinite scroll ved å vente ved bunnen og sjekke om siden utvider seg.
 */
class ScrollToBottomBehavior {
  static id = "ScrollToBottomBehavior";

  static isMatch() {
    // Generisk: matcher alle nettsider
    return true;
  }

  static init() {
    return {
      state: {
        scrolls: 0,
        finished: false
      }
    };
  }

  static runInIframe = true;
  static runInIframes = true;

  async awaitPageLoad() {
    await new Promise(r => setTimeout(r, 500));
  }

  async *run(ctx) {
    // --- Hjelpefunksjoner for Browsertrix-kompatibilitet ---
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
      }
      console.log(`[ScrollToBottom] ${msg}`);
    };

    const getState = (msg, key) => {
      const fn = (ctx?.Lib && ctx.Lib.getState) || ctx?.getState;
      if (typeof fn === "function") {
        if (ctx?.Lib && ctx.Lib.getState === fn) {
          return fn(ctx, msg, key);
        }
        return fn.call(ctx, msg, key);
      }
      return { state: key, msg: msg };
    };

    // Sørg for at siden ikke har låst rulling (overflow: hidden / fixed height)
    const unlockScroll = () => {
      try {
        const body = document.body;
        const html = document.documentElement;
        if (body) {
          const bodyStyle = window.getComputedStyle(body);
          if (bodyStyle.overflow === "hidden" || bodyStyle.overflowY === "hidden") {
            body.style.setProperty("overflow-y", "auto", "important");
          }
        }
        if (html) {
          const htmlStyle = window.getComputedStyle(html);
          if (htmlStyle.overflow === "hidden" || htmlStyle.overflowY === "hidden") {
            html.style.setProperty("overflow-y", "auto", "important");
          }
        }
      } catch (e) {
        log(`Advarsel ved opplåsing av scroll: ${e.message}`);
      }
    };

    unlockScroll();

    // Hent nåværende Y-posisjon
    const getScrollY = () => {
      return (
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement?.scrollTop ||
        document.body?.scrollTop ||
        document.scrollingElement?.scrollTop ||
        0
      );
    };

    // Hent samlet sidehøyde
    const getDocHeight = () => {
      return Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        document.scrollingElement?.scrollHeight || 0,
        document.documentElement?.clientHeight || 0
      );
    };

    // Utfør ett scroll-trinn på tvers av standard APIer
    const performScroll = (step) => {
      try {
        window.scrollBy({ top: step, left: 0, behavior: "instant" });
      } catch {
        window.scrollBy(0, step);
      }

      if (document.documentElement) {
        document.documentElement.scrollTop += step;
      }
      if (document.body) {
        document.body.scrollTop += step;
      }
      if (document.scrollingElement && document.scrollingElement !== document.documentElement && document.scrollingElement !== document.body) {
        document.scrollingElement.scrollTop += step;
      }
    };

    // Konfigurasjon for jevn scrolling
    const config = {
      stepSize: 250,            // Piksler per steg (gir jevn og fin bevegelse)
      stepDelayMs: 80,          // Pause mellom steg i ms (gir lazy-loading tid til å registrere)
      bottomWaitMs: 1500,       // Ventetid ved bunnen for å hente dynamisk innhold
      maxStableChecks: 4,       // Antall runder ved bunn uten vekst før ferdig
      growthThreshold: 25,      // Minimum pikselvekst for å regnes som ny sidehøyde
      maxTotalSteps: 3500       // Maksimalt antall steg som sikkerhetsstopp
    };

    log("Starter jevn scrolling fra toppen av siden...");

    // 1. Start øverst på siden
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    await sleep(300);

    let totalSteps = 0;
    let consecutiveNoMove = 0;
    let stableBottomRounds = 0;
    let lastHeight = getDocHeight();

    yield getState("Starter jevn scrolling mot bunnen", "start");

    // 2. Jevn scrolling-løkke
    while (stableBottomRounds < config.maxStableChecks && totalSteps < config.maxTotalSteps) {
      const prevY = getScrollY();
      const currentHeight = getDocHeight();
      const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 800;

      // Utfør et trinn nedover
      performScroll(config.stepSize);
      totalSteps++;

      await sleep(config.stepDelayMs);

      const currentY = getScrollY();
      const atBottom = (currentY + viewportHeight) >= (currentHeight - 15);

      // Sjekk om posisjonen faktisk beveget seg
      if (Math.abs(currentY - prevY) < 2) {
        consecutiveNoMove++;
      } else {
        consecutiveNoMove = 0;
      }

      // Hvis vi er ved bunnen eller ikke klarer å bevege oss lenger ned
      if (atBottom || consecutiveNoMove >= 3) {
        log(`Nådde antatt bunn (posisjon: ${Math.round(currentY)}px / ${currentHeight}px). Venter på dynamisk innhold...`);
        
        await sleep(config.bottomWaitMs);

        const newHeight = getDocHeight();
        const growth = newHeight - lastHeight;

        if (growth > config.growthThreshold) {
          log(`Siden utvidet seg med ${growth}px. Fortsetter scrolling...`);
          stableBottomRounds = 0;
          consecutiveNoMove = 0;
          lastHeight = newHeight;
        } else {
          stableBottomRounds++;
          log(`Stabilitetssjekk ved bunn: ${stableBottomRounds}/${config.maxStableChecks}`);
        }
      } else {
        stableBottomRounds = 0;
      }

      if (totalSteps % 15 === 0) {
        if (ctx?.state) {
          ctx.state.scrolls = totalSteps;
        }
        yield getState(`Jevn scrolling: steg ${totalSteps} (Y: ${Math.round(currentY)}px / ${currentHeight}px)`, "scrolls");
      }
    }

    // 3. Avsluttende rull helt til bunns for sikkerhets skyld
    const finalHeight = getDocHeight();
    window.scrollTo(0, finalHeight);
    if (document.documentElement) document.documentElement.scrollTop = finalHeight;
    if (document.body) document.body.scrollTop = finalHeight;
    await sleep(500);

    log(`Jevn scrolling fullført. Totalt ${totalSteps} steg, slutt-høyde: ${getDocHeight()}px.`);
    if (ctx?.state) {
      ctx.state.finished = true;
    }
    yield getState(`Scrolling fullført til bunnen (${totalSteps} steg)`, "finished");
  }
}

// Standalone hjelpefunksjon / direkte kjøring hvis scriptet injectes manuelt
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
