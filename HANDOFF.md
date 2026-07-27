# HANDOFF — WingFoil Alert

File di ripresa: se la sessione si interrompe, riparti da qui.

**Obiettivo:** PWA "WingFoil Alert" (vedi `docs/superpowers/specs/2026-07-27-wingfoil-alert-design.md`).
**Piano:** `docs/superpowers/plans/2026-07-27-wingfoil-alert-plan.md` (task numerati).

## Stato avanzamento

- [x] Design approvato da Luigi (2026-07-27)
- [x] Spec scritta e committata
- [x] Piano di implementazione (docs/superpowers/plans/2026-07-27-wingfoil-alert-plan.md)
- [ ] Task 1 — config.json + scripts/check_wind.py + test
- [ ] Task 2 — PWA (index/app/style/sw/manifest/icone)
- [ ] Task 3 — GitHub Actions (wind-alert.yml + pages.yml) + README
- [ ] Verifica finale (test, dry-run, PWA nel browser)
- [ ] Deploy (RICHIEDE LUIGI: nome account GitHub personale, creazione repo pubblico, secret NTFY_TOPIC)

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
