/**
 * Polaris Media Behavior for Browsertrix
 * 
 * - Finner og klikker på hoved-hamburgermenyen øverst til høyre på Polaris Media-aviser
 *   (Adresseavisen, Sunnmørsposten, Fædrelandsvennen, iTromsø, Harstad Tidende (ht.no), Romsdals Budstikke, m.fl.).
 * - Prefetcher og arkiverer alle dynamiske Nuxt-komponenter (inkludert /_nuxt/pox.menu.<hash>.js)
 *   og meny-API-er (/client-api/menu/secondary) slik at menyen fungerer fullverdig i replay uten 404-feil.
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

    // 2. Eksplisitt hent og arkiver alle dynamiske Nuxt-komponenter og meny-API-er for replay
    var prefetchNuxtMenuChunksAndApis = async function() {
      var scriptSrcs = Array.from(document.querySelectorAll("script[src], link[href]")).map(function(el) {
        return el.src || el.href || "";
      });

      // Finn alle unike Webpack/Nuxt-hasher fra eksisterende skript
      var hashes = new Set();
      for (var i = 0; i < scriptSrcs.length; i++) {
        var src = scriptSrcs[i];
        var match = src.match(/_nuxt\/pox\.(?:global\.|bundles\.|front\.|server-side\.)?([a-f0-9]{15,40})\.js/i);
        if (match && match[1]) {
          hashes.add(match[1]);
        }
      }

      // Prefetch dynamiske Nuxt-moduler for meny, søk og bruker
      var dynamicModules = ["menu", "search", "user", "drawer", "header"];
      var urlsToPrefetch = [];

      hashes.forEach(function(hash) {
        dynamicModules.forEach(function(mod) {
          urlsToPrefetch.push("/_nuxt/pox." + mod + "." + hash + ".js");
        });
      });

      // API-endepunkter som leverer JSON-strukturen til menyen
      urlsToPrefetch.push("/client-api/menu/secondary");
      urlsToPrefetch.push("/client-api/menu/primary");
      urlsToPrefetch.push("/client-api/menu/custom");

      for (var u = 0; u < urlsToPrefetch.length; u++) {
        var targetUrl = urlsToPrefetch[u];
        try {
          var res = await window.fetch(targetUrl, { credentials: "same-origin" });
          if (res.ok) {
            log("Arkiverte for replay: " + targetUrl);
            if (targetUrl.includes("/client-api/")) {
              var jsonData = await res.json();
              extractLinksFromJson(jsonData);
            }
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

    log("Henter og arkiverer Nuxt-menychunks og API-er for replay...");
    await prefetchNuxtMenuChunksAndApis();

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

    // 6. Vent aktivt på at Nuxt/Vue ferdigstiller DOM-en (ikke bare søkefeltet)
    var maxWaitMs = 5000;
    var waitInterval = 150;
    var elapsed = 0;

    while (elapsed < maxWaitMs) {
      var renderedItems = document.querySelectorAll(".menu-item, .menu-sub-item, .menu-with-title, [class*='menu-item']");
      if (renderedItems.length >= 6) {
        log("Hamburgermenyen er ferdig rendret med " + renderedItems.length + " elementer (etter " + elapsed + " ms).");
        break;
      }
      await sleep(waitInterval);
      elapsed += waitInterval;
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

    // Ekstra hviletid for å sikre at alle bakgrunnsforespørsler (pox.menu.js og API-er) er ferdig skrevet til WARC
    await sleep(2000);

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
