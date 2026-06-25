class PingvinavisaBehavior {
  static id = "PingvinavisaReactBehavior";

  static isMatch() {
    return true; 
  }

  static init() {
    return { state: { clicks: 0, scrolls: 0 } };
  }

  async dismissCookieConsent(ctx) {
    var sleep = ctx.Lib.sleep;
    // Cookie-banneret tegnes også av React, så vi må lete etter det
    var buttons = document.querySelectorAll("button");
    for (var bi = 0; bi < buttons.length; bi++) {
      var btn = buttons[bi];
      var text = (btn.innerText || btn.textContent || "").trim().toLowerCase();
      if (text === "godta alle" || text === "godta") {
        if (btn.offsetParent !== null) { 
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          ctx.log("Lukket React-basert cookie-banner.");
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
      var text = (el.innerText || el.textContent || "").toLowerCase();
      
      // I JSON-dataene så vi at knappen heter nøyaktig "Vis flere"
      if (text.includes("vis flere") || text === "vis flere") {
        var rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
          
          // Omgår React sine "Synthetic Events" ved å trykke direkte på det dypeste elementet
          var clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          });
          el.dispatchEvent(clickEvent);
          
          ctx.log("Trykket på React-knappen: 'Vis flere'");
          
          // Må vente lenge nok til at React gjør et nytt API-kall og tegner de nye sakene
          await sleep(4000); 
          return true;
        }
      }
    }
    return false;
  }

  async *run(ctx) {
    var getState = ctx.Lib.getState;
    var sleep = ctx.Lib.sleep;

    ctx.log("Venter 5 sekunder for at React skal tegne opp nettsiden...");
    // DETTE ER MAGIEN: Vi tvinger scriptet til å sove før det gjør NOE SOM HELST
    await sleep(5000); 

    await this.dismissCookieConsent(ctx);

    var maxAttempts = 60; 
    var lastHeight = document.documentElement.scrollHeight;
    var unchangedCount = 0;

    for (var i = 0; i < maxAttempts; i++) {
      var loadMoreClicked = await this.clickLoadMore(ctx);
      
      if (loadMoreClicked) {
        ctx.state.clicks++;
        unchangedCount = 0; 
        yield getState(ctx, "Utvidet listen via React", "clicks");
        continue; 
      }

      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(2000); 

      var newHeight = document.documentElement.scrollHeight;
      if (newHeight === lastHeight) {
        await sleep(2000);
        if (document.documentElement.scrollHeight === lastHeight) {
           ctx.log("Ingen flere knapper funnet. Overlater til crawleren å fange opp lenkene.");
           break; 
        }
      } else {
        unchangedCount = 0;
      }
      lastHeight = document.documentElement.scrollHeight;

      ctx.state.scrolls++;
      yield getState(ctx, "Scrollet for å sjekke om siden vokser", "scrolls");
    }
  }
}
