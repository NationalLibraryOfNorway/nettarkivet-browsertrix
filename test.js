class PingvinavisaBehavior {
  static id = "PingvinavisaReactBehavior";

  static isMatch() {
    return true; 
  }

  static init() {
    return { state: { clicks: 0, scrolls: 0, linksExtracted: 0 } };
  }

  async dismissCookieConsent(ctx) {
    var sleep = ctx.Lib.sleep;
    var buttons = document.querySelectorAll("button");
    for (var bi = 0; bi < buttons.length; bi++) {
      var btn = buttons[bi];
      var text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
      if (text === "godta alle" || text === "godta") {
        if (btn.offsetParent !== null) { 
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          ctx.log("Lukket cookie-banner.");
          await sleep(1000);
          return true;
        }
      }
    }
    return false;
  }

  async clickLoadMore(ctx) {
    var sleep = ctx.Lib.sleep;
    var elements = document.querySelectorAll("button, a, span, div");
    
    for (var ci = 0; ci < elements.length; ci++) {
      var el = elements[ci];
      var text = (el.innerText || el.textContent || "").toLowerCase();
      
      if (text.includes("vis flere") || text === "vis flere") {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
          
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          ctx.log("Trykket på knappen: 'Vis flere'");
          
          await sleep(4000); // Vent på React
          return true;
        }
      }
    }
    return false;
  }

  // NY LOGIKK: Sikker lenkefangst som bygger absolutte URL-er
  collectAndAddLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    
    // Henter alle lenker på siden
    var links = document.querySelectorAll('a[href]');
    
    for (var j = 0; j < links.length; j++) {
      var rawHref = links[j].getAttribute('href');
      
      // Ignorer tomme lenker, javascript-handlinger og anker-lenker
      if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('#')) {
        continue;
      }

      try {
        // GJØR MAGIEN HER: Konverterer "/pingvinavisa/sak" til "https://www.unn.no/pingvinavisa/sak"
        var absoluteUrl = new URL(rawHref, window.location.origin).href;

        // Filtrer slik at vi KUN sender Pingvinavisa-lenker til crawleren
        if (absoluteUrl.includes('/pingvinavisa') && !seenUrls.has(absoluteUrl)) {
          seenUrls.add(absoluteUrl);
          
          if (typeof addLink === "function") {
            addLink(absoluteUrl); // Tving lenken inn i Browsertrix
          }
          newCount++;
        }
      } catch (e) {
        // Ignorer feil hvis URL-en ikke kunne bygges
      }
    }
    
    if (newCount > 0) {
      ctx.log("Fant og matet inn " + newCount + " NYE lenker. (Totalt: " + seenUrls.size + ")");
    }
    return newCount;
  }

  async *run(ctx) {
    var getState = ctx.Lib.getState;
    var sleep = ctx.Lib.sleep;
    var seenUrls = new Set();

    ctx.log("Venter 5 sekunder for at React skal tegne opp nettsiden...");
    await sleep(5000); 

    await this.dismissCookieConsent(ctx);
    
    // Fang opp de artiklene som ligger der på første sidelasting
    this.collectAndAddLinks(ctx, seenUrls);

    var maxAttempts = 60; 
    var lastHeight = document.documentElement.scrollHeight;
    var unchangedCount = 0;

    for (var i = 0; i < maxAttempts; i++) {
      var loadMoreClicked = await this.clickLoadMore(ctx);
      
      if (loadMoreClicked) {
        ctx.state.clicks++;
        unchangedCount = 0; 
        
        // FANG OPP: Plukk opp de nye lenkene React nettopp la til på skjermen
        this.collectAndAddLinks(ctx, seenUrls);
        
        yield getState(ctx, "Trykket 'Vis flere', totalt funnet: " + seenUrls.size + " lenker", "clicks");
        continue; 
      }

      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(2000); 
      
      // Fang opp evt. lenker som dukker opp ved lazy-loading
      this.collectAndAddLinks(ctx, seenUrls);

      var newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight) {
        await sleep(2000);
        if (document.documentElement.scrollHeight === lastHeight) {
           ctx.log("Ingen flere knapper funnet. Totalt høstet: " + seenUrls.size + " lenker.");
           break; 
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = document.documentElement.scrollHeight;

      ctx.state.scrolls++;
      ctx.state.linksExtracted = seenUrls.size;
      yield getState(ctx, "Scrollet. Lenker lagt i kø: " + seenUrls.size, "scrolls");
    }
  }
}
