class UniversalPreAcceptConsent {
  static id = "Universal: Pre-accept consent cookies only";
  
  static isMatch() {
    // Matcher ALLE http/https sider
    return /^https?:/.test(window.location.href);
  }

  static init() {
    return new UniversalPreAcceptConsent();
  }

  static runInIframes = false;

  async awaitPageLoad() {
    // Sett consent-cookies MED EN GANG
    this.preAcceptConsent();
  }

  async* run(ctx) {
    yield ctx.Lib.getState({ 
      state: "consent: setting", 
      msg: "Setter consent-cookies" 
    });

    this.preAcceptConsent();

    yield ctx.Lib.getState({ 
      state: "consent: done", 
      msg: "Consent-cookies satt" 
    });
  }

  preAcceptConsent() {
    try {
      const hostname = window.location.hostname;
      const domain = hostname.replace('www.', '');
      const expire = new Date();
      expire.setFullYear(expire.getFullYear() + 1);
      const expireStr = expire.toUTCString();
      
      // Omfattende liste av consent-cookies fra populære systemer
      const cookies = [
        // SourcePoint
        `euconsent-v2=CPxGI4APxGI4AAHABBENDZCgAAAAAAAAAAAAAAAAA.YAAAAAAAAAAA`,
        `consentUUID=accepted_${Date.now()}`,
        `_sp_v1_consent=1!1:1`,
        `_sp_v1_data=accepted`,
        `_sp_enable_dfp_personalized_ads=true`,
        `ccpaUUID=1`,
        `ccpaApplies=false`,
        
        // OneTrust
        `OptanonConsent=isGpcEnabled=0&datestamp=${new Date().toISOString()}&version=6.17.0&isIABGlobal=false&hosts=&consentId=${Date.now()}&interactionCount=1&landingPath=NotLandingPage&groups=C0001:1,C0002:1,C0003:1,C0004:1,C0005:1`,
        `OptanonAlertBoxClosed=${new Date().toISOString()}`,
        
        // Cookiebot
        `CookieConsent={stamp:'${Date.now()}',necessary:true,preferences:true,statistics:true,marketing:true,method:'explicit',ver:1}`,
        `CookieConsentBulkSetting={stamp:'${Date.now()}',all:true}`,
        
        // Quantcast
        `__qca=P0-${Date.now()}-${Date.now()}`,
        `euconsent=1`,
        
        // Didomi
        `didomi_token=accepted`,
        `euconsent-v2=1`,
        
        // TrustArc
        `notice_preferences=2:1a8b5e5e5e5e5e5e`,
        `notice_gdpr_prefs=0,1,2:1a8b5e5e5e5e5e5e`,
        `cmapi_cookie_privacy=permit 1,2,3`,
        
        // Osano
        `osano_consentmanager=ACCEPT`,
        `osano_consentmanager_uuid=${Date.now()}`,
        
        // Cookie Information
        `CookieInformationConsent={"website_uuid":"${Date.now()}","consent_url":"accepted","consents_approved":["cookie_cat_necessary","cookie_cat_functional","cookie_cat_statistic","cookie_cat_marketing"]}`,
        
        // Klaro
        `klaro={stamp:'${Date.now()}',version:1,all:true}`,
        
        // Termly
        `termly_consent={"preferences":true,"statistics":true,"marketing":true}`,
        
        // Complianz
        `cmplz_all=allow`,
        `cmplz_marketing=allow`,
        `cmplz_statistics=allow`,
        
        // CookieYes
        `cookieyes-consent=consentid:${Date.now()},consent:yes`,
        
        // Usercentrics
        `uc_settings={"version":1,"consent":{"google_analytics":true,"facebook":true}}`,
        
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
        `cookie_bar_dismissed=true`
      ];
      
      // Sett cookies både med og uten domene
      for (const cookie of cookies) {
        // Med domene (for subdomener)
        document.cookie = `${cookie}; expires=${expireStr}; path=/; domain=.${domain}; SameSite=Lax`;
        
        // Uten domene (for nåværende host)
        document.cookie = `${cookie}; expires=${expireStr}; path=/; SameSite=Lax`;
        
        // Med Secure på HTTPS
        if (window.location.protocol === 'https:') {
          document.cookie = `${cookie}; expires=${expireStr}; path=/; domain=.${domain}; Secure; SameSite=None`;
          document.cookie = `${cookie}; expires=${expireStr}; path=/; Secure; SameSite=None`;
        }
      }
      
      // Sett også i localStorage og sessionStorage
      try {
        const storageData = {
          // SourcePoint
          '_sp_v1_consent': '1',
          '_sp_v1_opt_out': 'false',
          '_sp_v1_data': 'accepted',
          'consentUUID': 'accepted',
          
          // OneTrust
          'OptanonConsent': JSON.stringify({
            datestamp: new Date().toISOString(),
            version: '6.17.0',
            interactionCount: 1,
            groups: 'C0001:1,C0002:1,C0003:1,C0004:1,C0005:1'
          }),
          
          // Cookiebot
          'CookieConsent': JSON.stringify({
            all: true,
            necessary: true,
            preferences: true,
            statistics: true,
            marketing: true
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
          'privacy_policy_accepted': 'true'
        };
        
        for (const [key, value] of Object.entries(storageData)) {
          localStorage.setItem(key, value);
          sessionStorage.setItem(key, value);
        }
      } catch (e) {
        console.debug('Storage setting failed:', e);
      }
      
      console.log('✓ Pre-aksepterte consent cookies for', domain);
    } catch (e) {
      console.debug('Pre-accept feilet:', e);
    }
  }
}
