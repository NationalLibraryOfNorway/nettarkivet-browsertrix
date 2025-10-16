class AutoScrollBehavior
{
  static id = "AutoScroll: simple infinite scroll";

  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }

  static init() {
    return new AutoScrollBehavior();
  }

  static runInIframes = false;

  async awaitPageLoad() {
    await new Promise(r => setTimeout(r, 500));
  }

  async* run(ctx) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload; 
    };

    const cfg = {
      waitMs: 900,
      stableLimit: 10,
      bottomHoldExtra: 1500,
      growthEps: 8
    };

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );

    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;

    while (stableRounds < cfg.stableLimit) {
      const targetY = docHeight() - (window.innerHeight || 800);
      window.scrollTo(0, targetY > 0 ? targetY : 0);

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
      else      stableRounds++;

      lastHeight = h;
    }

    try {
      window.scrollTo(0, docHeight() - (window.innerHeight || 800));
      yield makeState("autoscroll: finished", { pulses, stableRounds });
    } catch {}
  }
}
