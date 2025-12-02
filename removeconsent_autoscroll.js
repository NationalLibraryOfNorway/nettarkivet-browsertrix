// Test-script for Chrome DevTools Console
// Kjør dette direkte i console på snasningen.no/vis/personalia/greetings/all

(async function() {
  console.log('🚀 Starter link-klikking test...');
  
  const visitedLinks = new Set();
  let clickedCount = 0;
  let pulses = 0;
  
  const docHeight = () => Math.max(
    document.documentElement?.scrollHeight || 0,
    document.body?.scrollHeight || 0
  );
  
  let lastHeight = docHeight();
  let stableRounds = 0;
  const stableLimit = 12;
  
  console.log('⬇️ Starter sakte scrolling...');
  
  // Scroll sakte nedover
  while (stableRounds < stableLimit && pulses < 50) {
    const targetY = docHeight() - (window.innerHeight || 800);
    window.scrollTo(0, targetY > 0 ? targetY : 0);
    
    pulses++;
    await new Promise(r => setTimeout(r, 900));
    
    const currentHeight = docHeight();
    if (Math.abs(currentHeight - lastHeight) < 10) {
      stableRounds++;
    } else {
      stableRounds = 0;
    }
    lastHeight = currentHeight;
    
    if (pulses % 5 === 0) {
      console.log(`📏 Pulse ${pulses}, height: ${currentHeight}, stable: ${stableRounds}`);
    }
  }
  
  console.log(`✅ Scrolling ferdig etter ${pulses} pulses`);
  console.log('⬆️ Scroller tilbake til toppen...');
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 1000));
  
  const allLinks = document.querySelectorAll('a[href]');
  console.log(`📊 Fant ${allLinks.length} totale lenker på siden`);

  for (const link of allLinks) {
    const href = link.href;
    
    // Debug første lenke
    if (clickedCount === 0) {
      console.log(`🔍 Første lenke:`, {
        href: href,
        pathname: link.pathname,
        matchesPrefix: link.pathname?.startsWith('/vis/personalia/greetings/all'),
        text: link.textContent?.trim().substring(0, 50)
      });
    }

    // Filtrer - kun lenker under /vis/personalia/greetings/all
    if (!href || !href.startsWith('http')) continue;
    if (!link.pathname?.startsWith('/vis/personalia/greetings/all')) continue;
    if (visitedLinks.has(href)) continue;

    visitedLinks.add(href);

    try {
      // Scroll inn i viewport
      link.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await new Promise(r => setTimeout(r, 300));

      // Klikk med preventDefault for å unngå navigering
      console.log(`🖱️ Klikker lenke #${clickedCount + 1}: ${href}`);
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      // Legg til preventDefault på linken før vi dispatcher eventet
      const preventNav = (e) => {
        e.preventDefault();
        console.log('🚫 Stoppet navigering');
      };
      link.addEventListener('click', preventNav, { once: false });
      link.dispatchEvent(clickEvent);
      
      clickedCount++;

      // Vent på lightbox
      await new Promise(r => setTimeout(r, 2000));

      // Se etter lightbox/modal
      const lightbox = document.querySelector('[class*="lightbox"], [class*="modal"], [class*="overlay"], [class*="popup"]');
      if (lightbox) {
        console.log(`📦 Fant lightbox:`, lightbox.className);
      }

      // Prøv å lukke
      const closeSelectors = [
        'button[aria-label="Lukk"]', '[aria-label="Lukk"]',
        'button[aria-label*="close"]', 'button[aria-label*="Close"]',
        '.close', '[class*="close"]', '[aria-label*="close"]', '[aria-label*="Close"]',
        '.modal-close', '.lightbox-close', 'button[title*="close"]', 'button[title*="Close"]',
        '[class*="overlay"]', '.backdrop', '[data-dismiss]', 'button.btn-close',
        '[onclick*="close"]', 'a[onclick*="close"]'
      ];

      let closed = false;
      for (const selector of closeSelectors) {
        const closeBtn = document.querySelector(selector);
        if (closeBtn && closeBtn.offsetParent !== null) {
          console.log(`🚪 Lukker med selector: ${selector}`);
          closeBtn.click();
          closed = true;
          await new Promise(r => setTimeout(r, 500));
          break;
        }
      }

      if (!closed) {
        // Fallback: ESC-tast
        console.log(`⌨️ Prøver ESC-tast`);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
      }

    } catch (e) {
      console.error(`❌ Feil ved klikk:`, e.message);
    }
  }

  console.log(`✅ Ferdig! Klikket ${clickedCount} lenker av ${allLinks.length} totalt`);
  console.log(`📋 Unike lenker besøkt: ${visitedLinks.size}`);
})();
