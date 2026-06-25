class PingvinavisaBehavior {
  // En ID for loggen i Browsertrix
  static id = "PingvinavisaLoadMore";

  // Sørger for at dette scriptet KUN kjører på Pingvinavisa-sidene
  static isMatch() {
    return window.location.hostname === 'www.unn.no' && window.location.pathname.includes('/pingvinavisa');
  }

  async* run(ctx) {
    let clickCount = 0;
    const maxClicks = 150; // Sikkerhetsstopp for å unngå uendelige looper

    ctx.log({msg: "Starter custom behavior for Pingvinavisa: Leter etter 'Vis flere'-knapp"});

    while (clickCount < maxClicks) {
      // Henter alle potensielle klikkbare elementer
      const elements = Array.from(document.querySelectorAll('button, a, div[role="button"]'));

      // Finn det elementet som er synlig og inneholder teksten "Vis flere"
      const loadMoreBtn = elements.find(el => 
        el.innerText && 
        el.innerText.toLowerCase().includes('vis flere') && 
        el.offsetParent !== null // Sjekker at knappen faktisk er synlig på skjermen
      );

      if (loadMoreBtn) {
        ctx.log({msg: "Fant 'Vis flere'-knapp, utfører klikk...", clickCount: clickCount + 1});
        
        // Scroll knappen inn i synsfeltet (god praksis for Puppeteer/Browsertrix)
        loadMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Et lite opphold før klikk
        await new Promise(resolve => setTimeout(resolve, 500));
        loadMoreBtn.click();
        clickCount++;

        // Vent 2.5 sekunder slik at nettverkskallet fullføres og DOM-en oppdateres med nye artikler
        await new Promise(resolve => setTimeout(resolve, 2500));
        
        // Yield gir kontrollen midlertidig tilbake til Browsertrix sin hovedloop
        // Dette lar crawleren registrere nettverkstrafikken før vi leter etter knappen igjen
        yield; 
      } else {
        ctx.log({msg: "Ingen (mer) 'Vis flere'-knapp funnet. Alle artikler er sannsynligvis lastet inn."});
        break; // Avbryter loopen når knappen ikke lenger finnes
      }
    }
  }
}
