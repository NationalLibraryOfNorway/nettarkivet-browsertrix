class SchibstedBehavior {
  static id = "SchibstedBehavior";

  static isMatch() {
    return true;
  }

  static runInIframe = true;
  static runInIframes = true;

  static init() {
    return { state: { cookieBannerHandled: false } };
  }

  async *run(ctx) {
    var sleep = async function(ms) {
      var fn = (ctx.Lib && ctx.Lib.sleep) || ctx.sleep;
      if (typeof fn === "function") {
        await fn(ms);
      } else {
        await new Promise(function(r) { setTimeout(r, ms); });
      }
    };

    var getState = function(msg, key) {
      var fn = (ctx.Lib && ctx.Lib.getState) || ctx.getState;
      if (typeof fn === "function") {
        if (ctx.Lib && ctx.Lib.getState === fn) {
          return fn(ctx, msg, key);
        } else {
          return fn.call(ctx, msg, key);
        }
      }
      return { state: key, msg: msg };
    };

    var isIframe = window.self !== window.top;

    if (isIframe) {
      ctx.log("Kjører inni iframe: " + window.location.href);
      
      var clicked = false;
      var maxAttempts = 20; // 10 sekunder maks
      
      for (var attempt = 0; attempt < maxAttempts; attempt++) {
        // 1. Prøv å finne Sourcepoint CMP-knappen via standardklasse for "Godta alle"
        var acceptBtn = document.querySelector('button.sp_choice_type_11, a.sp_choice_type_11');
        if (acceptBtn) {
          acceptBtn.click();
          ctx.log("Klikket på 'Godta alle' via sp_choice_type_11.");
          clicked = true;
          break;
        }

        // 2. Søk etter tekst i knapper
        var buttons = document.querySelectorAll("button, a, [role='button']");
        for (var i = 0; i < buttons.length; i++) {
          var text = (buttons[i].innerText || buttons[i].textContent || "").trim().toLowerCase();
          if (text.includes("godta alle") || text.includes("tillat alle") || text.includes("accept all") || text === "godta" || text === "tillat") {
            buttons[i].click();
            ctx.log("Klikket på '" + text + "'-knappen via tekstsøk.");
            clicked = true;
            break;
          }
        }

        if (clicked) {
          break;
        }

        await sleep(500);
      }

      if (clicked) {
        ctx.state.cookieBannerHandled = true;
        yield getState("Samtykkeboks håndtert inni iframe.", "cookieBannerHandled");
      }
    } else {
      ctx.log("Kjører i hovedvinduet. Venter på at samtykkeboks/iframe skal lukkes...");
      
      var hasCmp = false;
      var maxAttempts = 20; // 10 sekunder maks
      
      for (var attempt = 0; attempt < maxAttempts; attempt++) {
        var iframes = document.querySelectorAll('iframe');
        var foundCmp = false;
        for (var i = 0; i < iframes.length; i++) {
          var src = iframes[i].src || '';
          var id = iframes[i].id || '';
          var name = iframes[i].name || '';
          if (src.includes('cmp') || id.includes('sp_message') || name.includes('sp_message')) {
            foundCmp = true;
            break;
          }
        }
        
        if (!foundCmp) {
          break;
        }
        
        hasCmp = true;
        await sleep(500);
      }

      if (hasCmp) {
        ctx.log("Samtykkeboks lukket eller ikke lenger tilstede.");
      } else {
        ctx.log("Ingen samtykkeboks oppdaget.");
      }

      // Lås opp scrolling uansett for å være helt sikker
      document.body.style.setProperty('overflow', 'auto', 'important');
      document.body.style.setProperty('position', 'static', 'important');
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
      document.documentElement.style.setProperty('position', 'static', 'important');
      document.body.classList.remove('sp-message-open');
      document.documentElement.classList.remove('sp-message-open');

      // Vent 2 sekunder etter samtykkeboksen er fjernet/håndtert
      ctx.log("Venter i 2 sekunder før scrolling starter...");
      await sleep(2000);

      // Scroll nedover så langt som det lar seg gjøre
      ctx.log("Starter rulling til bunnen av siden...");
      var scrollMaxAttempts = 100;
      var lastHeight = document.documentElement.scrollHeight;
      var unchangedCount = 0;

      for (var scrollAttempts = 0; scrollAttempts < scrollMaxAttempts; scrollAttempts++) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(1500); // Vent på at nytt innhold lastes

        var newHeight = document.documentElement.scrollHeight;
        if (newHeight === lastHeight) {
          unchangedCount++;
          if (unchangedCount >= 3) {
            ctx.log("Rulling fullført. Nettsidens høyde endrer seg ikke mer.");
            break;
          }
        } else {
          unchangedCount = 0;
        }
        lastHeight = newHeight;
      }
    }

    yield getState("Behavior-script ferdig.");
  }
}
