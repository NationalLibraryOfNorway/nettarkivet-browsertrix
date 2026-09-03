/**
 * Generic Scroll-to-Bottom Behavior for Browsertrix & Web Crawling
 * 
 * - Fungerer universelt på alle typer nettsider:
 *   1. Standard nettsider (window / html / body scroll).
 *   2. Nettsider med låst body (overflow: hidden / 100vh) - låses automatisk opp.
 *   3. SPA-er med interne scroll-containere (React, Next.js, NTB Mediebank, Foundation, etc.).
 * - Starter øverst på siden.
 * - Scroller jevnt nedover trinn for trinn (jevn scrolling).
 * - Trigger scroll- og wheel-events underveis for lazy-loading og virtualiserte lister.
 * - Håndterer infinite scroll ved å vente ved bunnen og sjekke om mer innhold lastes inn.
 */
class ScrollToBottomBehavior {
  static id = "ScrollToBottomBehavior";
  static name = "ScrollToBottomBehavior";

  static isMatch() {
    // Generisk: matcher alle nettsider
    return true;
  }

  static init() {
    return new ScrollToBottomBehavior();
  }

  static runInIframe = false;
  static runInIframes = false;

  // Lås opp scrolling dersom body/html er låst av modals, cookie-bannere eller 100vh app-shells
  fixScroll() {
    try {
      if (document.body) {
        document.body.style.setProperty('overflow', 'auto', 'important');
        document.body.style.setProperty('overflow-y', 'auto', 'important');
        document.body.style.setProperty('position', 'static', 'important');
        document.body.style.setProperty('height', 'auto', 'important');
      }
      if (document.documentElement) {
        document.documentElement.style.setProperty('overflow', 'auto', 'important');
        document.documentElement.style.setProperty('overflow-y', 'auto', 'important');
        document.documentElement.style.setProperty('position', 'static', 'important');
        document.documentElement.style.setProperty('height', 'auto', 'important');
      }

      if (!document.getElementById('generic-scroll-fix')) {
        const style = document.createElement('style');
        style.id = 'generic-scroll-fix';
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
    } catch (e) {
      console.debug('Scroll fix error:', e);
    }
  }

  async awaitPageLoad(ctx) {
    this.fixScroll();
    await new Promise(r => setTimeout(r, 1000));
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
      const fn = (ctx?.Lib && ctx.Lib.log) || ctx?.log;
      if (typeof fn === "function") {
        try {
          fn.call(ctx, typeof msg === 'string' ? { msg } : msg);
          return;
        } catch {}
      }
      console.log(`[ScrollToBottom] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    };

    const getState = (state, data) => {
      const fn = (ctx?.Lib && ctx.Lib.getState) || ctx?.getState;
      if (typeof fn === "function") {
        try {
          return fn.call(ctx, { state, data });
        } catch {}
      }
      return { state, data };
    };

    // 1. Sørg for at scroll er låst opp
    this.fixScroll();

    // 2. Finn alle scrollbare elementer i DOM (f.eks. interne containere i Next.js / NTB Mediebank)
    const getScrollContainers = () => {
      const containers = [];
      try {
        const all = document.querySelectorAll('*');
        for (let i = 0; i < all.length; i++) {
          const el = all[i];
          if (!el || el === document.documentElement || el === document.body) continue;
          if (el.scrollHeight > el.clientHeight + 20 && el.clientHeight > 40) {
            const style = window.getComputedStyle(el);
            const oy = style.overflowY;
            const ox = style.overflow;
            if (oy === 'auto' || oy === 'scroll' || ox === 'auto' || ox === 'scroll') {
              containers.push(el);
            }
          }
        }
      } catch {}
      return containers;
    };

    // 3. Start øverst på siden
    const resetToTop = () => {
      try {
        window.scrollTo(0, 0);
      } catch {}
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;

      const containers = getScrollContainers();
      for (const el of containers) {
        try {
          el.scrollTop = 0;
        } catch {}
      }
    };

    // 4. Send et hjul-event (WheelEvent) for å trigge virtuelle lister og scroll-lyttere
    const dispatchWheel = (deltaY) => {
      try {
        const ev = new WheelEvent('wheel', {
          deltaY: deltaY,
          deltaMode: 0,
          bubbles: true,
          cancelable: true,
          view: window
        });
        (document.scrollingElement || document.body || window).dispatchEvent(ev);
      } catch {}
    };

    // 5. Utfør ett trinn med scrolling på tvers av alle metoder
    const performScrollStep = (stepSize) => {
      // Window & dokument scrolling
      try {
        window.scrollBy({ top: stepSize, left: 0, behavior: 'instant' });
      } catch {
        window.scrollBy(0, stepSize);
      }
      if (document.documentElement) document.documentElement.scrollTop += stepSize;
      if (document.body) document.body.scrollTop += stepSize;
      if (document.scrollingElement && document.scrollingElement !== document.documentElement) {
        document.scrollingElement.scrollTop += stepSize;
      }

      // Interne containere
      const containers = getScrollContainers();
      for (const el of containers) {
        try {
          el.scrollTop += stepSize;
          el.dispatchEvent(new Event('scroll', { bubbles: true }));
        } catch {}
      }

      // Wheel event
      dispatchWheel(stepSize);
    };

    // 6. Beregn samlet høyde for å oppdage dynamisk vekst (infinite scroll)
    const getMetrics = () => {
      const winY = window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
      const winH = window.innerHeight || document.documentElement?.clientHeight || 800;
      const docH = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        document.scrollingElement?.scrollHeight || 0
      );

      const containers = getScrollContainers();
      let containerMaxScroll = 0;
      let containerCurrentScroll = 0;
      for (const el of containers) {
        containerMaxScroll += (el.scrollHeight - el.clientHeight);
        containerCurrentScroll += el.scrollTop;
      }

      return {
        winY,
        winH,
        docH,
        isWinAtBottom: (winY + winH) >= (docH - 25),
        containerCount: containers.length,
        containerMaxScroll,
        containerCurrentScroll,
        totalHeight: docH + containerMaxScroll
      };
    };

    // Konfigurasjon for jevn scrolling
    const config = {
      stepSize: 250,            // Piksler per steg (gir jevn og rolig bevegelse)
      stepDelayMs: 80,          // Pause mellom steg i ms (gir lazy-loading tid til å laste)
      bottomWaitMs: 1500,       // Ventetid ved bunnen for å hente dynamisk innhold
      maxStableChecks: 5,       // Antall sjekker ved bunn uten vekst før ferdig
      growthThreshold: 20,      // Minimum pikselvekst for å regnes som ny sidehøyde
      maxTotalSteps: 4000       // Maksimalt antall steg
    };

    log("Starter jevn scrolling fra toppen...");
    resetToTop();
    await sleep(400);

    let totalSteps = 0;
    let stableBottomRounds = 0;
    let lastMetrics = getMetrics();

    yield getState("scroll_to_bottom:start", { initialHeight: lastMetrics.totalHeight });

    // 7. Hovedløkke for jevn scrolling
    while (stableBottomRounds < config.maxStableChecks && totalSteps < config.maxTotalSteps) {
      // Utfør et trinn
      performScrollStep(config.stepSize);
      totalSteps++;

      await sleep(config.stepDelayMs);

      const metrics = getMetrics();

      // Sjekk om vi er ved bunnen av enten vinduet eller samtlige interne containere
      const atWindowBottom = metrics.isWinAtBottom;
      const atContainerBottom = metrics.containerCount > 0 && (metrics.containerCurrentScroll >= metrics.containerMaxScroll - 20);

      const reachedBottom = atWindowBottom || (metrics.containerCount > 0 && atContainerBottom);

      if (reachedBottom && totalSteps > 5) {
        log(`Nådde antatt bunn etter ${totalSteps} steg. Venter på dynamisk innhold...`);

        // Vent og la nettverkskall / infinite scroll / lazy-loading hente mer
        await sleep(config.bottomWaitMs);

        const newMetrics = getMetrics();
        const growth = newMetrics.totalHeight - lastMetrics.totalHeight;

        if (growth > config.growthThreshold) {
          log(`Siden/containeren utvidet seg med ${growth}px. Fortsetter rulling...`);
          stableBottomRounds = 0;
          lastMetrics = newMetrics;
        } else {
          stableBottomRounds++;
          log(`Stabilitetssjekk ved bunn: ${stableBottomRounds}/${config.maxStableChecks}`);
        }
      } else {
        stableBottomRounds = 0;
      }

      if (totalSteps % 20 === 0) {
        yield getState("scroll_to_bottom:scrolling", {
          steps: totalSteps,
          scrollY: Math.round(metrics.winY),
          containers: metrics.containerCount
        });
      }
    }

    // 8. Avsluttende rull helt til bunns for sikkerhets skyld
    performScrollStep(999999);
    await sleep(400);

    const finalMetrics = getMetrics();
    log(`Jevn scrolling fullført! Totalt ${totalSteps} steg, samlet høyde: ${finalMetrics.totalHeight}px.`);
    yield getState("scroll_to_bottom:finished", {
      totalSteps,
      finalHeight: finalMetrics.totalHeight
    });
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
