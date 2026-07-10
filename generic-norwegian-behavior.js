class GenericNorwegianBehavior {
  static id = "GenericNorwegianBehavior";

  static isMatch() {
    return true; // Fungerer som en generell fallback for alle nettsteder
  }

  static init() {
    return {
      state: {
        scrolls: 0,
        clicks: 0,
        linksQueued: 0,
        consentHandled: false,
        sitemapProcessed: false
      }
    };
  }

  static runInIframe = true;
  static runInIframes = true;

  async *run(ctx) {
    var seenUrls = new Set();
    var isIframe = window.self !== window.top;

    // --- Lokale hjelpefunksjoner for robusthet i Browsertrix ---
    var sleep = async function(ms) {
      var fn = (ctx.Lib && ctx.Lib.sleep) || ctx.sleep;
      if (typeof fn === "function") {
        await fn(ms);
      } else {
        await new Promise(function(r) { setTimeout(r, ms); });
      }
    };

    var addLink = async function(url) {
      var fn = (ctx.Lib && ctx.Lib.addLink) || ctx.addLink || self["__bx_addLink"];
      if (typeof fn === "function") {
        await fn(url);
      } else {
        ctx.log("Advarsel: Fant ikke addLink-funksjon. Kan ikke legge til: " + url);
      }
    };

    var getState = function(msg, key) {
      var fn = (ctx.Lib && ctx.Lib.getState) || ctx.getState;
      if (typeof fn === "function") {
        if (ctx.Lib && ctx.Lib.getState === fn) {
          return fn(ctx, msg, key);
        } else {
          return fn.call(ctx, msg, key);
        }
      }
      return { state: key, msg: msg };
    };

    // --- Samtykke-håndtering (Cookie Consent / GDPR) ---
    var consentWords = [
      "godta alle", "tillat alle", "aksepter alle", "godta", "tillat", "aksepter",
      "jeg forstår", "jeg aksepterer", "ok, godta", "ja, jeg samtykker", "samtykk",
      "samtykker", "enig", "godkjenn alle", "godkjenn", "godkjenn og lukk",
      "accept all", "allow all", "accept", "allow", "i agree", "ok"
    ];

    var isConsentText = function(text) {
      var t = text.trim().toLowerCase();
      if (!t) return false;
      if (t === "ok") return true;
      for (var i = 0; i < consentWords.length; i++) {
        var word = consentWords[i];
        if (word !== "ok" && t.includes(word)) {
          return true;
        }
      }
      return false;
    };

    var dismissCookieConsent = async function() {
      // 1. Prøv kjente samtykke-IDer og klasser først (mer spesifikt)
      var selectors = [
        'button.sp_choice_type_11', 'a.sp_choice_type_11', // Sourcepoint
        '#onetrust-accept-btn-handler', // OneTrust
        '#didomi-notice-agree-button', '.didomi-components-button-accept', // Didomi
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowall', // Cookiebot
        '#cookie-consent-accept', '.cookie-consent-accept',
        '.js-cookie-accept', '#cookie-accept-all', '.cookie-accept-all'
      ];
      
      for (var i = 0; i < selectors.length; i++) {
        try {
          var btn = document.querySelector(selectors[i]);
          if (btn && btn.offsetParent !== null) {
            btn.click();
            ctx.log("Klikket samtykkeknapp via selector: " + selectors[i]);
            await sleep(1000);
            return true;
          }
        } catch (e) {}
      }

      // 2. Skann alle knapper etter tekst-match
      var clickables = document.querySelectorAll("button, a, [role='button'], .btn, .button");
      for (var j = 0; j < clickables.length; j++) {
        var elem = clickables[j];
        if (elem.offsetParent === null) continue; // Hopp over skjulte elementer
        
        var txt = (elem.innerText || elem.textContent || "").trim().toLowerCase();
        if (isConsentText(txt)) {
          elem.click();
          ctx.log("Klikket samtykkeknapp via tekstmatch: " + txt);
          await sleep(1000);
          return true;
        }
      }
      return false;
    };

    var removeConsentOverlay = function() {
      try {
        // Fjern Sourcepoint/consent iframes som blokkerer
        var consentIframes = document.querySelectorAll('iframe[src*="sp.api.no"], iframe[src*="sourcepoint"], iframe[src*="consent"], iframe[src*="cookiebot"], iframe[src*="cookie-bar"]');
        consentIframes.forEach(function(iframe) {
          ctx.log("Fjernet samtykke-iframe: " + iframe.src);
          iframe.remove();
        });
        
        // Fjern overlays fra kjente leverandører
        var overlaySelectors = [
          '[id*="sp_message"]', '[class*="sp_message"]',
          '#onetrust-consent-sdk', '#didomi-host', '#CybotCookiebotDialog',
          '#cookie-law-info-bar', '#cookie-consent-banner', '.cookie-consent-banner',
          'div[style*="z-index: 2147483647"]', 'div[style*="z-index:2147483647"]'
        ];
        
        overlaySelectors.forEach(function(sel) {
          try {
            var elements = document.querySelectorAll(sel);
            elements.forEach(function(el) {
              if (el && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
                ctx.log("Fjernet samtykke-overlay: " + sel);
                el.remove();
              }
            });
          } catch(e) {}
        });
      } catch (e) {
        ctx.log("Feil ved fjerning av overlay: " + e.message);
      }
    };

    var fixScroll = function() {
      try {
        document.body.removeAttribute('style');
        document.documentElement.removeAttribute('style');
        
        document.body.style.setProperty('overflow', 'auto', 'important');
        document.body.style.setProperty('position', 'static', 'important');
        document.body.style.setProperty('height', 'auto', 'important');
        document.body.style.setProperty('width', 'auto', 'important');
        document.documentElement.style.setProperty('overflow', 'auto', 'important');
        
        if (!document.getElementById('force-scroll-fix')) {
          var style = document.createElement('style');
          style.id = 'force-scroll-fix';
          style.textContent = 'body, html { overflow: auto !important; position: static !important; height: auto !important; width: auto !important; }';
          document.head.appendChild(style);
        }
      } catch (e) {
        ctx.log("Feil under retting av rulling: " + e.message);
      }
    };

    // --- Intern Lenkeinnsamling og Filtrering ---
    var getBaseDomain = function(hostname) {
      var parts = hostname.split('.');
      if (parts.length > 2) {
        // e.g. www.dagbladet.no -> dagbladet.no
        return parts.slice(-2).join('.');
      }
      return hostname;
    };

    var currentHost = window.location.hostname;
    var baseDomain = getBaseDomain(currentHost);

    var isInternalLink = function(urlStr) {
      try {
        var url = new URL(urlStr);
        if (url.hostname === currentHost) return true;
        if (url.hostname.endsWith('.' + baseDomain)) return true;
        return false;
      } catch (e) {
        return false;
      }
    };

    var skipExtensions = [
      '.pdf', '.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.exe', '.dmg',
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp',
      '.mp3', '.mp4', '.m4a', '.wav', '.avi', '.mov', '.mpg', '.mpeg', '.webm',
      '.xml', '.json', '.rss', '.atom', '.css', '.js'
    ];

    var shouldQueueLink = function(urlStr) {
      try {
        if (!urlStr) return false;
        if (urlStr.startsWith('mailto:') || urlStr.startsWith('javascript:') || urlStr.startsWith('tel:') || urlStr.startsWith('sms:')) {
          return false;
        }
        
        var url = new URL(urlStr);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return false;
        }

        if (!isInternalLink(urlStr)) {
          return false;
        }

        var urlWithoutHash = url.origin + url.pathname + url.search;
        if (seenUrls.has(urlWithoutHash)) {
          return false;
        }

        var pathname = url.pathname.toLowerCase();
        for (var i = 0; i < skipExtensions.length; i++) {
          if (pathname.endsWith(skipExtensions[i])) {
            return false;
          }
        }

        return true;
      } catch (e) {
        return false;
      }
    };

    var collectAndAddLinks = async function() {
      var newCount = 0;
      var links = document.querySelectorAll("a[href]");
      
      for (var j = 0; j < links.length; j++) {
        try {
          var absoluteHref = links[j].href;
          if (shouldQueueLink(absoluteHref)) {
            var urlObj = new URL(absoluteHref);
            var cleanUrl = urlObj.origin + urlObj.pathname + urlObj.search;
            
            seenUrls.add(cleanUrl);
            await addLink(cleanUrl);
            newCount++;
          }
        } catch (e) {}
      }
      
      if (newCount > 0) {
        ctx.state.linksQueued = seenUrls.size;
        ctx.log("Fant og la til " + newCount + " nye interne lenker. (Kø totalt: " + seenUrls.size + ")");
      }
      return newCount;
    };

    // --- Sitemap Innsamling (Kjøres kun én gang per domene på startsiden) ---
    var harvestSitemap = async function(sitemapUrl, visitedSitemaps) {
      if (visitedSitemaps.has(sitemapUrl)) return;
      visitedSitemaps.add(sitemapUrl);

      ctx.log("Henter sitemap: " + sitemapUrl);
      try {
        var response = await fetch(sitemapUrl);
        if (!response.ok) {
          ctx.log("Feil ved sitemap-henting: " + sitemapUrl + " (status " + response.status + ")");
          return;
        }
        var text = await response.text();
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(text, "text/xml");

        var parserError = xmlDoc.querySelector("parsererror");
        if (parserError) {
          ctx.log("XML-parseringsfeil for sitemap: " + sitemapUrl);
          return;
        }

        var locElements = xmlDoc.getElementsByTagName("loc");
        ctx.log("Fant " + locElements.length + " lenker i sitemap: " + sitemapUrl);

        var sitemapNewLinks = 0;
        for (var i = 0; i < locElements.length; i++) {
          var loc = (locElements[i].textContent || "").trim();
          if (!loc) continue;

          if (loc.endsWith(".xml") || loc.includes("/sitemap")) {
            await harvestSitemap(loc, visitedSitemaps);
          } else {
            if (shouldQueueLink(loc)) {
              var urlObj = new URL(loc);
              var cleanUrl = urlObj.origin + urlObj.pathname + urlObj.search;
              seenUrls.add(cleanUrl);
              await addLink(cleanUrl);
              sitemapNewLinks++;
            }
          }
        }
        if (sitemapNewLinks > 0) {
          ctx.log("La til " + sitemapNewLinks + " lenker fra sitemap: " + sitemapUrl);
        }
      } catch (err) {
        ctx.log("Error under sitemapproserring for " + sitemapUrl + ": " + err.message);
      }
    };

    // --- "Last mer" / Neste-knapp klikking ---
    var loadMoreWords = [
      "vis mer", "vis flere", "last mer", "hent flere", "se flere", "neste side",
      "load more", "show more", "next page", "se mere", "indlæs flere", "flere kommentarer"
    ];

    var clickLoadMore = async function() {
      var selectors = [
        'button', '[role="button"]', 'a.load-more', 'a.show-more', 'a.next', 
        'button.lc-load-more', 'button#load-more-posts', '#pagenation button',
        'button[class*="load"]', 'button[class*="show"]', 'button[class*="more"]'
      ];
      
      var elements = document.querySelectorAll(selectors.join(","));
      for (var i = 0; i < elements.length; i++) {
        var elem = elements[i];
        if (elem.offsetParent === null) continue; // Hopp over skjulte
        
        var text = (elem.innerText || elem.textContent || "").trim().toLowerCase();
        var matched = false;
        
        for (var w = 0; w < loadMoreWords.length; w++) {
          if (text.includes(loadMoreWords[w])) {
            matched = true;
            break;
          }
        }
        
        var ariaLabel = (elem.getAttribute('aria-label') || "").toLowerCase();
        var title = (elem.getAttribute('title') || "").toLowerCase();
        if (ariaLabel.includes("neste side") || title.includes("neste side") ||
            ariaLabel.includes("neste") || title.includes("neste") ||
            ariaLabel.includes("load more") || title.includes("load more")) {
          matched = true;
        }

        if (elem.disabled || elem.getAttribute('aria-disabled') === 'true') {
          matched = false;
        }

        if (matched) {
          try {
            elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(500);
            elem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            ctx.log("Klikket 'Last mer / Neste' knapp med tekst: " + text);
            await sleep(2000);
            return true;
          } catch(err) {
            ctx.log("Feil ved klikk på 'Last mer': " + err.message);
          }
        }
      }
      return false;
    };

    // --- Utvidelse av skjulte seksjoner ---
    var expandCollapsibles = async function() {
      var selectors = [
        'button', '[role="button"]', '.expand', '.show-all', '.show-more',
        '.les-mer', '.les-hele', '[class*="expand"]', '[class*="show-all"]'
      ];
      var expandWords = ["vis alle", "show all", "expand", "les mer", "les hele", "åpne", "åbn"];
      
      var elements = document.querySelectorAll(selectors.join(","));
      var expandedAny = false;
      for (var i = 0; i < elements.length; i++) {
        var elem = elements[i];
        if (elem.offsetParent === null) continue;
        
        var text = (elem.innerText || elem.textContent || "").trim().toLowerCase();
        var matched = false;
        for (var w = 0; w < expandWords.length; w++) {
          if (text.includes(expandWords[w])) {
            matched = true;
            break;
          }
        }
        
        if (matched) {
          if (elem.disabled || elem.getAttribute('aria-expanded') === 'true') {
            continue;
          }
          try {
            elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(200);
            elem.click();
            ctx.log("Utvidet seksjon med tekst: " + text);
            expandedAny = true;
            await sleep(500);
          } catch(e) {}
        }
      }
      return expandedAny;
    };

    // --- Horisontale Karuseller ---
    var handleCarousels = async function() {
      ctx.log("Behandler horisontale karuseller...");
      
      // 1. Rull horisontale containere programmatisk
      var scrollableContainers = [];
      var allElements = document.querySelectorAll('*');
      for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var style = window.getComputedStyle(el);
        var overflowX = style.overflowX;
        if ((overflowX === 'auto' || overflowX === 'scroll' || el.scrollWidth > el.clientWidth) && el.clientWidth > 100) {
          scrollableContainers.push(el);
        }
      }

      if (scrollableContainers.length > 0) {
        for (var s = 0; s < scrollableContainers.length; s++) {
          var container = scrollableContainers[s];
          var currentScroll = 0;
          var maxScroll = container.scrollWidth - container.clientWidth;
          var step = Math.max(container.clientWidth / 2, 200);

          if (maxScroll > 10) {
            while (currentScroll < maxScroll) {
              currentScroll += step;
              container.scrollTo({ left: currentScroll, behavior: 'smooth' });
              await sleep(500);
              await collectAndAddLinks();
            }
          }
        }
      }

      // 2. Klikk neste-piler i karuseller
      var buttons = document.querySelectorAll('button, [role="button"], .next, .arrow-right, .chevron-right, [class*="next"], [class*="arrow"], [class*="chevron"]');
      var nextButtons = [];
      for (var b = 0; b < buttons.length; b++) {
        var btn = buttons[b];
        var text = (btn.textContent || "").trim().toLowerCase();
        var className = (btn.className || "").toString().toLowerCase();
        var ariaLabel = (btn.getAttribute('aria-label') || "").toLowerCase();
        var id = (btn.id || "").toLowerCase();

        var isNext = false;
        if (className.includes('next') || className.includes('right') || className.includes('arrow') || className.includes('chevron')) {
          isNext = true;
        }
        if (ariaLabel.includes('next') || ariaLabel.includes('neste') || ariaLabel.includes('høyre') || ariaLabel.includes('right')) {
          isNext = true;
        }
        if (id.includes('next') || id.includes('right')) {
          isNext = true;
        }
        var svg = btn.querySelector('svg');
        if (svg) {
          var svgClass = (svg.className || "").toString().toLowerCase();
          if (svgClass.includes('right') || svgClass.includes('next') || svgClass.includes('arrow') || svgClass.includes('chevron')) {
            isNext = true;
          }
        }

        if (isConsentText(text)) {
          isNext = false;
        }

        if (isNext && btn.offsetParent !== null) {
          nextButtons.push(btn);
        }
      }

      if (nextButtons.length > 0) {
        for (var n = 0; n < nextButtons.length; n++) {
          var nextBtn = nextButtons[n];
          try {
            nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(300);

            for (var clickAttempt = 0; clickAttempt < 5; clickAttempt++) {
              if (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
                break;
              }
              nextBtn.click();
              await sleep(800);
              await collectAndAddLinks();
            }
          } catch (e) {}
        }
      }
    };

    // ====================================================
    // HOVEDLØYFE FOR BEHAVIOR
    // ====================================================

    // Iframe-modus: Håndter kun samtykkeboks og returner
    if (isIframe) {
      ctx.log("Kjører inni iframe: " + window.location.href);
      for (var attempt = 0; attempt < 10; attempt++) {
        var clicked = await dismissCookieConsent();
        if (clicked) {
          ctx.state.consentHandled = true;
          yield getState("Samtykkeboks lukket i iframe.", "consentHandled");
          break;
        }
        await sleep(500);
      }
      return;
    }

    // Hovedvindu-modus
    ctx.log("Starter GenericNorwegianBehavior på: " + window.location.href);
    await sleep(3000); // Vent på React/JS-hydrering

    // Håndter samtykkeboks
    var consentSuccess = await dismissCookieConsent();
    if (consentSuccess) {
      ctx.state.consentHandled = true;
      yield getState("Samtykkeboks godkjent.", "consentHandled");
    } else {
      // Fallback: Fjern eventuelle blokkerende overlays og tving scroll-funksjonalitet
      removeConsentOverlay();
      fixScroll();
      await sleep(500);
    }

    // Sitemap innsamling (kun hvis vi er på startsiden og den ikke er prosessert før)
    var isHomepage = window.location.pathname === "/" || window.location.pathname === "";
    if (isHomepage && !ctx.state.sitemapProcessed) {
      ctx.state.sitemapProcessed = true;
      var visitedSitemaps = new Set();
      var originSitemap = window.location.origin + "/sitemap.xml";
      yield getState("Starter sitemap-høsting...", "sitemapProcessed");
      await harvestSitemap(originSitemap, visitedSitemaps);
      yield getState("Sitemap ferdig. Fant " + seenUrls.size + " sitemap lenker.", "sitemapProcessed");
    }

    // Første lenkeinnsamling
    await collectAndAddLinks();

    // Håndter horisontale karuseller/sliders
    await handleCarousels();

    // Hoved-scroll-løkke med rulling til bunnen av siden og "last mer"-klikking
    var maxScrollAttempts = 60;
    var lastHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    var unchangedCount = 0;

    for (var i = 0; i < maxScrollAttempts; i++) {
      // Sjekk om det finnes en "Last mer" eller "Neste side"-knapp vi kan trykke på
      var loadedMore = await clickLoadMore();
      if (loadedMore) {
        ctx.state.clicks++;
        unchangedCount = 0;
        await collectAndAddLinks();
        yield getState("Klikket 'Last mer'. Totalt antall klikk: " + ctx.state.clicks, "clicks");
        continue;
      }

      // Hvis ingen knapp, rull nedover
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(1500); // Vent på lazy-loading av innhold

      var added = await collectAndAddLinks();

      var newHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      if (newHeight === lastHeight && added === 0) {
        unchangedCount++;
        // Hvis høyden og antall lenker har vært stabilt i 3 runder, regner vi oss som ferdig
        if (unchangedCount >= 3) {
          ctx.log("Rulling fullført. Nettsidens høyde og lenker har stabilisert seg.");
          break;
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = newHeight;

      ctx.state.scrolls++;
      yield getState("Scrollet (pulser: " + (i + 1) + "). Interne lenker i kø: " + seenUrls.size, "scrolls");
    }

    // Prøv å utvide skjulte/kollapsede tekstbokser helt til slutt
    await expandCollapsibles();
    await collectAndAddLinks();

    yield getState("GenericNorwegianBehavior fullført. Fant totalt " + seenUrls.size + " interne lenker.");
  }
}
