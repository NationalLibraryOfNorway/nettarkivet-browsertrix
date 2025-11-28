// --- Start Skript (Wrapper for Chrome Console) ---
(async function() {
    console.log("--- Bx Scroll and Click Initiert for Chrome Console ---");

    // Simulerer Browsertrix-miljøet (ctx) for Chrome-konsollen
    const ctx = {
        Lib: {
            sleep: (ms) => new Promise(r => setTimeout(r, ms)),
            addLink: (url) => { console.log(`[Bx Link Added] ${url}`); return Promise.resolve(); },
            // Lager en tilnærmet getState for logging
            getState: (payload) => { return payload; } 
        },
        // Log-funksjon for Chrome-konsollen
        log: (data) => console.log(`[Bx Log] ${data.msg}`, data) 
    };

    // Definerer hjelpefunksjon for å unngå gjentakelse
    const docHeight = () =>
      Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );


    // Klassedefinisjonen
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

        async extractBrowserLinks(ctx) {
            const urls = new Set(Array.from(document.links, a => a.href).filter(Boolean));
            await Promise.allSettled(Array.from(urls, url => ctx.Lib.addLink(url)));
        }

        static runInIframes = false;

    // ----------------------------------------------------
    // CONSENT OG SCROLL FIX METODER
    // ----------------------------------------------------

        removeConsentOverlay(ctx) {
            try {
                const consentIframes = document.querySelectorAll('iframe[src*="sp.api.no"], iframe[src*="sourcepoint"], iframe[src*="consent"]');
                let iframeCount = 0;
                consentIframes.forEach(iframe => { iframe.remove(); iframeCount++; });
                
                const overlays = document.querySelectorAll('[id*="sp_message"], [class*="sp_message"], div[style*="z-index: 2147483647"]');
                let overlayCount = 0;
                overlays.forEach(el => { el.remove(); overlayCount++; });
                
                document.body.style.overflow = 'auto';
                document.body.style.position = 'static';
                document.documentElement.style.overflow = 'auto';
                document.documentElement.style.position = 'static';

                if (iframeCount > 0 || overlayCount > 0) {
                    ctx.log({ msg: `Consent: Fjernet ${iframeCount} iframes og ${overlayCount} overlays. Scrolling gjenopprettet.`, level: "warning" });
                }
            } catch (e) {
                ctx.log({ msg: `Consent: Feil under fjerning av overlay: ${e.message}`, level: "error" });
            }
        }
        
        fixScroll(ctx) {
            try {
                document.body.removeAttribute('style');
                document.documentElement.removeAttribute('style');
                
                document.body.style.setProperty('overflow', 'auto', 'important');
                document.body.style.setProperty('position', 'static', 'important');
                document.body.style.setProperty('height', 'auto', 'important');
                document.body.style.setProperty('width', 'auto', 'important');
                document.documentElement.style.setProperty('overflow', 'auto', 'important');
                
                if (!document.getElementById('force-scroll-fix')) {
                    const style = document.createElement('style');
                    style.id = 'force-scroll-fix';
                    style.textContent = `
                        body, html {
                            overflow: auto !important;
                            position: static !important;
                            height: auto !important;
                            width: auto !important;
                        }
                    `;
                    document.head.appendChild(style);
                }
                ctx.log({ msg: "Scroll fix påsatt.", level: "debug" });
            } catch (e) {
                ctx.log({ msg: `Scroll fix error: ${e.message}`, level: "debug" });
            }
        }

        /**
        * Tilpasset for Chrome: Erstatter Browsertrix sin awaitPageLoad
        */
        async _awaitPageLoad(ctx) {
            this.removeConsentOverlay(ctx);
            this.fixScroll(ctx);
            await ctx.Lib.sleep(1000); 
        }

    // ----------------------------------------------------
    // RUN-metoden (Hovedsløyfen)
    // ----------------------------------------------------

        async* run(ctx) {
            const cfg = {
                waitMs: 900,
                stableLimit: 10,
                bottomHoldExtra: 1500,
                growthEps: 8
            };
            
            let click = 0;
            let lastHeight = docHeight();
            let stableRounds = 0;
            let pulses = 0;

            ctx.log({ msg: "Starting combined Scroll and Click loop" });

            while (stableRounds < cfg.stableLimit && pulses < 100) {
                
                // 1. SCROLL
                const targetY = docHeight() - (window.innerHeight || 800);
                window.scrollTo(0, targetY > 0 ? targetY : 0);
                // Bruker ctx.Lib.getState for å simulere yield i Chrome
                yield ctx.Lib.getState({ state: "autoscroll: pulse", data: { pulses, stableRounds } });
                pulses++;

                await ctx.Lib.sleep(cfg.waitMs); 
                
                // 2. KLIKK LOGIKK
                const selectstring = this.selectors.join(",");
                const elems = document.querySelectorAll(selectstring);
                let clicksThisRound = 0;
                
                for (const elem of elems) {
                    const txt = (elem.innerText || elem.textContent || "").toLowerCase().trim();
                    if (this.triggerwords.some(w => w === txt)) {
                        elem.click();
                        await ctx.Lib.sleep(200); 
                        click++;
                        clicksThisRound++;
                    }
                }
                if (clicksThisRound > 0) {
                    ctx.log({ msg: "Clicked load more buttons", totalClicks: click, thisRound: clicksThisRound });
                }
                
                // 3. Ekstra venting hvis vi er på bunnen
                const atBottom = (window.innerHeight + window.scrollY) >= (docHeight() - 2);
                if (atBottom) {
                    await ctx.Lib.sleep(cfg.bottomHoldExtra);
                }
                
                // 4. SJEKK STABILITET
                const h = docHeight();
                const grew = (h - lastHeight) > cfg.growthEps;
                
                if (grew) stableRounds = 0;
                else stableRounds++;
                
                lastHeight = h;
                
                await this.extractBrowserLinks(ctx);

                if (pulses >= 100) {
                    ctx.log({ msg: `Max pulses (${pulses}) reached. Stopping scroll.`, level: "warning" });
                    break;
                }
            }
            
            // Ruller til bunnen ved fullføring
            try {
                window.scrollTo(0, docHeight() - (window.innerHeight || 800));
                yield ctx.Lib.getState({ 
                    state: "autoscroll: finished", 
                    data: { 
                        pulses, 
                        stableRounds, 
                        totalClicks: click, 
                        msg: "Scrolling fullført. Siden er stabil."
                    } 
                });
            } catch {}
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
        // I Chrome må vi manuelt "await" den returnerte verdien hvis den er en Promise (ctx.Lib.sleep)
        if (result.value instanceof Promise) {
            await result.value; 
        }
        console.log(`[Bx State]`, result.value);
        result = await generator.next();
    }

    console.log("--- Bx Scroll and Click Fullført ---");
})();
// --- Slutt Skript ---
