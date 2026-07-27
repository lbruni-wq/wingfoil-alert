"""Logica "finestre buone" per gli alert wing foil.

Le ore arrivano come dict {"time": "YYYY-MM-DDTHH:MM", "speed": kn,
"gust": kn, "dir": gradi}, ordinate. Una finestra buona è una run di ore
CONSECUTIVE, dentro la fascia [day_start, day_end), con velocità >= soglia
e direzione in uno dei settori scelti, lunga almeno min_hours.
`end` è l'inizio dell'ultima ora buona + 1h (14-18 = 4 ore buone).
"""

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
                "start": run[0]["time"],
                "end": end_iso,
                "min_speed": min(h["speed"] for h in run),
                "max_speed": max(h["speed"] for h in run),
                "sectors": sorted({deg_to_sector(h["dir"]) for h in run},
                                  key=SECTORS.index),
            })
        run.clear()

    prev = None
    for h in hours:
        contiguous = (prev is not None
                      and h["time"][:10] == prev[:10]
                      and int(h["time"][11:13]) == int(prev[11:13]) + 1)
        if _hour_ok(h, rules):
            if run and not contiguous:
                flush()
            run.append(h)
        else:
            flush()
        prev = h["time"]
    flush()
    return windows
