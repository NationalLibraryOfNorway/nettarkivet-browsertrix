class UniversalConsentBehavior {
  static id = "Universal: Pre-accept and click consent";
  
  static isMatch() {
    return /^https?:/.test(window.location.href);
  }

  static init() {
    return new UniversalConsentBehavior();
  }

  static runInIframes = true;

  async awaitPageLoad() {
    // Sett cookies med en gang
    this.setConsentCookies();
    
    // Vent litt, så prøv å klikke
    await this.wait(1500);
    
    if (window === window.top) {
      await this.clickConsentButtons();
    }
  }

  async* run(ctx) {
    const isIframe = window !== window.top;
    
    yield ctx.Lib.getState({ 
      state: "consent: setting", 
      msg: isIframe ? "Setter i iframe" : "Setter consent" 
    });

    this.setConsentCookies();
    
    await this.wait(1500);
    
    if (!isIframe) {
      yield ctx.Lib.getState({ 
        state: "consent: clicking", 
        msg: "Søker etter knapper" 
      });
      
      const clicked = await this.clickConsentButtons();
      
      yield ctx.Lib.getState({ 
        state: "consent: done", 
        msg: clicked ? "Klikket knapp" : "Ingen knapp funnet" 
      });
    } else {
      // Vi er i iframe, prøv å klikke her også
      await this.clickInIframe();
      
      yield ctx.Lib.getState({ 
        state: "consent: done", 
        msg: "Håndtert i iframe" 
      });
    }
  }

  async clickConsentButtons() {
    const maxAttempts = 50; // 10 sekunder
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // 1. Søk i hovedvinduet
        if (this.findAndClick(document)) {
          console.log('✓ Klikket i hovedvindu');
          await this.wait(500);
          return true;
        }
        
        // 2. Søk i alle iframes
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
            if (iframeDoc && this.findAndClick(iframeDoc)) {
              console.log('✓ Klikket i same-origin iframe');
              await this.wait(500);
              return true;
            }
          } catch (e) {
            // Cross-origin iframe - kan ikke aksessere
          }
        }
        
      } catch (e) {
        console.debug('Klikk-forsøk feilet:', e);
      }
      
      await this.wait(200);
    }
    
    console.log('⚠ Fant ikke consent-knapp etter 10 sekunder');
    return false;
  }

  async clickInIframe() {
    // Vi er INNE i consent-iframe
    const maxAttempts = 50;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.findAndClick(document)) {
        console.log('✓ Klikket i consent-iframe');
        await this.wait(500);
        return true;
      }
      await this.wait(200);
    }
    
    console.log('⚠ Fant ikke knapp i iframe');
    return false;
  }

  findAndClick(doc) {
    // Søk etter "Godta alle" / "Accept all" knapper
    const patterns = [
      /godta\s+alle/i,
      /godta\s+alt/i,
      /accept\s+all/i,
      /accepter\s+alle/i,
      /samtykke\s+til\s+alle/i,
      /tillat\s+alle/i,
      /agree\s+to\s+all/i,
      /consent\s+to\s+all/i,
      /aksepter\s+alle/i,
      /allow\s+all/i
    ];
    
    // Søk i buttons og button-lignende elementer
    const selectors = [
      'button',
      '[role="button"]',
      'a[role="button"]',
      'div[role="button"]',
      'span[role="button"]',
      'a',
      'div[onclick]',
      'span[onclick]'
    ];
    
    for (const selector of selectors) {
      try {
        const elements = Array.from(doc.querySelectorAll(selector));
        
        for (const el of elements) {
          const text = (el.textContent || el.innerText || '').trim();
          const title = el.getAttribute('title') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const dataText = el.getAttribute('data-text') || '';
          const combinedText = `${text} ${title} ${ariaLabel} ${dataText}`;
          
          // Sjekk om teksten matcher
          for (const pattern of patterns) {
            if (pattern.test(combinedText)) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                const visibleText = text.substring(0, 50);
                console.log('Fant knapp:', visibleText || ariaLabel || title);
                
                // Prøv flere typer klikk
                el.click();
                
                // Dispatch mouse events også
                try {
                  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                } catch (e) {}
                
                return true;
              }
            }
          }
        }
      } catch (e) {
        console.debug(`Søk i ${selector} feilet:`, e);
      }
    }
    
    // Søk etter SourcePoint-spesifikke attributter og klasser
    const spSelectors = [
      '[title*="Accept all" i]',
      '[title*="Godta alle" i]',
      '.sp_choice_type_11',
      '[class*="accept-all"]',
      '[class*="acceptAll"]',
      '[class*="accept_all"]',
      '[data-choice="11"]',
      'button[aria-label*="Accept all" i]',
      'button[aria-label*="Godta alle" i]',
      '[class*="message-button"]:last-child', // Ofte siste knapp
      '.message-component button:last-child'
    ];
    
    for (const selector of spSelectors) {
      try {
        const el = doc.querySelector(selector);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log('Fant SP-element:', selector);
            
            el.click();
            
            try {
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            } catch (e) {}
            
            return true;
          }
        }
      } catch (e) {}
    }
    
    return false;
  }

  setConsentCookies() {
    try {
      const hostname = window.location.hostname;
      const domain = hostname.replace('www.', '');
      const now = new Date();
      const expire = new Date();
      expire.setFullYear(expire.getFullYear() + 1);
      const expireStr = expire.toUTCString();
      
      const timestamp = Date.now();
      const uuid = this.generateUUID();
      
      // TCF v2.0 consent string (full accept)
      const euconsentString = 'CQaDXoAQaDXoAAGABCENCCFgALAAAELAABpwJpQGYAFAAWABUADwAIAAZAA0ACYAE4AQgA0QB-gERAJEAUkA0wCkwFvALhAXmAxkBlgDVwHLgRmAmkCb8B2ABQAFgAVAA8ACAAGQANAAfgBMACcAH4AQgA0QB-gERAIsASIA80CZAJlAUmAtkBbwC8wGMgMsAauA5cB_YEZgJvgFBgBwACwAKgAeABBADIANAAmABOAEIANEAfoBIgGMgNXAjMIAAgLhCgBAAFADRAYyBGYIACACcAuEeAJAAUAB4AH4ATgCIgHmAW8AxkCMw4AKAIQApIBpgFwgTSJgAgFvAMZJAAwBCAD9AjMVACgAKATKAt4BjIEZigAIAQgDlwAA.dgAACEAAAAAA';
      
      const cookies = [
        // SourcePoint / TCF v2.0
        `consentUUID=${uuid}_49`,
        `consentDate=${now.toISOString()}`,
        `euconsent-v2=${euconsentString}`,
        `_sp_v1_consent=1!1:1`,
        `_sp_v1_data=accepted`,
        `_sp_enable_dfp_personalized_ads=true`,
        `ccpaUUID=1`,
        `ccpaApplies=false`,
        
        // OneTrust
        `OptanonConsent=isGpcEnabled=0&datestamp=${now.toISOString()}&version=6.17.0&groups=C0001:1,C0002:1,C0003:1,C0004:1,C0005:1`,
        `OptanonAlertBoxClosed=${now.toISOString()}`,
        
        // Cookiebot
        `CookieConsent={stamp:'${timestamp}',necessary:true,preferences:true,statistics:true,marketing:true,all:true}`,
        
        // Quantcast
        `__qca=P0-${timestamp}-${timestamp}`,
        `euconsent=1`,
        
        // Didomi
        `didomi_token=accepted`,
        
        // Google Ad cookies
        `__eoi=ID=${this.generateRandomId()}:T=${Math.floor(timestamp/1000)}:RT=${Math.floor(timestamp/1000)}:S=AA-${this.generateRandomString(20)}`,
        `__gads=ID=${this.generateRandomId()}:T=${Math.floor(timestamp/1000)}:RT=${Math.floor(timestamp/1000)}:S=ALNI_${this.generateRandomString(30)}`,
        `__gpi=UID=${this.generateRandomId(12)}:T=${Math.floor(timestamp/1000)}:RT=${Math.floor(timestamp/1000)}:S=ALNI_${this.generateRandomString(30)}`,
        
        // Amedia
        `amedia:visitid=${uuid}|${timestamp}`,
        
        // Prebid
        `lwuid=gnlw${this.generateRandomId()}-${this.generateUUIDSection()}-${this.generateUUIDSection()}-${this.generateUUIDSection()}-${this.generateRandomId(12)}`,
        `pbjs_sharedId=${this.generateUUID()}`,
        `pbjs_sharedId_cst=${encodeURIComponent('OiwMLEYsVA==')}`,
        
        // Generiske
        `cookie_consent=all`,
        `cookie_consent_level=all`,
        `cookies_accepted=true`,
        `cookieconsent_status=allow`,
        `gdpr_consent=true`,
        `privacy_consent=accepted`,
        `hasConsent=true`
      ];
      
      // Sett alle cookies
      for (const cookie of cookies) {
        // Med domene
        document.cookie = `${cookie}; expires=${expireStr}; path=/; domain=.${domain}; SameSite=Lax`;
        
        // Uten domene
        document.cookie = `${cookie}; expires=${expireStr}; path=/; SameSite=Lax`;
        
        // Secure på HTTPS
        if (window.location.protocol === 'https:') {
          document.cookie = `${cookie}; expires=${expireStr}; path=/; domain=.${domain}; Secure; SameSite=None`;
          document.cookie = `${cookie}; expires=${expireStr}; path=/; Secure; SameSite=None`;
        }
      }
      
      // LocalStorage
      try {
        localStorage.setItem('consentUUID', `${uuid}_49`);
        localStorage.setItem('consentDate', now.toISOString());
        localStorage.setItem('euconsent-v2', euconsentString);
        localStorage.setItem('_sp_v1_consent', '1');
        localStorage.setItem('_sp_v1_opt_out', 'false');
        localStorage.setItem('_sp_v1_data', 'accepted');
        localStorage.setItem('gdprConsent', 'true');
        localStorage.setItem('cookieConsent', 'accepted');
      } catch (e) {
        console.debug('LocalStorage ikke tilgjengelig');
      }
      
      console.log('✓ Satte consent-cookies for:', domain);
    } catch (e) {
      console.debug('Cookie-setting feilet:', e);
    }
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  generateUUIDSection() {
    return 'xxxx'.replace(/[x]/g, function() {
      return (Math.random() * 16 | 0).toString(16);
    });
  }

  generateRandomId(length = 16) {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
