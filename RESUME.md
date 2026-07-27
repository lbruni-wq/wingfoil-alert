# RESUME — WingFoil Alert

**Progetto COMPLETO e DEPLOYATO** (2026-07-27). Non c'è nulla da riprendere.

- **App (PWA):** https://lbruni-wq.github.io/wingfoil-alert/
- **Repo:** https://github.com/lbruni-wq/wingfoil-alert (pubblico, account lbruni-wq)
- **Alert:** GitHub Actions ogni 3h → ntfy.sh; secret `NTFY_TOPIC` impostato
  (il topic è segreto: NON scriverlo nel repo, è la password delle notifiche).
- **Run di test:** Wind alert SUCCESS (fetch Open-Meteo OK, 0 notifiche —
  nessuna finestra nelle 48h al momento del test) + Deploy Pages SUCCESS.

## Uso quotidiano (smartphone)

1. App **ntfy** (Play Store / App Store) → sottoscrivi il topic segreto.
2. Apri l'URL Pages → "Aggiungi a schermata Home".

## Promemoria operativi

- Le modifiche fatte nell'app (soglia, spot, ecc.) valgono solo sul dispositivo:
  per gli alert push serve ⬇ *Esporta config.json* → sostituisci nel repo → push.
- `config.json` letto con `utf-8-sig` (tollera BOM).
- Il cron GitHub in inverno slitta di 1h (cron è UTC): accettato.
- `actions/cache` conserva lo stato dedup (`wind-state-*`), max 1 notifica
  per spot per giorno di finestra.

## Decisioni prese (non riaprirle)

- Spot: Cupra Marittima (43.024, 13.861) e Grottammare (42.989, 13.870).
- Regola "si esce": ≥12 kn, direzioni N/NE/E/SE, fascia 8–20, ≥2h consecutive, 48h.
- Dati: Open-Meteo `meteofrance_seamless` (stessi modelli AROME/ARPEGE di
  nucleoventonda), nodi, Europe/Rome.
- Notifiche: ntfy.sh, topic solo nel secret Actions (repo pubblico).
