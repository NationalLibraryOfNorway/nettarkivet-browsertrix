class PingvinavisaBehavior {
  static id = "PingvinavisaReactBehavior";

  static isMatch() {
    return true; 
  }

  static init() {
    return { state: { clicks: 0, articlesFound: 0, scrolls: 0 } };
  }

  async *run(ctx) {
    var seenUrls = new Set();
    
    // --- Lokale hjelpefunksjoner for å unngå "this"-bindingsproblemer i Browsertrix ---
    
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

    var dismissCookieConsent = async function() {
      var buttons = document.querySelectorAll("button, a, div, span");
      
      // 1. Søk etter fullt samtykke ("godta alle", "tillat alle")
      for (var bi = 0; bi < buttons.length; bi++) {
        var text = (buttons[bi].innerText || buttons[bi].textContent || "").trim().toLowerCase();
        if (text.includes("godta alle") || text.includes("tillat alle") || text === "godta" || text === "tillat") {
          buttons[bi].click();
          ctx.log("Lukket samtykkebanner (fullt samtykke).");
          await sleep(1000);
          return true;
        }
      }
      
      // 2. Søk etter delvis/generelt samtykke ("godta", "tillat", "accept")
      for (var bi = 0; bi < buttons.length; bi++) {
        var text = (buttons[bi].innerText || buttons[bi].textContent || "").trim().toLowerCase();
        if (text.includes("godta") || text.includes("tillat") || text.includes("accept")) {
          buttons[bi].click();
          ctx.log("Lukket samtykkebanner (generelt samtykke).");
          await sleep(1000);
          return true;
        }
      }
      return false;
    };

    var clickLoadMore = async function() {
      var elements = document.querySelectorAll("button, a, span, div");
      for (var i = 0; i < elements.length; i++) {
        var text = (elements[i].innerText || elements[i].textContent || "").trim().toLowerCase();
        if (text.includes("vis flere")) {
          elements[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
          elements[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          ctx.log("Trykket på 'Vis flere'-knappen.");
          await sleep(4000);
          return true;
        }
      }
      return false;
    };

    var collectAndAddLinks = async function() {
      var newCount = 0;
      var links = document.querySelectorAll("a");
      
      for (var j = 0; j < links.length; j++) {
        try {
          var rawHref = links[j].getAttribute('href');
          if (!rawHref) continue;

          if (rawHref.startsWith('mailto:') || rawHref.startsWith('javascript:') || rawHref.startsWith('#')) {
            continue;
          }

          var absoluteHref = links[j].href;
          
          // Sjekk om lenken er en del av Pingvinavisa eller generelle nyhetssider
          var isRelevant = absoluteHref.includes('/pingvinavisa/') || absoluteHref.includes('/nyheter/');
          
          if (isRelevant && !seenUrls.has(absoluteHref)) {
            seenUrls.add(absoluteHref);
            await addLink(absoluteHref);
            newCount++;
          }
        } catch (e) {
          // Ignorer feilende lenker
        }
      }
      
      if (newCount > 0) {
        ctx.log("Fant " + newCount + " nye artikler. (Totalt i innhøstingskøen: " + seenUrls.size + ")");
      }
      return newCount;
    };

    // --- HOVEDLØYFE ---
    ctx.log("Starter script... Venter i 4 sekunder så React får bygget siden.");
    await sleep(4000); 

    await dismissCookieConsent();
    
    await collectAndAddLinks();

    var maxAttempts = 100;
    var lastHeight = document.documentElement.scrollHeight;
    var unchangedCount = 0;

    for (var i = 0; i < maxAttempts; i++) {
      var clicked = await clickLoadMore();
      
      if (clicked) {
        ctx.state.clicks++;
        unchangedCount = 0; 
        
        await collectAndAddLinks();
        
        yield getState("Klikket 'Vis flere', totalt funnet: " + seenUrls.size + " artikler", "clicks");
        continue; 
      }

      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(2000); 
      
      var added = await collectAndAddLinks();
      ctx.state.articlesFound = seenUrls.size;

      var newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight && added === 0) {
        unchangedCount++;
        if (unchangedCount >= 3) {
           ctx.log("Ferdig! Fant ingen flere knapper, og listen vokser ikke mer.");
           break; 
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = newHeight;

      ctx.state.scrolls++;
      yield getState("Scrollet. Artikler i innhøstingskø: " + seenUrls.size, "articlesFound");
    }
    
    yield getState("Behavior-script ferdig. Crawleren tar nå over for å besøke alle artiklene!");
  }
}
