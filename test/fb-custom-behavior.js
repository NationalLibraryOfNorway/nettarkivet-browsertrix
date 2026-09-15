class FacebookArchiveBehavior {
  static get id() {
    return "Facebook";
  }

  static isMatch() {
    return window.location.hostname.includes("facebook.com");
  }

  static init() {
    return {
      state: {
        postsCrawled: 0,
        commentsExtracted: 0,
        dialogsProcessed: 0,
        originalsRestored: 0,
        photosHarvested: 0,
        scrolls: 0
      }
    };
  }

  async awaitPageLoad(ctx) {
    // Returner umiddelbart for å unngå Browsertrix sin faste 5-sekunders PAGE_OP_TIMEOUT_SECS
    return;
  }

  async *run(ctx) {
    const { sleep, getState } = ctx.Lib;
    ctx.log("Facebook Archive: Venter på at Facebook Comet skal hydrere React...");

    // 1. Vent på at React monterer mount_0_0_... (inntil 25 sekunder)
    for (let i = 0; i < 50; i++) {
      const mount = document.querySelector('[id^="mount_"]');
      const textLen = document.body ? document.body.innerText.length : 0;
      if (mount && textLen > 50) {
        ctx.log(`Facebook Archive: React montert vellykket etter ${(i + 1) * 0.5}s! Mount ID=${mount.id}, TextLength=${textLen}`);
        break;
      }
      await sleep(500);
    }

    // Hjelpefunksjon for å lukke generelle dialoger og cookie-bannere
    const dismissCookieAndModals = () => {
      let closed = 0;
      const cookieSelectors = [
        'div[role="button"][aria-label="Allow all cookies"]',
        'button[aria-label="Allow all cookies"]',
        'div[role="button"][aria-label="Decline optional cookies"]',
        'button[aria-label="Decline optional cookies"]',
        'div[role="button"][aria-label="Tillat alle informasjonskapsler"]',
        'button[aria-label="Tillat alle informasjonskapsler"]',
        'div[role="button"][aria-label="Avvis valgfrie informasjonskapsler"]',
        'button[aria-label="Avvis valgfrie informasjonskapsler"]',
        '[data-cookiebanner="accept_button"]'
      ];

      for (const sel of cookieSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          try {
            el.click();
            closed++;
            ctx.log("Facebook Archive: Lukket samtykkebanner");
          } catch (e) {}
        }
      }
      return closed;
    };

    // Hjelpefunksjon for å reversere maskinoversatte tekster til opprinnelig norsk språk
    const revertToOriginalLanguage = () => {
      let count = 0;
      const seeOrigBtns = Array.from(document.querySelectorAll([
        'div[role="button"]',
        'span[role="button"]',
        'div[role="link"]',
        'span[dir="auto"]'
      ].join(', '))).filter(b => {
        const txt = (b.innerText || "").trim().toLowerCase();
        const aria = (b.getAttribute("aria-label") || "").trim().toLowerCase();
        return (
          txt === "see original" ||
          txt.startsWith("see original") ||
          txt === "se original" ||
          txt.startsWith("se original") ||
          txt.includes("see original (norwegian)") ||
          aria.includes("see original") ||
          aria.includes("se original")
        );
      });

      for (const btn of seeOrigBtns) {
        if (!btn.dataset.archiveRevertedOriginal) {
          btn.dataset.archiveRevertedOriginal = "true";
          try {
            btn.click();
            count++;
          } catch (e) {}
        }
      }
      if (count > 0) {
        ctx.state.originalsRestored += count;
        ctx.log(`Facebook Archive: Gjenopprettet ${count} tekster/kommentarer til opprinnelig språk (totalt: ${ctx.state.originalsRestored}).`);
      }
      return count;
    };

    await sleep(2000);
    dismissCookieAndModals();
    await sleep(1500);
    revertToOriginalLanguage();
    await sleep(1500);

    const isPhotosPage = window.location.pathname.includes('/photos');

    // 2A. Spesialisert håndtering for bildegalleriet (/photos)
    if (isPhotosPage) {
      ctx.log("Facebook Archive: Bildegalleri oppdaget (/photos)! Starter høsting av galleriet...");
      const photoScrollRounds = 6;

      for (let round = 0; round < photoScrollRounds; round++) {
        ctx.state.scrolls = round + 1;
        yield getState(ctx, `Ruller bildegalleri (runde ${round + 1}/${photoScrollRounds})`, "scrolls");

        // Finn alle bilde-elementer i rutenettet
        const photoLinks = Array.from(document.querySelectorAll([
          'a[href*="/photo.php"]',
          'a[href*="/photos/"]',
          'a[href*="fbid="]'
        ].join(', '))).filter(a => {
          return a.querySelector('img') && !a.dataset.archivePhotoProcessed;
        });

        ctx.log(`Facebook Archive: Fant ${photoLinks.length} nye bilde-elementer i runde ${round + 1}`);

        // Åpne opptil 2 bilder i Photo Theater for å fange full HD-oppløsning og bildetekst
        for (const link of photoLinks.slice(0, 2)) {
          link.dataset.archivePhotoProcessed = "true";
          try {
            ctx.log("Facebook Archive: Åpner bilde i Photo Theater for å fange full oppløsning...");
            link.click();
            await sleep(2000);

            const photoDialog = document.querySelector('div[role="dialog"]');
            if (photoDialog) {
              ctx.state.photosHarvested++;
              revertToOriginalLanguage();
              await sleep(1000);

              const closeBtn = photoDialog.querySelector([
                'div[aria-label="Close"]',
                'div[aria-label="Lukk"]',
                'div[role="button"][aria-label="Close"]',
                'div[role="button"][aria-label="Lukk"]',
                '[aria-label="Lukk"]',
                '[aria-label="Close"]'
              ].join(', '));

              if (closeBtn) {
                closeBtn.click();
              } else {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27 }));
              }
              await sleep(1000);
            }
          } catch (e) {
            ctx.log(`Facebook Archive: Feil ved åpning av bilde: ${e.message}`);
          }
        }

        // Rull nedover galleriet
        const scrollStep = Math.floor(window.innerHeight * 1.4);
        window.scrollBy({ top: scrollStep, left: 0, behavior: "smooth" });
        if (document.scrollingElement) {
          document.scrollingElement.scrollTop += scrollStep;
        }
        window.dispatchEvent(new Event("scroll"));
        await sleep(2000);

        revertToOriginalLanguage();
      }

      // Se etter underfaner (f.eks. Album eller Opplastede bilder)
      const subTabs = Array.from(document.querySelectorAll('a[role="tab"], div[role="tab"]')).filter(tab => {
        const t = (tab.innerText || "").toLowerCase();
        return (t.includes("album") || t.includes("opplast") || t.includes("upload")) && !tab.dataset.archiveTabVisited;
      });

      for (const tab of subTabs.slice(0, 2)) {
        tab.dataset.archiveTabVisited = "true";
        try {
          ctx.log(`Facebook Archive: Klikker på underfane i galleriet: ${tab.innerText}...`);
          tab.click();
          await sleep(3000);
          window.scrollBy({ top: 800, left: 0, behavior: "smooth" });
          await sleep(2000);
          revertToOriginalLanguage();
        } catch (e) {}
      }

      // Lukk eventuelle åpne dialoger og rull til toppen for rent skjermbilde
      const openDialogs = document.querySelectorAll('div[role="dialog"]');
      for (const d of openDialogs) {
        const cb = d.querySelector('div[aria-label="Close"], div[aria-label="Lukk"], div[role="button"][aria-label="Close"]');
        if (cb) cb.click();
      }
      await sleep(1000);

      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      await sleep(2000);
      revertToOriginalLanguage();
      await sleep(1500);

      ctx.log("================================================================================");
      ctx.log("Facebook Archive: Bildegalleri høstet fullstendig!");
      ctx.log(`Bilder åpnet i full oppløsning: ${ctx.state.photosHarvested}`);
      ctx.log(`Tekster/bildetekster gjenopprettet til originalspråk: ${ctx.state.originalsRestored}`);
      ctx.log("================================================================================");
      return;
    }

    // 2B. Traversal over innlegg på tidslinjen
    const totalRounds = 8;
    for (let round = 0; round < totalRounds; round++) {
      ctx.state.scrolls = round + 1;
      yield getState(ctx, `Behandler innlegg og kommentarer (runde ${round + 1}/${totalRounds})`, "scrolls");

      // Finn alle ubehandlede kommentar-knapper på siden
      const commentButtons = Array.from(document.querySelectorAll([
        'div[role="button"][aria-label="Leave a comment"]',
        'div[role="button"][aria-label="Legg igjen en kommentar"]',
        'div[role="button"][aria-label="Skriv en kommentar"]',
        'div[role="button"][aria-label*="comment" i]',
        'div[role="button"][aria-label*="kommentar" i]'
      ].join(', '))).filter(btn => {
        const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
        // Ikke klikk submit/send inne i composer
        return !aria.includes("submit") && !aria.includes("send") && !btn.dataset.processedForArchive;
      });

      ctx.log(`Facebook Archive: Fant ${commentButtons.length} nye ubehandlede innlegg med kommentarer i runde ${round + 1}`);

      // Behandle opptil 3 innlegg per runde
      for (const btn of commentButtons.slice(0, 3)) {
        btn.dataset.processedForArchive = "true";
        try {
          ctx.log(`Facebook Archive: Åpner kommentarer for innlegg (${btn.innerText || btn.getAttribute("aria-label")})...`);
          btn.click();
          await sleep(2000);

          // Sjekk om innlegget åpnet seg i en modal dialog
          const dialog = document.querySelector('div[role="dialog"]');
          if (dialog) {
            ctx.state.dialogsProcessed++;
            ctx.log("Facebook Archive: Post åpnet i dialogvindu. Ruller inne i dialogen for å laste kommentarer...");

            // Finn rullbare beholdere i dialogen
            const allElements = Array.from(dialog.querySelectorAll("*"));
            const scrollables = allElements.filter(el => el.scrollHeight > el.clientHeight && el.clientHeight > 100);

            // Rull 2-3 ganger i dialogen for å trigge GraphQL-lasting av kommentarer
            for (let s = 0; s < 3; s++) {
              for (const sc of scrollables) {
                sc.scrollTop += 1200;
                sc.dispatchEvent(new Event("scroll"));
              }
              await sleep(1500);

              // Klikk eventuelle "Vis flere kommentarer" eller "Vis svar"
              const expandBtns = Array.from(dialog.querySelectorAll('div[role="button"], span[role="button"]')).filter(b => {
                const t = (b.innerText || "").toLowerCase();
                return /view.*more.*comment|vis.*flere.*kommentar|view.*\brepl|vis.*\bsvar|see more|se mer/i.test(t);
              });

              for (const eb of expandBtns.slice(0, 3)) {
                try {
                  eb.click();
                  await sleep(1000);
                } catch (e) {}
              }

              // Gjenopprett originalspråk på innlastede kommentarer inne i dialogen
              revertToOriginalLanguage();
            }

            const commentCountInDialog = dialog.querySelectorAll('div[role="article"]').length;
            ctx.state.commentsExtracted += commentCountInDialog;
            ctx.log(`Facebook Archive: Hentet ${commentCountInDialog} kommentarer fra dialogen.`);

            // Sikre at alle kommentarer i dialogen er på originalspråk før lukking
            revertToOriginalLanguage();
            await sleep(1000);

            // Lukk dialogen og gå tilbake til feeden
            const closeBtn = dialog.querySelector('div[aria-label="Close"], div[aria-label="Lukk"], div[role="button"][aria-label="Close"], div[role="button"][aria-label="Lukk"]');
            if (closeBtn) {
              closeBtn.click();
              ctx.log("Facebook Archive: Lukket post-dialog og returnerte til tidslinjen.");
            } else {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27 }));
            }
            await sleep(1500);
          } else {
            // Hvis kommentarene åpnet seg inline i selve feeden
            ctx.log("Facebook Archive: Kommentarer åpnet inline i feeden.");
            await sleep(1500);
            const expandBtns = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]')).filter(b => {
              const t = (b.innerText || "").toLowerCase();
              return /view.*more.*comment|vis.*flere.*kommentar|view.*\brepl|vis.*\bsvar/i.test(t);
            });
            for (const eb of expandBtns.slice(0, 2)) {
              try {
                eb.click();
                await sleep(1000);
              } catch (e) {}
            }
            revertToOriginalLanguage();
          }

          ctx.state.postsCrawled++;
        } catch (err) {
          ctx.log(`Facebook Archive: Feil ved åpning av kommentarer: ${err.message}`);
        }
      }

      // Rull hovedvinduet nedover for å laste inn neste sett med innlegg
      const scrollStep = Math.floor(window.innerHeight * 1.3);
      window.scrollBy({ top: scrollStep, left: 0, behavior: "smooth" });
      if (document.scrollingElement) {
        document.scrollingElement.scrollTop += scrollStep;
      }
      window.dispatchEvent(new Event("scroll"));
      await sleep(2500);

      dismissCookieAndModals();
      revertToOriginalLanguage();
    }

    // Siste feierunde: Lukk eventuelle åpne dialoger, rull til toppen og reverser alle tekster til norsk
    ctx.log("Facebook Archive: Kjører slutt-feie for å sikre originalspråk over hele siden...");
    const openDialogs = document.querySelectorAll('div[role="dialog"]');
    for (const d of openDialogs) {
      const cb = d.querySelector('div[aria-label="Close"], div[aria-label="Lukk"], div[role="button"][aria-label="Close"]');
      if (cb) cb.click();
    }
    await sleep(1500);

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    await sleep(1500);
    revertToOriginalLanguage();
    await sleep(2000);

    ctx.log("================================================================================");
    ctx.log(`Facebook Archive: Høsting fullført!`);
    ctx.log(`Innlegg behandlet: ${ctx.state.postsCrawled}`);
    ctx.log(`Dialoger med kommentarer prosessert: ${ctx.state.dialogsProcessed}`);
    ctx.log(`Kommentarer registrert: ${ctx.state.commentsExtracted}`);
    ctx.log(`Tekster/kommentarer gjenopprettet til originalspråk: ${ctx.state.originalsRestored}`);
    ctx.log("================================================================================");
  }
}
