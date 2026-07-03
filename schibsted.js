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

    ctx.log("Venter i 3 sekunder på at samtykkeboks eventuelt dukker opp...");
    await sleep(3000);

    var clicked = false;

    // 1. Prøv å finne Sourcepoint CMP-knappen via standardklasse for "Godta alle"
    var acceptBtn = document.querySelector('button.sp_choice_type_11, a.sp_choice_type_11');
    if (acceptBtn) {
      acceptBtn.click();
      ctx.log("Klikket på 'Godta alle' via sp_choice_type_11.");
      clicked = true;
    }

    // 2. Hvis ikke funnet via klasse, søk etter tekst
    if (!clicked) {
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
    }

    if (clicked) {
      ctx.state.cookieBannerHandled = true;
      yield getState("Samtykkeboks håndtert.", "cookieBannerHandled");
      await sleep(2000); // Vent på at banneret lukkes og lagrer samtykke
    } else {
      ctx.log("Ingen samtykkeboks funnet eller håndtert i denne konteksten.");
    }

    // Sikre at scrolling låses opp i hovedvinduet hvis CMP-en av en eller annen grunn henger
    if (window.self === window.top) {
      document.body.style.setProperty('overflow', 'auto', 'important');
      document.body.style.setProperty('position', 'static', 'important');
      document.documentElement.style.setProperty('overflow', 'auto', 'important');
      document.documentElement.style.setProperty('position', 'static', 'important');
      document.body.classList.remove('sp-message-open');
      document.documentElement.classList.remove('sp-message-open');
    }

    yield getState("Behavior-script ferdig.");
  }
}
