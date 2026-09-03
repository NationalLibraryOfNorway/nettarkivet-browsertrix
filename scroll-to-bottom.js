class ScrollToBottomBehavior {
  static id = "ScrollToBottomBehavior";

  static isMatch() {
    // Generisk: matcher alle nettsteder som en universell scrolle-behavior
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

  async *run(ctx) {
    var isIframe = window.self !== window.top;

    // --- Browsertrix standard hjelpefunksjoner ---
    var sleep = async function(ms) {
      var fn = (ctx && ctx.Lib && ctx.Lib.sleep) || (ctx && ctx.sleep);
      if (typeof fn === "function") {
        await fn(ms);
      } else {
        await new Promise(function(r) { setTimeout(r, ms); });
      }
    };

    var log = function(msg) {
      if (ctx && typeof ctx.log === "function") {
        ctx.log(msg);
      } else if (ctx && ctx.Lib && typeof ctx.Lib.log === "function") {
        ctx.Lib.log(msg);
      } else {
        console.log("[ScrollToBottom] " + msg);
      }
    };

    var getState = function(msg, key) {
      var fn = (ctx && ctx.Lib && ctx.Lib.getState) || (ctx && ctx.getState);
      if (typeof fn === "function") {
        if (ctx.Lib && ctx.Lib.getState === fn) {
          return fn(ctx, msg, key);
        } else {
          return fn.call(ctx, msg, key);
        }
      }
      return { state: key, msg: msg };
    };

    // Hvis dette er en liten/usynlig iframe, hopper vi over for å spare ressurser
    if (isIframe && (window.innerHeight < 100 || window.innerWidth < 100)) {
      return;
    }

    // 1. Lås opp scrolling dersom nettsiden har låst html/body (f.eks. Next.js / NTB Mediebank / modaler)
    try {
      if (!document.getElementById("generic-scroll-fix")) {
        var style = document.createElement("style");
        style.id = "generic-scroll-fix";
        style.textContent = "html, body { overflow: auto !important; overflow-y: auto !important; position: static !important; height: auto !important; min-height: 100% !important; }";
        (document.head || document.documentElement).appendChild(style);
      }
      if (document.body) {
        document.body.style.setProperty("overflow", "auto", "important");
        document.body.style.setProperty("height", "auto", "important");
      }
      if (document.documentElement) {
        document.documentElement.style.setProperty("overflow", "auto", "important");
        document.documentElement.style.setProperty("height", "auto", "important");
      }
    } catch (e) {
      log("Advarsel ved scroll-unlock: " + e.message);
    }

    // 2. Hjelpefunksjoner for å måle sidehøyde og posisjon
    var getDocHeight = function() {
      return Math.max(
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0,
        document.scrollingElement ? document.scrollingElement.scrollHeight : 0
      );
    };

    var getScrollY = function() {
      return window.scrollY || window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || (document.body && document.body.scrollTop) || 0;
    };

    var getViewportH = function() {
      return window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 800;
    };

    // Finn alle interne scrollbare containere (for SPA-er)
    var getScrollContainers = function() {
      var containers = [];
      try {
        var all = document.querySelectorAll("main, [role='main'], div, section, article");
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (!el || el === document.documentElement || el === document.body) continue;
          if (el.scrollHeight > el.clientHeight + 25 && el.clientHeight > 50) {
            var st = window.getComputedStyle(el);
            if (st.overflowY === "auto" || st.overflowY === "scroll" || st.overflow === "auto" || st.overflow === "scroll") {
              containers.push(el);
            }
          }
        }
      } catch (e) {}
      return containers;
    };

    // 3. Start øverst på siden
    log("Starter jevn scrolling fra toppen...");
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    var initialContainers = getScrollContainers();
    for (var ci = 0; ci < initialContainers.length; ci++) {
      try {
        initialContainers[ci].scrollTop = 0;
      } catch (e) {}
    }
    await sleep(400);

    // 4. Konfigurasjon for jevn scrolling
    var stepSize = 250;          // Stegstørrelse i piksler for jevn bevegelse
    var stepDelayMs = 80;        // Forsinkelse per steg (gir lazy-loading tid til å trigge)
    var bottomHoldMs = 1500;     // Ventetid ved bunnen for å hente dynamisk innhold
    var stableLimit = 5;         // Antall sjekker ved bunnen uten ny vekst før fullført
    var growthEps = 15;          // Minimum pikselvekst for å regne som nytt innhold
    var maxTotalSteps = 4000;    // Sikkerhetsgrense mot uendelige løkker

    var totalSteps = 0;
    var stableRounds = 0;
    var lastHeight = getDocHeight();

    yield getState("Starter jevn scrolling til bunnen", "start");

    // 5. Jevn scroll-løkke
    while (stableRounds < stableLimit && totalSteps < maxTotalSteps) {
      var currentY = getScrollY();
      var currentH = getDocHeight();
      var viewH = getViewportH();
      var maxScrollY = Math.max(0, currentH - viewH);

      var atBottom = (currentY + viewH) >= (currentH - 10);

      if (!atBottom && currentY < maxScrollY) {
        var nextY = Math.min(currentY + stepSize, maxScrollY);

        try {
          window.scrollBy({ top: stepSize, left: 0, behavior: "instant" });
        } catch (e) {
          window.scrollBy(0, stepSize);
        }

        if (document.documentElement) document.documentElement.scrollTop = nextY;
        if (document.body) document.body.scrollTop = nextY;

        // Rull også eventuelle interne SPA-containere
        var activeContainers = getScrollContainers();
        for (var cj = 0; cj < activeContainers.length; cj++) {
          try {
            activeContainers[cj].scrollTop += stepSize;
            activeContainers[cj].dispatchEvent(new Event("scroll", { bubbles: true }));
          } catch (e) {}
        }

        totalSteps++;
        if (ctx && ctx.state) {
          ctx.state.scrolls = totalSteps;
        }

        await sleep(stepDelayMs);

        if (totalSteps % 20 === 0) {
          yield getState("Jevn scrolling: steg " + totalSteps + " (Y: " + Math.round(getScrollY()) + "px / " + currentH + "px)", "scrolls");
        }
      } else {
        // Nådde bunnen av nåværende innhold - vent og la lazy loading / infinite scroll trigge
        await sleep(bottomHoldMs);

        var newH = getDocHeight();
        var grew = (newH - lastHeight) > growthEps;

        if (grew) {
          log("Innhold utvidet seg til " + newH + "px. Fortsetter scrolling...");
          stableRounds = 0;
          lastHeight = newH;
        } else {
          stableRounds++;
          log("Stabilitetssjekk ved bunn: " + stableRounds + "/" + stableLimit);
        }
      }
    }

    // 6. Avsluttende rulling helt til bunns
    try {
      window.scrollTo(0, getDocHeight());
    } catch (e) {}
    await sleep(400);

    log("Jevn scrolling fullført! Totalt " + totalSteps + " steg. Slutthøyde: " + getDocHeight() + "px.");
    if (ctx && ctx.state) {
      ctx.state.finished = true;
    }
    yield getState("Jevn scrolling fullført (" + totalSteps + " steg)", "finished");
  }
}
