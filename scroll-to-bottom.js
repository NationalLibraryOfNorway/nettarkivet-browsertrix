/**
 * Generic Scroll-to-Bottom Behavior for Browsertrix & Web Crawling
 * 
 * - Fungerer universelt på alle typer nettsider:
 *   1. Standard sider der window / document / body scroller.
 *   2. Moderne SPA-apper (Next.js, React, Vue, Foundation, osv.) der innholdet
 *      ligger inni en intern container med overflow: auto / scroll (f.eks. NTB Mediebank).
 * - Starter øverst på siden (både for window og alle interne scroll-containere).
 * - Scroller jevnt nedover trinn for trinn (jevn scrolling).
 * - Trigger scroll-events for lazy-loading og virtualiserte lister.
 * - Venter ved bunnen og oppdager dynamisk lasting (infinite scroll).
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
    // Gi SPA-apper (React/Next.js/etc) litt tid til å hydrere DOM
    await new Promise(r => setTimeout(r, 1000));
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

    // 1. Finn alle scrollbare elementer på siden (håndterer SPA-containere som NTB Mediebank)
    const findScrollContainers = () => {
      const containers = new Set();
      
      if (document.scrollingElement) containers.add(document.scrollingElement);
      if (document.documentElement) containers.add(document.documentElement);
      if (document.body) containers.add(document.body);

      const allElements = document.querySelectorAll('*');
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        if (!el || el === document.documentElement || el === document.body) continue;

        // Må ha scrollbar-høyde større enn synlig høyde
        if (el.scrollHeight > el.clientHeight + 15 && el.clientHeight > 40) {
          try {
            const style = window.getComputedStyle(el);
            const overflowY = style.overflowY;
            const overflow = style.overflow;
            if (
              overflowY === 'auto' ||
              overflowY === 'scroll' ||
              overflowY === 'overlay' ||
              overflow === 'auto' ||
              overflow === 'scroll'
            ) {
              containers.add(el);
            }
          } catch {}
        }
      }

      return Array.from(containers);
    };

    // 2. Start øverst på siden (nullstill både window og containere)
    const resetToTop = () => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      } catch {
        window.scrollTo(0, 0);
      }

      const containers = findScrollContainers();
      for (const el of containers) {
        try {
          el.scrollTop = 0;
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
        } catch {}
      }
    };

    // 3. Utfør ett scroll-trinn på tvers av window og alle containere
    const performStep = (stepSize) => {
      let moved = false;

      // Scroll window
      const prevWinY = window.scrollY || window.pageYOffset || 0;
      try {
        window.scrollBy({ top: stepSize, left: 0, behavior: 'instant' });
      } catch {
        window.scrollBy(0, stepSize);
      }
      const newWinY = window.scrollY || window.pageYOffset || 0;
      if (Math.abs(newWinY - prevWinY) >= 1) {
        moved = true;
      }

      // Scroll alle identifiserte containere
      const containers = findScrollContainers();
      for (const el of containers) {
        const prevTop = el.scrollTop;
        el.scrollTop += stepSize;
        try {
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
        } catch {}
        if (Math.abs(el.scrollTop - prevTop) >= 1) {
          moved = true;
        }
      }

      return { moved, containerCount: containers.length };
    };

    // 4. Beregn samlet høyde for å oppdage dynamisk vekst (infinite scroll)
    const getCombinedHeight = () => {
      const containers = findScrollContainers();
      let total = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        document.scrollingElement?.scrollHeight || 0
      );

      for (const el of containers) {
        total += (el.scrollHeight || 0);
      }
      return total;
    };

    // Konfigurasjon for jevn scrolling
    const config = {
      stepSize: 250,            // Piksler per steg (gir jevn og rolig bevegelse)
      stepDelayMs: 80,          // Pause mellom steg i ms (gir lazy-loading tid til å registrere)
      bottomWaitMs: 1500,       // Ventetid ved bunnen for lasting av nytt innhold
      maxStableChecks: 4,       // Antall sjekker ved bunn uten vekst før ferdig
      growthThreshold: 20,      // Minimum pikselvekst for å regnes som ny sidehøyde
      maxTotalSteps: 3500       // Maksimalt antall steg som sikkerhetsstopp
    };

    log("Starter jevn scrolling fra toppen...");
    resetToTop();
    await sleep(400);

    let totalSteps = 0;
    let consecutiveNoMove = 0;
    let stableBottomRounds = 0;
    let lastCombinedHeight = getCombinedHeight();

    yield getState("Starter jevn scrolling mot bunnen", "start");

    // 5. Jevn scrolling-løkke
    while (stableBottomRounds < config.maxStableChecks && totalSteps < config.maxTotalSteps) {
      const { moved, containerCount } = performStep(config.stepSize);
      totalSteps++;

      await sleep(config.stepDelayMs);

      if (!moved) {
        consecutiveNoMove++;
      } else {
        consecutiveNoMove = 0;
        stableBottomRounds = 0;
      }

      // Hvis ingen elementer lenger klarer å scrolle nedover (bunn nådd)
      if (consecutiveNoMove >= 2) {
        log(`Nådde antatt bunn (steg ${totalSteps}, ${containerCount} containere). Venter på dynamisk innhold...`);
        
        await sleep(config.bottomWaitMs);

        const currentCombinedHeight = getCombinedHeight();
        const growth = currentCombinedHeight - lastCombinedHeight;

        if (growth > config.growthThreshold) {
          log(`Siden/containeren utvidet seg med ${growth}px. Fortsetter scrolling...`);
          stableBottomRounds = 0;
          consecutiveNoMove = 0;
          lastCombinedHeight = currentCombinedHeight;
        } else {
          stableBottomRounds++;
          log(`Stabilitetssjekk ved bunn: ${stableBottomRounds}/${config.maxStableChecks}`);
        }
      }

      if (totalSteps % 15 === 0) {
        if (ctx?.state) {
          ctx.state.scrolls = totalSteps;
        }
        yield getState(`Jevn scrolling: steg ${totalSteps} (containere: ${containerCount})`, "scrolls");
      }
    }

    // 6. Avsluttende rull helt til bunns for alle elementer
    const containers = findScrollContainers();
    for (const el of containers) {
      try {
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
      } catch {}
    }
    window.scrollTo(0, document.documentElement?.scrollHeight || 999999);
    await sleep(500);

    log(`Jevn scrolling fullført! Totalt ${totalSteps} steg gjennomført.`);
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
