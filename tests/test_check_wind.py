import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import check_wind  # noqa: E402

SPOT = {
    "id": "cupra", "name": "Cupra Marittima", "lat": 43.024, "lon": 13.861,
    "enabled": True, "min_knots": 12, "sectors": ["N", "NE", "E", "SE"],
    "day_start": 8, "day_end": 20, "min_hours": 2,
}
CFG = {"forecast": {"model": "meteofrance_seamless", "alert_hours": 48,
                    "display_hours": 72},
       "ntfy": {"server": "https://ntfy.sh"}}

API_FIXTURE = {
    "hourly": {
        "time": ["2026-07-29T13:00", "2026-07-29T14:00", "2026-07-29T15:00",
                 "2026-07-29T16:00"],
        "wind_speed_10m": [8.1, 13.0, None, 16.2],
        "wind_gusts_10m": [12.0, 17.5, 19.0, 21.0],
        "wind_direction_10m": [120, 121, 122, 123],
    }
}


class TestBuildUrl(unittest.TestCase):
    def test_contains_all_params(self):
        url = check_wind.build_url(SPOT, CFG)
        for frag in ["latitude=43.024", "longitude=13.861",
                     "models=meteofrance_seamless", "wind_speed_unit=kn",
                     "timezone=Europe%2FRome",
                     "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m"]:
            self.assertIn(frag, url)


class TestParseHours(unittest.TestCase):
    def test_parses_and_drops_null_rows(self):
        hours = check_wind.parse_hours(API_FIXTURE)
        self.assertEqual(len(hours), 3)  # la riga con None è scartata
        self.assertEqual(hours[0], {"time": "2026-07-29T13:00", "speed": 8.1,
                                    "gust": 12.0, "dir": 120})


class TestFilterHorizon(unittest.TestCase):
    def test_excludes_past_and_beyond(self):
        hours = [{"time": "2026-07-29T10:00"}, {"time": "2026-07-29T13:00"},
                 {"time": "2026-07-31T13:00"}]
        out = check_wind.filter_horizon(hours, "2026-07-29T12:30", 48)
        self.assertEqual([h["time"] for h in out], ["2026-07-29T13:00"])


class TestFormatMessage(unittest.TestCase):
    def test_italian_message(self):
        w = {"start": "2026-07-29T14:00", "end": "2026-07-29T18:00",
             "min_speed": 13.0, "max_speed": 16.2, "sectors": ["SE"]}
        msg = check_wind.format_message("Cupra Marittima", w)
        self.assertEqual(msg, "Cupra Marittima: mer 29/07 14–18 · 13–16 kn da SE")

    def test_two_sectors(self):
        w = {"start": "2026-07-30T09:00", "end": "2026-07-30T11:00",
             "min_speed": 12.4, "max_speed": 12.6, "sectors": ["E", "SE"]}
        msg = check_wind.format_message("Grottammare", w)
        self.assertEqual(msg, "Grottammare: gio 30/07 9–11 · 12–13 kn da E/SE")


class TestDedupKey(unittest.TestCase):
    def test_stable_if_window_shifts_one_hour(self):
        w1 = {"start": "2026-07-29T14:00", "end": "2026-07-29T18:00"}
        w2 = {"start": "2026-07-29T15:00", "end": "2026-07-29T18:00"}
        self.assertEqual(check_wind.dedup_key("cupra", w1),
                         check_wind.dedup_key("cupra", w2))
        self.assertNotEqual(check_wind.dedup_key("cupra", w1),
                            check_wind.dedup_key("grottammare", w1))


class TestState(unittest.TestCase):
    def test_roundtrip_and_prune(self):
        import tempfile, os, json
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "state", "notified.json")
            state = {"cupra|2026-07-29": "2026-07-27T10:00",
                     "cupra|2026-07-10": "2026-07-10T08:00"}
            check_wind.save_state(path, state)
            loaded = check_wind.load_state(path, now_iso="2026-07-27T12:00")
            self.assertIn("cupra|2026-07-29", loaded)
            self.assertNotIn("cupra|2026-07-10", loaded)  # > 7 giorni: pruned

    def test_missing_file_empty(self):
        self.assertEqual(check_wind.load_state("no/such/file.json",
                                               now_iso="2026-07-27T12:00"), {})


if __name__ == "__main__":
    unittest.main()
