/**
 * Polaris Media Behavior for Browsertrix
 * 
 * - Finner og klikker på hamburgermenyen øverst til høyre på Polaris Media-aviser
 *   (f.eks. Adresseavisen (adressa.no), Sunnmørsposten (smp.no), Fædrelandsvennen (fvn.no),
 *   iTromsø (itromso.no), Romsdals Budstikke (rbnett.no), Harstad Tidende (harstadtidende.no), m.fl.).
 * - Åpner menyen og samler inn alle kategorier, emner, underseksjoner og interne lenker som avdekkes.
 * - Sender lenkene direkte til Browsertrix sin crawl-kø (ctx.Lib.addLink).
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

    // 2. Finn hoved-hamburgermenyknappen øverst til høyre
    var findHamburgerButton = function() {
      // 1. Prioriter spesifikke Polaris Media hovedmeny-selektorer
      var specific = document.querySelector(
        "button.menu-icon.main, button.main.menu-icon, button[aria-label*='Åpne- og lukkeknapp for meny' i]"
      );
      if (specific) return specific;

      // 2. Søk etter menyknapper som IKKE er brukermeny (.user / Brukermeny)
      var nonUser = document.querySelector("button.menu-icon:not(.user), button:not(.user)[class*='menu-icon']");
      if (nonUser) return nonUser;

      // 3. Generisk søk etter meny-knapper i headeren plassert lengst til høyre
      var candidates = Array.from(document.querySelectorAll("button, a, [role='button']"));
      var rightSideMenuButtons = [];

      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var aria = (el.getAttribute("aria-label") || "").toLowerCase();
        var cls = (el.className || "").toString().toLowerCase();
        var txt = (el.innerText || el.textContent || "").trim().toLowerCase();

        // Ignorer innlogging/profil/brukermeny
        if (cls.includes("user") || aria.includes("bruker") || aria.includes("profil") || aria.includes("login")) {
          continue;
        }

        var isMenuRelated = (
          cls.includes("menu-icon") ||
          cls.includes("hamburger") ||
          cls.includes("nav-toggle") ||
          cls.includes("menu-button") ||
          aria.includes("meny") ||
          aria.includes("menu") ||
          txt === "meny" ||
          txt === "menu"
        );

        if (isMenuRelated) {
          var rect = el.getBoundingClientRect();
          // Knapp i headeren (øverste 250px)
          if (rect.width > 0 && rect.height > 0 && rect.y < 250) {
            rightSideMenuButtons.push({ element: el, x: rect.x + rect.width });
          }
        }
      }

      // Sorter etter høyeste x-koordinat (lengst til høyre i headeren)
      if (rightSideMenuButtons.length > 0) {
        rightSideMenuButtons.sort((a, b) => b.x - a.x);
        return rightSideMenuButtons[0].element;
      }

      return null;
    };

    // 3. Sjekk og rens en URL for innhøsting
    var isValidCrawlLink = function(rawUrl) {
      if (!rawUrl) return null;
      try {
        var resolved = new URL(rawUrl, window.location.href);
        // Kun http og https
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
          return null;
        }
        // Fjern hash (#...)
        resolved.hash = "";
        var cleanUrl = resolved.href;

        // Ignorer statiske mediefiler
        if (cleanUrl.match(/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|tar|gz|mp3|mp4|avi|mov)$/i)) {
          return null;
        }

        return cleanUrl;
      } catch (e) {
        return null;
      }
    };

    // 4. Samle inn alle lenker i meny-beholderen og DOM
    var collectMenuLinks = async function() {
      var addedCount = 0;
      var menuSelectors = [
        ".menu-item a",
        ".menu-sub-item a",
        ".menu-with-title a",
        "[class*='menu-container'] a",
        "[class*='main-menu'] a",
        "[class*='drawer'] a",
        "[class*='sidebar'] a",
        "nav a",
        "aside a",
        "[role='navigation'] a",
        "[role='dialog'] a"
      ];

      var anchorElements = Array.from(document.querySelectorAll(menuSelectors.join(", ")));

      // Fallback dersom spesifikke containere mangler: finn alle synlige <a> i DOM
      if (anchorElements.length === 0) {
        anchorElements = Array.from(document.querySelectorAll("a[href]"));
      }

      for (var i = 0; i < anchorElements.length; i++) {
        var a = anchorElements[i];
        var validUrl = isValidCrawlLink(a.getAttribute("href") || a.href);

        if (validUrl && !seenUrls.has(validUrl)) {
          seenUrls.add(validUrl);
          await addLink(validUrl);
          addedCount++;
        }
      }

      return addedCount;
    };

    log("Leter etter hamburgermenyen til høyre...");
    var menuBtn = findHamburgerButton();

    if (!menuBtn) {
      log("Fant ikke hamburgermeny-knapp. Samler generelle navigasjonslenker som fallback.");
      var fallbackAdded = await collectMenuLinks();
      if (ctx && ctx.state) {
        ctx.state.linksQueued = fallbackAdded;
        ctx.state.finished = true;
      }
      yield getState("Fullført: " + fallbackAdded + " lenker samlet (uten meny-knapp)", "linksQueued");
      return;
    }

    log("Fant hamburgermeny-knapp (" + (menuBtn.className || menuBtn.getAttribute("aria-label") || menuBtn.tagName) + "). Klikker for å åpne...");
    menuBtn.click();
    if (ctx && ctx.state) {
      ctx.state.clicks++;
    }

    // Vent på at meny-animasjon og innhold lastes inn
    await sleep(1000);

    // Rull eventuelt nedover inni meny-containeren dersom den har eget scrollfelt
    var scrollableDrawers = document.querySelectorAll(
      "[class*='menu-container'], [class*='main-menu'], [class*='drawer'], [class*='sidebar'], nav, aside"
    );
    for (var d = 0; d < scrollableDrawers.length; d++) {
      var drawer = scrollableDrawers[d];
      if (drawer.scrollHeight > drawer.clientHeight) {
        drawer.scrollTop = drawer.scrollHeight;
        await sleep(300);
      }
    }

    // Samle inn og legg til lenkene i Browsertrix-køen
    var totalAdded = await collectMenuLinks();
    log("Åpnet hamburgermeny. Fant og la til " + totalAdded + " unike lenker i crawl-køen.");

    if (ctx && ctx.state) {
      ctx.state.linksQueued = totalAdded;
      ctx.state.finished = true;
    }

    yield getState("Hamburgermeny behandlet. La til " + totalAdded + " lenker i køen.", "linksQueued");
  }
}

// Standalone støtte dersom scriptet kjøres manuelt i konsoll
if (typeof window !== "undefined") {
  window.PolarisMediaBehavior = PolarisMediaBehavior;
}
