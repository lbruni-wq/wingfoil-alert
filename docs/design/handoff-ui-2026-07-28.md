# Handoff: WingFoil Alert — redesign UI

## Overview
Redesign dell'interfaccia di WingFoil Alert (app di allerta vento per wing foil, in italiano).
Obiettivo dichiarato dal committente: migliorare l'usabilità mantenendo le funzioni attuali, e
far rispondere ogni schermata per prima alla domanda **«quando è la prossima finestra utile?»**.

Quattro schermate mobile: lista spot, dettaglio spot, impostazioni spot, aggiungi spot.
Due temi: chiaro ("Carta", default) e scuro ("Inchiostro").

## About the Design Files
I file in questo bundle sono **riferimenti di design realizzati in HTML** — prototipi che mostrano
aspetto e comportamento previsti, **non codice di produzione da copiare**. Il compito è
**ricreare questi design nell'ambiente esistente dell'app** (React Native, Flutter, SwiftUI,
Kotlin/Compose, web…) usando i pattern e le librerie già in uso nel codebase. Se non esiste
ancora un ambiente, scegliere il framework più adatto e implementare lì.

`WingFoil Alert.dc.html` usa un piccolo runtime di prototipazione (tag `<x-dc>`, `<sc-for>`,
`{{ hole }}`): **ignorare il runtime**, leggere markup, stili inline e la classe di logica come
specifica. Il grafico e le fasce orarie sono generati da array di dati fittizi nella classe di logica.

## Fidelity
**High-fidelity.** Colori, tipografia, spaziature, dimensioni dei target di tocco e stati sono
definitivi. Ricreare pixel-perfect con le librerie del codebase. I dati (vento, orari, località)
sono di esempio e vanno sostituiti dalle API reali.

## Design Tokens
Presi dal design system "Broadsheet" (`broadsheet-styles.css` allegato — è la fonte autorevole).

Tema chiaro (Carta):
- ground `--color-bg` #f3f2f2 · surface #eae9e9 · testo `--color-text` #201e1d
- accento primario (ciano) #0088b0; ramp usata: accent-100 #e9f8ff, accent-200 #cbeeff,
  accent-600 #1186ac (fill interattivi), accent-700 #006786 (testo su fondo chiaro)
- accento secondario (magenta) #d6006c; accent-2-700 #aa0b56 (azione distruttiva)
- neutri: 200 #eae7e7, 300 #d7d3d3, 400 #bab6b6, 500 #9b9797, 600 #7d7979, 700 #605d5d
- divider: #201e1d al 16%
- inchiostro su fill accento (`--color-accent-on`): #ffffff

Tema scuro (Inchiostro) — override delle stesse variabili:
- desk #0e0d0d · bg #1a1918 · surface #252322 · testo #f0eeec · divider #f0eeec al 18%
- neutri: 200 #2a2827, 300 #3b3836, 400 #57534f, 500 #857f7c, 600 #a8a3a0, 700 #c6c1be
- accent #62c5ee · accent-100 #10262f · accent-200 #14414f · accent-600 #62c5ee ·
  accent-700 #99e0ff · accent-2 #ff458e · accent-2-600 #ffc0d0 · accent-2-700 #ff90b1
- inchiostro su fill accento: #10222a

Tipografia: **Source Serif 4** per tutto (titoli e corpo; il serif è anche la chrome — nessun sans).
Corsivo vero per l'enfasi. Scala usata nelle schermate:
- display finestra 44px/0.95 w600 · titolo schermata 32px/1.05 w600 · nome spot 23px w600
- sottotitolo sezione 19px w600 · corpo 17px/1.45 · secondario 15px · caption 14px
- kicker/etichette 12–13px, uppercase, letter-spacing 0.14–0.16em
- minimo assoluto 12px (solo etichette), corpo mai sotto 14px

Spaziature (scala 1.25×): 5 / 10 / 15 / 20 / 30 / 40 px. Radius: 1 / **2** / 4 px (i controlli usano 2px).
Ombre: sm `0 1px 2px rgba(45,43,43,.14)`, md `0 3px 10px rgba(45,43,43,.16)`, lg `0 12px 32px rgba(45,43,43,.22)`.
Le ombre nel prototipo servono solo a staccare i telefoni dalla scrivania: **dentro l'app non usarle**.

Regole del sistema da rispettare: nessun box/card/righello per strutturare la pagina (la gerarchia
è data da scala tipografica e spazio bianco); l'unica furniture ammessa è la coppia di righe
spesso-fine (5px + 1px, 3px di stacco, in `--color-text`) sotto la testata; i due accenti mai
nello stesso piccolo componente.

## Screens / Views

### 1. Lista spot (home) — 390px di larghezza, padding 24px 20px 32px, colonna, gap 24px
Scopo: capire in due secondi se e quando si va, su quale spot.
Layout dall'alto:
1. **Testata**: wordmark "WingFoil *Alert*" 26px w600 (la parola "Alert" in corsivo w400);
   sotto, dateline 12px uppercase ls .14em neutral-600: "Mar 28 lug · Marche · agg. 21:17".
   A destra bottone **+** 44×44, bordo 1px accent-600, testo accent-700, radius 2px,
   hover fill accent-100, pressed accent-200.
2. **Coppia di righe** spesso-fine (vedi token).
3. **Blocco "Prossima finestra utile"**: kicker 12px uppercase accent-700; poi "Gio 30" 44px w600
   accanto a "14 – 18" 30px w600 accent-700 (baseline allineate, gap 10px); riga 19px
   "Cupra Marittima · 15–18 kn da **NE**"; riga 15px neutral-700 "fra 41 ore · 4 ore piene sopra soglia".
   È l'aggregato del **primo** spot utile fra tutti quelli attivi.
4. **Elenco spot** (gap 28px fra spot). Per ogni spot:
   - pallino stato 9px: cerchio pieno accent-600 se ha una finestra, cerchio vuoto bordo
     neutral-500 se no (il rosso/verde dell'app attuale è stato eliminato);
   - nome 23px w600; a destra link testuale "regola" 15px accent-700 sottolineato
     (underline-offset 3px), area di tocco ≥44px in altezza;
   - riga verdetto 17px: "**Gio 30, 14:00 – 18:00** · 15–18 kn NE" oppure, se non c'è finestra,
     "Nessuna finestra nelle prossime 48 ore · max 9 kn" in neutral-700 e l'intero blocco a opacity .72;
   - **striscia 48 ore**: 48 celle orarie, flex:1 ciascuna, gap 1px, altezza 26px, senza radius.
     Colore cella: accent-600 se vento ≥ soglia **e** direzione valida; accent-200 se sopra soglia
     ma direzione sbagliata; neutral-300 di giorno sotto soglia; neutral-200 nelle ore notturne
     (ora locale < 11 nel prototipo: in produzione usare la fascia oraria impostata dall'utente);
   - asse sotto la striscia, 12px uppercase neutral-600: "ora / mer 29 / gio 30 / +48 h"
     (space-between).
5. **Legenda** in fondo (13px neutral-700, gap 14px): patch 16×10 accent-600 "vento valido",
   accent-200 "sopra soglia, direzione no", neutral-300 "sotto soglia".

### 2. Dettaglio spot
Scopo: verificare la finestra ora per ora e le condizioni collaterali.
1. Barra: "← Spot" a sinistra, "regola" a destra (entrambi 16px accent-700).
2. Titolo "Cupra Marittima" 32px w600; sotto, riepilogo regole 13px uppercase neutral-600:
   "soglia 12 kn · N / NE / E / SE · 08–20".
3. Coppia di righe spesso-fine.
4. **Prossima finestra**: kicker accent-700; "Gio 30 · 14:00 – 18:00" 27px w600;
   "picco 18 kn alle 16 · raffiche 23 kn · NE 45°" 17px neutral-700.
5. **Grafico 48 h** (SVG, viewBox 0 0 350 150, larghezza fluida):
   - fasce verticali accent-200 (x/width dalle run di ore valide) dietro tutto, altezza 110;
   - baseline y=110 neutral-400; griglia y=60 e y=10 neutral-300;
   - **soglia**: linea y=60 magenta `--color-accent-2`, 1.5px, dash 5 4, etichetta "12 soglia"
     in accent-2-700 10px;
   - **raffiche**: polyline neutral-500 1.25px dash 3 3 (= vento × 1.3, clamp 24 kn);
   - **vento**: polyline accent-700 2.25px, linejoin round;
   - scala y: 0 kn = y110, 24 kn = y10 (lineare, clamp a 24);
   - asse x: 48 punti orari equispaziati su 350; etichette 11px "mer 29" / "gio 30" / "finestra"
     (accent-700) a y=126; riga direzioni a y=144, una sigla ogni 6 ore, neutral-500 (accent-700
     sotto la finestra).
6. **Tabella oraria**: intestazione 12px uppercase neutral-600 con border-bottom 1px `--color-text`;
   colonne a larghezza fissa: ora 52px, vento 66px, raffica 70px, dir 52px, mare flex a destra.
   Righe 16px, padding 9px 0, border-bottom 1px divider; le ore dentro la finestra hanno
   background accent-100 e il vento in w600. Numeri con la virgola decimale italiana ("0,6 m").
7. Piede: "acqua 24° · aria 28° · tramonto 20:31" 15px neutral-700, gap 26px.

### 3. Impostazioni spot
Scopo: regolare soglia, direzioni, fascia oraria e durata minima con meno attriti dell'attuale dialog.
1. Barra: "← Annulla" testuale a sinistra; **Salva** a destra, fill accent-600, testo
   `--color-accent-on` 16px w600, padding 12px 22px, radius 2px, hover accent-700.
   (Le azioni stanno in testa, non in fondo: la schermata è più lunga dello schermo.)
2. Kicker "Impostazioni" + titolo spot 32px; coppia di righe spesso-fine.
3. **Toggle "Avvisami per questo spot"** (label 19px w600 + descrizione 14px neutral-700);
   switch 56×32, radius 16, fill accent-600 quando attivo, knob 26px `--color-bg` a 3px dal bordo.
   Sostituisce il vecchio "Spot attivo" con checkbox.
4. **Soglia vento**: label 19px w600 e valore "24 kn" 26px w600 accent-700 sulla stessa riga
   (space-between). Sotto: bottone − 44×44 (bordo neutral-400, hover neutral-200), slider,
   bottone + 44×44. Slider: traccia 3px neutral-300, riempimento accent-600 da 0 a
   `(valore−6)/(30−6)`, pallino 20px accent-600 centrato sulla percentuale. Range **6–30 kn**,
   passo 1. Sotto, hint 14px neutral-700 che cambia col valore:
   ≤11 "wing grande, giornata leggera" · 12–19 "vento pieno, ala media" · ≥20 "solo giorni forti".
5. **Direzioni valide**: label 19px w600 + nota "costa esposta a 90°" 14px neutral-700 a destra.
   Griglia 3×3, gap 8px, celle alte 56px, radius 2px: NW N NE / W **90°** E / SW S SE.
   La cella centrale non è un bottone: mostra l'esposizione della costa in neutral-500.
   Selezionata = fill accent-600 + testo `--color-accent-on`; non selezionata = bordo
   neutral-400 + testo neutral-700. Testo 19px w600.
6. **Fascia oraria**: due campi affiancati "dalle" / "alle", etichette 13px uppercase neutral-600,
   campi alti 48px, bordo neutral-400, radius 2px, valore 19px (08:00 / 20:00).
7. **Durata minima**: quattro bottoni a larghezza uguale (1 h / 2 h / 3 h / 4 h), alti 48px,
   stessa logica di selezione delle direzioni. Sostituisce la select dell'app attuale.
8. Piede: **recap in linguaggio naturale** 15px neutral-700 che si ricompone dai valori:
   «Ti avviso quando il vento supera {soglia} kn da {direzioni separate da " / "} per almeno
   {durata}, tra le 08:00 e le 20:00.» Se nessuna direzione è attiva: "da nessuna direzione".
   Sotto, "Elimina questo spot" come link 16px accent-2-700 sottolineato (nessun bottone rosso pieno).

### 4. Aggiungi spot
1. "← Chiudi" in alto; titolo "Aggiungi spot" 32px; coppia di righe spesso-fine.
2. Campo di ricerca: label 13px uppercase "Cerca località", input alto 52px, testo 19px,
   radius 2px (classe `.input` del design system).
3. **Risultati** live sotto il campo (l'app attuale non ne mostra): kicker "Risultati";
   ogni riga è un bottone full-width con nome 20px w600 e meta 14px neutral-700
   ("Macerata · 24 km · costa 75°"), a destra "aggiungi" 15px accent-700;
   padding 16px 0, border-bottom 1px divider, hover background accent-100.
4. "Vicino a te" + bottone outline "Usa la mia posizione" (bordo accent-600, testo accent-700,
   padding 13px 20px).
5. Piede 15px neutral-700: "Il nuovo spot parte con soglia 12 kn e le direzioni suggerite
   dall'esposizione della costa: puoi correggerle subito dopo."

## Interactions & Behavior
- **Home → Dettaglio**: tap sul nome dello spot o sulla striscia. **→ Impostazioni**: "regola".
  **→ Aggiungi**: "+" in testata. Impostazioni e Aggiungi sono schermate piene, non dialog
  (nel design attuale erano modali con la tastiera che copriva i campi).
- **Soglia**: − / + a passo 1 kn e trascinamento dello slider; il valore, l'hint, il recap,
  **le strisce 48 h di tutti gli spot e le fasce del grafico** si ricalcolano in tempo reale.
- **Direzioni**: toggle indipendenti; una finestra è valida solo se vento ≥ soglia **e**
  direzione dell'ora fra quelle selezionate.
- **Durata minima**: selezione singola; filtra le finestre più corte (nel prototipo non filtra:
  da implementare — le run contigue valide più brevi della durata non vanno annunciate).
- **Stati**: hover = tinta accent-100 / neutral-200; pressed = uno step più scuro (accent-700);
  focus tastiera = outline 2px `--color-accent`, offset 2px. Nessuno stato di default del browser.
- **Tema**: switch Carta / Inchiostro; nell'app va legato al tema di sistema con override manuale
  e persistito. Nel prototipo è un segmentato in testa alla pagina.
- **Vuoto / errore** (da progettare se serve): spot senza previsione, rete assente, permesso
  posizione negato.
- Nessuna schermata notifiche: l'unico controllo è il toggle per spot (scelta del committente).

## State Management
Per spot: `attivo` (bool), `sogliaKn` (6–30), `direzioni` (set fra NW N NE W E SE S SW),
`daOra`/`aOra`, `durataMinimaOre` (1–4), `esposizioneCostaGradi`.
Globale: `tema` ('light' | 'dark' | 'system'), `ultimoAggiornamento`.
Derivati (ricalcolati a ogni cambio di regola, non salvati): per ogni spot la serie oraria a 48 h
(vento, raffica, direzione, mare), le `run` valide, la `prossimaFinestra`, e la
`prossimaFinestraGlobale` mostrata in testa alla home.
Dati: una fetch previsionale per spot (48 h, passo 1 h: vento, raffica, direzione, onda,
temperatura aria/acqua, alba/tramonto) + geocoding per la ricerca località.

## Assets
Nessun'immagine. Nessuna icona nel design attuale (le etichette sono testuali, coerenti col
sistema); se servono icone usare **Phosphor** in peso *duotone*.
Font: **Source Serif 4** (Google Fonts / SIL OFL), pesi 400 e 600 + corsivo 400.

## Files
- `WingFoil Alert.dc.html` — le quattro schermate + i due temi (aprire in un browser).
- `broadsheet-styles.css` — token e componenti del design system Broadsheet (fonte dei valori).
