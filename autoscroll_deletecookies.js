class CookieWipeBehavior
{
  // vises i loggene
  static id = "CookieWipe: delete cookies only";

  // begrens gjerne til dine domener om ønskelig
  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }

  // din Browsertrix-versjon krever init()
  static init() {
    return new CookieWipeBehavior();
  }

  // kjør kun i toppvindu
  static runInIframes = false;

  // valgfritt: slett før hoved-run
  async awaitPageLoad() {
    await this.clearCookies();
  }

  // hovedløype: gjør en ekstra runde sletting og avslutt
  async* run(ctx) {
    const makeState = (state, data) => {
      const payload = { state, data };
      if (ctx?.Lib?.getState) return ctx.Lib.getState(payload);
      if (ctx?.getState)      return ctx.getState(payload);
      return payload;
    };

    yield makeState("cookiewipe: start", { url: location.href });

    await this.clearCookies();

    yield makeState("cookiewipe: done", { url: location.href });
  }

  // ---------- bare COOKIES ----------
  async clearCookies() {
    try {
      const cookieStr = document.cookie || "";
      if (!cookieStr) return;

      const names = cookieStr
        .split(";")
        .map(s => s.split("=")[0].trim())
        .filter(Boolean);

      if (!names.length) return;

      const host = location.hostname;
      const domains = this.parentDomains(host);   // ["example.com", ".example.com", ...]
      const paths = this.parentPaths(location.pathname); // ["/", "/a", "/a/b", ...]

      const expire = "Thu, 01 Jan 1970 00:00:00 GMT";

      for (const name of names) {
        // Uten domain (gjelder nåværende host)
        for (const p of paths) {
          document.cookie = `${name}=; expires=${expire}; path=${p}`;
          document.cookie = `${name}=; Max-Age=0; path=${p}`;
          // sameSite-varianter kan hjelpe enkelte sett
          document.cookie = `${name}=; expires=${expire}; path=${p}; SameSite=Lax`;
        }

        // Med foreldredomener
        for (const d of domains) {
          for (const p of paths) {
            document.cookie = `${name}=; expires=${expire}; domain=${d}; path=${p}`;
            document.cookie = `${name}=; Max-Age=0; domain=${d}; path=${p}`;
            document.cookie = `${name}=; expires=${expire}; domain=${d}; path=${p}; SameSite=Lax`;
            // secure-variant (virker kun på https:)
            if (location.protocol === "https:") {
              document.cookie = `${name}=; expires=${expire}; domain=${d}; path=${p}; Secure; SameSite=None`;
              document.cookie = `${name}=; Max-Age=0; domain=${d}; path=${p}; Secure; SameSite=None`;
            }
          }
        }
      }
    } catch {
      // ignorer
    }
  }

  parentDomains(hostname) {
    // "a.b.example.com" -> ["b.example.com", ".b.example.com", "example.com", ".example.com"]
    const parts = (hostname || "").split(".").filter(Boolean);
    const out = [];
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(i).join(".");
      out.push(d, `.${d}`);
    }
    return Array.from(new Set(out));
  }

  parentPaths(pathname) {
    // "/x/y/z" -> ["/", "/x", "/x/y", "/x/y/z"]
    const out = ["/"];
    const parts = (pathname || "/").split("/").filter(Boolean);
    let acc = "";
    for (const p of parts) { acc += `/${p}`; out.push(acc); }
    return out;
  }
}
