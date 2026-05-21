class FriskusBehavior {
  static id = "Friskus";

  static isMatch() {
    return !!window.location.href.match(/https?:\/\/[^/]*\.friskus\.com/);
  }

  static init() {
    return {
      state: {
        events: 0,
        tabs: 0,
        scrolls: 0,
      },
    };
  }

  async dismissCookieConsent(ctx) {
    var sleep = ctx.Lib.sleep;
    var buttons = document.querySelectorAll("button");
    for (var bi = 0; bi < buttons.length; bi++) {
      var btn = buttons[bi];
      if (btn.textContent.trim() === "Godta") {
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
      'button, [role="button"], a.load-more, a.show-more'
    );
    for (var ci = 0; ci < buttons.length; ci++) {
      var btn = buttons[ci];
      var text = (btn.textContent || "").trim().toLowerCase();
      if (
        text === "last mer" ||
        text === "vis mer" ||
        text === "load more" ||
        text === "show more" ||
        text === "hent flere"
      ) {
        btn.click();
        ctx.log("Clicked load more button: " + text);
        await sleep(1000);
        return true;
      }
    }
    return false;
  }

  async expandEventDates(ctx) {
    var sleep = ctx.Lib.sleep;
    var scrollIntoView = ctx.Lib.scrollIntoView;
    var expandButtons = document.querySelectorAll(
      'button, [role="button"], .expand, .show-all'
    );
    for (var ei = 0; ei < expandButtons.length; ei++) {
      var btn = expandButtons[ei];
      var text = (btn.textContent || "").trim().toLowerCase();
      if (
        text.includes("vis alle") ||
        text.includes("show all") ||
        text.includes("expand")
      ) {
        scrollIntoView(btn);
        await sleep(300);
        btn.click();
        ctx.log("Expanded section: " + text);
        await sleep(500);
      }
    }
  }

  isEventListingPage() {
    var path = window.location.pathname;
    return path === "/" || path === "/events" || path === "/events/";
  }

  isEventDetailPage() {
    return !!window.location.pathname.match(
      /\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
  }

  isOrganisationPage() {
    return !!window.location.pathname.match(
      /\/organisations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    );
  }

  collectAndAddLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    var links = document.querySelectorAll('a[href*="/events/"], a[href*="/organisations/"]');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].href;
      if (href && !seenUrls.has(href)) {
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
    var scrollIntoView = ctx.Lib.scrollIntoView;

    // Track all discovered URLs
    var seenUrls = new Set();

    // Dismiss cookie consent first
    await this.dismissCookieConsent(ctx);
    await sleep(500);

    if (this.isEventListingPage()) {
      ctx.log("Running behavior on event listing page");

      // Collect initial links
      var initialNew = this.collectAndAddLinks(ctx, seenUrls);
      ctx.state.events = seenUrls.size;
      yield getState(ctx, "Found " + seenUrls.size + " initial events, added " + initialNew + " links", "events");

      // Scroll to load all events
      var maxScrollAttempts = 100;
      var lastHeight = 0;
      var unchangedCount = 0;

      for (var i = 0; i < maxScrollAttempts; i++) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(1500);

        var loadMoreClicked = await this.clickLoadMore(ctx);
        if (loadMoreClicked) {
          await sleep(2000);
          // Collect newly loaded links
          this.collectAndAddLinks(ctx, seenUrls);
          unchangedCount = 0;
          continue;
        }

        // Collect newly loaded links after scroll
        var added = this.collectAndAddLinks(ctx, seenUrls);
        ctx.state.events = seenUrls.size;

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
      ctx.state.events = seenUrls.size;
      yield getState(ctx, "Loaded " + seenUrls.size + " total events", "events");

    } else if (this.isEventDetailPage()) {
      ctx.log("Running behavior on event detail page");
      await sleep(1000);

      // Expand any collapsed sections
      await this.expandEventDates(ctx);

      // Click through tabs to ensure all content is loaded
      var tabButtons = document.querySelectorAll(
        '[role="tab"], .mat-tab-label, .tab-button, button'
      );
      for (var t = 0; t < tabButtons.length; t++) {
        var tab = tabButtons[t];
        var text = (tab.textContent || "").trim();
        if (text === "Kontakt" || text === "Kart" || text === "Praktisk informasjon" || text === "Om") {
          scrollIntoView(tab);
          await sleep(300);
          tab.click();
          ctx.state.tabs++;
          yield getState(ctx, "Clicked tab: " + text, "tabs");
          await sleep(1000);
        }
      }

      // Collect links from detail page (e.g. related events, org links)
      this.collectAndAddLinks(ctx, seenUrls);

      // Scroll through the entire page to trigger lazy loading
      var lastHeight2 = 0;
      var unchangedCount2 = 0;
      for (var i2 = 0; i2 < 50; i2++) {
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
        yield getState(ctx, "Scrolled detail page (attempt " + (i2 + 1) + ")", "scrolls");
      }

      yield getState(ctx, "Finished processing event detail page");

    } else if (this.isOrganisationPage()) {
      ctx.log("Running behavior on organisation page");
      await sleep(1000);

      var lastHeight3 = 0;
      var unchangedCount3 = 0;
      for (var i3 = 0; i3 < 50; i3++) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(1500);

        this.collectAndAddLinks(ctx, seenUrls);

        var newHeight3 = document.documentElement.scrollHeight;
        if (newHeight3 === lastHeight3) {
          unchangedCount3++;
          if (unchangedCount3 >= 3) break;
        } else {
          unchangedCount3 = 0;
        }
        lastHeight3 = newHeight3;

        ctx.state.scrolls++;
        yield getState(ctx, "Scrolled org page (attempt " + (i3 + 1) + ")", "scrolls");
      }

      yield getState(ctx, "Finished processing organisation page");

    } else {
      ctx.log("Running default scroll behavior on: " + window.location.href);

      var lastHeight4 = 0;
      var unchangedCount4 = 0;
      for (var i4 = 0; i4 < 50; i4++) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(1500);

        this.collectAndAddLinks(ctx, seenUrls);

        var newHeight4 = document.documentElement.scrollHeight;
        if (newHeight4 === lastHeight4) {
          unchangedCount4++;
          if (unchangedCount4 >= 3) break;
        } else {
          unchangedCount4 = 0;
        }
        lastHeight4 = newHeight4;

        ctx.state.scrolls++;
        yield getState(ctx, "Scrolled page (attempt " + (i4 + 1) + ")", "scrolls");
      }

      yield getState(ctx, "Finished scrolling page");
    }
  }
}
