class SchibstedBehavior {
  static id = "SchibstedBehavior";

  static isMatch() {
    return true;
  }

  static init() {
    return { state: { cookieBannerRemoved: false } };
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

    ctx.log("Starter Schibsted behavior script... Venter i 2 sekunder.");
    await sleep(2000);

    // 1. Finn og fjern CMP-iframe(s)
    var removed = false;
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
      var src = iframes[i].src || '';
      var id = iframes[i].id || '';
      var name = iframes[i].name || '';
      if (src.includes('cmp') || id.includes('sp_message') || name.includes('sp_message')) {
        iframes[i].remove();
        ctx.log("Fjernet Schibsted CMP iframe: " + src);
        removed = true;
      }
    }

    // 2. Gjenopprett scrolling og overflow på html og body
    document.body.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('position', 'static', 'important');
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.documentElement.style.setProperty('position', 'static', 'important');

    // Fjern CSS-klasser lagt til av CMP som blokkerer rulling
    document.body.classList.remove('sp-message-open');
    document.documentElement.classList.remove('sp-message-open');

    if (removed) {
      ctx.state.cookieBannerRemoved = true;
      yield getState("Fjernet cookiebox og gjenopprettet scrolling.", "cookieBannerRemoved");
    } else {
      ctx.log("Fant ingen Schibsted cookiebox.");
    }

    yield getState("Behavior-script ferdig.");
  }
}
