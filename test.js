class PingvinavisaBehavior {
  static id = "PingvinavisaBehavior";

  static isMatch() {
    return !!window.location.href.match(/unn\.no\/pingvinavisa/i);
  }

  static init() {
    return {
      state: { clicks: 0, scrolls: 0 },
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
        if (rect.width > 0 && rect.height > 0) { 
          btn.click();
          ctx.log("Lukket cookie-banner");
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
      var text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      
      if (text.includes("vis flere") || text.includes("last mer") || text.includes("hent flere")) {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
          el.click(); 
          ctx.log("Trykket på utvid-knapp: '" + text + "'");
          await sleep(4000); // Vent lenge nok til at Browsertrix sin hovedmotor rekker å registrere de nye lenkene
          return true;
        }
      }
    }
    return false;
  }

  async *run(ctx) {
    var getState = ctx.Lib.getState;
    var sleep = ctx.Lib.sleep;

    ctx.log("Starter forenklet innhøsting av Pingvinavisa...");
    await this.dismissCookieConsent(ctx);

    var maxScrollAttempts = 150;
    var lastHeight = 0;
    var unchangedCount = 0;

    for (var i = 0; i < maxScrollAttempts; i++) {
      // Prioritet 1: Leter etter knappen og trykker
      var loadMoreClicked = await this.clickLoadMore(ctx);
      
      if (loadMoreClicked) {
        ctx.state.clicks++;
        unchangedCount = 0; 
        yield getState(ctx, "Klikket knapp, totalt klikk: " + ctx.state.clicks, "clicks");
        continue; 
      }

      // Prioritet 2: Hvis ingen knapp finnes, scroll rolig nedover for å aktivere bilder/artikler
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(2000); 

      var newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight) {
        unchangedCount++;
        if (unchangedCount >= 3) {
          ctx.log("Nådd bunnen av siden. Venter på at crawleren suger til seg de siste lenkene.");
          break;
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = newHeight;

      ctx.state.scrolls++;
      yield getState(ctx, "Scrollet side ned (forsøk " + (i+1) + ")", "scrolls");
    }
    
    // Et siste pusterom slik at de nederste lenkene rekker å bli indeksert før scriptet avsluttes
    await sleep(2000); 
    yield getState(ctx, "Innhøsting ferdig.");
  }
}
