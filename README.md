# nettarkivet-browsertrix

Dette arkivet inneholder tilpassede Browsertrix-behaviors utviklet for innhøsting av norske nettsteder i regi av Nettarkivet.

## Oversikt over behaviors

Følgende scripts er tilgjengelige i dette prosjektet:

### 1. Generisk norsk behavior (GenericNorwegianBehavior)
* **Fil:** `generic-norwegian-behavior.js`
* **Mål:** Fungerer som en generell fallback på tvers av de fleste norske nettsteder (`isMatch() { return true; }`).
* **Hovedfunksjonalitet:**
  - Håndterer og klikker samtykkebanners/GDPR-dialoger (SourcePoint, OneTrust, Didomi, Cookiebot, m.fl.) både i hovedvinduet og i iframes.
  - Låser opp rulling (`overflow: auto !important`) dersom popup-er blokkerer siden.
  - Henter og parser nettstedets `/sitemap.xml` én gang (kun på startsiden) for å oppdage alle tilgjengelige undersider.
  - Ruller siden automatisk nedover for å trigge lazy loading av bilder/innhold.
  - Klikker på "Last mer", "Vis flere", og pagination-knapper basert på norske og engelske søkeord.
  - Ruller horisontale karuseller/sliders og klikker på neste-piler for å avdekke skjult innhold.
  - Samler og legger kun interne lenker til i Browsertrix' crawl-kø, mens statiske mediefiler (som PDF, ZIP, bilder, osv.) filtreres ut.

### 2. Friskus Behavior
* **Fil:** `friskus-behavior.js`
* **Mål:** Spesialtilpasset behavior for `friskus.com` og tilhørende kommuneportaler.
* **Hovedfunksjonalitet:**
  - Samler inn kommunelenker via JSON-LD på portalen.
  - Håndterer spesifikke layouts for arrangementsoversikter, arrangementsdetaljer og organisasjonssider.
  - Klikker gjennom faner (Kontakt, Kart, Praktisk info) og utvider datoer.

### 3. Pingvinavisa Behavior
* **Fil:** `pingvinavisa.js`
* **Mål:** Tilpasset for nettavisen Pingvinavisa.
* **Hovedfunksjonalitet:**
  - Klikker seg gjennom "Vis flere" og "Neste side" for å avdekke artikler under `/nyheter/` og `/pingvinavisa/`.

### 4. Schibsted Behavior
* **Fil:** `schibsted.js`
* **Mål:** Skreddersydd for Schibsted-aviser.
* **Hovedfunksjonalitet:**
  - Fokuserer på å håndtere Sourcepoint CMP (samtykkeboks) via spesifikke klasser og tekstsøk inni iframes.
  - Låser opp scroll og ruller siden til bunns.

### 5. Amedia Personalia Behavior
* **Fil:** `amedia_personalia.js`
* **Mål:** Spesialisert for innhøsting av Amedias personalia- og gratulasjonssider.
* **Hovedfunksjonalitet:**
  - Klikker på "vis flere" for å laste inn gratulasjoner.
  - Klikker på enkeltsaker for å åpne modaler/lightboxes, lagrer innholdet, og lukker modalen igjen med ESC eller lukkeknapper.

### 6. AutoScroll (Standard & Consent Removal)
* **Filer:** `autoscroll.js` og `removeconsent_autoscroll.js`
* **Mål:** Enkel infinite scrolling.
* **Hovedfunksjonalitet:**
  - Ruller stabilt til bunnen av siden til høyden slutter å vokse.
  - `removeconsent_autoscroll.js` fjerner i tillegg kjente samtykke-overlays og fikser scrolling i body/html.

### 7. Jevn Scroll til bunn (ScrollToBottomBehavior)
* **Fil:** `scroll-to-bottom.js`
* **Mål:** Generisk, ikke-sitespesifikk jevn/gradvis scrolling.
* **Hovedfunksjonalitet:**
  - Starter øverst på siden og scroller jevnt nedover trinn for trinn med tilpasset hastighet/intervall.
  - Sørger for at lazy-loading og IntersectionObservers trigger underveis.
  - Venter ved bunnen og oppdager om nytt innhold lastes inn dynamisk før den avslutter.

