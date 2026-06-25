class PingvinavisaBehavior {
  static id = "PingvinavisaBehavior";

  static isMatch() {
    return true; // Lar den kjøre overalt. Crawlerens egne regler vil styre hva som faktisk lagres.
  }

  static init() {
    return { state: { clicks: 0, scrolls: 0 } };
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
          // Ekte museklikk på cookie-banner
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          ctx.log("Fjernet cookie-banner.");
          await sleep(1000);
          return true;
        }
      }
    }
    return false;
  }

  async clickLoadMore(ctx) {
    var sleep = ctx.Lib.sleep;
    var elements = document.querySelectorAll("button, a");
    
    for (var ci = 0; ci < elements.length; ci++) {
      var el = elements[ci];
      var text = (el.innerText || el.textContent || "").toLowerCase();
      
      if (text.includes("vis flere") || text.includes("last mer")) {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
          
          // TVUNGET MUSEKLIKK: Dette omgår nettsidens sperrer mot automatiserte klikk
          var clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(clickEvent);
          
          ctx.log("Tvang frem fysisk museklikk på: " + text);
          await sleep(4000); // Må være høy nok til at de nye artiklene rekker å dukke opp
          return true;
        }
      }
    }
    return false;
  }

  async *run(ctx) {
    var getState = ctx.Lib.getState;
    var sleep = ctx.Lib.sleep;

    ctx.log("Starter forenklet adferd for å mate skjermen...");
    await this.dismissCookieConsent(ctx);

    var maxAttempts = 60; // Sikkerhetsstopp! Forhindrer at scriptet låser crawleren i timesvis.
    var lastHeight = document.documentElement.scrollHeight;
    var unchangedCount = 0;

    for (var i = 0; i < maxAttempts; i++) {
      var loadMoreClicked = await this.clickLoadMore(ctx);
      
      if (loadMoreClicked) {
        ctx.state.clicks++;
        unchangedCount = 0; 
        yield getState(ctx, "Utvidet listen", "clicks");
        continue; 
      }

      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(2000); 

      var newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight) {
        // Vi venter 2 sekunder ekstra for å se om nettet er tregt
        await sleep(2000);
        if (document.documentElement.scrollHeight === lastHeight) {
           ctx.log("Scriptet er ferdig. Gir nå stafettpinnen videre til crawler-motoren for å fange lenkene.");
           break; // Dette breake-et er KRITISK for at crawleren skal få lov til å begynne å besøke artiklene
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = document.documentElement.scrollHeight;

      ctx.state.scrolls++;
      yield getState(ctx, "Scrollet", "scrolls");
    }
  }
}
