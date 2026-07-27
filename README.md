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

## Struttura

```
index.html / style.css / app.js   dashboard + impostazioni
windlogic.js                      logica finestre (porting 1:1 del Python)
sw.js / manifest.json / icons/    PWA installabile
config.json                       spot e regole (letto da app E da cron)
scripts/check_wind.py             cron: Open-Meteo -> regole -> ntfy
scripts/windlogic.py              logica finestre condivisa
scripts/make_icons.ps1            rigenera le icone
.github/workflows/wind-alert.yml  cron alert ogni 3h
.github/workflows/pages.yml       deploy GitHub Pages
tests/                            unit test Python + JS
```

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

## Regola "si esce" (default)

- vento medio ≥ **12 kn** (configurabile 8–25)
- direzione in **N / NE / E / SE** (rosa dei venti configurabile)
- fascia **8–20**, almeno **2 ore consecutive**
- orizzonte alert: 48 h — max 1 notifica per spot per giorno di finestra
