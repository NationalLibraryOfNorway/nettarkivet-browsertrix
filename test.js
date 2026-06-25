class PingvinavisaBehavior {
  static id = "PingvinavisaBehavior";

  static isMatch() {
    // Fanger opp alle varianter av unn.no/pingvinavisa
    return !!window.location.href.match(/unn\.no\/pingvinavisa/i);
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
    var buttons = document.querySelectorAll("button, a, [role='button']");
    for (var bi = 0; bi < buttons.length; bi++) {
      var btn = buttons[bi];
      var text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
      if (text === "godta alle" || text === "godta") {
        var rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) { // Sjekker at banneret har en faktisk størrelse
          btn.click();
          ctx.log("Lukket samtykkebanner");
          await sleep(1000);
          return true;
        }
      }
    }
    return false;
  }

  async clickLoadMore(ctx) {
    var sleep = ctx.Lib.sleep;
    // Leter bredt, ettersom knappen kan være en div eller span styrt av JavaScript
    var elements = document.querySelectorAll("button, a, span, div");
    
    for (var ci = 0; ci < elements.length; ci++) {
      var el = elements[ci];
      var text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      
      if (text.includes("vis flere") || text.includes("last mer") || text.includes("hent flere")) {
        // Sikker sjekk for å se om knappen faktisk er synlig på skjermen
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
          
          el.click(); 
          ctx.log("Fant og trykket på utvid-knapp: '" + text + "'");
          
          // Gi god tid til at AJAX-kallet laster ned de nye artiklene i bakgrunnen
          await sleep(3500); 
          return true;
        }
      }
    }
    return false;
  }

  collectAndAddLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    
    var links = document.querySelectorAll('a[href]');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].href;
      
      // Sjekker at det er en reell HTTP-lenke og ikke et anker (#)
      if (href && href.startsWith("http") && !href.includes("#") && !seenUrls.has(href)) {
        // Legger KUN til lenker som peker til saker under pingvinavisa
        if (href.includes("/pingvinavisa")) {
          seenUrls.add(href);
          if (typeof addLink === "function") {
            addLink(href); // Sender lenken rett til Browsertrix sin crawler-kø
          }
          newCount++;
        }
      }
    }
    
    if (newCount > 0) {
      ctx.log("Fant og la til " + newCount + " nye lenker i innhøstingskøen.");
    }
    return newCount;
  }

  async *run(ctx) {
    var getState = ctx.Lib.getState;
    var sleep = ctx.Lib.sleep;
    var seenUrls = new Set();

    ctx.log("Starter innhøsting av Pingvinavisa...");

    // 1. Rydd unna cookies så de ikke ligger over 'Vis flere'-knappen
    await this.dismissCookieConsent(ctx);

    // 2. Gjør et første søk etter lenker før vi i det hele tatt begynner å scrolle
    this.collectAndAddLinks(ctx, seenUrls);

    var maxScrollAttempts = 150;
    var lastHeight = 0;
    var unchangedCount = 0;

    for (var i = 0; i < maxScrollAttempts; i++) {
      // 3. Forsøk ALLTID å trykke på knappen først
      var loadMoreClicked = await this.clickLoadMore(ctx);
      
      if (loadMoreClicked) {
        ctx.state.clicks++;
        this.collectAndAddLinks(ctx, seenUrls);
        unchangedCount = 0; // Vi vet at siden ble endret, så vi nullstiller telleren
        yield getState(ctx, "Klikket knapp, totalt klikk: " + ctx.state.clicks, "clicks");
        continue; 
      }

      // 4. Hvis ingen knapp ble funnet, scroll rolig nedover for å trigge lazy-loading
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(2000); 

      var added = this.collectAndAddLinks(ctx, seenUrls);
      ctx.state.articles = seenUrls.size;

      var newHeight = document.documentElement.scrollHeight;
      
      // 5. Har vi nådd bunnen? (Ingen nye lenker OG siden blir ikke lengre)
      if (newHeight === lastHeight && added === 0) {
        unchangedCount++;
        if (unchangedCount >= 3) {
          ctx.log("Nådd bunnen. Ingen flere knapper funnet, og siden blir ikke lenger.");
          break;
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = newHeight;

      ctx.state.scrolls++;
      yield getState(ctx, "Scrollet side (forsøk " + (i+1) + "), totalt " + seenUrls.size + " lenker i kø", "scrolls");
    }

    yield getState(ctx, "Innhøsting ferdig. Klarte å mate " + seenUrls.size + " unike lenker inn i crawleren.");
  }
}
