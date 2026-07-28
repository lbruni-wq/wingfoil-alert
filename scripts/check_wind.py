"""Controlla le previsioni Open-Meteo e manda push ntfy per le finestre buone.

Uso:
    python scripts/check_wind.py [--dry-run]

Env:
    NTFY_TOPIC   topic ntfy segreti, uno o piu' separati da virgola — un canale
                 per persona, cosi' si revoca il topic di uno senza toccare gli
                 altri (obbligatorio senza --dry-run)
    NTFY_SERVER  default: valore in config.json (https://ntfy.sh)
    STATE_FILE   default: .state/notified.json (dedup: 1 notifica per spot
                 per giorno di finestra PER TOPIC, pruning dopo 7 giorni)

I topic non vengono mai stampati: i log delle Actions di un repo pubblico sono
pubblici, e il topic e' la password del canale. Nei messaggi compare solo la
posizione nella lista (#1, #2, ...).

Solo stdlib. In caso di errore API lo spot viene saltato senza notifiche
false e lo script esce comunque con 0.
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from windlogic import find_windows  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]


def build_url(spot, cfg):
    params = {
        "latitude": spot["lat"],
        "longitude": spot["lon"],
        "hourly": "wind_speed_10m,wind_gusts_10m,wind_direction_10m",
        "wind_speed_unit": "kn",
        "timezone": "Europe/Rome",
        "forecast_days": 4,
        "models": cfg["forecast"]["model"],
    }
    return ("https://api.open-meteo.com/v1/forecast?"
            + urllib.parse.urlencode(params))


def parse_hours(api_json):
    h = api_json["hourly"]
    hours = []
    for t, s, g, d in zip(h["time"], h["wind_speed_10m"],
                          h["wind_gusts_10m"], h["wind_direction_10m"]):
        if s is None or d is None:
            continue
        hours.append({"time": t, "speed": s,
                      "gust": g if g is not None else s, "dir": d})
    return hours


def filter_horizon(hours, now_iso, alert_hours):
    now = datetime.fromisoformat(now_iso)
    limit = now + timedelta(hours=alert_hours)
    return [h for h in hours
            if now < datetime.fromisoformat(h["time"]) <= limit]


def format_message(spot_name, w):
    start = datetime.fromisoformat(w["start"])
    end = datetime.fromisoformat(w["end"])
    giorno = f"{GIORNI[start.weekday()]} {start.day:02d}/{start.month:02d}"
    kn = f"{round(w['min_speed'])}–{round(w['max_speed'])} kn"
    da = "/".join(w["sectors"])
    return f"{spot_name}: {giorno} {start.hour}–{end.hour} · {kn} da {da}"


def parse_topics(raw):
    """"topicA, topicB" -> ["topicA", "topicB"]. Uno solo resta il caso normale."""
    return [t.strip() for t in raw.split(",") if t.strip()]


def dedup_key(spot_id, w, topic=None):
    """Senza topic: chiave storica (stato scritto prima del multi-topic)."""
    base = f"{spot_id}|{w['start'][:10]}"
    return base if topic is None else f"{base}|{topic}"


def load_state(path, now_iso):
    try:
        with open(path, encoding="utf-8") as f:
            state = json.load(f)
    except (OSError, ValueError):
        return {}
    cutoff = datetime.fromisoformat(now_iso) - timedelta(days=7)
    return {k: v for k, v in state.items()
            if datetime.fromisoformat(v) > cutoff}


def save_state(path, state):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(state, indent=2), encoding="utf-8")


def send_ntfy(server, topic, spot_name, message):
    req = urllib.request.Request(
        f"{server.rstrip('/')}/{topic}",
        data=message.encode("utf-8"),
        headers={
            "Title": f"Vento buono a {spot_name}",
            "Priority": "high",
            "Tags": "kite",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()


def main(argv):
    dry_run = "--dry-run" in argv
    topics = parse_topics(os.environ.get("NTFY_TOPIC", ""))
    if not dry_run and not topics:
        print("Errore: NTFY_TOPIC non impostata (oppure usa --dry-run).",
              file=sys.stderr)
        return 2
    if dry_run and not topics:
        topics = ["(dry-run)"]  # un solo destinatario finto, per stampare

    # utf-8-sig: tollera il BOM che Notepad/PowerShell aggiungono su Windows
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8-sig"))
    server = os.environ.get("NTFY_SERVER", cfg["ntfy"]["server"])
    state_file = os.environ.get("STATE_FILE", str(ROOT / ".state" / "notified.json"))
    now_iso = datetime.now().strftime("%Y-%m-%dT%H:%M")
    state = load_state(state_file, now_iso)
    notified = 0

    for spot in cfg["spots"]:
        if not spot.get("enabled", True):
            continue
        url = build_url(spot, cfg)
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                api_json = json.load(resp)
            hours = parse_hours(api_json)
        except Exception as e:  # rete/API: salta il giro, niente falsi alert
            print(f"AVVISO: fetch fallito per {spot['name']}: {e}",
                  file=sys.stderr)
            continue

        horizon = filter_horizon(hours, now_iso, cfg["forecast"]["alert_hours"])
        windows = find_windows(horizon, spot)
        for w in windows:
            msg = format_message(spot["name"], w)
            # un destinatario alla volta: se il primo topic e' gia' stato
            # avvisato e il secondo no (topic aggiunto oggi), il secondo riceve.
            for i, topic in enumerate(topics, start=1):
                key = dedup_key(spot["id"], w, topic)
                # stato scritto prima del multi-topic: valeva per il 1o topic
                legacy_seen = i == 1 and dedup_key(spot["id"], w) in state
                if key in state or legacy_seen:
                    print(f"(già notificato #{i}) {msg}")
                    continue
                if dry_run:
                    print(f"[dry-run #{i}] {msg}")
                    continue
                try:
                    send_ntfy(server, topic, spot["name"], msg)
                except Exception as e:
                    print(f"AVVISO: invio ntfy #{i} fallito: {e}", file=sys.stderr)
                    continue
                state[key] = now_iso
                notified += 1
                print(f"[notificato #{i}] {msg}")
        if not windows:
            print(f"{spot['name']}: nessuna finestra utile nelle "
                  f"{cfg['forecast']['alert_hours']}h.")

    if not dry_run:
        save_state(state_file, state)
    print(f"Fatto: {notified} notifiche inviate.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
