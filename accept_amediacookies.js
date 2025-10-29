class UniversalConsentBehavior {
  static id = "Universal: Pre-accept and click consent";
  static isMatch() {
    try { return /^https?:/.test(window.location.href); } catch { return false; }
  }
  static get runInIframes() { return true; }

  constructor() {
    this._stop = false;
    this._attempts = 0;
    this._maxAttempts = 80; // ~16s med 200ms intervall
  }

  async *run(ctx) {
    const inIframe = window !== window.top;

    yield { state: "consent:init", msg: inIframe ? "Iframe" : "Top" };

    // Lett hint – ikke forsøk å smi leverandør-cookies
    this.setLightConsentHints();

    // Start mutasjons-observer (fanger sent lastede bannere)
    const disconnect = this.observeMutations(() => {
      this.tryClickEverywhereOnce();
    });

    // Poll i en begrenset periode
    while (!this._stop && this._attempts < this._maxAttempts) {
      this._attempts++;

      const clicked = await this.tryClickEverywhereOnce();
      if (clicked) {
        yield { state: "consent:clicked", msg: "Fant og klikket knapp" };
        break;
      }

      await this.sleep(200);
    }

    // En siste runde etter liten pause (noen CMP’er åpner trinn 2)
    await this.sleep(400);
    await this.tryClickEverywhereOnce();

    disconnect?.();
    yield { state: "consent:done", msg: "Ferdig" };
  }

  async tryClickEverywhereOnce() {
    // 1) Hoveddokument
    if (this.findAndClick(document)) return true;

    // 2) Same-origin iframes
    const iframes = Array.from(document.querySelectorAll("iframe"));
    for (const iframe of iframes) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && this.findAndClick(doc)) return true;
      } catch { /* cross-origin – ignorer */ }
    }

    return false;
  }

  findAndClick(doc) {
    // Søk i både vanlige noder og Shadow DOM
    const candidates = this.queryAllDeep(
      [
        // Generiske “godta”-knapper
        "button",
        "[role='button']",
        "a[role='button']",
        "div[role='button']",
        "a",
        "div[onclick]",
        "span[onclick]",

        // Vanlige CMP-selektorer (bredt men ufarlig)
        "button[aria-label*='accept' i]",
        "button[aria-label*='godta' i]",
        "[title*='accept' i]",
        "[title*='godta' i]",
        "[class*='accept-all' i]",
        "[class*='acceptAll']",
        "[class*='accept_all']",
        "[data-choice='11']",

        // OneTrust
        "#onetrust-accept-btn-handler",
        "button#onetrust-accept-btn-handler",

        // Cookiebot
        "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
        "#CybotCookiebotDialogBodyButtonAccept",

        // Quantcast / SourcePoint (vanligvis “last child”/primærknapp)
        ".sp_message .sp_choice_type_11",
        ".sp_message button:last-child",
        ".message-component button:last-child",

        // Didomi
        "button[id*='accept-all' i]",
        "button[data-action*='accept' i]"
      ],
      doc
    );

    const patterns = [
      /godta\s+alle/i, /godta\s+alt/i, /aksepter\s+alle/i, /tillat\s+alle/i,
      /accept\s+all/i, /agree\s+to\s+all/i, /allow\s+all/i,
      /accepter\s+alle/i, /consent\s+to\s+all/i
    ];

    for (const el of candidates) {
      if (!this.isVisible(el)) continue;

      const text = this.readableText(el);
      const title = el.getAttribute?.("title") || "";
      const aria = el.getAttribute?.("aria-label") || "";
      const dataText = el.getAttribute?.("data-text") || "";
      const hay = `${text} ${title} ${aria} ${dataText}`.trim();

      // Treff enten via tekstmønster eller via “kjente” selektorer over
      if (
        hay.length > 0 &&
        (patterns.some(p => p.test(hay)) || this.looksLikePrimaryAccept(el))
      ) {
        // Prøv ekte klikksekvens
        try {
          el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
          el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          el.click?.();
          el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        } catch {
          try { el.click?.(); } catch {}
        }
        return true;
      }
    }
    return false;
  }

  looksLikePrimaryAccept(el) {
    const cls = (el.className || "").toString();
    // Enkle heuristikker for “primærknapp”
    return /\b(primary|confirm|allow|accept|positive)\b/i.test(cls);
  }

  isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const r = el.getBoundingClientRect();
    const styles = window.getComputedStyle?.(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      styles &&
      styles.visibility !== "hidden" &&
      styles.display !== "none" &&
      styles.pointerEvents !== "none"
    );
  }

  // Dyp query som også går inn i Shadow DOM
  queryAllDeep(selectors, rootDoc) {
    const out = [];
    const walker = (root) => {
      if (!root) return;
      try {
        for (const sel of selectors) {
          root.querySelectorAll?.(sel)?.forEach((n) => out.push(n));
        }
      } catch { /* querySelectorAll kan kaste på rare roots */ }

      // Gå gjennom alle elementer og åpne shadow roots
      const tree = root.querySelectorAll ? root.querySelectorAll("*") : [];
      for (const el of tree) {
        if (el.shadowRoot) walker(el.shadowRoot);
      }
    };
    walker(rootDoc);
    return out;
  }

  observeMutations(onChange) {
    try {
      const obs = new MutationObserver(() => onChange?.());
      obs.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
      return () => { try { obs.disconnect(); } catch {} };
    } catch {
      return () => {};
    }
  }

  setLightConsentHints() {
    try {
      // Kun ufarlige hints – noen CMP’er plukker opp dette
      localStorage.setItem("cookieConsent", "accepted");
      localStorage.setItem("gdprConsent", "true");
      localStorage.setItem("_sp_v1_consent", "1");
    } catch {}
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}
