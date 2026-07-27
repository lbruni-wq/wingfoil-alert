# RESUME — WingFoil Alert

> **Per riprendere in automatico:** apri Claude Code in questa cartella
> (`C:\Users\luigib\OneDrive - MINARDI PIUME SRL\200. Claude\10. App Varie\WIngFoil`)
> e incolla il prompt qui sotto.

## Prompt di ripresa

```
Riprendi il progetto WingFoil Alert. Leggi RESUME.md, HANDOFF.md e README.md
in questa cartella. Lo sviluppo è COMPLETO (16/16 test verdi, PWA verificata
in browser, dry-run OK). Resta solo il DEPLOY: chiedimi su quale account
GitHub personale pubblicare, poi esegui i 5 passi della sezione "Deploy" del
README (repo pubblico wingfoil-alert, Pages via Actions, secret NTFY_TOPIC
con topic generato casualmente, istruzioni tablet, run di test del workflow).
Lavora in autonomia, un commit per passo.
```

## Stato al 2026-07-27 (pausa)

**Progetto FINITO e committato** (9 commit su `main`, nessun remote ancora):

| Cosa | Stato |
|---|---|
| Spec + piano | `docs/superpowers/specs/` e `docs/superpowers/plans/` |
| Logica finestre vento | `scripts/windlogic.py` + `windlogic.js` (porting identici, test condivisi) |
| Cron alert | `scripts/check_wind.py` (Open-Meteo → regole → ntfy, dedup 1/giorno/spot, dry-run) |
| PWA | `index.html`, `app.js`, `style.css`, `sw.js`, `manifest.json`, `icons/` |
| CI | `.github/workflows/wind-alert.yml` (cron 3h) + `pages.yml` (deploy) |
| Test | 16/16 verdi: `python -m unittest discover -s tests -v` |
| Verifica visuale | dashboard e dialog impostazioni OK in browser, zero errori console |

**Unico passo mancante — Deploy (~10 min, serve Luigi):**
1. Decidere l'account GitHub personale (Luigi ha detto "altro account personale", da precisare).
2. `gh repo create wingfoil-alert --public --source . --push`
3. Settings → Pages → Source = "GitHub Actions"
4. `gh secret set NTFY_TOPIC --body "<topic segreto casuale>"` (es. `wingfoil-luigi-x7k2m9`)
5. Tablet: app ntfy (Play Store) sottoscritta al topic + PWA da `https://<account>.github.io/wingfoil-alert/` → "Aggiungi a schermata Home"
6. Test: tab Actions → Wind alert → Run workflow

## Decisioni prese (non riaprirle)

- Spot: Cupra Marittima (43.024, 13.861) e Grottammare (42.989, 13.870); altri aggiungibili dall'app (geocoding).
- Regola "si esce": ≥12 kn (slider 8–25), direzioni N/NE/E/SE (rosa configurabile), fascia 8–20, ≥2h consecutive, orizzonte 48h.
- Dati: Open-Meteo `meteofrance_seamless` (stessi modelli AROME/ARPEGE di nucleoventonda), nodi, Europe/Rome — verificato funzionante.
- Notifiche: ntfy.sh, topic segreto SOLO nel secret Actions (repo pubblico!).
- Config: `config.json` nel repo guida gli alert; le modifiche fatte nell'app vanno ri-esportate (⬇ Esporta config.json) e committate.
- Il sito nucleoventonda non espone dati per spot: è stato sostituito dalle API Open-Meteo (stessi modelli).

## Attenzioni note

- `config.json` letto con `utf-8-sig` (tollera BOM di Notepad/PowerShell).
- Il cron GitHub in inverno slitta di 1h (cron è UTC): irrilevante, accettato.
- `actions/cache` conserva lo stato dedup tra i run (`wind-state-*`).
