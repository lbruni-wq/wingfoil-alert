// Casi condivisi con tests/test_windlogic.py (a-f). Esce 1 al primo errore.
const W = require("../windlogic.js");
const assert = require("assert");

const RULES = { min_knots: 12, sectors: ["N", "NE", "E", "SE"],
                day_start: 8, day_end: 20, min_hours: 2 };
const hour = (time, speed, dir) => ({ time, speed, gust: speed + 4, dir });

// (f) degToSector
for (const [deg, exp] of [[0, "N"], [350, "N"], [337.5, "N"], [22.5, "NE"],
                          [45, "NE"], [120, "SE"], [200, "S"], [270, "W"],
                          [300, "NW"], [360, "N"]]) {
  assert.strictEqual(W.degToSector(deg), exp, `deg=${deg}`);
}

// (a) 4 ore buone -> 1 finestra 14-18
let windows = W.findWindows([
  hour("2026-07-29T13:00", 8, 120),
  hour("2026-07-29T14:00", 13, 120),
  hour("2026-07-29T15:00", 14, 125),
  hour("2026-07-29T16:00", 16, 130),
  hour("2026-07-29T17:00", 13, 118),
  hour("2026-07-29T18:00", 9, 120),
], RULES);
assert.strictEqual(windows.length, 1);
assert.deepStrictEqual(windows[0], {
  start: "2026-07-29T14:00", end: "2026-07-29T18:00",
  min_speed: 13, max_speed: 16, sectors: ["SE"],
});

// (b) forte ma da W -> niente
windows = W.findWindows(
  Array.from({ length: 6 }, (_, i) => hour(`2026-07-29T${10 + i}:00`, 20, 270)),
  RULES);
assert.strictEqual(windows.length, 0);

// (c) 1 sola ora buona -> niente
windows = W.findWindows([
  hour("2026-07-29T13:00", 8, 120),
  hour("2026-07-29T14:00", 14, 120),
  hour("2026-07-29T15:00", 8, 120),
], RULES);
assert.strictEqual(windows.length, 0);

// (d) run spezzata da un buco
windows = W.findWindows([
  hour("2026-07-29T10:00", 13, 60),
  hour("2026-07-29T11:00", 13, 60),
  hour("2026-07-29T12:00", 8, 60),
  hour("2026-07-29T13:00", 14, 60),
], RULES);
assert.strictEqual(windows.length, 1);
assert.strictEqual(windows[0].start, "2026-07-29T10:00");
assert.strictEqual(windows[0].end, "2026-07-29T12:00");

// (e) fuori fascia oraria: resta solo l'ora 19, sotto min_hours -> niente
windows = W.findWindows([
  hour("2026-07-29T19:00", 14, 90),
  hour("2026-07-29T20:00", 15, 90),
  hour("2026-07-29T21:00", 16, 90),
], RULES);
assert.strictEqual(windows.length, 0);

// ore non contigue (giorni diversi) non si fondono
windows = W.findWindows([
  hour("2026-07-29T18:00", 14, 90),
  hour("2026-07-29T19:00", 14, 90),
  hour("2026-07-30T08:00", 14, 90),
], RULES);
assert.strictEqual(windows.length, 1);
assert.strictEqual(windows[0].end, "2026-07-29T20:00");

console.log("windlogic.js: tutti i casi OK");
