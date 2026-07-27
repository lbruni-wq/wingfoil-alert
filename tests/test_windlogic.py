import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import windlogic  # noqa: E402

RULES = {
    "min_knots": 12,
    "sectors": ["N", "NE", "E", "SE"],
    "day_start": 8,
    "day_end": 20,
    "min_hours": 2,
}


def hour(t, speed, direction, gust=None):
    return {"time": t, "speed": speed, "gust": gust or speed + 4, "dir": direction}


class TestDegToSector(unittest.TestCase):
    def test_cardinal_boundaries(self):
        cases = [(0, "N"), (350, "N"), (337.5, "N"), (22.5, "NE"), (45, "NE"),
                 (120, "SE"), (200, "S"), (270, "W"), (300, "NW"), (360, "N")]
        for deg, expected in cases:
            self.assertEqual(windlogic.deg_to_sector(deg), expected, f"deg={deg}")


class TestFindWindows(unittest.TestCase):
    def test_four_good_hours_one_window(self):
        hours = [
            hour("2026-07-29T13:00", 8, 120),
            hour("2026-07-29T14:00", 13, 120),
            hour("2026-07-29T15:00", 14, 125),
            hour("2026-07-29T16:00", 16, 130),
            hour("2026-07-29T17:00", 13, 118),
            hour("2026-07-29T18:00", 9, 120),
        ]
        windows = windlogic.find_windows(hours, RULES)
        self.assertEqual(len(windows), 1)
        w = windows[0]
        self.assertEqual(w["start"], "2026-07-29T14:00")
        self.assertEqual(w["end"], "2026-07-29T18:00")
        self.assertEqual(w["min_speed"], 13)
        self.assertEqual(w["max_speed"], 16)
        self.assertEqual(w["sectors"], ["SE"])

    def test_strong_wind_wrong_direction(self):
        hours = [hour(f"2026-07-29T{h:02d}:00", 20, 270) for h in range(10, 16)]
        self.assertEqual(windlogic.find_windows(hours, RULES), [])

    def test_single_good_hour_below_min_hours(self):
        hours = [
            hour("2026-07-29T13:00", 8, 120),
            hour("2026-07-29T14:00", 14, 120),
            hour("2026-07-29T15:00", 8, 120),
        ]
        self.assertEqual(windlogic.find_windows(hours, RULES), [])

    def test_run_split_by_lull(self):
        hours = [
            hour("2026-07-29T10:00", 13, 60),
            hour("2026-07-29T11:00", 13, 60),
            hour("2026-07-29T12:00", 8, 60),
            hour("2026-07-29T13:00", 14, 60),
        ]
        windows = windlogic.find_windows(hours, RULES)
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0]["start"], "2026-07-29T10:00")
        self.assertEqual(windows[0]["end"], "2026-07-29T12:00")

    def test_hours_outside_daylight_excluded(self):
        hours = [
            hour("2026-07-29T19:00", 14, 90),
            hour("2026-07-29T20:00", 15, 90),
            hour("2026-07-29T21:00", 16, 90),
        ]
        self.assertEqual(windlogic.find_windows(hours, RULES), [])

    def test_non_contiguous_times_not_merged(self):
        hours = [
            hour("2026-07-29T18:00", 14, 90),
            hour("2026-07-29T19:00", 14, 90),
            hour("2026-07-30T08:00", 14, 90),
        ]
        windows = windlogic.find_windows(hours, RULES)
        self.assertEqual(len(windows), 1)
        self.assertEqual(windows[0]["start"], "2026-07-29T18:00")
        self.assertEqual(windows[0]["end"], "2026-07-29T20:00")


if __name__ == "__main__":
    unittest.main()
