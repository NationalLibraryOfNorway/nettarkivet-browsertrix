// ... (resten av koden er uendret)

  async* run(ctx) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload; 
    };

    // --------------------------
    // 📌 SAKTE, SMOOTH SCROLLING
    // --------------------------
    const cfg = {
      waitMs: 250,           // scroll hvert 250 ms
      scrollStep: 150,       // scroll 150px ned per puls
      stableLimit: 10,
      bottomHoldExtra: 1500,
      growthEps: 8
    };
    // --------------------------

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;
    
    while (stableRounds < cfg.stableLimit) {
      // 👇 Smooth incremental scroll:
      window.scrollBy(0, cfg.scrollStep);

      yield makeState("autoscroll: pulse", { pulses });
      pulses++;

      await sleep(cfg.waitMs);

      const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
      if (atBottom) {
        await sleep(cfg.bottomHoldExtra);
      }

      const h = docHeight();
      const grew = (h - lastHeight) > cfg.growthEps;
      if (grew) stableRounds = 0;
      else      stableRounds++;
      lastHeight = h;
    }

    yield makeState("autoscroll: finished", { pulses, stableRounds });
  }
