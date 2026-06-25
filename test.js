class PingvinavisaBehavior {
  static id = "Pingvinavisa";

  static isMatch() {
    // Treffer kun sider under www.unn.no/pingvinavisa
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
      var text = (btn.textContent || "").trim().toLowerCase();
      // UNN bruker typisk "Godta alle" i sitt samtykkebanner
      if (text === "godta alle" || text === "godta") {
        btn.click();
        ctx.log("Dismissed cookie consent banner");
        await sleep(500);
        return true;
      }
    }
    return false;
  }

  async clickLoadMore(ctx) {
    var sleep = ctx.Lib.sleep;
    var buttons = document.querySelectorAll(
      'button, [role="button"], a.load-more, a'
    );
    for (var ci = 0; ci < buttons.length; ci++) {
      var btn = buttons[ci];
      var text = (btn.textContent || "").trim().toLowerCase();
      // Pingvinavisa bruker "vis flere" på sin knapp
      if (text.includes("vis flere") || text === "last mer") {
        btn.click();
        ctx.log("Clicked load more button: " + text);
        // Gir siden litt lenger tid til å hente sakene via AJAX
        await sleep(2500); 
        return true;
      }
    }
    return false;
  }

  isFrontPage() {
    var path = window.location.pathname;
    return path === "/pingvinavisa" || path === "/pingvinavisa/";
  }

  collectAndAddLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    // Henter ut lenker som peker til undersider i Pingvinavisa
    var links = document.querySelectorAll('a[href*="/pingvinavisa/"]');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].href;
      // Filtrerer bort rene ankerlenker
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

    // Track all discovered URLs
    var seenUrls = new Set();

    // Dismiss cookie consent first
    await this.dismissCookieConsent(ctx);
    await sleep(500);

    if (this.isFrontPage()) {
      ctx.log("Running behavior on Pingvinavisa front page");

      // Collect initial links
      var initialNew = this.collectAndAddLinks(ctx, seenUrls);
      ctx.state.articles = seenUrls.size;
      yield getState(ctx, "Found " + seenUrls.size + " initial articles, added " + initialNew + " links", "articles");

      // Scroll to load all articles
      var maxScrollAttempts = 150;
      var lastHeight = 0;
      var unchangedCount = 0;

      for (var i = 0; i < maxScrollAttempts; i++) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(1500);

        var loadMoreClicked = await this.clickLoadMore(ctx);
        if (loadMoreClicked) {
          ctx.state.clicks++;
          // Collect newly loaded links
          this.collectAndAddLinks(ctx, seenUrls);
          unchangedCount = 0;
          continue;
        }

        // Collect newly loaded links after scroll
        var added = this.collectAndAddLinks(ctx, seenUrls);
        ctx.state.articles = seenUrls.size;

        var newHeight = document.documentElement.scrollHeight;
        if (newHeight === lastHeight && added === 0) {
          unchangedCount++;
          if (unchangedCount >= 3) break;
        } else {
          unchangedCount = 0;
        }
        lastHeight = newHeight;

        ctx.state.scrolls++;
        yield getState(ctx, "Scrolled page (attempt " + (i + 1) + "), total links: " + seenUrls.size, "scrolls");
      }

      // Final collection
      this.collectAndAddLinks(ctx, seenUrls);
      ctx.state.articles = seenUrls.size;
      yield getState(ctx, "Loaded " + seenUrls.size + " total articles", "articles");

    } else {
      ctx.log("Running default scroll behavior on article page: " + window.location.href);

      // Enklere scroll-logikk for selve artiklene for å trigge lazy-loading av bilder etc.
      var lastHeight2 = 0;
      var unchangedCount2 = 0;
      for (var i2 = 0; i2 < 30; i2++) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(1500);

        this.collectAndAddLinks(ctx, seenUrls);

        var newHeight2 = document.documentElement.scrollHeight;
        if (newHeight2 === lastHeight2) {
          unchangedCount2++;
          if (unchangedCount2 >= 3) break;
        } else {
          unchangedCount2 = 0;
        }
        lastHeight2 = newHeight2;

        ctx.state.scrolls++;
        yield getState(ctx, "Scrolled article page (attempt " + (i2 + 1) + ")", "scrolls");
      }

      yield getState(ctx, "Finished scrolling article page");
    }
  }
}
