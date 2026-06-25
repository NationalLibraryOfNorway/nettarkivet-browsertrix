class PingvinavisaBehavior {
  static id = "PingvinavisaReactBehavior";

  static isMatch() {
    return true; 
  }

  static init() {
    return { state: { clicks: 0, articlesFound: 0 } };
  }

  async dismissCookieConsent(ctx) {
    var buttons = document.querySelectorAll("button");
    for (var bi = 0; bi < buttons.length; bi++) {
      var text = (buttons[bi].innerText || buttons[bi].textContent || "").trim().toLowerCase();
      if (text === "godta alle" || text === "godta") {
        buttons[bi].click(); // Enkelt klikk fungerer vanligvis for UNN sitt samtykkebanner
        ctx.log("Lukket samtykkebanner.");
        await ctx.Lib.sleep(1000);
        return true;
      }
    }
    return false;
  }

  async clickLoadMore(ctx) {
    // Ser etter elementer som inneholder teksten "vis flere"
    var elements = document.querySelectorAll("button, a, span, div");
    
    for (var i = 0; i < elements.length; i++) {
      var text = (elements[i].innerText || elements[i].textContent || "").trim().toLowerCase();
      if (text === "vis flere") {
        elements[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        await ctx.Lib.sleep(1000);
        
        // Tvinger frem et ekte museklikk for å omgå React sine sperrer
        elements[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        
        ctx.log("Trykket på 'Vis flere'-knappen.");
        await ctx.Lib.sleep(4000); // Gir React god tid til å hente nye artikler
        return true;
      }
    }
    return false;
  }

  collectAndAddLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    
    // Vi leter utelukkende etter anker-taggene (<a>) som inneholder /pingvinavisa/ 
    // Dette fanger opp den skjulte "visuallyhidden"-lenken du fant i kildekoden!
    var links = document.querySelectorAll("a[href*='/pingvinavisa/']");
    
    for (var j = 0; j < links.length; j++) {
      // Ved å bruke egenskapen .href gjør nettleseren automatisk 
      // "/pingvinavisa/nyheter/.." om til "https://www.unn.no/pingvinavisa/nyheter/.."
      var absoluteHref = links[j].href; 
      
      if (absoluteHref && !absoluteHref.includes('#') && !seenUrls.has(absoluteHref)) {
        seenUrls.add(absoluteHref);
        
        if (typeof addLink === "function") {
          addLink(absoluteHref); // Sender den komplette lenken til Browsertrix
        }
        newCount++;
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

    var maxAttempts = 100; // Stopper scriptet etter max 100 klikk
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

      // 3. Hvis ingen knapp, scroll ned for å trigge lazy-loading
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

      yield getState(ctx, "Scrollet. Artikler i innhøstingskø: " + seenUrls.size, "articlesFound");
    }
    
    yield getState(ctx, "Behavior-script ferdig. Crawleren tar nå over for å besøke artiklene!");
  }
}
