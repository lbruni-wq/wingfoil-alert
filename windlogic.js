// Porting 1:1 di scripts/windlogic.py — stesso contratto, stessi casi di test.
const WindLogic = (() => {
  const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  function degToSector(deg) {
    return SECTORS[Math.floor((((deg % 360) + 360) % 360 + 22.5) / 45) % 8];
  }

  function hourOk(h, rules) {
    const t = parseInt(h.time.slice(11, 13), 10);
    return rules.day_start <= t && t < rules.day_end
      && h.speed >= rules.min_knots
      && rules.sectors.includes(degToSector(h.dir));
  }

  function findWindows(hours, rules) {
    const windows = [];
    let run = [];
    const flush = () => {
      if (run.length >= rules.min_hours) {
        const end = run[run.length - 1].time;
        const endIso = end.slice(0, 11)
          + String(parseInt(end.slice(11, 13), 10) + 1).padStart(2, "0")
          + end.slice(13);
        const sectors = [...new Set(run.map(h => degToSector(h.dir)))]
          .sort((a, b) => SECTORS.indexOf(a) - SECTORS.indexOf(b));
        windows.push({
          start: run[0].time,
          end: endIso,
          min_speed: Math.min(...run.map(h => h.speed)),
          max_speed: Math.max(...run.map(h => h.speed)),
          sectors,
        });
      }
      run = [];
    };
    let prev = null;
    for (const h of hours) {
      const contiguous = prev !== null
        && h.time.slice(0, 10) === prev.slice(0, 10)
        && parseInt(h.time.slice(11, 13), 10) === parseInt(prev.slice(11, 13), 10) + 1;
      if (hourOk(h, rules)) {
        if (run.length && !contiguous) flush();
        run.push(h);
      } else {
        flush();
      }
      prev = h.time;
    }
    flush();
    return { windows, hourOk };
  }

  // findWindows restituisce solo l'array nelle chiamate dell'app;
  // hourOk è esposto a parte per colorare il meteogramma.
  return {
    degToSector,
    hourOk,
    findWindows: (hours, rules) => findWindows(hours, rules).windows,
  };
})();

if (typeof module !== "undefined") module.exports = WindLogic;
