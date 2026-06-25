class PingvinavisaBehavior {
  static id = "PingvinavisaBehavior";

  static isMatch() {
    return !!window.location.href.match(/https?:\/\/(www\.)?unn\.no\/pingvinavisa/);
  }

  static init() {
    return {
      state: {
        articles: 0,
        clicks: 0,
        scrolls: 0,
      },
    };
  }

  async dismissCookieConsent(ctx) {
    var sleep = ctx.Lib.sleep;
    var buttons = document.querySelectorAll("button, [role='button'], a");
    for (var bi = 0; bi < buttons.length; bi++) {
      var btn = buttons[bi];
      var text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
      if (text === "godta alle" || text === "godta") {
        if (btn.offsetParent !== null) { // Sjekker at banneret er synlig
          btn.click();
          ctx.log("Lukket samtykkebanner");
          await sleep(800);
          return true;
        }
      }
    }
    return false;
  }

  async clickLoadMore(ctx) {
    var sleep = ctx.Lib.sleep;
    // Utvider søket til span og div i tilfelle CMS-et pakker knappen inn rart
    var elements = document.querySelectorAll('button, [role="button"], a, span, div.load-more');
    for (var ci = 0; ci < elements.length; ci++) {
      var el = elements[ci];
      
      // Sjekk om elementet faktisk er synlig på skjermen (viktig for at klikk skal fungere)
      if (el.offsetParent !== null) {
        // Bruker innerText for å unngå skjult HTML, og fjerner doble mellomrom for sikker treff
        var text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        
        if (text.includes("vis flere") || text.includes("last mer") || text.includes("hent flere")) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(800);
          el.click();
          ctx.log("Fant og trykket på utvid-knapp: " + text);
          await sleep(3000); // Vent på at nettverket henter de nye sakene
          return true;
        }
      }
    }
    return false;
  }

  collectAndAddLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    
    // Henter ALLE lenker for å være 100% sikker på at de legges i køen. 
    // Browsertrix sin scope-konfigurasjon vil ignorere lenker som bryter med crawl-reglene dine.
    var links = document.querySelectorAll('a[href]');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].href;
      
      // Pass på at det er en gyldig url til unn.no og ikke en #anker-lenke
      if (href && href.startsWith("http") && href.includes("unn.no") && !seenUrls.has(href)) {
        seenUrls.add(href);
        addLink(href); // Sender lenken til Browsertrix sin crawl-kø
        newCount++;
      }
    }
    return newCount;
  }

  async *run(ctx) {
    var getState = ctx.Lib.getState;
    var sleep = ctx.Lib.sleep;
    var seenUrls = new Set();

    ctx.log("Starter innhøsting av Pingvinavisa");

    // 1. Fjern cookies først så de ikke blokkerer klikking
    await this.dismissCookieConsent(ctx);
    await sleep(500);

    // 2. Første runde med å fange lenker
    this.collectAndAddLinks(ctx, seenUrls);

    // 3. Forent logikk: Vi prøver å finne "Vis flere" uansett hvilken side vi er på.
    var maxScrollAttempts = 150;
    var lastHeight = 0;
    var unchangedCount = 0;

    for (var i = 0; i < maxScrollAttempts; i++) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(1500);

      var loadMoreClicked = await this.clickLoadMore(ctx);
      
      if (loadMoreClicked) {
        ctx.state.clicks++;
        this.collectAndAddLinks(ctx, seenUrls);
        unchangedCount = 0; // Nullstill fordi vi vet vi akkurat lastet mer innhold
        yield getState(ctx, "Trykket 'Vis flere', totalt klikk: " + ctx.state.clicks, "clicks");
        continue; // Gå rett til neste iterasjon for å se om knappen er der igjen
      }

      // Hvis ingen knapp ble funnet/trykket, sjekk om scrollingen fant nye lenker
      var added = this.collectAndAddLinks(ctx, seenUrls);
      ctx.state.articles = seenUrls.size;

      var newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight && added === 0) {
        unchangedCount++;
        // Hvis vi har scrollet 3 ganger uten ny høyde og uten nye lenker -> da er vi i bunnen.
        if (unchangedCount >= 3) {
          ctx.log("Nådd bunnen av siden eller ingen flere artikler å laste.");
          break;
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = newHeight;

      ctx.state.scrolls++;
      yield getState(ctx, "Scrollet side (forsøk " + (i + 1) + "), lenker i kø: " + seenUrls.size, "scrolls");
    }

    yield getState(ctx, "Innhøsting ferdig. Totalt lenker lagt i kø: " + seenUrls.size);
  }
}
