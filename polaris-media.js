/**
 * Polaris Media Behavior for Browsertrix
 * 
 * - Finner og klikker på hoved-hamburgermenyen øverst til høyre på Polaris Media-aviser
 *   (Adresseavisen, Sunnmørsposten, Fædrelandsvennen, iTromsø, Romsdals Budstikke, Harstad Tidende, m.fl.).
 * - Trigger og tar opp API-kallet (/client-api/menu/secondary) i WARC-arkivet slik at menyen fungerer i replay.
 * - Venter til Nuxt/Vue har ferdig-rendret alle menyelementer, underkategorier og emner i DOM-en.
 * - Samler inn og legger alle unike lenker inn i Browsertrix sin crawl-kø (ctx.Lib.addLink).
 */
class PolarisMediaBehavior {
  static id = "PolarisMediaBehavior";

  static isMatch() {
    // Generisk matching for Polaris Media og relaterte nettaviser
    return true;
  }

  static init() {
    return {
      state: {
        clicks: 0,
        linksQueued: 0,
        finished: false
      }
    };
  }

  static runInIframe = false;
  static runInIframes = false;

  async awaitPageLoad(ctx) {
    await new Promise(r => setTimeout(r, 1000));
  }

  async *run(ctx) {
    var seenUrls = new Set();

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
        console.log("[PolarisMedia] " + msg);
      }
    };

    var addLink = async function(url) {
      var fn = (ctx && ctx.Lib && ctx.Lib.addLink) || (ctx && ctx.addLink) || self["__bx_addLink"];
      if (typeof fn === "function") {
        await fn(url);
      } else {
        log("Advarsel: addLink er ikke tilgjengelig, lenke: " + url);
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

    // 1. Håndter eventuelle cookie-bannere som blokkerer menyen
    var dismissCookieConsent = async function() {
      try {
        var buttons = document.querySelectorAll("button, a, [role='button']");
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
          var aria = (btn.getAttribute("aria-label") || "").toLowerCase();
          if (
            text === "godta alle" || text === "tillat alle" || text === "aksepter alle" ||
            text === "godta" || text === "aksepter" || text === "enig" ||
            aria.includes("godta alle") || aria.includes("accept all")
          ) {
            btn.click();
            log("Lukket samtykkebanner.");
            await sleep(600);
            return true;
          }
        }
      } catch (e) {}
      return false;
    };

    await dismissCookieConsent();

    // 2. Eksplisitt hent meny-API-et slik at proxyen garantert tar det opp i WARC-en for replay
    var prefetchMenuApi = async function() {
      var apiEndpoints = [
        "/client-api/menu/secondary",
        "/client-api/menu/primary"
      ];
      for (var i = 0; i < apiEndpoints.length; i++) {
        try {
          var res = await window.fetch(apiEndpoints[i], { credentials: "same-origin" });
          if (res.ok) {
            var data = await res.json();
            log("Prefetchet og arkiverte " + apiEndpoints[i] + " for replay.");
            // Ekstraher også lenker direkte fra JSON-strukturen
            extractLinksFromJson(data);
          }
        } catch (e) {}
      }
    };

    // Hjelpefunksjon for å hente ut alle URL-er fra Polaris Media JSON-menystruktur
    var extractLinksFromJson = function(obj) {
      if (!obj) return;
      if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) {
          extractLinksFromJson(obj[i]);
        }
      } else if (typeof obj === "object") {
        if (obj.url && typeof obj.url === "string") {
          var clean = isValidCrawlLink(obj.url);
          if (clean && !seenUrls.has(clean)) {
            seenUrls.add(clean);
            addLink(clean);
          }
        }
        if (obj.list && Array.isArray(obj.list)) {
          extractLinksFromJson(obj.list);
        }
        if (obj.items && Array.isArray(obj.items)) {
          extractLinksFromJson(obj.items);
        }
      }
    };

    // 3. Finn den faktiske hovedmenyen (skiller den fra brukermeny/innlogging)
    var findMainHamburgerButton = function() {
      var allButtons = Array.from(document.querySelectorAll("button, [role='button']"));

      // Prioritet 1: Knapp med klassene 'main' og 'menu-icon'
      var mainMenuBtn = allButtons.find(function(b) {
        return b.classList && b.classList.contains("main") && b.classList.contains("menu-icon");
      });
      if (mainMenuBtn) return mainMenuBtn;

      // Prioritet 2: Aria-label 'Åpne- og lukkeknapp for meny'
      var ariaBtn = allButtons.find(function(b) {
        var aria = (b.getAttribute("aria-label") || "").toLowerCase();
        return aria.includes("åpne- og lukkeknapp") || (aria.includes("meny") && !aria.includes("bruker"));
      });
      if (ariaBtn) return ariaBtn;

      // Prioritet 3: Menu-icon som IKKE er brukermeny
      var nonUserBtn = allButtons.find(function(b) {
        var isMenu = b.classList && b.classList.contains("menu-icon");
        var isUser = b.classList && (b.classList.contains("user") || b.classList.contains("profile"));
        return isMenu && !isUser;
      });
      if (nonUserBtn) return nonUserBtn;

      // Prioritet 4: Høyre-plassert menyknapp i headeren
      var headerCandidates = [];
      for (var i = 0; i < allButtons.length; i++) {
        var el = allButtons[i];
        var cls = (el.className || "").toString().toLowerCase();
        var aria = (el.getAttribute("aria-label") || "").toLowerCase();
        if (cls.includes("user") || aria.includes("bruker") || aria.includes("profil") || aria.includes("login")) {
          continue;
        }
        if (cls.includes("menu") || cls.includes("hamburger") || cls.includes("nav-toggle") || aria.includes("menu") || aria.includes("meny")) {
          var rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.y < 250) {
            headerCandidates.push({ el: el, x: rect.x + rect.width });
          }
        }
      }
      if (headerCandidates.length > 0) {
        headerCandidates.sort(function(a, b) { return b.x - a.x; });
        return headerCandidates[0].el;
      }

      return null;
    };

    // 4. Rens og valider URL
    var isValidCrawlLink = function(rawUrl) {
      if (!rawUrl) return null;
      try {
        var resolved = new URL(rawUrl, window.location.href);
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
          return null;
        }
        resolved.hash = "";
        var cleanUrl = resolved.href;
        if (cleanUrl.match(/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|tar|gz|mp3|mp4|avi|mov)$/i)) {
          return null;
        }
        return cleanUrl;
      } catch (e) {
        return null;
      }
    };

    // 5. Samle inn alle lenker fra DOM-en
    var collectDomLinks = async function() {
      var added = 0;
      var anchors = Array.from(document.querySelectorAll("a[href]"));
      for (var i = 0; i < anchors.length; i++) {
        var clean = isValidCrawlLink(anchors[i].getAttribute("href") || anchors[i].href);
        if (clean && !seenUrls.has(clean)) {
          seenUrls.add(clean);
          await addLink(clean);
          added++;
        }
      }
      return added;
    };

    log("Henter og arkiverer meny-API-er for replay-støtte...");
    await prefetchMenuApi();

    log("Leter etter hoved-hamburgermenyen til høyre...");
    var menuBtn = findMainHamburgerButton();

    if (!menuBtn) {
      log("Fant ikke hamburgermeny-knapp. Samler inn eksisterende navigasjonslenker.");
      var fallbackCount = await collectDomLinks();
      if (ctx && ctx.state) {
        ctx.state.linksQueued = seenUrls.size;
        ctx.state.finished = true;
      }
      yield getState("Fullført uten menyknapp (" + seenUrls.size + " lenker i kø)", "linksQueued");
      return;
    }

    log("Klikker på hamburgermeny (" + (menuBtn.className || menuBtn.getAttribute("aria-label")) + ")...");
    menuBtn.click();
    if (ctx && ctx.state) {
      ctx.state.clicks++;
    }

    // 6. Vent aktivt på at Nuxt/Vue rendrer alle seksjoner og kategorier i menyen (ikke bare søkefeltet)
    var maxWaitMs = 5000;
    var waitInterval = 150;
    var elapsed = 0;

    while (elapsed < maxWaitMs) {
      var renderedItems = document.querySelectorAll(".menu-item, .menu-sub-item, .menu-with-title, [class*='menu-item']");
      if (renderedItems.length >= 10) {
        log("Hamburgermenyen er ferdig rendret med " + renderedItems.length + " elementer (etter " + elapsed + " ms).");
        break;
      }
      await sleep(waitInterval);
      elapsed += waitInterval;
    }

    if (elapsed >= maxWaitMs) {
      log("Ventetid på meny-rendring utløp etter " + maxWaitMs + " ms. Fortsetter innsamling.");
    }

    // Rull eventuelle skuffer/drawers for å avdekke alle undermenyer
    var drawers = document.querySelectorAll(".menu-container, .main-menu, [class*='drawer'], [class*='sidebar'], nav");
    for (var d = 0; d < drawers.length; d++) {
      var dr = drawers[d];
      if (dr.scrollHeight > dr.clientHeight) {
        dr.scrollTop = dr.scrollHeight;
        await sleep(250);
      }
    }

    // 7. Samle inn alle renderede lenker fra DOM-en
    var newlyAdded = await collectDomLinks();
    log("Ferdig med hamburgermeny. Totalt " + seenUrls.size + " unike lenker er lagt til i Browsertrix-køen.");

    if (ctx && ctx.state) {
      ctx.state.linksQueued = seenUrls.size;
      ctx.state.finished = true;
    }

    yield getState("Hamburgermeny behandlet. Totalt " + seenUrls.size + " lenker i køen.", "linksQueued");
  }
}

// Standalone støtte dersom scriptet kjøres manuelt i konsoll
if (typeof window !== "undefined") {
  window.PolarisMediaBehavior = PolarisMediaBehavior;
}
