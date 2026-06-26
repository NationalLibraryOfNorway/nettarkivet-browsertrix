class PingvinavisaBehavior {
  static id = "PingvinavisaReactBehavior";

  // Vi lar scriptet kjøre uansett, og stoler på at Browsertrix sitt "Scope" stopper feil lenker
  static isMatch() {
    return true; 
  }

  static init() {
    return { state: { clicks: 0, articlesFound: 0, scrolls: 0 } };
  }

  async dismissCookieConsent(ctx) {
    var buttons = document.querySelectorAll("button, a, div, span");
    for (var bi = 0; bi < buttons.length; bi++) {
      var text = (buttons[bi].innerText || buttons[bi].textContent || "").trim().toLowerCase();
      if (text === "godta alle" || text === "godta") {
        buttons[bi].click(); // Enkelt klikk fungerer vanligvis for samtykkebanneret
        ctx.log("Lukket samtykkebanner.");
        await ctx.Lib.sleep(1000);
        return true;
      }
    }
    return false;
  }

  async clickLoadMore(ctx) {
    // Ser etter elementer som inneholder knappen
    var elements = document.querySelectorAll("button, a, span, div");
    
    for (var i = 0; i < elements.length; i++) {
      var text = (elements[i].innerText || elements[i].textContent || "").trim().toLowerCase();
      
      // Bruker .includes slik at den også treffer f.eks. "Vis flere (44)"
      if (text.includes("vis flere")) {
        elements[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        await ctx.Lib.sleep(1000);
        
        // Tvinger frem et ekte museklikk for å omgå React sine sperrer
        elements[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        
        ctx.log("Trykket på 'Vis flere'-knappen.");
        await ctx.Lib.sleep(4000); // Gir React god tid til å hente og tegne opp nye artikler
        return true;
      }
    }
    return false;
  }

  collectAndAddLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    
    // Vi henter alle anker-tagger på siden
    var links = document.querySelectorAll("a");
    
    for (var j = 0; j < links.length; j++) {
      try {
        var rawHref = links[j].getAttribute('href');
        if (!rawHref) continue;

        // Ignorer e-post, javascript-kall og interne sideoppsett-ankere
        if (rawHref.startsWith('mailto:') || rawHref.startsWith('javascript:') || rawHref.startsWith('#')) {
          continue;
        }

        // links[j].href gir alltid den fullstendige, absolutte URL-en oppløst av nettleseren
        var absoluteHref = links[j].href;
        
        // Siden vi stoler på Browsertrix' eget Scope til å stoppe uønskede lenker til slutt,
        // samler vi inn alle lenker som er en del av pingvinavisa eller generelle nyheter
        var isRelevant = absoluteHref.includes('/pingvinavisa/') || absoluteHref.includes('/nyheter/');
        
        if (isRelevant && !seenUrls.has(absoluteHref)) {
          seenUrls.add(absoluteHref);
          
          if (typeof addLink === "function") {
            addLink(absoluteHref); // Sender den komplette lenken til Browsertrix
          }
          newCount++;
        }
      } catch (e) {
        // Ignorer lenker som krasjer URL-byggeren
      }
    }
    
    if (newCount > 0) {
      ctx.log("Fant " + newCount + " nye artikler. (Totalt i innhøstingskøen: " + seenUrls.size + ")");
    }
    return newCount;
  }

  async *run(ctx) {
    var getState = ctx.Lib.getState;
    var sleep = ctx.Lib.sleep;
    var seenUrls = new Set();

    ctx.log("Starter script... Venter i 4 sekunder så React får bygget siden.");
    await sleep(4000); 

    await this.dismissCookieConsent(ctx);
    
    // Henter de første artiklene som allerede er synlige på skjermen
    this.collectAndAddLinks(ctx, seenUrls);

    var maxAttempts = 100; // Stopper scriptet etter max 100 klikk for å forhindre evig loop
    var lastHeight = document.documentElement.scrollHeight;
    var unchangedCount = 0;

    for (var i = 0; i < maxAttempts; i++) {
      // 1. Forsøk å klikke på knappen
      var clicked = await this.clickLoadMore(ctx);
      
      if (clicked) {
        ctx.state.clicks++;
        unchangedCount = 0; 
        
        // 2. Fang opp de nye lenkene React nettopp la til i HTML-en
        this.collectAndAddLinks(ctx, seenUrls);
        
        yield getState(ctx, "Klikket 'Vis flere', totalt funnet: " + seenUrls.size + " artikler", "clicks");
        continue; 
      }

      // 3. Hvis ingen knapp ble funnet, scroll ned for å trigge eventuell lazy-loading
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(2000); 
      
      var added = this.collectAndAddLinks(ctx, seenUrls);
      ctx.state.articlesFound = seenUrls.size;

      var newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight && added === 0) {
        unchangedCount++;
        // Nådd bunnen av siden
        if (unchangedCount >= 3) {
           ctx.log("Ferdig! Fant ingen flere knapper, og listen vokser ikke mer.");
           break; 
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = newHeight;

      ctx.state.scrolls++;
      yield getState(ctx, "Scrollet. Artikler i innhøstingskø: " + seenUrls.size, "articlesFound");
    }
    
    yield getState(ctx, "Behavior-script ferdig. Crawleren tar nå over for å besøke alle artiklene!");
  }
}
