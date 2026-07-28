# 🪁 WingFoil Alert

PWA per smartphone che mostra le previsioni vento per gli spot wing foil
(Cupra Marittima e Grottammare) e manda una notifica push quando c'è una
**finestra buona**: almeno N ore consecutive con vento sopra soglia e
direzione giusta, nella fascia oraria utile.

- **Dati:** [Open-Meteo](https://open-meteo.com) — modello `meteofrance_seamless`
  (AROME ~1,3 km / ARPEGE, gli stessi di nucleoventonda), unità nodi.
- **Dashboard:** app statica installabile (GitHub Pages), funziona anche offline.
- **Alert:** GitHub Actions ogni 3 ore → push via [ntfy.sh](https://ntfy.sh)
  (arriva anche a telefono in standby, con l'app ntfy installata).

## Interfaccia (design system "Broadsheet", luglio 2026)

Quattro schermate, navigazione con l'hash dell'URL (il gesto "indietro" del
telefono funziona). Ogni schermata risponde per prima a **«quando si va?»**.

1. **Lista spot** — "Prossima finestra utile" in grande (giorno, orario, spot,
   nodi, direzione), poi ogni spot con verdetto in una riga e la **striscia
   48 ore**: una cella per ora, inchiostro pieno = vento valido, azzurro chiaro
   = sopra soglia ma direzione sbagliata, grigio = sotto soglia, grigio tenue =
   fuori dalla fascia oraria.
2. **Dettaglio spot** — finestra con picco e raffiche, grafico 48 h (curva
   vento, raffiche tratteggiate, soglia magenta, fasce delle finestre valide),
   tabella oraria con vento/raffica/direzione/onda, e piede con acqua, aria e
   tramonto.
3. **Impostazioni spot** — schermata piena (non più un dialog): interruttore
   avvisi, soglia **6–30 kn** con − / + e slider, griglia 3×3 delle direzioni,
   fascia oraria, durata minima, e un recap in italiano di ciò che farà l'app.
4. **Aggiungi spot** — ricerca località con risultati dal vivo e "usa la mia
   posizione" (che ordina i risultati per distanza).

Due temi: **Carta** (chiaro) e **Inchiostro** (scuro), di default quello di
sistema, con override persistito in fondo alla lista spot.
Font Source Serif 4 (messo in cache dal service worker: resta anche offline).
Il contratto di `config.json` non è cambiato: gli alert push leggono lo stesso
file di prima.

## Struttura

```
index.html / style.css / app.js   quattro schermate + router hash
windlogic.js                      logica finestre (porting 1:1 del Python)
sw.js / manifest.json / icons/    PWA installabile
config.json                       spot e regole (letto da app E da cron)
scripts/check_wind.py             cron: Open-Meteo -> regole -> ntfy
scripts/windlogic.py              logica finestre condivisa
scripts/make_icons.ps1            rigenera le icone
.github/workflows/wind-alert.yml  cron alert ogni 3h
.github/workflows/pages.yml       deploy GitHub Pages
docs/design/                      handoff UI e token del design system
tests/                            unit test Python + JS
```

## Dati

Open-Meteo, due chiamate per spot:

- `api.open-meteo.com` — vento, raffiche, direzione, temperatura aria,
  alba/tramonto (modello `meteofrance_seamless`, unità nodi);
- `marine-api.open-meteo.com` — altezza onda e temperatura acqua. È un extra:
  se non risponde (o lo spot è nell'entroterra) la colonna "mare" resta vuota e
  il resto dell'app funziona.

## Sviluppo locale

```powershell
python -m unittest discover -s tests -v   # tutti i test (16)
python scripts/check_wind.py --dry-run    # prova alert senza notifiche
python -m http.server 8765                # poi apri http://localhost:8765
```

## Deploy (una tantum)

1. **Repo GitHub** (account personale, deve essere **pubblico** per Pages free):

   ```powershell
   gh repo create wingfoil-alert --public --source . --push
   ```

2. **GitHub Pages**: Settings → Pages → Source = **GitHub Actions**.
   Al push successivo l'app è su `https://<account>.github.io/wingfoil-alert/`.

3. **Topic ntfy segreto**: inventa un topic difficile da indovinare, es.
   `wingfoil-luigi-x7k2m9`. Poi:

   ```powershell
   gh secret set NTFY_TOPIC --body "wingfoil-luigi-x7k2m9"
   ```

   ⚠️ Il topic È la password: chi lo conosce può leggere/mandare notifiche.
   Non scriverlo mai nel codice (il repo è pubblico).

4. **Smartphone**:
   - installa **ntfy** (Play Store / App Store) → ➕ → sottoscrivi il topic;
   - apri l'URL Pages nel browser → menu → **Aggiungi a schermata Home**.

5. **Test**: tab Actions → *Wind alert* → **Run workflow**. Se in questo momento
   c'è una finestra buona nelle prossime 48h arriva la notifica sul telefono.

## Modificare spot e regole

Le impostazioni cambiate **nell'app** (soglia, direzioni, fascia, nuovi spot)
valgono per la dashboard del dispositivo. Per aggiornare anche gli **alert push**:
⬇ *Esporta config.json* dall'app → sostituisci `config.json` nel repo → commit
e push.

## Installare sull'iPhone (istruzioni da condividere)

1. Apri **Safari** (non Chrome: solo Safari sa installare le web app su iOS) e
   vai su **https://lbruni-wq.github.io/wingfoil-alert/**
2. Tocca il pulsante **Condividi** ⬆️ in basso → scorri → **Aggiungi alla
   schermata Home** → **Aggiungi**.
3. Ora c'è l'icona 🪁 *WingFoil* fra le app: si apre a tutto schermo, senza la
   barra di Safari, e funziona anche senza rete (mostra gli ultimi dati salvati
   e lo dice).
4. **Notifiche push** (facoltativo, arrivano anche col telefono in tasca):
   installa **ntfy** dall'App Store → ➕ → *Subscribe to topic* → incolla il
   topic segreto → *Subscribe*. Il topic è la password: non condividerlo in
   chiaro.
5. **Se l'app era già installata** e sembra quella vecchia: chiudila del tutto
   (swipe su dal multitasking) e riaprila — la versione nuova entra alla prima
   riapertura.

Uso quotidiano: apri l'app, leggi in cima *quando* è la prossima finestra e su
quale spot; tocca il nome dello spot per il dettaglio ora per ora; tocca
*regola* per cambiare soglia, direzioni, fascia oraria e durata minima.

## Regola "si esce" (default)

- vento medio ≥ **12 kn** (configurabile 6–30 dall'app)
- direzione in **N / NE / E / SE** (rosa dei venti configurabile)
- fascia **8–20**, almeno **2 ore consecutive**
- orizzonte alert: 48 h — max 1 notifica per spot per giorno di finestra
