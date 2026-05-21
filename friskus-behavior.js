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
    const { sleep } = ctx.Lib;
    // Look for the "Godta" (Accept) button in the cookie consent banner
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent.trim() === "Godta") {
        btn.click();
        ctx.log("Dismissed cookie consent banner");
        await sleep(500);
        return true;
      }
    }
    return false;
  }

  async *scrollToLoadAll(ctx) {
    const { getState, sleep } = ctx.Lib;
    const maxScrollAttempts = 100;
    let lastHeight = 0;
    let unchangedCount = 0;

    for (let i = 0; i < maxScrollAttempts; i++) {
      const currentHeight = document.documentElement.scrollHeight;

      window.scrollTo({
        top: currentHeight,
        behavior: "smooth",
      });

      await sleep(1500);

      // Check for "Load more" / "Last mer" / "Vis mer" buttons
      const loadMoreClicked = await this.clickLoadMore(ctx);

      if (loadMoreClicked) {
        await sleep(2000);
        unchangedCount = 0;
        continue;
      }

      const newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight) {
        unchangedCount++;
        if (unchangedCount >= 3) {
          break;
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = newHeight;

      ctx.state.scrolls++;
      yield getState(ctx, `Scrolled page (attempt ${i + 1})`, "scrolls");
    }
  }

  async clickLoadMore(ctx) {
    const { sleep } = ctx.Lib;
    const buttons = document.querySelectorAll(
      'button, [role="button"], a.load-more, a.show-more'
    );
    for (const btn of buttons) {
      const text = (btn.textContent || "").trim().toLowerCase();
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

  async *clickDetailTabs(ctx) {
    const { getState, sleep, scrollIntoView } = ctx.Lib;

    // On event detail pages, click tabs like Kontakt, Kart
    const tabButtons = document.querySelectorAll(
      '[role="tab"], .mat-tab-label, .tab-button, button'
    );

    for (const tab of tabButtons) {
      const text = (tab.textContent || "").trim();
      if (
        text === "Kontakt" ||
        text === "Kart" ||
        text === "Praktisk informasjon" ||
        text === "Om"
      ) {
        scrollIntoView(tab);
        await sleep(300);
        tab.click();
        ctx.state.tabs++;
        yield getState(ctx, `Clicked tab: ${text}`, "tabs");
        await sleep(1000);
      }
    }
  }

  async expandEventDates(ctx) {
    const { sleep, scrollIntoView } = ctx.Lib;

    // Look for expandable date sections or "show all dates" buttons
    const expandButtons = document.querySelectorAll(
      'button, [role="button"], .expand, .show-all'
    );
    for (const btn of expandButtons) {
      const text = (btn.textContent || "").trim().toLowerCase();
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
    const path = window.location.pathname;
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

  async *run(ctx) {
    const { getState, sleep, scrollIntoView } = ctx.Lib;

    // Dismiss cookie consent first
    await this.dismissCookieConsent(ctx);
    await sleep(500);

    if (this.isEventListingPage()) {
      ctx.log("Running behavior on event listing page");

      // Count initial events
      const initialEvents = document.querySelectorAll('a[href*="/events/"]');
      ctx.state.events = initialEvents.length;
      yield getState(
        ctx,
        `Found ${initialEvents.length} initial events`,
        "events"
      );

      // Scroll to load all events
      yield* this.scrollToLoadAll(ctx);

      // Count final events
      const finalEvents = document.querySelectorAll('a[href*="/events/"]');
      ctx.state.events = finalEvents.length;
      yield getState(
        ctx,
        `Loaded ${finalEvents.length} total events`,
        "events"
      );
    } else if (this.isEventDetailPage()) {
      ctx.log("Running behavior on event detail page");

      // Wait for content to render
      await sleep(1000);

      // Expand any collapsed sections
      await this.expandEventDates(ctx);

      // Click through tabs to ensure all content is loaded
      yield* this.clickDetailTabs(ctx);

      // Scroll through the entire page to trigger lazy loading
      yield* this.scrollToLoadAll(ctx);

      yield getState(ctx, "Finished processing event detail page");
    } else if (this.isOrganisationPage()) {
      ctx.log("Running behavior on organisation page");

      await sleep(1000);

      // Scroll to load all content
      yield* this.scrollToLoadAll(ctx);

      yield getState(ctx, "Finished processing organisation page");
    } else {
      ctx.log("Running default scroll behavior on: " + window.location.href);

      // Generic scroll behavior for other pages
      yield* this.scrollToLoadAll(ctx);

      yield getState(ctx, "Finished scrolling page");
    }
  }
}
