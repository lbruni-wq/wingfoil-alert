# WingFoil Alert — Design

**Data:** 2026-07-27
**Stato:** approvato da Luigi (conversazione Claude Code)

## Obiettivo

PWA per tablet Android che avvisa quando le previsioni di vento rendono possibile uscire
in wing foil negli spot configurati (Cupra Marittima e Grottammare), con notifiche che
arrivano anche ad app chiusa.

Ispirazione: kitedan.wixsite.com/nucleoventonda (hub di mappe ARPEGE/AROME di
Météo-France). Il sito non espone dati numerici per spot, quindi i dati arrivano dalle
**API Open-Meteo** (gratuite, senza chiave), che servono gli stessi modelli
Météo-France (AROME ~1,3 km / ARPEGE) usati dal sito.

## Architettura (approvata)

```
TABLET                        CLOUD (gratis)
┌──────────────┐   deploy    ┌──────────────────┐
│ PWA installata│◄───────────│ GitHub Pages     │
│ (dashboard,   │            │ (repo con app)   │
│  config spot) │            └──────────────────┘
└──────────────┘             ┌──────────────────┐
┌──────────────┐             │ GitHub Actions   │
│ App ntfy     │◄── push ────│ cron ogni 3h:    │
│ (notifiche)  │   ntfy.sh   │ Open-Meteo →     │
└──────────────┘             │ regole → alert   │
                             └──────────────────┘
```

- **Hosting:** GitHub Pages su account GitHub personale di Luigi (repo pubblico ⇒ il
  topic ntfy va in un GitHub Actions secret, mai nel codice).
- **Sorgente progetto:** questa cartella OneDrive (`200. Claude\10. App Varie\WIngFoil`).

## Componenti

### 1. PWA (statica, vanilla HTML/CSS/JS)

- **Dashboard:** una card per spot con semaforo 🟢/🔴, elenco delle prossime finestre
  buone nelle 72 h e meteogramma orario (vento medio, raffiche, direzione con frecce).
- **Impostazioni per spot:** soglia in nodi (slider, default 12), rosa dei venti a
  8 settori per le direzioni valide, fascia oraria utile (default 08–20), durata minima
  finestra (default 2 h consecutive), abilita/disabilita spot.
- **Aggiungi spot:** ricerca località via geocoding Open-Meteo → lat/lon.
- **Config:** salvata in `localStorage`; pulsante **Esporta config** che scarica
  `config.json` da committare nel repo (è il file letto dal cron).
- **Service worker:** cache offline; se manca rete mostra gli ultimi dati con timestamp.

### 2. Dati

Open-Meteo Forecast API, modello `meteofrance_seamless` (AROME dove disponibile,
ARPEGE oltre): `wind_speed_10m`, `wind_gusts_10m`, `wind_direction_10m` orari,
unità nodi, 72 h per la dashboard, 48 h per gli alert.

Spot iniziali:
- Cupra Marittima ≈ 43.024 N, 13.861 E
- Grottammare ≈ 42.989 N, 13.870 E

### 3. Alert cloud

GitHub Actions cron ogni 3 h (06–21 ora italiana). Script `scripts/check_wind.py`:
1. legge `config.json`;
2. interroga Open-Meteo per ogni spot abilitato;
3. cerca **finestre buone** = ≥ `min_hours` ore consecutive nella fascia oraria con
   `wind_speed ≥ soglia` e direzione nei settori validi, nelle prossime 48 h;
4. dedup con file di stato (cache Actions): non rinotifica la stessa finestra;
5. manda push a ntfy.sh sul topic segreto, es.
   `🪁 Cupra: mercoledì 14–18, 14–16 kn da SE`.

Se Open-Meteo non risponde: salta il giro, nessuna notifica falsa.

### 4. Tablet

- Installare la PWA da GitHub Pages (Chrome → Aggiungi a schermata Home).
- Installare l'app **ntfy** (Play Store) e sottoscrivere il topic segreto.

## Testing

- Unit test sulla funzione trova-finestre con fixture JSON (casi: sotto soglia,
  direzione sbagliata, finestra a cavallo della fascia oraria, dedup).
- `check_wind.py --dry-run` per prova reale senza notifiche.
- Verifica visuale della PWA servita in locale.

## Fuori scope (YAGNI)

- Backend / database, login, multi-utente.
- Web Push nativo VAPID (sostituito da ntfy).
- Dati onde/maree (possibile estensione futura).
