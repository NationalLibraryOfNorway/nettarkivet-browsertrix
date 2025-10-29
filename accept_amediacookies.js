class CookieSetAndRefreshBehavior
{
  static id = "CookieSetAndRefresh: UUID + Lax";

  // Begrens gjerne til ett domene, f.eks. blv.no:
  // static isMatch(){ return /(^|\.)blv\.no$/.test(location.hostname); }
  static isMatch() {
    try { return /^https?:/.test(location.href); } catch { return false; }
  }

  static init() { return new CookieSetAndRefreshBehavior(); }

  static runInIframes = false;

  async awaitPageLoad() {
    // lite pusterom for å sikre at siden er “idle”
    await new Promise(r => setTimeout(r, 200));
  }

  async* run(ctx) {
    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload;
    };

    // ---------------------- KONFIGURASJON ----------------------
    // Overstyr om du vil tvinge et spesifikt domain (f.eks. ".blv.no"):
    const domainOverride = null; // sett til ".blv.no" eller "www.blv.no" ved behov

    // Hvor lenge skal cookies leve?
    const daysDefault = 365;

    // Generér verdier
    const uuid = this.uuidv4();
    const nowIso = new Date().toISOString();

    // Cookies du vil sette (SameSite=Lax på alle som ønsket)
    const cookies = [
      {
        name: "consentUUID",
        value: uuid,
        path: "/",
        domain: domainOverride, // hvis null -> settes uten Domain (host-only)
        days: daysDefault,
        sameSite: "Lax",
        secure: false           // Lax krever ikke Secure; sett true hvis du vil
      },
      {
        name: "consentDate",
        value: nowIso,
        path: "/",
        domain: domainOverride,
        days: daysDefault,
        sameSite: "Lax",
        secure: false
      }
    ];
    // -----------------------------------------------------------

    const ONCE_KEY = "__bx_cookie_refresh_done";

    try {
      if (sessionStorage.getItem(ONCE_KEY) === "1") {
        yield makeState("cookie: already refreshed", { url: location.href });
        return;
      }
    } catch {}

    // Sett cookies
    let setCount = 0;
    for (const c of cookies) {
      try {
        const parts = [];
        parts.push(`${c.name}=${encodeURIComponent(String(c.value ?? ""))}`);

        if (typeof c.days === "number") {
          const exp = new Date(Date.now() + c.days * 864e5).toUTCString();
          parts.push(`Expires=${exp}`);
          parts.push(`Max-Age=${Math.floor(c.days * 86400)}`);
        }

        parts.push(`Path=${c.path || "/"}`);

        // Domain: bare legg til hvis du eksplisitt vil – ellers blir det host-only
        if (c.domain) parts.push(`Domain=${c.domain}`);

        // SameSite = Lax (som ønsket)
        parts.push(`SameSite=${c.sameSite || "Lax"}`);

        // Secure: valgfritt for Lax; aktiver hvis du vil og siden er https
        if (c.secure && location.protocol === "https:") parts.push("Secure");

        document.cookie = parts.join("; ");
        setCount++;
      } catch {}
    }

    yield makeState("cookie: set", { count: setCount, url: location.href, uuid });

    try { sessionStorage.setItem(ONCE_KEY, "1"); } catch {}

    // Gjør én refresh slik at nye cookies blir med i neste request
    try {
      location.reload();
      setTimeout(() => { location.replace(location.href); }, 1500);
    } catch {}
  }

  // RFC4122 v4 – random-basert UUID
  uuidv4() {
    // Bruk crypto hvis tilgjengelig
    if (crypto && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // Per RFC: set versjon og variant
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
      return (
        hex.slice(0,8) + "-" +
        hex.slice(8,12) + "-" +
        hex.slice(12,16) + "-" +
        hex.slice(16,20) + "-" +
        hex.slice(20)
      );
    }
    // Fallback (ikke kryptografisk)
    const rnd = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
    const a = rnd(), b = rnd(), c = rnd(), d = rnd();
    return `${a.slice(0,8)}-${b.slice(0,4)}-4${b.slice(5,8)}-${(8 + Math.random()*4|0).toString(16)}${c.slice(1,3)}-${c.slice(3)}${d}`;
  }
}
