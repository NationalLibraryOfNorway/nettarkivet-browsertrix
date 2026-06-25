class PingvinavisaBehavior {
  static id = "PingvinavisaBehavior";

  // KRAV 1: isMatch() bestemmer når scriptet skal kjøre
  static isMatch() {
    return !!window.location.href.match(/https?:\/\/(www\.)?unn\.no\/pingvinavisa/);
  }

  // KRAV 2: init() setter opp data/variabler som scriptet skal spore
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
      var text = (btn.textContent || "").trim().toLowerCase();
      if (text === "godta alle" || text === "godta") {
        btn.click();
        ctx.log("Lukkert samtykkebanner for informasjonskapsler");
        await sleep(500);
        return true;
      }
    }
    return false;
  }

  async clickLoadMore(ctx) {
    var sleep = ctx.Lib.sleep;
    var buttons = document.querySelectorAll('button, [role="button"], a');
    for (var ci = 0; ci < buttons.length; ci++) {
      var btn = buttons[ci];
      var text = (btn.textContent || "").trim().toLowerCase();
      // Ser etter "Vis flere" (som UNN bruker)
      if (text.includes("vis flere") || text === "last mer") {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(500);
        btn.click();
        ctx.log("Trykket på knapp: " + text);
        await sleep(2500); // Venter på at AJAX laster nye artikler
        return true;
      }
    }
    return false;
  }

  collectAndAddLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    var links = document.querySelectorAll('a[href*="/pingvinavisa/"]');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].href;
      if (href && !href.includes("#") && !seenUrls.has(href)) {
        seenUrls.add(href);
        addLink(href);
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

    // 1. Fjern cookies først
    await this.dismissCookieConsent(ctx);
    await sleep(500);

    // 2. Er vi på forsiden der "Vis flere"-knappen finnes?
    var path = window.location.pathname;
    if (path === "/pingvinavisa" || path === "/pingvinavisa/") {
      
      this.collectAndAddLinks(ctx, seenUrls);
      
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
          unchangedCount = 0;
          yield getState(ctx, "Lastet flere artikler, totalt klikk: " + ctx.state.clicks, "clicks");
          continue;
        }

        // Hvis ingen knapp ble funnet, sjekk om vi scroller uendret (nådd bunnen)
        var added = this.collectAndAddLinks(ctx, seenUrls);
        ctx.state.articles = seenUrls.size;

        var newHeight = document.documentElement.scrollHeight;
        if (newHeight === lastHeight && added === 0) {
          unchangedCount++;
          if (unchangedCount >= 3) {
            ctx.log("Ingen flere knapper eller nytt innhold. Nådd bunnen.");
            break;
          }
        } else {
          unchangedCount = 0;
        }
        lastHeight = newHeight;

        ctx.state.scrolls++;
        yield getState(ctx, "Scrollet forside (forsøk " + (i + 1) + ")", "scrolls");
      }

    } else {
      // 3. Hvis vi er inne på en spesifikk artikkel, bare scroll nedover for lazy-loading
      ctx.log("Leser artikkel, scroller for å laste inn bilder/innhold");
      var lastHeightArt = 0;
      var unchangedCountArt = 0;
      
      for (var k = 0; k < 30; k++) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(1500);
        this.collectAndAddLinks(ctx, seenUrls);

        var newHeightArt = document.documentElement.scrollHeight;
        if (newHeightArt === lastHeightArt) {
          unchangedCountArt++;
          if (unchangedCountArt >= 3) break;
        } else {
          unchangedCountArt = 0;
        }
        lastHeightArt = newHeightArt;
        
        ctx.state.scrolls++;
        yield getState(ctx, "Scrollet artikkel (forsøk " + (k + 1) + ")", "scrolls");
      }
    }

    yield getState(ctx, "Innhøsting ferdig for denne siden");
  }
}
