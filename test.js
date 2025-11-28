// --- Start Skript (Wrapper for Chrome Console) ---
(async function() {
    console.log("--- Bx Scroll and Click Initiert for Chrome ---");

    // Simulerer Browsertrix-miljøet (ctx) for Chrome-konsollen
    const ctx = {
        Lib: {
            sleep: (ms) => new Promise(r => setTimeout(r, ms)),
            // extractBrowserLinks krever ctx.Lib.addLink, men dette er ikke tilgjengelig i Chrome.
            // Vi stubber den ut for å unngå feil.
            addLink: (url) => { console.log(`[Bx Link Added] ${url}`); return Promise.resolve(); }
        },
        // Log-funksjon for Chrome-konsollen
        log: (data) => console.log(`[Bx Log] ${data.msg}`, data) 
    };

    // Klassedefinisjonen (Tilpasset for å kjøre i Chrome)
    class ScrollAndClick {
      static id = "Scroll and Click";
      static maxScrolls = 500;
      selectors = [
        "a",
        "button",
        "button.lc-load-more",
        "span[role=treeitem]",
        "button#load-more-posts",
        "#pagenation"
      ];
      triggerwords = [
        "se mere",
        "åbn",
        "flere kommentarer",
        "se flere",
        "indlæs flere nyheder",
        "hent flere",
        "vis flere"
      ].map(t => t.toLowerCase());

      static isMatch(url) {
        return true; 
      }

      static init() {
        return {};
      }

      async extractBrowserLinks(ctx) {
        const urls = new Set(Array.from(document.links, a => a.href).filter(Boolean));
        // Bruker den simulerte ctx.Lib.addLink
        await Promise.allSettled(Array.from(urls, url => ctx.Lib.addLink(url)));
      }

      static runInIframes = false;

    // ----------------------------------------------------
    // ROBUST CONSENT-FJERNER (Brukes FØR scrolling)
    // ----------------------------------------------------

      removeConsentOverlay(ctx) {
        try {
          // Fjern SourcePoint/consent iframes
          const consentIframes = document.querySelectorAll('iframe[src*="sp.api.no"], iframe[src*="sourcepoint"], iframe[src*="consent"]');
          let iframeCount = 0;
          consentIframes.forEach(iframe => {
            iframe.remove();
            iframeCount++;
          });
            
          // Fjern overlays (inkludert høy z-index og sp_message)
          const overlays = document.querySelectorAll('[id*="sp_message"], [class*="sp_message"], div[style*="z-index: 2147483647"]');
          let overlayCount = 0;
          overlays.forEach(el => {
            el.remove();
            overlayCount++;
          });
            
          // Gjenoppretter scrolling på body og html
          document.body.style.overflow = 'auto';
          document.body.style.position = 'static';
          document.documentElement.style.overflow = 'auto';
          document.documentElement.style.position = 'static';

          if (iframeCount > 0 || overlayCount > 0) {
            ctx.log({ 
              msg: `Consent: Fjernet ${iframeCount} iframes og ${overlayCount} overlays. Scrolling gjenopprettet.`, 
              level: "warning" 
            });
          }

        } catch (e) {
          ctx.log({ msg: `Consent: Feil under fjerning av overlay: ${e.message}`, level: "error" });
        }
      }

      /**
       * Tilpasset for Chrome: Erstatter Browsertrix sin awaitPageLoad
       */
      async _awaitPageLoad(ctx) {
        // Kjører consent-fjerning før hovedsløyfen
        this.removeConsentOverlay(ctx);
        // Venter litt etter opprydding
        await ctx.Lib.sleep(500); 
      }

    // ----------------------------------------------------
    // RUN-metoden (Hovedsløyfen)
    // ----------------------------------------------------

      async* run(ctx) {
        let click = 0;
        const DomElementsMinimumChange = 10;
        let consecutiveSmallChanges = 0;

        let lastCount = document.body.getElementsByTagName("*").length;
        let stableTime = 0;
        let iterations = 0;

        while (true) {
          if (++iterations > ScrollAndClick.maxScrolls) {
            ctx.log({ msg: "Max scrolls reached", iterations });
            break;
          }

          // scroll to bottom
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          // Bruker Promise for å simulere ctx.Lib.sleep
          await ctx.Lib.sleep(1000); 

          // click if matched
          const selectstring = this.selectors.join(",");
          const elems = document.querySelectorAll(selectstring);
          for (const elem of elems) {
            const txt = (elem.innerText || elem.textContent || "").toLowerCase().trim();
            if (this.triggerwords.some(w => w === txt)) {
              elem.click();
              click++;
            }
          }
          if (elems.length > 0) {
            ctx.log({ msg: "Clicked load more buttons", totalClicks: click, thisRound: elems.length });
          }

          // Bruker Promise for å simulere ctx.Lib.sleep
          await ctx.Lib.sleep(1000);
          await this.extractBrowserLinks(ctx);

          // detect DOM changes by element count delta
          const newCount = document.body.getElementsByTagName("*").length;
          const delta = newCount - lastCount;
          ctx.log({ msg: "DomElementsAfterScroll", newCount, delta });

          if (delta >= DomElementsMinimumChange) {
            consecutiveSmallChanges = 0;
            stableTime = 0;
          } else {
            consecutiveSmallChanges += 1;
            stableTime += 1000;
          }

          // update baseline for next iteration
          lastCount = newCount;

          // stop if 3 consecutive small changes
          if (consecutiveSmallChanges >= 3) {
            ctx.log({
              msg: "Ending due to consecutive small DOM changes",
              consecutiveSmallChanges,
              threshold: DomElementsMinimumChange
            });
            break;
          }

          // stop if nothing changes for 10s
          if (stableTime >= 10000) {
            ctx.log({ msg: "No significant changes for 10 seconds, stopping scroll" });
            break;
          }
        }
      }
    }
    
    // --- Kjører skriptet i Chrome-konsollen ---

    if (!ScrollAndClick.isMatch(window.location.href)) {
        console.log("URL matcher ikke ScrollAndClick. Avslutter.");
        return;
    }
    
    const behavior = new ScrollAndClick();
    
    // Utfører opprydding og venter
    await behavior._awaitPageLoad(ctx);

    // Kjører den asynkrone generatorfunksjonen
    const generator = behavior.run(ctx);
    let result = await generator.next();

    while (!result.done) {
        // I Browsertrix vil yield gi kontroll tilbake til kjernen, men her må vi bare fortsette
        if (result.value instanceof Promise) {
            await result.value; 
        }
        console.log(`[Bx State]`, result.value);
        result = await generator.next();
    }

    console.log("--- Bx Scroll and Click Fullført ---");
})();
