class SchibstedBehavior {
  static id = "SchibstedBehavior";

  static isMatch(url) {
    const domains = ["vg.no", "aftenposten.no", "bt.no", "smp.no", "fvn.no", "e24.no"];
    return domains.some(domain => url.includes(domain));
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

    // Fjerner Schibsteds Sourcepoint CMP informasjonskapsel-banner og aktiverer scrolling
    var dismissCookieConsent = async function() {
      var removed = false;
      
      // 1. Finn og fjern CMP-iframe(s)
      var iframes = document.querySelectorAll('iframe');
      for (var i = 0; i < iframes.length; i++) {
        var src = iframes[i].src || '';
        var id = iframes[i].id || '';
        var name = iframes[i].name || '';
        if (src.includes('cmp') || id.includes('sp_message') || name.includes('sp_message')) {
          iframes[i].remove();
          ctx.log("Fjernet Schibsted CMP iframe: " + src);
          removed = true;
        }
      }
      
      // 2. Gjenopprett scrolling og overflow på html og body
      document.body.style.setProperty('overflow', 'auto', 'important');
      document.body.style.setProperty('position', 'static', 'important');
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
      document.documentElement.style.setProperty('position', 'static', 'important');
      
      // Fjern kjente CSS-klasser lagt til av CMP som blokkerer rulling
      document.body.classList.remove('sp-message-open');
      document.documentElement.classList.remove('sp-message-open');
      
      if (removed) {
        await sleep(1000);
      }
      return removed;
    };

    var clickLoadMore = async function() {
      var elements = document.querySelectorAll("button, a, [role='button']");
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
      var currentHost = window.location.hostname;
      
      // Finn base-domenet (f.eks. "vg.no" fra "www.vg.no")
      var baseDomain = currentHost;
      var parts = currentHost.split('.');
      if (parts.length >= 2) {
        baseDomain = parts[parts.length - 2] + '.' + parts[parts.length - 1];
      }

      for (var j = 0; j < links.length; j++) {
        try {
          var rawHref = links[j].getAttribute('href');
          if (!rawHref) continue;

          if (rawHref.startsWith('mailto:') || rawHref.startsWith('javascript:') || rawHref.startsWith('#')) {
            continue;
          }

          var absoluteHref = links[j].href;
          
          // Sjekk om lenken hører til samme Schibsted-side (samme domene, f.eks. vg.no)
          var linkUrl = new URL(absoluteHref);
          var linkHost = linkUrl.hostname;
          
          var isSameDomain = linkHost.endsWith(baseDomain);
          
          if (isSameDomain && !seenUrls.has(absoluteHref)) {
            seenUrls.add(absoluteHref);
            ctx.log("Fant lenke: " + absoluteHref);
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
    ctx.log("Starter Schibsted behavior script... Venter i 4 sekunder på sideoppsett.");
    await sleep(4000); 

    await dismissCookieConsent();
    
    await collectAndAddLinks();

    var maxAttempts = 50; 
    var lastHeight = document.documentElement.scrollHeight;
    var unchangedCount = 0;

    for (var i = 0; i < maxAttempts; i++) {
      // Rydd CMP-banneret underveis hvis det dukker opp igjen under rulling
      await dismissCookieConsent();

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
           ctx.log("Ferdig! Listen vokser ikke mer.");
           break; 
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = newHeight;

      ctx.state.scrolls++;
      yield getState("Scrollet. Artikler i innhøstingskø: " + seenUrls.size, "articlesFound");
    }
    
    yield getState("Schibsted behavior-script ferdig.");
  }
}
