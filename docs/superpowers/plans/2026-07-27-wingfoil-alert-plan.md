# WingFoil Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA per tablet che mostra le previsioni vento per gli spot wing foil e manda notifiche ntfy quando c'è una finestra buona, via GitHub Actions.

**Architecture:** App statica vanilla (GitHub Pages) che legge Open-Meteo lato client; script Python stdlib-only eseguito da un cron GitHub Actions che valuta le stesse regole e manda push a ntfy.sh. La logica "finestre buone" esiste in due porting equivalenti (Python per il cron, JS per la dashboard) validati dagli stessi casi di test.

**Tech Stack:** HTML/CSS/JS vanilla, Python 3 stdlib (urllib, unittest), GitHub Actions, ntfy.sh, Open-Meteo (`meteofrance_seamless`, unità `kn`, timezone `Europe/Rome` — verificato funzionante il 2026-07-27 sulle coordinate di Cupra).

## Global Constraints

- Nessuna dipendenza pip / npm: Python solo stdlib, JS senza framework né build step.
- Il topic ntfy NON va mai nel codice (repo pubblico): solo env `NTFY_TOPIC` / secret Actions.
- Unità vento: nodi (`wind_speed_unit=kn`). Timezone: `Europe/Rome`.
- Settori direzione (8, ampi 45° centrati): N=[337.5,22.5), NE=[22.5,67.5), E=[67.5,112.5), SE=[112.5,157.5), S=[157.5,202.5), SW=[202.5,247.5), W=[247.5,292.5), NW=[292.5,337.5).
- Default regole spot: `min_knots=12`, `sectors=["N","NE","E","SE"]`, `day_start=8`, `day_end=20`, `min_hours=2`.
- Testo UI e notifiche in italiano.
- Un commit per task, aggiornare `HANDOFF.md` a ogni task chiuso.

---

### Task 1: config.json + logica finestre Python + test

**Files:**
- Create: `config.json`
- Create: `scripts/windlogic.py`
- Test: `tests/test_windlogic.py`

**Interfaces:**
- Produces: `windlogic.deg_to_sector(deg: float) -> str`; `windlogic.find_windows(hours: list[dict], rules: dict) -> list[dict]` dove `hours` = `[{"time": "2026-07-29T14:00", "speed": 14.2, "gust": 18.0, "dir": 120}, ...]` (ISO local, ordinati) e ogni finestra = `{"start": iso, "end": iso, "min_speed": float, "max_speed": float, "sectors": [str]}` (`end` = inizio dell'ultima ora buona + 1h, quindi 14–18 = 4 ore buone).

- [ ] **Step 1: scrivere `config.json`**

```json
{
  "spots": [
    {"id": "cupra", "name": "Cupra Marittima", "lat": 43.024, "lon": 13.861,
     "enabled": true, "min_knots": 12, "sectors": ["N", "NE", "E", "SE"],
     "day_start": 8, "day_end": 20, "min_hours": 2},
    {"id": "grottammare", "name": "Grottammare", "lat": 42.989, "lon": 13.87,
     "enabled": true, "min_knots": 12, "sectors": ["N", "NE", "E", "SE"],
     "day_start": 8, "day_end": 20, "min_hours": 2}
  ],
  "forecast": {"model": "meteofrance_seamless", "alert_hours": 48, "display_hours": 72},
  "ntfy": {"server": "https://ntfy.sh"}
}
```

- [ ] **Step 2: scrivere i test (falliscono: modulo inesistente)**

`tests/test_windlogic.py`, `unittest`, casi: (a) 4 ore consecutive ≥12kn da SE → 1 finestra 14–18; (b) vento forte ma da W → nessuna finestra; (c) 1 sola ora buona con `min_hours=2` → nessuna; (d) run buona spezzata da un'ora sotto soglia → due run separate, tiene solo quelle ≥ min_hours; (e) ore buone fuori fascia (21:00) → escluse; (f) `deg_to_sector`: 0→N, 350→N, 45→NE, 120→SE, 200→S, 337.5→N.

- [ ] **Step 3: eseguire i test e verificarli FAIL** — `python -m unittest discover -s tests -v` → ImportError.

- [ ] **Step 4: implementare `scripts/windlogic.py`**

```python
SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

def deg_to_sector(deg):
    return SECTORS[int(((deg % 360) + 22.5) // 45) % 8]

def _hour_ok(h, rules):
    t = int(h["time"][11:13])
    return (rules["day_start"] <= t < rules["day_end"]
            and h["speed"] >= rules["min_knots"]
            and deg_to_sector(h["dir"]) in rules["sectors"])

def find_windows(hours, rules):
    windows, run = [], []
    def flush():
        if len(run) >= rules["min_hours"]:
            end = run[-1]["time"]
            end_iso = end[:11] + f"{int(end[11:13]) + 1:02d}" + end[13:]
            windows.append({
                "start": run[0]["time"], "end": end_iso,
                "min_speed": min(h["speed"] for h in run),
                "max_speed": max(h["speed"] for h in run),
                "sectors": sorted({deg_to_sector(h["dir"]) for h in run},
                                  key=SECTORS.index)})
        run.clear()
    prev = None
    for h in hours:
        contiguous = prev is not None and h["time"][:10] == prev[:10] \
            and int(h["time"][11:13]) == int(prev[11:13]) + 1
        if _hour_ok(h, rules):
            if not contiguous:
                flush()
            run.append(h)
        else:
            flush()
        prev = h["time"]
    flush()
    return windows
```

Nota: `end` a ora 20 va bene perché `day_end=20` esclude l'ora 20 dalla run, quindi `end` max = 20 e non si sfora mai il giorno (nessun rollover di data necessario).

- [ ] **Step 5: test PASS** — `python -m unittest discover -s tests -v`.
- [ ] **Step 6: commit** — `git add config.json scripts/ tests/ && git commit -m "feat: config spot e logica finestre vento con test"`.

---

### Task 2: check_wind.py (fetch, dedup, ntfy, dry-run) + test

**Files:**
- Create: `scripts/check_wind.py`
- Test: `tests/test_check_wind.py`

**Interfaces:**
- Consumes: `windlogic.find_windows`, `config.json`.
- Produces: CLI `python scripts/check_wind.py [--dry-run]`; env `NTFY_TOPIC` (obbligatoria se non dry-run), `STATE_FILE` (default `.state/notified.json`), `NTFY_SERVER` (default da config). Funzioni testabili: `build_url(spot, cfg) -> str`, `parse_hours(api_json) -> list[dict]`, `filter_horizon(hours, now_iso, alert_hours) -> list`, `format_message(spot_name, w) -> str` (es. `mer 29/07 14–18 · 13–16 kn da SE`), `dedup_key(spot_id, w) -> str` = `"{spot_id}|{start[:10]}"` (max 1 notifica per spot al giorno di finestra), `load_state/save_state` (JSON `{key: first_notified_iso}`, prune > 7 giorni).

- [ ] **Step 1: test che falliscono** — casi: `build_url` contiene lat/lon/modello/kn/timezone; `parse_hours` da fixture JSON Open-Meteo (arrays `hourly.time/wind_speed_10m/wind_gusts_10m/wind_direction_10m`, con un `None` nei dati → ora scartata); `filter_horizon` esclude ore passate e oltre 48h; `format_message` produce l'italiano atteso; `dedup_key` stabile anche se la finestra slitta di 1h.
- [ ] **Step 2: verificare FAIL.**
- [ ] **Step 3: implementare.** Flusso `main()`: carica config → per ogni spot abilitato fetch con `urllib.request.urlopen(url, timeout=30)` in try/except (su errore: warning su stderr e `continue`, MAI notifiche false) → `find_windows` su orizzonte 48h → per ogni finestra con `dedup_key` non in stato: manda POST ntfy (`Title: Vento buono a {name}`, `Tags: kite`, `Priority: high`, body = messaggio) e registra in stato → salva stato (crea dir). `--dry-run`: stampa invece di inviare, non tocca lo stato. Senza `NTFY_TOPIC` e senza `--dry-run`: exit 2 con messaggio chiaro. Exit 0 anche se un fetch fallisce.
- [ ] **Step 4: test PASS + prova reale** — `python scripts/check_wind.py --dry-run` contro l'API vera: stampa le finestre (o "nessuna finestra") per i 2 spot senza errori.
- [ ] **Step 5: commit.**

---

### Task 3: PWA — dashboard, meteogramma, impostazioni

**Files:**
- Create: `index.html`, `style.css`, `app.js`, `windlogic.js`
- Test: `tests/test_windlogic_js.py` (esegue i casi condivisi via `node` se presente, altrimenti skip) — in più verifica visuale con browser in Task 5.

**Interfaces:**
- Consumes: `config.json` (fetch come default), Open-Meteo forecast + geocoding (`https://geocoding-api.open-meteo.com/v1/search?name=..&count=5&language=it`).
- Produces: `windlogic.js` esporta (globale `WindLogic`) `degToSector(deg)`, `findWindows(hours, rules)` — stesso contratto del Python, stessi casi di test. `app.js`: config effettiva = `localStorage["wingfoil-config"]` se presente, altrimenti `config.json`; funzioni principali `loadConfig()`, `fetchForecast(spot, cfg)`, `renderSpotCard(spot, hours, windows)`, `renderMeteogram(canvas, hours, rules)`, `openSettings(spotId)`, `exportConfig()`, `addSpotSearch(query)`.

- [ ] **Step 1: `windlogic.js`** — porting 1:1 di `windlogic.py` (stessi nomi in camelCase). In fondo: `if (typeof module !== "undefined") module.exports = WindLogic;` per i test node.
- [ ] **Step 2: test JS** — `tests/test_windlogic_js.py` lancia `node tests/run_windlogic_cases.js` (che riusa i casi a-f del Task 1 su `windlogic.js`) con `subprocess`; se `node` non è nel PATH → `unittest.skip`. Verificare esito.
- [ ] **Step 3: `index.html` + `style.css`** — layout tablet dark (il tablet può fare da dashboard): header con titolo "🪁 WingFoil Alert", timestamp ultimo aggiornamento e bottoni ⚙️/➕; `<main>` griglia di card (1 colonna portrait, 2 landscape ≥ 900px). Card spot: nome, semaforo grande (🟢 se c'è almeno una finestra nelle prossime 48h, altrimenti 🔴 con "niente vento utile"), lista finestre 72h ("mer 29/07 14–18 · 13–16 kn da SE"), canvas meteogramma. `<dialog>` impostazioni per spot: slider soglia 8–25 kn con valore live, 8 checkbox a rosa dei venti (griglia 3×3 con centro vuoto), due select fascia oraria (0–23), select ore minime (1–4), toggle abilitato, bottone elimina spot; footer dialog: Salva / Annulla. `<dialog>` aggiungi spot: input ricerca + risultati geocoding cliccabili. Footer app: bottone "Esporta config.json" + nota che il file va committato nel repo per aggiornare gli alert.
- [ ] **Step 4: `app.js`** — al load: `loadConfig()` → per ogni spot abilitato `fetchForecast` (72h, stessa URL del Python ma `forecast_days=4`) → `findWindows` su regole spot → render. Meteogramma canvas (device-pixel-ratio aware): barre orarie velocità colorate (verde se ora "buona", grigio altrimenti), linea raffiche, linea tratteggiata soglia, frecce direzione ogni 3h (`ctx.rotate((dir+180)*Math.PI/180)` — la freccia indica DOVE va il vento), etichette giorno. Auto-refresh ogni 30 min con `setInterval` + refresh su `visibilitychange`. Salvataggio impostazioni → `localStorage` + re-render. `exportConfig()` → `Blob` + `a.download="config.json"`. Gestione errori fetch: banner giallo "Dati non aggiornati (offline?) — ultimo aggiornamento HH:MM" usando l'ultima risposta buona tenuta in `localStorage["wingfoil-cache"]`.
- [ ] **Step 5: commit.**

---

### Task 4: PWA installabile — manifest, service worker, icone

**Files:**
- Create: `manifest.json`, `sw.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/maskable-512.png`, `scripts/make_icons.ps1`

**Interfaces:**
- Consumes: nulla. Produces: PWA installabile (Chrome "Aggiungi a schermata Home").

- [ ] **Step 1: `manifest.json`** — name "WingFoil Alert", short_name "WingFoil", start_url "./", scope "./", display "standalone", background/theme `#0b1220`, icone 192/512 + maskable, lang "it".
- [ ] **Step 2: icone** — `scripts/make_icons.ps1` con System.Drawing: sfondo blu notte `#0b1220` con angoli pieni, onda stilizzata in `#38bdf8` (due archi), vela/wing triangolare bianca. Genera i 3 PNG. Eseguirlo.
- [ ] **Step 3: `sw.js`** — versione cache `wingfoil-v1`; install: precache shell (`./`, `index.html`, `style.css`, `app.js`, `windlogic.js`, `manifest.json`, icone); activate: pulizia cache vecchie; fetch: per `api.open-meteo.com` network-first con fallback cache, per il resto cache-first con aggiornamento in background (stale-while-revalidate). Registrazione in `app.js` con `navigator.serviceWorker.register("sw.js")`.
- [ ] **Step 4: verifica** — `python -m http.server 8000` nella cartella e controllo in browser: manifest valido, SW registrato (DevTools → Application), nessun errore console.
- [ ] **Step 5: commit.**

---

### Task 5: GitHub Actions + README + verifica finale

**Files:**
- Create: `.github/workflows/wind-alert.yml`, `.github/workflows/pages.yml`, `README.md`, `.gitignore` (`.state/`, `__pycache__/`)

**Interfaces:**
- Consumes: `scripts/check_wind.py`, secret `NTFY_TOPIC`.

- [ ] **Step 1: `wind-alert.yml`**

```yaml
name: Wind alert
on:
  schedule:
    - cron: "15 4,7,10,13,16,19 * * *"   # 06:15..21:15 ora italiana (estate)
  workflow_dispatch: {}
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/cache@v4
        with:
          path: .state
          key: wind-state-${{ github.run_id }}
          restore-keys: wind-state-
      - run: python scripts/check_wind.py
        env:
          NTFY_TOPIC: ${{ secrets.NTFY_TOPIC }}
```

- [ ] **Step 2: `pages.yml`** — deploy Pages standard su push main: `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` (path `.`), `actions/deploy-pages@v4`, permissions `pages: write`, `id-token: write`.
- [ ] **Step 3: `README.md`** — cos'è, struttura, sviluppo locale (`http.server`, unittest, dry-run) e la checklist deploy per Luigi: 1) creare repo pubblico `wingfoil-alert` sull'account personale e push; 2) Settings → Pages → Source "GitHub Actions"; 3) scegliere un topic ntfy segreto (es. `wingfoil-luigi-<random>`) e salvarlo come secret `NTFY_TOPIC`; 4) sul tablet: installare app ntfy e sottoscrivere il topic; aprire l'URL Pages con Chrome → Aggiungi a schermata Home; 5) test: Actions → Wind alert → Run workflow.
- [ ] **Step 4: verifica finale** — tutti gli unittest verdi; `--dry-run` reale OK; PWA aperta con Playwright su `http.server`: screenshot dashboard + dialog impostazioni, zero errori console; `HANDOFF.md` aggiornato (restano solo i passi deploy di Luigi).
- [ ] **Step 5: commit.**

---

## Self-review

- Copertura spec: dashboard/semaforo/meteogramma (T3), impostazioni+rosa venti+export (T3), aggiungi spot geocoding (T3), offline (T3 banner + T4 SW), alert cron+dedup+ntfy (T2+T5), niente notifiche false su errore API (T2), installabilità (T4), README deploy (T5). ✔
- Nessun placeholder; contratti `find_windows`/`findWindows` identici nei due linguaggi e condivisi dai test. ✔
- Dedup per spot+giorno regge lo slittamento di 1h delle finestre tra run del modello. ✔
