class UniversalConsentBehavior {
  static id = "Universal: Pre-accept consent (exact cookies)";
  
  static isMatch() {
    // Matcher ALLE http/https sider
    return /^https?:/.test(window.location.href);
  }

  static init() {
    return new UniversalConsentBehavior();
  }

  static runInIframes = false;

  async awaitPageLoad() {
    this.setConsentCookies();
  }

  async* run(ctx) {
    yield ctx.Lib.getState({ 
      state: "consent: setting", 
      msg: "Setter consent-cookies" 
    });

    this.setConsentCookies();

    yield ctx.Lib.getState({ 
      state: "consent: done", 
      msg: "Consent-cookies satt" 
    });
  }

  setConsentCookies() {
    try {
      const hostname = window.location.hostname;
      const domain = hostname.replace('www.', '');
      const now = new Date();
      const expire = new Date();
      expire.setFullYear(expire.getFullYear() + 1);
      const expireStr = expire.toUTCString();
      
      // Generer unike ID-er
      const timestamp = Date.now();
      const uuid = this.generateUUID();
      
      // KRITISKE CONSENT-COOKIES
      
      // 1. TCF v2.0 / IAB Consent (SourcePoint, OneTrust, Quantcast, etc)
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
        `OptanonConsent=isGpcEnabled=0&datestamp=${now.toISOString()}&version=6.17.0&isIABGlobal=false&hosts=&consentId=${uuid}&interactionCount=1&landingPath=NotLandingPage&groups=C0001:1,C0002:1,C0003:1,C0004:1,C0005:1`,
        `OptanonAlertBoxClosed=${now.toISOString()}`,
        
        // Cookiebot
        `CookieConsent={stamp:'${timestamp}',necessary:true,preferences:true,statistics:true,marketing:true,method:'explicit',ver:1}`,
        `CookieConsentBulkSetting={stamp:'${timestamp}',all:true}`,
        
        // Quantcast
        `__qca=P0-${timestamp}-${timestamp}`,
        `euconsent=1`,
        
        // Didomi
        `didomi_token=accepted`,
        
        // TrustArc
        `notice_preferences=2:1a8b${this.generateRandomId(10)}`,
        `notice_gdpr_prefs=0,1,2:1a8b${this.generateRandomId(10)}`,
        `cmapi_cookie_privacy=permit 1,2,3`,
        
        // Osano
        `osano_consentmanager=ACCEPT`,
        `osano_consentmanager_uuid=${uuid}`,
        
        // Cookie Information
        `CookieInformationConsent={"website_uuid":"${uuid}","consent_url":"accepted","consents_approved":["cookie_cat_necessary","cookie_cat_functional","cookie_cat_statistic","cookie_cat_marketing"]}`,
        
        // Klaro
        `klaro={stamp:'${timestamp}',version:1,all:true}`,
        
        // Termly
        `termly_consent={"preferences":true,"statistics":true,"marketing":true}`,
        
        // Complianz
        `cmplz_all=allow`,
        `cmplz_marketing=allow`,
        `cmplz_statistics=allow`,
        `cmplz_banner-status=dismissed`,
        
        // CookieYes
        `cookieyes-consent=consentid:${uuid},consent:yes,action:accept`,
        
        // Usercentrics
        `uc_settings={"version":1,"consent":{"google_analytics":true,"facebook":true}}`,
        
        // Google Consent Mode
        `CONSENT=YES+cb.${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${this.generateRandomId(8)}`,
        
        // Google Ad cookies (settes etter consent)
        `__eoi=ID=${this.generateRandomId()}:T=${Math.floor(timestamp/1000)}:RT=${Math.floor(timestamp/1000)}:S=AA-${this.generateRandomString(20)}`,
        `__gads=ID=${this.generateRandomId()}:T=${Math.floor(timestamp/1000)}:RT=${Math.floor(timestamp/1000)}:S=ALNI_${this.generateRandomString(30)}`,
        `__gpi=UID=${this.generateRandomId(12)}:T=${Math.floor(timestamp/1000)}:RT=${Math.floor(timestamp/1000)}:S=ALNI_${this.generateRandomString(30)}`,
        
        // Amedia-spesifikke (for norske aviser)
        `amedia:visitid=${uuid}|${timestamp}`,
        
        // LiveIntent / Prebid
        `lwuid=gnlw${this.generateRandomId()}-${this.generateUUIDSection()}-${this.generateUUIDSection()}-${this.generateUUIDSection()}-${this.generateRandomId(12)}`,
        `pbjs_sharedId=${this.generateUUID()}`,
        `pbjs_sharedId_cst=${encodeURIComponent('OiwMLEYsVA==')}`,
        
        // Generiske
        `cookie_consent=all`,
        `cookie_consent_level=all`,
        `cookie_accepted=true`,
        `cookies_accepted=true`,
        `cookieconsent_status=allow`,
        `cookieconsent_status=dismiss`,
        `cookieconsent_dismissed=yes`,
        `gdpr_consent=true`,
        `privacy_consent=accepted`,
        `consent=1`,
        `hasConsent=true`,
        `accepted_cookies=all`,
        `cookies_policy=accepted`,
        `cookie_notice_accepted=true`,
        `cookie_bar_dismissed=true`,
        `privacy_policy_accepted=true`,
        `tracking_consent=true`,
        `analytics_consent=true`,
        `marketing_consent=true`,
        `functional_consent=true`
      ];
      
      // Sett alle cookies med multiple strategier
      for (const cookie of cookies) {
        // Med domene (for subdomener)
        document.cookie = `${cookie}; expires=${expireStr}; path=/; domain=.${domain}; SameSite=Lax`;
        
        // Uten domene (for nåværende host)
        document.cookie = `${cookie}; expires=${expireStr}; path=/; SameSite=Lax`;
        
        // Secure på HTTPS
        if (window.location.protocol === 'https:') {
          document.cookie = `${cookie}; expires=${expireStr}; path=/; domain=.${domain}; Secure; SameSite=None`;
          document.cookie = `${cookie}; expires=${expireStr}; path=/; Secure; SameSite=None`;
        }
      }
      
      // LocalStorage (hvis tilgjengelig)
      try {
        const storageData = {
          // SourcePoint
          'consentUUID': `${uuid}_49`,
          'consentDate': now.toISOString(),
          'euconsent-v2': euconsentString,
          '_sp_v1_consent': '1',
          '_sp_v1_opt_out': 'false',
          '_sp_v1_data': 'accepted',
          
          // OneTrust
          'OptanonConsent': JSON.stringify({
            datestamp: now.toISOString(),
            version: '6.17.0',
            interactionCount: 1,
            groups: 'C0001:1,C0002:1,C0003:1,C0004:1,C0005:1'
          }),
          'OptanonAlertBoxClosed': now.toISOString(),
          
          // Cookiebot
          'CookieConsent': JSON.stringify({
            all: true,
            necessary: true,
            preferences: true,
            statistics: true,
            marketing: true,
            stamp: timestamp
          }),
          
          // Didomi
          'didomi_token': 'accepted',
          'didomi_consent': JSON.stringify({
            purposes: {enabled: true},
            vendors: {enabled: true}
          }),
          
          // Generiske
          'cookieConsent': 'accepted',
          'gdprConsent': 'true',
          'cookie_consent': 'all',
          'hasConsent': 'true',
          'cookies_accepted': 'true',
          'privacy_policy_accepted': 'true',
          'consent_given': 'true',
          'all_consent': 'true'
        };
        
        for (const [key, value] of Object.entries(storageData)) {
          localStorage.setItem(key, value);
          sessionStorage.setItem(key, value);
        }
      } catch (e) {
        console.debug('Storage ikke tilgjengelig:', e);
      }
      
      console.log('✓ Satte universelle consent-cookies for:', domain);
    } catch (e) {
      console.debug('Consent cookie-setting feilet:', e);
    }
  }

  // Helper-funksjoner
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
