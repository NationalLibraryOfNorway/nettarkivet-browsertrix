class VimeoArchiveBehavior {
  static id = "vimeo-archive-behavior";
  
  // Selektorer for "Last flere"-knapper på Vimeo
  selectors = [
    "button", "a.load-more", "button[class*='load-more']", 
    ".pagination", "button[aria-label*='Load more']"
  ];

  triggerwords = [
    "load more", "last flere", "show more", "se flere", "+"
  ].map(t => t.toLowerCase());

  static isMatch(url) {
    // Kjører på alle Vimeo-sider
    return url.includes("vimeo.com");
  }

  static init() {
    return new VimeoArchiveBehavior();
  }

  // Vimeo-spilleren ligger ofte i en iframe, men Browsertrix kjører 
  // vanligvis behaviors i hovedvinduet. Vi setter denne til true 
  // for å sikre at vi treffer spilleren uansett struktur.
  static runInIframes = true;

  // ----------------------------------------------------
  // CLEANUP OG FORBEREDELSER
  // ----------------------------------------------------
  removeOverlays() {
    try {
      // Fjern cookie-bannere og login-vegger som kan blokkere klikk
      const overlays = document.querySelectorAll(
        '[id*="consent"], [class*="consent"], .enforce_login, [id*="signup-lightbox"]'
      );
      overlays.forEach(el => el.remove());
    } catch (e) {
      console.debug('Overlay removal error:', e);
    }
  }

  // ----------------------------------------------------
  // VIDEO-AVSPILLING (For enkeltsider)
  // ----------------------------------------------------
  async playVideo(ctx) {
    ctx.log({ msg: "Forsøker å starte videoavspilling..." });
    
    // 1. Vent på at Next.js "Loading View" er borte
    let attempts = 0;
    while (attempts < 10) {
      const loading = document.querySelector('[data-vh-view*="loading"]');
      if (!loading) break;
      await ctx.Lib.sleep(1000);
      attempts++;
    }

    // 2. Finn spill-knappen
    const playSelectors = [
      '[aria-label="Play"]',
      '.vp-play',
      '.play',
      '.vp-preview',
      '.css-1ts7mxw' // Fra kildekoden din
    ];

    for (const selector of playSelectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null) {
        ctx.log({ msg: `Fant spill-knapp via: ${selector}` });
        btn.click();
        await ctx.Lib.sleep(2000);
      }
    }

    // 3. Tving HTML5-video til å starte hvis den er lastet
    const videoTag = document.querySelector('video');
    if (videoTag) {
      try {
        await videoTag.play();
        ctx.log({ msg: "Video startet via HTML5-tag" });
      } catch (e) {
        ctx.log({ msg: "Kunne ikke starte video tag direkte (browser-restriksjon)" });
      }
    }
  }

  // ----------------------------------------------------
  // HOVEDSLØYFE
  // ----------------------------------------------------
  async* run(ctx) {
    this.removeOverlays();
    const url = window.location.href;

    // Sjekk om vi er på en spesifikk video (vimeo.com/TALL)
    const isVideoPage = /\/\d+(\/|$)/.test(url);

    if (isVideoPage) {
      ctx.log({ msg: "Detektert videoside, starter avspilling" });
      await this.playVideo(ctx);
      
      // La videoen spille i 30 sekunder for å bufre nok segmenter til WARC
      ctx.log({ msg: "Buffer video i 30 sekunder..." });
      await ctx.Lib.sleep(30000);
      
      yield ctx.Lib.getState({ state: "playing", data: { url } });
    } 
    else {
      // Vi er på en liste-side (som /videos)
      ctx.log({ msg: "Detektert listeside, starter utrulling" });
      
      const docHeight = () => document.documentElement.scrollHeight;
      let lastHeight = docHeight();
      let stableRounds = 0;
      let pulses = 0;

      while (stableRounds < 5 && pulses < 50) {
        window.scrollTo(0, docHeight());
        pulses++;
        await ctx.Lib.sleep(2000);

        // Se etter "Load more"-knapper
        const buttons = document.querySelectorAll(this.selectors.join(","));
        let clicked = false;

        for (const btn of buttons) {
          const txt = (btn.innerText || btn.textContent || "").toLowerCase().trim();
          if (this.triggerwords.some(w => txt.includes(w)) || txt === "+") {
            btn.scrollIntoView({ block: "center" });
            btn.click();
            ctx.log({ msg: `Klikket last flere: "${txt}"` });
            clicked = true;
            await ctx.Lib.sleep(3000);
          }
        }

        const currentHeight = docHeight();
        if (!clicked && Math.abs(currentHeight - lastHeight) < 50) {
          stableRounds++;
        } else {
          stableRounds = 0;
        }
        lastHeight = currentHeight;
        
        yield ctx.Lib.getState({ state: "expanding", data: { pulses, height: currentHeight } });
      }
    }

    ctx.log({ msg: "Vimeo behavior ferdig" });
    yield ctx.Lib.getState({ state: "finished" });
  }
}
