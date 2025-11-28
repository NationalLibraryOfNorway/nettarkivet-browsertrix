class ScrollAndClick {
  static id = "Scroll and Click";
  static maxScrolls = 500;

  selectors = [
    "a", "button", "button.lc-load-more", "span[role=treeitem]",
    "button#load-more-posts", "#pagenation"
  ];

  triggerwords = [
    "se mere", "åbn", "flere kommentarer", "se flere",
    "indlæs flere nyheder", "hent flere", "vis flere"
  ].map(t => t.toLowerCase());

  static isMatch(url) {
    return true;
  }

  static init() {
    return {};
  }

  // NY OG ANBEFALT METODE FOR Å LEGGE URL I KØEN
  queueUrl(url, ctx) {
    // Normaliser URL (fjerner #hash hvis du vil)
    const cleanUrl = url.split("#")[0];

    // Send melding til Browsertrix-crawlerens kjerne
    window.postMessage({
      type: "ADD_SEED",
      url: cleanUrl,
      // Valgfritt: begrens dybden fra denne lenken (1 = kun selve siden)
      depth: 1,
      // Valgfritt: begrens til samme domene som nåværende side
      limitToScope: true
    }, "*");

    ctx.log({
      msg: "URL lagt i køen via postMessage (ADD_SEED)",
      url: cleanUrl,
      level: "info"
    });
  }

  async extractAndQueueLinks(ctx) {
    const currentOrigin = location.origin;

    // Henter alle <a href=""> på siden
    const allLinks = Array.from(document.querySelectorAll("a[href]"))
      .map(a => a.href)
      .filter(href => href && href.length > 0);

    const uniqueLinks = [...new Set(allLinks)];

    let queuedCount = 0;
    let externalCount = 0;

    for (const url of uniqueLinks) {
      // Hopp over mailto:, tel:, javascript: osv.
      if (!url.startsWith("http")) {
        continue;
      }

      // Kun interne lenker (same origin) – du kan endre til same domain hvis du vil ha subdomener også
      if (url.startsWith(currentOrigin)) {
        this.queueUrl(url, ctx);
        queuedCount++;
      } else {
        externalCount++;
        ctx.log({ msg: "Ekstern lenke hoppet over", url, level: "debug" });
      }
    }

    ctx.log({
      msg: `Lenke-kø: ${queuedCount} interne lenker lagt i køen, ${externalCount} eksterne ignorert`,
      level: "info"
    });
  }

  // ----------------------------------------------------
  // CONSENT OG SCROLL FIX (uendret)
  // ----------------------------------------------------
  removeConsentOverlay(ctx) {
    // ... (din eksisterende kode – beholdes uendret)
    }

  fixScroll(ctx) {
    // ... (din eksisterende kode – beholdes uendret)
  }

  async awaitPageLoad(ctx) {
    this.removeConsentOverlay(ctx);
    this.fixScroll(ctx);
    await ctx.Lib.sleep(1000);
  }

  // ----------------------------------------------------
  // HOVEDSLØYFE – nå med skikkelig kø-legging
  // ----------------------------------------------------
  async* run(ctx) {
    await this.awaitPageLoad(ctx);

    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );

    const cfg = {
      waitMs: 900,
      stableLimit: 12,
      bottomHoldExtra: 1500,
      growthEps: 10
    };

    let click = 0;
    let lastHeight = docHeight();
    let stableRounds = 0;
    let pulses = 0;

    ctx.log({ msg: "Starter Scroll & Click + Queue behavior" });

    while (stableRounds < cfg.stableLimit && pulses < 150) {
      // 1. Scroll til nesten bunnen
      const targetY = docHeight() - (window.innerHeight || 800);
      window.scrollTo(0, targetY > 0 ? targetY : 0);

      yield ctx.Lib.getState({ state: "autoscroll", data: { pulses, stableRounds } });
      pulses++;
      await ctx.Lib.sleep(cfg.waitMs);

      // 2. Klikk på "vis flere"-knapper
      const elems = document.querySelectorAll(this.selectors.join(","));
      let clicksThisRound = 0;

      for (const elem of elems) {
        const txt = (elem.innerText || elem.textContent || "").toLowerCase().trim();
        if (this.triggerwords.some(w => txt.includes(w))) {  // includes er ofte bedre enn ===
          elem.scrollIntoView({ block: "center" });
          elem.click();
          clicksThisRound++;
          click++;
          await ctx.Lib.sleep(300);
        }
      }

      if (clicksThisRound > 0) {
        ctx.log({ msg: `Klikket ${clicksThisRound} "vis flere"-knapper (totalt ${click})` });
      }

      // 3. Legg alle nye interne lenker i køen (kjøres hver runde)
      await this.extractAndQueueLinks(ctx);

      // 4. Sjekk om siden har sluttet å vokse
      const h = docHeight();
      if (h - lastHeight > cfg.growthEps) {
        stableRounds = 0;
        lastHeight = h;
      } else {
        stableRounds++;
      }

      // Ekstra ventetid når vi er på bunnen
      if ((window.innerHeight + window.scrollY) >= (docHeight() - 10)) {
        await ctx.Lib.sleep(cfg.bottomHoldExtra);
      }
    }

    // Avslutt – en siste runde med kø-legging
    await this.extractAndQueueLinks(ctx);

    window.scrollTo(0, docHeight());

    yield ctx.Lib.getState({
      state: "finished",
      data: {
        msg: "Scroll & Click + Queue ferdig",
        totalClicks: click,
        totalPulses: pulses
      }
    });
  }
}

// Eksporter for Browsertrix
module.exports = ScrollAndClick;
