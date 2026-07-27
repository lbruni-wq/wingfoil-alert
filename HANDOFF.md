# HANDOFF — WingFoil Alert

File di ripresa: se la sessione si interrompe, riparti da qui.

**Obiettivo:** PWA "WingFoil Alert" (vedi `docs/superpowers/specs/2026-07-27-wingfoil-alert-design.md`).
**Piano:** `docs/superpowers/plans/2026-07-27-wingfoil-alert-plan.md` (task numerati).

## Stato avanzamento

- [x] Design approvato da Luigi (2026-07-27)
- [x] Spec scritta e committata
- [x] Piano di implementazione (docs/superpowers/plans/2026-07-27-wingfoil-alert-plan.md)
- [x] Task 1 — config.json + windlogic.py + test (7 test verdi)
- [x] Task 2 — check_wind.py (fetch, dedup, ntfy, dry-run) + test (15 test verdi, dry-run reale OK)
- [x] Task 3 — PWA (index/app/style/windlogic.js, dashboard verificata in browser: card, meteogramma, dialog impostazioni OK, zero errori console)
- [x] Task 4 — manifest, service worker (cache wingfoil-v1 attiva), icone generate
- [x] Task 5 — GitHub Actions (wind-alert.yml cron 3h + pages.yml) + README con guida deploy
- [x] Verifica finale — 16/16 test verdi; dry-run end-to-end con soglia abbassata genera i messaggi giusti; fix BOM (utf-8-sig)
- [x] Deploy (2026-07-27, account lbruni-wq):
      1. Repo pubblico: https://github.com/lbruni-wq/wingfoil-alert
      2. Pages attivo (build via Actions): https://lbruni-wq.github.io/wingfoil-alert/ (HTTP 200)
      3. Secret NTFY_TOPIC impostato (topic segreto NON nel repo — comunicato a Luigi in chat)
      4. Run di test Wind alert: SUCCESS — fetch Open-Meteo OK, "nessuna finestra utile nelle 48h", 0 notifiche, cache dedup salvata
- [ ] Smartphone (RICHIEDE LUIGI, ~5 min):
      1. App ntfy (Play Store / App Store) → sottoscrivi il topic segreto
      2. Apri https://lbruni-wq.github.io/wingfoil-alert/ → menu browser → "Aggiungi a schermata Home"

## Decisioni chiave (non rimetterle in discussione)

- Architettura: PWA statica + GitHub Actions cron 3h + push ntfy.sh (topic in secret).
- Dati: Open-Meteo, modello `meteofrance_seamless`, unità nodi.
- Spot: Cupra Marittima (43.024, 13.861), Grottammare (42.989, 13.870); altri aggiungibili da app.
- Regole default: soglia 12 kn, settori N/NE/E/SE, fascia 08–20, min 2h consecutive.
- Hosting: GitHub Pages su account personale di Luigi (repo pubblico).
- Niente framework, niente backend, niente Web Push VAPID.

## Come riprendere

1. Leggi spec e piano.
2. `git log --oneline` per vedere l'ultimo task completato (un commit per task).
3. Continua dal primo task non spuntato qui sopra, aggiorna questo file a ogni task chiuso.
