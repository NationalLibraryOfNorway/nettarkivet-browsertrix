class CookieWipeBehavior
{
  static id = "CookieWipe: delete cookies only";

  static isMatch() {
    try { return /^https?:/.test(window.location.href); }
    catch { return false; }
  }

  static init() {
    return new CookieWipeBehavior();
  }

  static runInIframes = false;

  async awaitPageLoad() {
    await this.clearCookies();
  }

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
      const domains = this.parentDomains(host);  
      const paths = this.parentPaths(location.pathname); 

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

    const parts = (hostname || "").split(".").filter(Boolean);
    const out = [];
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(i).join(".");
      out.push(d, `.${d}`);
    }
    return Array.from(new Set(out));
  }

  parentPaths(pathname) {

    const out = ["/"];
    const parts = (pathname || "/").split("/").filter(Boolean);
    let acc = "";
    for (const p of parts) { acc += `/${p}`; out.push(acc); }
    return out;
  }
}
