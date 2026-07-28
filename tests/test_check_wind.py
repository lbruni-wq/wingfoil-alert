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


class TestParseTopics(unittest.TestCase):
    def test_single_topic_unchanged(self):
        self.assertEqual(check_wind.parse_topics("solo-io"), ["solo-io"])

    def test_multiple_with_spaces(self):
        self.assertEqual(check_wind.parse_topics(" luigi-x , carlo-y "),
                         ["luigi-x", "carlo-y"])

    def test_empty_and_trailing_comma(self):
        self.assertEqual(check_wind.parse_topics(""), [])
        self.assertEqual(check_wind.parse_topics("a,,b,"), ["a", "b"])


class TestDedupKeyPerTopic(unittest.TestCase):
    W = {"start": "2026-07-29T14:00", "end": "2026-07-29T18:00"}

    def test_topics_have_independent_keys(self):
        k1 = check_wind.dedup_key("cupra", self.W, "luigi-x")
        k2 = check_wind.dedup_key("cupra", self.W, "carlo-y")
        self.assertNotEqual(k1, k2)

    def test_legacy_key_still_produced_without_topic(self):
        # lo stato salvato prima del multi-topic deve restare riconoscibile
        self.assertEqual(check_wind.dedup_key("cupra", self.W), "cupra|2026-07-29")

    def test_topic_key_extends_legacy_key(self):
        self.assertTrue(check_wind.dedup_key("cupra", self.W, "luigi-x")
                        .startswith(check_wind.dedup_key("cupra", self.W)))


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


class TestMainMultiTopic(unittest.TestCase):
    """main() con due canali: ogni finestra va a entrambi, una volta sola."""

    TOPICS = "topic-uno,topic-due"

    def setUp(self):
        import contextlib, io, json, os, tempfile
        from datetime import datetime, timedelta
        from unittest import mock

        self.mock, self.io, self.contextlib = mock, io, contextlib
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state_file = os.path.join(self.tmp.name, "notified.json")

        # finestra valida domani 09-13: SE (120°), 15 kn, dentro la fascia 8-20
        domani = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        ore = [f"{domani}T{h:02d}:00" for h in range(9, 14)]
        api = {"hourly": {"time": ore,
                          "wind_speed_10m": [15.0] * len(ore),
                          "wind_gusts_10m": [19.0] * len(ore),
                          "wind_direction_10m": [120] * len(ore)}}

        @contextlib.contextmanager
        def fake_urlopen(url, timeout=None):
            buf = io.BytesIO(json.dumps(api).encode())
            yield buf

        self.patches = [
            mock.patch.object(check_wind.urllib.request, "urlopen", fake_urlopen),
            mock.patch.dict(os.environ, {"NTFY_TOPIC": self.TOPICS,
                                         "STATE_FILE": self.state_file}),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    def run_main(self):
        """Esegue main() catturando invii e stdout."""
        inviati = []
        with self.mock.patch.object(
                check_wind, "send_ntfy",
                side_effect=lambda srv, top, name, msg: inviati.append((top, name))):
            out = self.io.StringIO()
            with self.contextlib.redirect_stdout(out):
                rc = check_wind.main([])
        return rc, inviati, out.getvalue()

    def test_both_topics_get_it_once_then_dedup(self):
        rc, inviati, out = self.run_main()
        self.assertEqual(rc, 0)
        topic_usati = {t for t, _ in inviati}
        self.assertEqual(topic_usati, {"topic-uno", "topic-due"})
        # ogni spot notificato a entrambi i canali
        per_spot = {}
        for t, name in inviati:
            per_spot.setdefault(name, set()).add(t)
        for name, tset in per_spot.items():
            self.assertEqual(tset, {"topic-uno", "topic-due"}, name)

        # secondo giro: nessun nuovo invio
        _, inviati2, out2 = self.run_main()
        self.assertEqual(inviati2, [])
        self.assertIn("già notificato", out2)

    def test_topics_never_printed(self):
        _, _, out = self.run_main()
        self.assertNotIn("topic-uno", out)
        self.assertNotIn("topic-due", out)
        self.assertIn("#1", out)
        self.assertIn("#2", out)

    def test_legacy_state_skips_first_topic_only(self):
        """Stato scritto prima del multi-topic: chi c'era non ripete, il nuovo riceve."""
        import json
        from datetime import datetime, timedelta
        domani = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        now = datetime.now().strftime("%Y-%m-%dT%H:%M")
        legacy = {f"cupra|{domani}": now, f"grottammare|{domani}": now}
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(legacy, f)

        _, inviati, _ = self.run_main()
        self.assertTrue(inviati, "il secondo canale deve ricevere")
        self.assertEqual({t for t, _ in inviati}, {"topic-due"})


if __name__ == "__main__":
    unittest.main()
