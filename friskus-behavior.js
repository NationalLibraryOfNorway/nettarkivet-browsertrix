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
        sitemapProcessed: false,
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

  async harvestSitemap(ctx, sitemapUrl, seenUrls, visitedSitemaps) {
    if (visitedSitemaps.has(sitemapUrl)) return;
    visitedSitemaps.add(sitemapUrl);

    ctx.log("Fetching sitemap: " + sitemapUrl);
    try {
      var response = await fetch(sitemapUrl);
      if (!response.ok) {
        ctx.log("Failed to fetch sitemap: " + sitemapUrl + " (status " + response.status + ")");
        return;
      }
      var text = await response.text();
      var parser = new DOMParser();
      var xmlDoc = parser.parseFromString(text, "text/xml");

      var parserError = xmlDoc.querySelector("parsererror");
      if (parserError) {
        ctx.log("XML parse error for sitemap: " + sitemapUrl);
        return;
      }

      var locElements = xmlDoc.getElementsByTagName("loc");
      ctx.log("Found " + locElements.length + " entries in sitemap: " + sitemapUrl);

      for (var i = 0; i < locElements.length; i++) {
        var loc = (locElements[i].textContent || "").trim();
        if (!loc) continue;

        if (loc.endsWith(".xml") || loc.includes("/sitemap")) {
          await this.harvestSitemap(ctx, loc, seenUrls, visitedSitemaps);
        } else {
          if (!seenUrls.has(loc)) {
            seenUrls.add(loc);
            if (typeof ctx.Lib.addLink === "function") {
              ctx.Lib.addLink(loc);
            }
          }
        }
      }
    } catch (err) {
      ctx.log("Error processing sitemap " + sitemapUrl + ": " + err.message);
    }
  }

  isMainPortalPage() {
    var host = window.location.hostname;
    return host === 'friskus.com' || host === 'www.friskus.com';
  }

  collectMunicipalityLinks(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var newCount = 0;
    var links = document.querySelectorAll('a');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].href;
      if (href) {
        try {
          var urlObj = new URL(href);
          var hostname = urlObj.hostname;
          if (hostname.endsWith('.friskus.com') && hostname !== 'www.friskus.com' && hostname !== 'friskus.com') {
            var municipalityOrigin = urlObj.origin + "/";
            if (!seenUrls.has(municipalityOrigin)) {
              seenUrls.add(municipalityOrigin);
              if (typeof addLink === "function") {
                addLink(municipalityOrigin);
              }
              newCount++;
            }
          }
        } catch (e) {
          // Ignore
        }
      }
    }
    return newCount;
  }

  extractMunicipalitiesFromJsonLd(ctx, seenUrls) {
    var addLink = ctx.Lib.addLink;
    var count = 0;
    try {
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var i = 0; i < scripts.length; i++) {
        try {
          var text = scripts[i].textContent;
          if (!text) continue;
          var data = JSON.parse(text);
          if (data && data.areaServed && Array.isArray(data.areaServed)) {
            for (var j = 0; j < data.areaServed.length; j++) {
              var url = data.areaServed[j].url;
              if (url) {
                try {
                  var urlObj = new URL(url);
                  var normalized = urlObj.origin + "/";
                  if (!seenUrls.has(normalized)) {
                    seenUrls.add(normalized);
                    if (typeof addLink === "function") {
                      addLink(normalized);
                    }
                    count++;
                  }
                } catch (e) { }
              }
            }
          }
        } catch (inner) { }
      }
    } catch (e) {
      ctx.log("Error parsing JSON-LD: " + e.message);
    }
    if (count > 0) {
      ctx.log("Found " + count + " municipality URLs from JSON-LD.");
    }
    return count;
  }

  async handleHorizontalCarousels(ctx, seenUrls) {
    var sleep = ctx.Lib.sleep;
    ctx.log("Checking for horizontal carousels/sliders...");

    // 1. Programmatically scroll any horizontally scrollable container
    var scrollableContainers = [];
    var allElements = document.querySelectorAll('*');
    for (var i = 0; i < allElements.length; i++) {
      var el = allElements[i];
      var style = window.getComputedStyle(el);
      var overflowX = style.overflowX;
      if ((overflowX === 'auto' || overflowX === 'scroll' || el.scrollWidth > el.clientWidth) && el.clientWidth > 100) {
        scrollableContainers.push(el);
      }
    }

    if (scrollableContainers.length > 0) {
      ctx.log("Found " + scrollableContainers.length + " horizontally scrollable containers.");
      for (var s = 0; s < scrollableContainers.length; s++) {
        var container = scrollableContainers[s];
        var currentScroll = 0;
        var maxScroll = container.scrollWidth - container.clientWidth;
        var step = Math.max(container.clientWidth / 2, 200);

        ctx.log("Scrolling container horizontally (max scroll: " + maxScroll + ")");
        while (currentScroll < maxScroll) {
          currentScroll += step;
          container.scrollTo({ left: currentScroll, behavior: 'smooth' });
          await sleep(500);
          this.collectMunicipalityLinks(ctx, seenUrls);
        }
      }
    }

    // 2. Find and click arrow/next buttons in carousels
    var buttons = document.querySelectorAll('button, [role="button"], .next, .arrow-right, .chevron-right, [class*="next"], [class*="arrow"], [class*="chevron"]');
    var nextButtons = [];
    for (var b = 0; b < buttons.length; b++) {
      var btn = buttons[b];
      var text = (btn.textContent || "").trim().toLowerCase();
      var className = (btn.className || "").toString().toLowerCase();
      var ariaLabel = (btn.getAttribute('aria-label') || "").toLowerCase();
      var id = (btn.id || "").toLowerCase();

      var isNext = false;
      if (className.includes('next') || className.includes('right') || className.includes('arrow') || className.includes('chevron')) {
        isNext = true;
      }
      if (ariaLabel.includes('next') || ariaLabel.includes('neste') || ariaLabel.includes('høyre') || ariaLabel.includes('right')) {
        isNext = true;
      }
      if (id.includes('next') || id.includes('right')) {
        isNext = true;
      }
      var svg = btn.querySelector('svg');
      if (svg) {
        var svgClass = (svg.className || "").toString().toLowerCase();
        if (svgClass.includes('right') || svgClass.includes('next') || svgClass.includes('arrow') || svgClass.includes('chevron')) {
          isNext = true;
        }
      }

      if (text === "godta" || text.includes("cookie") || text.includes("samtykke")) {
        isNext = false;
      }

      if (isNext) {
        nextButtons.push(btn);
      }
    }

    if (nextButtons.length > 0) {
      ctx.log("Found " + nextButtons.length + " potential carousel next buttons. Clicking them to reveal items...");
      for (var n = 0; n < nextButtons.length; n++) {
        var nextBtn = nextButtons[n];
        try {
          ctx.Lib.scrollIntoView(nextBtn);
          await sleep(300);

          for (var clickAttempt = 0; clickAttempt < 10; clickAttempt++) {
            if (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
              break;
            }

            ctx.log("Clicking carousel button (attempt " + (clickAttempt + 1) + ")");
            nextBtn.click();
            await sleep(800);
            this.collectMunicipalityLinks(ctx, seenUrls);
          }
        } catch (e) {
          ctx.log("Error clicking carousel button: " + e.message);
        }
      }
    }
  }

  async *run(ctx) {
    var getState = ctx.Lib.getState;
    var sleep = ctx.Lib.sleep;
    var scrollIntoView = ctx.Lib.scrollIntoView;

    // Track all discovered URLs
    var seenUrls = new Set();

    if (!ctx.state.sitemapProcessed) {
      ctx.state.sitemapProcessed = true;
      yield getState(ctx, "Starting sitemap harvesting...", "events");
      var visitedSitemaps = new Set();
      var originSitemap = window.location.origin + "/sitemap.xml";
      await this.harvestSitemap(ctx, originSitemap, seenUrls, visitedSitemaps);
      yield getState(ctx, "Sitemap harvesting completed. Found " + seenUrls.size + " URLs from sitemap.", "events");
    }

    // Dismiss cookie consent first
    await this.dismissCookieConsent(ctx);
    await sleep(500);

    if (this.isMainPortalPage()) {
      ctx.log("Running behavior on main portal page: " + window.location.href);

      // 1. Extract from JSON-LD
      var jsonLdCount = this.extractMunicipalitiesFromJsonLd(ctx, seenUrls);
      yield getState(ctx, "Extracted " + jsonLdCount + " municipalities from JSON-LD", "events");

      // 2. Collect initial links
      var initialMunicipalityCount = this.collectMunicipalityLinks(ctx, seenUrls);
      yield getState(ctx, "Collected " + initialMunicipalityCount + " initial municipality links", "events");

      // 3. Handle horizontal carousels
      yield getState(ctx, "Processing horizontal carousels...", "events");
      await this.handleHorizontalCarousels(ctx, seenUrls);

      // 4. Scroll vertically to capture everything else (footer, etc.)
      var lastHeight = 0;
      var unchangedCount = 0;
      for (var i = 0; i < 20; i++) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(1500);

        var added = this.collectMunicipalityLinks(ctx, seenUrls);

        var newHeight = document.documentElement.scrollHeight;
        if (newHeight === lastHeight && added === 0) {
          unchangedCount++;
          if (unchangedCount >= 3) break;
        } else {
          unchangedCount = 0;
        }
        lastHeight = newHeight;

        ctx.state.scrolls++;
        yield getState(ctx, "Scrolled page vertically, total links: " + seenUrls.size, "scrolls");
      }

      yield getState(ctx, "Finished portal page. Total unique URLs queued: " + seenUrls.size, "events");

    } else if (this.isEventListingPage()) {
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
