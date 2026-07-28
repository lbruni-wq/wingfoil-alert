/* WingFoil Alert — PWA. Quattro schermate: lista spot, dettaglio, impostazioni
   spot, aggiungi spot; navigazione via hash dell'URL. Ogni schermata risponde
   per prima alla domanda «quando è la prossima finestra utile?».

   Config effettiva: localStorage["wingfoil-config"] se presente, altrimenti
   config.json del repo (lo stesso file che legge il cron degli alert push).
   I dati Open-Meteo buoni restano in localStorage["wingfoil-cache"] come
   fallback offline. */

const LS_CONFIG = "wingfoil-config";
const LS_CACHE = "wingfoil-cache";
const LS_THEME = "wingfoil-theme";

const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu",
              "lug", "ago", "set", "ott", "nov", "dic"];
const DIR_GRID = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];
const ROSA = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];  // ordine di windlogic
const KN_MIN = 6, KN_MAX = 30;      // range della soglia in impostazioni
const CHART_MAX_KN = 24;            // fondo scala del grafico
const HORIZON = 48;                 // ore mostrate: striscia, grafico, tabella

const SPOT_DEFAULTS = {
  enabled: true, min_knots: 12, sectors: ["N", "NE", "E", "SE"],
  day_start: 8, day_end: 20, min_hours: 2,
};

let cfg = null;
const state = {
  view: "home", spotId: null, returnTo: "#/",
  data: new Map(),          // spotId -> { series, windows, daily, stale, error }
  draft: null,              // impostazioni in corso di modifica
  query: "", results: [], searchMsg: "", pos: null,
  lastUpdate: null, loading: true,
};

/* ---------- DOM ---------- */

function el(tag, opts = {}, ...kids) {
  const n = document.createElement(tag);
  if (opts.class) n.className = opts.class;
  if (opts.text != null) n.textContent = opts.text;
  if (opts.style) n.style.cssText = opts.style;
  for (const [k, v] of Object.entries(opts.attrs || {})) {
    if (v != null) n.setAttribute(k, v);
  }
  for (const [k, v] of Object.entries(opts.on || {})) n.addEventListener(k, v);
  // flat(Infinity): le viste passano liste annidate (mappe dentro mappe) e un
  // array non appiattito finirebbe nel DOM come testo.
  n.append(...kids.flat(Infinity).filter(Boolean));
  return n;
}

function svg(tag, attrs = {}, ...kids) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids.flat(Infinity).filter(Boolean));
  return n;
}

function rules() {
  return el("div", { class: "rules" }, el("i"), el("i"));
}

function kicker(text, accent) {
  return el("div", { class: accent ? "kicker kicker--accent" : "kicker", text });
}

/* ---------- formattazione ---------- */

const pad = n => String(n).padStart(2, "0");
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowHourIso() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return isoLocal(d);
}

function addHoursIso(iso, hours) {
  const d = new Date(iso);
  d.setHours(d.getHours() + hours);
  return isoLocal(d);
}

const dayLabel = d => `${cap(GIORNI[d.getDay()])} ${d.getDate()}`;
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const kn = v => `${Math.round(v)} kn`;

function decimale(v, dec = 1) {
  return v == null ? "—" : v.toFixed(dec).replace(".", ",");
}

function oreLabel(n) {
  return n === 1 ? "1 ora" : `${n} ore`;
}

/* ---------- config ---------- */

async function loadConfig() {
  const stored = localStorage.getItem(LS_CONFIG);
  if (stored) {
    try { return JSON.parse(stored); } catch { /* corrotta: riparte dal file */ }
  }
  const resp = await fetch("config.json");
  return resp.json();
}

function saveConfig() {
  localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(cfg, null, 2) + "\n"],
                        { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "config.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function spotById(id) {
  return cfg.spots.find(s => s.id === id);
}

/* ---------- tema (Carta / Inchiostro, con default di sistema) ---------- */

function themePref() {
  return localStorage.getItem(LS_THEME) || "system";
}

function applyTheme() {
  const pref = themePref();
  const dark = pref === "dark" || (pref === "system" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')
    .setAttribute("content", dark ? "#1a1918" : "#f3f2f2");
}

function setTheme(pref) {
  localStorage.setItem(LS_THEME, pref);
  applyTheme();
  render();
}

/* ---------- dati ---------- */

function forecastUrl(spot) {
  const p = new URLSearchParams({
    latitude: spot.lat, longitude: spot.lon,
    hourly: "wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m",
    daily: "sunrise,sunset",
    wind_speed_unit: "kn", timezone: "Europe/Rome", forecast_days: "4",
    models: cfg.forecast.model,
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

function marineUrl(spot) {
  const p = new URLSearchParams({
    latitude: spot.lat, longitude: spot.lon,
    hourly: "wave_height,sea_surface_temperature",
    timezone: "Europe/Rome", forecast_days: "4",
  });
  return `https://marine-api.open-meteo.com/v1/marine?${p}`;
}

/* Serie oraria di HORIZON ore a partire dall'ora corrente: vento, raffica,
   direzione, temperatura aria e — se il modello marino risponde — onda e
   temperatura dell'acqua. */
function buildSeries(data, marine, startIso, count) {
  const h = data.hourly;
  const idx = new Map(h.time.map((t, i) => [t, i]));
  const mh = marine && marine.hourly ? marine.hourly : null;
  const midx = mh ? new Map(mh.time.map((t, i) => [t, i])) : null;

  const out = [];
  let t = startIso;
  for (let k = 0; k < count; k++) {
    const i = idx.get(t);
    if (i != null && h.wind_speed_10m[i] != null && h.wind_direction_10m[i] != null) {
      const mi = midx ? midx.get(t) : null;
      out.push({
        time: t,
        speed: h.wind_speed_10m[i],
        gust: h.wind_gusts_10m?.[i] ?? h.wind_speed_10m[i],
        dir: h.wind_direction_10m[i],
        temp: h.temperature_2m?.[i] ?? null,
        wave: mi != null ? mh.wave_height?.[mi] ?? null : null,
        sst: mi != null ? mh.sea_surface_temperature?.[mi] ?? null : null,
      });
    }
    t = addHoursIso(t, 1);
  }
  return out;
}

async function fetchSpot(spot) {
  const cache = JSON.parse(localStorage.getItem(LS_CACHE) || "{}");
  let data = null, marine = null, stale = null;

  try {
    const resp = await fetch(forecastUrl(spot));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = await resp.json();
    // Risposta servita dal service worker perché la rete manca: i numeri sono
    // quelli dell'ultimo giro buono, non di adesso.
    if (resp.headers.get("X-Wingfoil-Cache") === "hit") {
      stale = cache[spot.id]?.at || "un giro precedente";
      marine = cache[spot.id]?.marine || null;
    }
  } catch (e) {
    const c = cache[spot.id];
    if (!c) return { error: e.message };
    data = c.data;
    marine = c.marine || null;
    stale = c.at;
  }

  if (!stale) {
    // Il modello marino è un extra: se manca, la colonna "mare" resta vuota.
    try {
      const resp = await fetch(marineUrl(spot));
      if (resp.ok) marine = await resp.json();
    } catch { /* niente dati mare: si prosegue */ }
    cache[spot.id] = { at: isoLocal(new Date()), data, marine };
    try { localStorage.setItem(LS_CACHE, JSON.stringify(cache)); }
    catch { /* quota piena: la cache è solo un extra */ }
  }

  const series = buildSeries(data, marine, nowHourIso(), HORIZON);
  return {
    series,
    windows: WindLogic.findWindows(series, spot),
    daily: data.daily || null,
    stale,
  };
}

async function refresh() {
  const results = await Promise.all(cfg.spots.map(async spot => {
    try { return [spot.id, await fetchSpot(spot)]; }
    catch (e) { return [spot.id, { error: e.message }]; }
  }));
  state.data = new Map(results);
  state.lastUpdate = new Date();
  state.loading = false;
  // Impostazioni e ricerca hanno campi in corso di compilazione: non si
  // ridisegnano sotto le dita dell'utente.
  if (state.view === "home" || state.view === "detail") render();
}

/* Ricalcola finestre e serie senza rifare la rete (dopo un cambio di regole). */
function recompute(spotId) {
  const d = state.data.get(spotId);
  const spot = spotById(spotId);
  if (d && d.series && spot) d.windows = WindLogic.findWindows(d.series, spot);
}

/* ---------- derivati ---------- */

function windowInfo(w) {
  const s = new Date(w.start), e = new Date(w.end);
  return {
    start: s, end: e,
    giorno: dayLabel(s),
    ore: `${hhmm(s)} – ${hhmm(e)}`,
    oreCorte: `${s.getHours()} – ${e.getHours()}`,
    durata: Math.round((e - s) / 3600000),
    nodi: `${Math.round(w.min_speed)}–${Math.round(w.max_speed)} kn`,
    settori: w.sectors.join("/"),
    fra: Math.round((s - new Date()) / 3600000),
  };
}

function stripColor(h, spot) {
  const t = Number(h.time.slice(11, 13));
  if (t < spot.day_start || t >= spot.day_end) return "var(--n200)";
  if (h.speed >= spot.min_knots) {
    return spot.sectors.includes(WindLogic.degToSector(h.dir))
      ? "var(--accent-600)" : "var(--accent-200)";
  }
  return "var(--n300)";
}

function inWindow(iso, windows) {
  return windows.some(w => iso >= w.start && iso < w.end);
}

function stripDays(series) {
  const giorni = [...new Set(series.map(h => h.time.slice(0, 10)))].slice(1, 3);
  return giorni.map(d => dayLabel(new Date(`${d}T12:00`)).toLowerCase());
}

/* Prima finestra utile fra tutti gli spot con avvisi attivi. */
function nextGlobal() {
  let best = null;
  for (const spot of cfg.spots) {
    if (!spot.enabled) continue;
    const d = state.data.get(spot.id);
    if (!d || !d.windows || !d.windows.length) continue;
    const w = d.windows[0];
    if (!best || w.start < best.w.start) best = { spot, w };
  }
  return best;
}

function regoleRiassunto(spot) {
  return `soglia ${spot.min_knots} kn · ${spot.sectors.join(" / ") || "nessuna direzione"}` +
         ` · ${pad(spot.day_start)}–${pad(spot.day_end)}`;
}

/* ---------- navigazione ---------- */

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "aggiungi") {
    state.view = "add";
  } else if (parts[0] === "spot" && spotById(parts[1])) {
    state.spotId = parts[1];
    if (parts[2] === "regola") {
      state.view = "settings";
      const spot = spotById(parts[1]);
      state.draft = {
        enabled: spot.enabled !== false,
        min_knots: spot.min_knots,
        sectors: [...spot.sectors],
        day_start: spot.day_start,
        day_end: spot.day_end,
        min_hours: spot.min_hours,
      };
    } else {
      state.view = "detail";
      state.returnTo = `#/spot/${parts[1]}`;
    }
  } else {
    state.view = "home";
    state.returnTo = "#/";
  }
  render();
  window.scrollTo(0, 0);
}

/* ---------- vista: lista spot ---------- */

function viewHome() {
  const oggi = new Date();
  const dateline = [
    `${cap(GIORNI[oggi.getDay()])} ${oggi.getDate()} ${MESI[oggi.getMonth()]}`,
    state.lastUpdate
      ? `agg. ${hhmm(state.lastUpdate)}`
      : (state.loading ? "carico…" : "mai aggiornato"),
  ].join(" · ");

  const head = el("div", { class: "bar", style: "align-items:flex-start" },
    el("div", { class: "stack" },
      el("div", { class: "wordmark" }, document.createTextNode("WingFoil "),
        el("em", { text: "Alert" })),
      el("div", { class: "dateline", text: dateline })),
    el("button", {
      class: "btn-plus", text: "+",
      attrs: { type: "button", title: "Aggiungi spot", "aria-label": "Aggiungi spot" },
      on: { click: () => go("#/aggiungi") },
    }));

  const blocchi = [head, rules()];

  const stale = [...state.data.values()].some(d => d.stale);
  if (stale) {
    blocchi.push(el("p", { class: "note note--warn",
      text: "Rete assente: mostro gli ultimi dati salvati." }));
  }

  blocchi.push(nextWindowBlock());

  blocchi.push(cfg.spots.length
    ? el("div", { class: "stack stack--28" }, cfg.spots.map(s => spotBlock(s)))
    : el("p", { class: "secondary",
        text: "Nessuno spot: aggiungine uno col + qui sopra." }));

  blocchi.push(el("div", { class: "stack stack--14 push-down" },
    el("div", { class: "legend" },
      el("span", {}, el("i", { style: "background:var(--accent-600)" }),
        document.createTextNode("vento valido")),
      el("span", {}, el("i", { style: "background:var(--accent-200)" }),
        document.createTextNode("sopra soglia, direzione no")),
      el("span", {}, el("i", { style: "background:var(--n300)" }),
        document.createTextNode("sotto soglia"))),
    themeAndExport()));

  return blocchi;
}

function nextWindowBlock() {
  const best = nextGlobal();
  if (!best) {
    return el("div", { class: "stack stack--8 next-window" },
      kicker("Prossima finestra utile", true),
      el("div", { class: "display", text: state.loading ? "…" : "Niente" }),
      el("p", { class: "secondary",
        text: state.loading
          ? "Sto leggendo le previsioni."
          : `Nessuna finestra nelle prossime ${HORIZON} ore sugli spot con avvisi attivi.` }));
  }
  const i = windowInfo(best.w);
  return el("div", { class: "stack stack--8 next-window" },
    kicker("Prossima finestra utile", true),
    el("div", { class: "baseline" },
      el("div", { class: "display", text: i.giorno }),
      el("div", { class: "display-time", text: i.oreCorte })),
    el("div", { style: "font-size:19px; line-height:1.4" },
      document.createTextNode(`${best.spot.name} · ${i.nodi} da `),
      el("span", { style: "font-weight:600", text: i.settori })),
    el("p", { class: "secondary",
      text: `${i.fra <= 0 ? "adesso" : `fra ${oreLabel(i.fra)}`} · ` +
            `${oreLabel(i.durata)} piene sopra soglia` }));
}

function spotBlock(spot) {
  const d = state.data.get(spot.id) || {};
  const w = d.windows && d.windows.length ? windowInfo(d.windows[0]) : null;

  const blocco = el("div", { class: `stack stack--10${w ? "" : " spot--quiet"}` });

  blocco.append(el("div", { class: "row" },
    el("button", {
      class: "plain-btn spot-head",
      attrs: { type: "button", "aria-label": `Dettaglio ${spot.name}` },
      on: { click: () => go(`#/spot/${spot.id}`) },
    },
      el("i", { class: w ? "dot" : "dot dot--off" }),
      el("span", { class: "spot-name", text: spot.name })),
    el("button", {
      class: "link link--trail", text: "regola",
      attrs: { type: "button" },
      on: { click: () => openSettings(spot.id) },
    })));

  if (d.error) {
    blocco.append(el("p", { class: "note note--warn",
      text: `Dati non disponibili: ${d.error}` }));
    return blocco;
  }
  if (!d.series || !d.series.length) {
    blocco.append(el("p", { class: "verdict verdict--none",
      text: state.loading ? "Carico le previsioni…" : "Nessun dato." }));
    return blocco;
  }

  if (w) {
    blocco.append(el("p", { class: "verdict" },
      el("strong", { text: `${w.giorno}, ${w.ore}` }),
      document.createTextNode(` · ${w.nodi} ${w.settori}`)));
  } else {
    const max = Math.max(0, ...d.series.map(h => h.speed));
    blocco.append(el("p", { class: "verdict verdict--none",
      text: `Nessuna finestra nelle prossime ${HORIZON} ore · max ${kn(max)}` }));
  }

  if (spot.enabled === false) {
    blocco.append(el("div", { class: "kicker", text: "avvisi off" }));
  }

  blocco.append(el("button", {
    class: "plain-btn",
    attrs: { type: "button", "aria-label": `Previsione 48 ore ${spot.name}` },
    on: { click: () => go(`#/spot/${spot.id}`) },
  }, el("div", { class: "strip" },
    d.series.map(h => el("i", { style: `background:${stripColor(h, spot)}` })))));

  const giorni = stripDays(d.series);
  blocco.append(el("div", { class: "axis" },
    el("span", { text: "ora" }),
    giorni.map(g => el("span", { text: g })),
    el("span", { text: `+${HORIZON} h` })));

  return blocco;
}

function themeAndExport() {
  const pref = themePref();
  const scelte = [["system", "Sistema"], ["light", "Carta"], ["dark", "Inchiostro"]];
  return el("div", { class: "stack stack--10" },
    kicker("App"),
    el("div", { class: "grid-row" }, scelte.map(([id, label]) => el("button", {
      class: "chip chip--theme", text: label,
      attrs: { type: "button", "aria-pressed": String(pref === id) },
      on: { click: () => setTheme(id) },
    }))),
    el("button", {
      class: "link", text: "Esporta config.json",
      attrs: { type: "button" }, on: { click: exportConfig },
    }),
    el("p", { class: "caption",
      text: "Per aggiornare anche gli alert push, committa il config.json " +
            "esportato nel repository GitHub." }));
}

/* ---------- vista: dettaglio spot ---------- */

function viewDetail() {
  const spot = spotById(state.spotId);
  const d = state.data.get(spot.id) || {};

  const blocchi = [
    el("div", { class: "bar" },
      el("button", {
        class: "link link--bar link--lead", text: "← Spot",
        attrs: { type: "button" }, on: { click: () => go("#/") },
      }),
      el("button", {
        class: "link link--bar link--trail", text: "regola",
        attrs: { type: "button" }, on: { click: () => openSettings(spot.id) },
      })),
    el("div", { class: "stack stack--4" },
      el("h1", { class: "screen-title", text: spot.name }),
      el("div", { class: "rules-summary", text: regoleRiassunto(spot) })),
    rules(),
  ];

  if (d.error || !d.series || !d.series.length) {
    blocchi.push(el("p", { class: "note note--warn",
      text: d.error ? `Dati non disponibili: ${d.error}`
                    : (state.loading ? "Carico le previsioni…" : "Nessun dato.") }));
    return blocchi;
  }

  const windows = d.windows || [];
  const w = windows.length ? windowInfo(windows[0]) : null;

  if (w) {
    const dentro = d.series.filter(h => inWindow(h.time, [windows[0]]));
    const picco = dentro.reduce((a, b) => (b.speed > a.speed ? b : a), dentro[0]);
    const raffica = Math.max(...dentro.map(h => h.gust));
    blocchi.push(el("div", { class: "stack stack--6" },
      kicker("Prossima finestra", true),
      el("div", { class: "window-headline", text: `${w.giorno} · ${w.ore}` }),
      el("p", { class: "muted",
        text: `picco ${kn(picco.speed)} alle ${picco.time.slice(11, 13)} · ` +
              `raffiche ${kn(raffica)} · ${WindLogic.degToSector(picco.dir)} ` +
              `${Math.round(picco.dir)}°` })));
  } else {
    const max = Math.max(0, ...d.series.map(h => h.speed));
    blocchi.push(el("div", { class: "stack stack--6" },
      kicker("Prossima finestra", true),
      el("div", { class: "window-headline", text: "Nessuna" }),
      el("p", { class: "muted",
        text: `nelle prossime ${HORIZON} ore il massimo è ${kn(max)}` })));
  }

  blocchi.push(el("div", { class: "stack stack--8" },
    kicker(`Vento e raffiche · ${HORIZON} h · kn`),
    chart(d.series, spot, windows)));

  blocchi.push(hoursTable(d.series, windows));
  blocchi.push(detailStats(d));
  return blocchi;
}

function chart(series, spot, windows) {
  const W = 350, BASE = 110, TOP = 10;
  const step = W / (series.length - 1 || 1);
  const y = v => BASE - Math.min(CHART_MAX_KN, Math.max(0, v)) *
                        ((BASE - TOP) / CHART_MAX_KN);
  const pts = key => series
    .map((h, i) => `${(i * step).toFixed(1)},${y(h[key]).toFixed(1)}`).join(" ");

  const bande = windows.map(w => {
    const i0 = series.findIndex(h => h.time === w.start);
    let i1 = series.findIndex(h => h.time >= w.end);
    if (i1 < 0) i1 = series.length - 1;
    return i0 < 0 ? null : { x: i0 * step, w: Math.max(step, (i1 - i0) * step) };
  }).filter(Boolean);

  const nodes = [
    bande.map(b => svg("rect", { x: b.x.toFixed(1), y: 0, width: b.w.toFixed(1),
                                 height: BASE, fill: "var(--accent-200)" })),
    svg("line", { x1: 0, y1: BASE, x2: W, y2: BASE,
                  stroke: "var(--n400)", "stroke-width": 1 }),
    svg("line", { x1: 0, y1: TOP, x2: W, y2: TOP,
                  stroke: "var(--n300)", "stroke-width": 1 }),
    svg("line", { x1: 0, y1: y(spot.min_knots), x2: W, y2: y(spot.min_knots),
                  stroke: "var(--accent-2)", "stroke-width": 1.5,
                  "stroke-dasharray": "5 4" }),
    svg("polyline", { points: pts("gust"), fill: "none", stroke: "var(--n500)",
                      "stroke-width": 1.25, "stroke-dasharray": "3 3" }),
    svg("polyline", { points: pts("speed"), fill: "none",
                      stroke: "var(--accent-700)", "stroke-width": 2.25,
                      "stroke-linejoin": "round" }),
    svg("text", { x: 4, y: TOP - 3, "font-size": 10, fill: "var(--n600)" },
        document.createTextNode(String(CHART_MAX_KN))),
    svg("text", { x: 4, y: y(spot.min_knots) - 3, "font-size": 10,
                  fill: "var(--accent-2-700)" },
        document.createTextNode(`${spot.min_knots} soglia`)),
  ];

  // asse x: etichetta di giorno al cambio di data, direzione ogni 6 ore
  let data = series[0].time.slice(0, 10);
  series.forEach((h, i) => {
    if (h.time.slice(0, 10) !== data) {
      data = h.time.slice(0, 10);
      const x = Math.min(W - 40, i * step + 3);
      nodes.push(svg("text", { x, y: 126, "font-size": 11, fill: "var(--n700)" },
        document.createTextNode(dayLabel(new Date(h.time)).toLowerCase())));
    }
  });
  series.forEach((h, i) => {
    if (i % 6) return;
    const dentro = inWindow(h.time, windows);
    nodes.push(svg("text", {
      x: Math.min(W - 16, i * step + 2), y: 144, "font-size": 11,
      fill: dentro ? "var(--accent-700)" : "var(--n500)",
    }, document.createTextNode(WindLogic.degToSector(h.dir))));
  });

  return svg("svg", {
    class: "chart", viewBox: "0 0 350 150", role: "img",
    "aria-label": `Vento e raffiche delle prossime ${HORIZON} ore`,
  }, nodes);
}

function hoursTable(series, windows) {
  const t = el("div", { class: "hours" },
    el("div", { class: "hours-head" },
      el("span", { class: "c-h", text: "ora" }),
      el("span", { class: "c-wind", text: "vento" }),
      el("span", { class: "c-gust", text: "raffica" }),
      el("span", { class: "c-dir", text: "dir" }),
      el("span", { class: "c-sea", text: "mare" })));

  let data = null;
  for (const h of series) {
    if (h.time.slice(0, 10) !== data) {
      data = h.time.slice(0, 10);
      t.append(el("div", { class: "hours-day",
        text: dayLabel(new Date(h.time)) }));
    }
    const on = inWindow(h.time, windows);
    t.append(el("div", { class: on ? "hours-row hours-row--on" : "hours-row" },
      el("span", { class: "c-h", text: `${h.time.slice(11, 13)}:00` }),
      el("span", { class: "c-wind", text: kn(h.speed) }),
      el("span", { class: "c-gust", text: kn(h.gust) }),
      el("span", { class: "c-dir", text: WindLogic.degToSector(h.dir) }),
      el("span", { class: "c-sea",
        text: h.wave == null ? "—" : `${decimale(h.wave)} m` })));
  }
  return t;
}

function detailStats(d) {
  const ora = d.series[0];
  const parti = [];
  if (ora.sst != null) parti.push(`acqua ${decimale(ora.sst, 0)}°`);
  if (ora.temp != null) parti.push(`aria ${decimale(ora.temp, 0)}°`);
  const tramonto = (d.daily?.sunset || []).find(s => s > isoLocal(new Date()));
  if (tramonto) parti.push(`tramonto ${tramonto.slice(11, 16)}`);
  if (d.stale) parti.push(`dati del ${d.stale.replace("T", " ")}`);
  return el("div", { class: "stats" }, parti.map(p => el("span", { text: p })));
}

/* ---------- vista: impostazioni spot ---------- */

function openSettings(spotId) {
  state.returnTo = location.hash || "#/";
  go(`#/spot/${spotId}/regola`);
}

/* I comandi delle impostazioni aggiornano solo i nodi che cambiano: un
   re-render integrale interromperebbe il trascinamento dello slider. */
function knotsPct(v) {
  return `${((v - KN_MIN) / (KN_MAX - KN_MIN)) * 100}%`;
}

function knotsHint(v) {
  return v <= 11 ? "wing grande, giornata leggera"
    : v >= 20 ? "solo giorni forti" : "vento pieno, ala media";
}

function recapText(dr) {
  return `Ti avviso quando il vento supera ${dr.min_knots} kn da ` +
         `${dr.sectors.join(" / ") || "nessuna direzione"} per almeno ` +
         `${dr.min_hours} h, tra le ${pad(dr.day_start)}:00 e le ` +
         `${pad(dr.day_end)}:00.`;
}

function patchSettings(what) {
  const dr = state.draft;
  const byId = id => document.getElementById(id);
  if (what === "knots") {
    const sl = byId("set-knots");
    if (sl) {
      sl.value = dr.min_knots;
      sl.style.setProperty("--pct", knotsPct(dr.min_knots));
    }
    byId("set-knots-value").textContent = `${dr.min_knots} kn`;
    byId("set-knots-hint").textContent = knotsHint(dr.min_knots);
  }
  byId("set-recap").textContent = recapText(dr);
}

function viewSettings() {
  const spot = spotById(state.spotId);
  const dr = state.draft;

  const setKnots = v => {
    dr.min_knots = Math.min(KN_MAX, Math.max(KN_MIN, v));
    patchSettings("knots");
  };

  const oreSelect = (campo, value, from, to) => {
    const s = el("select", {
      class: "field",
      attrs: { "aria-label": campo === "day_start" ? "dalle" : "alle" },
      on: { change: e => { dr[campo] = Number(e.target.value); patchSettings(); } },
    });
    for (let h = from; h <= to; h++) {
      s.add(new Option(`${pad(h)}:00`, h, false, h === value));
    }
    return s;
  };

  return [
    el("div", { class: "bar" },
      el("button", {
        class: "link link--bar link--lead", text: "← Annulla",
        attrs: { type: "button" }, on: { click: () => go(state.returnTo) },
      }),
      el("button", {
        class: "btn-primary", text: "Salva",
        attrs: { type: "button" }, on: { click: saveSettings },
      })),

    el("div", { class: "stack stack--4" },
      kicker("Impostazioni"),
      el("h1", { class: "screen-title", text: spot.name })),
    rules(),

    el("button", {
      class: "toggle",
      attrs: { type: "button", role: "switch", "aria-checked": String(dr.enabled) },
      on: { click: e => {
        dr.enabled = !dr.enabled;
        e.currentTarget.setAttribute("aria-checked", String(dr.enabled));
      } },
    },
      el("span", { class: "stack" },
        el("span", { class: "section-label", text: "Avvisami per questo spot" }),
        el("span", { class: "caption",
          text: "notifica appena si apre una finestra" })),
      el("span", { class: "switch" }, el("i"))),

    el("div", { class: "stack stack--12" },
      el("div", { class: "row" },
        el("span", { class: "section-label", text: "Soglia vento" }),
        el("span", { attrs: { id: "set-knots-value" },
          style: "font-size:26px; font-weight:600; color:var(--accent-700)",
          text: `${dr.min_knots} kn` })),
      el("div", { class: "row row--center", style: "gap:12px" },
        el("button", {
          class: "step-btn", text: "−",
          attrs: { type: "button", "aria-label": "Meno un nodo" },
          on: { click: () => setKnots(dr.min_knots - 1) },
        }),
        el("input", {
          class: "slider", style: `--pct:${knotsPct(dr.min_knots)}`,
          attrs: { type: "range", id: "set-knots", min: KN_MIN, max: KN_MAX,
                   step: 1, value: dr.min_knots,
                   "aria-label": "Soglia vento in nodi" },
          on: { input: e => setKnots(Number(e.target.value)) },
        }),
        el("button", {
          class: "step-btn", text: "+",
          attrs: { type: "button", "aria-label": "Più un nodo" },
          on: { click: () => setKnots(dr.min_knots + 1) },
        })),
      el("p", { class: "caption", attrs: { id: "set-knots-hint" },
        text: knotsHint(dr.min_knots) })),

    el("div", { class: "stack stack--12" },
      el("div", { class: "row" },
        el("span", { class: "section-label", text: "Direzioni valide" }),
        spot.coast_deg != null
          ? el("span", { class: "caption", text: `costa esposta a ${spot.coast_deg}°` })
          : null),
      el("div", { class: "grid3" }, DIR_GRID.map(dir => {
        if (!dir) {
          return el("div", { class: "chip chip--dir chip--static",
            text: spot.coast_deg != null ? `${spot.coast_deg}°` : "·" });
        }
        return el("button", {
          class: "chip chip--dir", text: dir,
          attrs: { type: "button", "aria-pressed": String(dr.sectors.includes(dir)) },
          on: { click: e => {
            const on = dr.sectors.includes(dir);
            dr.sectors = on ? dr.sectors.filter(s => s !== dir)
                            : [...dr.sectors, dir];
            // ordine della rosa: il recap e il config restano leggibili
            dr.sectors.sort((a, b) => ROSA.indexOf(a) - ROSA.indexOf(b));
            e.currentTarget.setAttribute("aria-pressed", String(!on));
            patchSettings();
          } },
        });
      }))),

    el("div", { class: "stack stack--12" },
      el("span", { class: "section-label", text: "Fascia oraria" }),
      el("div", { class: "row row--center", style: "gap:12px" },
        el("label", { class: "label-inline" },
          el("span", { text: "dalle" }),
          oreSelect("day_start", dr.day_start, 0, 23)),
        el("label", { class: "label-inline" },
          el("span", { text: "alle" }),
          oreSelect("day_end", dr.day_end, 1, 24)))),

    el("div", { class: "stack stack--12" },
      el("span", { class: "section-label", text: "Durata minima" }),
      el("div", { class: "grid-row", attrs: { id: "set-durate" } },
        [1, 2, 3, 4].map(n => el("button", {
          class: "chip chip--dur", text: `${n} h`,
          attrs: { type: "button", "aria-pressed": String(dr.min_hours === n) },
          on: { click: e => {
            dr.min_hours = n;
            for (const b of e.currentTarget.parentElement.children) {
              b.setAttribute("aria-pressed", String(b === e.currentTarget));
            }
            patchSettings();
          } },
        })))),

    el("div", { class: "stack stack--14 push-down" },
      el("p", { class: "secondary", attrs: { id: "set-recap" },
        text: recapText(dr) }),
      el("button", {
        class: "link link--danger", text: "Elimina questo spot",
        attrs: { type: "button" }, on: { click: deleteSpot },
      })),
  ];
}

function saveSettings() {
  const spot = spotById(state.spotId);
  const dr = state.draft;
  spot.enabled = dr.enabled;
  spot.min_knots = dr.min_knots;
  spot.sectors = dr.sectors;
  spot.day_start = dr.day_start;
  spot.day_end = Math.max(dr.day_start + 1, dr.day_end);
  spot.min_hours = dr.min_hours;
  saveConfig();
  recompute(spot.id);
  go(state.returnTo);
}

function deleteSpot() {
  const spot = spotById(state.spotId);
  if (!confirm(`Eliminare lo spot ${spot.name}?`)) return;
  cfg.spots = cfg.spots.filter(s => s.id !== spot.id);
  state.data.delete(spot.id);
  saveConfig();
  go("#/");
}

/* ---------- vista: aggiungi spot ---------- */

function distanzaKm(a, b) {
  const R = 6371, rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function slugify(name) {
  const base = name.toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let id = base || "spot", n = 2;
  while (cfg.spots.some(s => s.id === id)) id = `${base}-${n++}`;
  return id;
}

let searchTimer = null;

async function runSearch(q) {
  state.query = q;
  if (q.length < 3) {
    state.results = [];
    state.searchMsg = "";
    renderResults();
    return;
  }
  try {
    const url = "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({ name: q, count: "8", language: "it" });
    const resp = await fetch(url);
    const data = await resp.json();
    state.results = data.results || [];
    if (state.pos) {
      state.results.sort((a, b) =>
        distanzaKm(state.pos, { lat: a.latitude, lon: a.longitude }) -
        distanzaKm(state.pos, { lat: b.latitude, lon: b.longitude }));
    }
    state.searchMsg = state.results.length ? "" : "Nessuna località trovata.";
  } catch {
    state.results = [];
    state.searchMsg = "Ricerca non disponibile: serve la rete.";
  }
  renderResults();
}

function resultRows() {
  const rows = state.results.map(r => {
    const meta = [r.admin1 || r.country, state.pos
      ? `${decimale(distanzaKm(state.pos, { lat: r.latitude, lon: r.longitude }), 0)} km`
      : `${decimale(r.latitude, 3)} / ${decimale(r.longitude, 3)}`].filter(Boolean);
    return el("button", {
      class: "result", attrs: { type: "button" },
      on: { click: () => addSpot(r) },
    },
      el("span", { class: "stack", style: "gap:3px" },
        el("span", { class: "result-name", text: r.name }),
        el("span", { class: "result-meta", text: meta.join(" · ") })),
      el("span", { class: "result-add", text: "aggiungi" }));
  });
  if (state.searchMsg) rows.push(el("p", { class: "caption", text: state.searchMsg }));
  return rows;
}

function renderResults() {
  const box = document.getElementById("results");
  if (box) box.replaceChildren(...resultRows());
}

function addSpot(r) {
  const spot = {
    id: slugify(r.name), name: r.name,
    lat: Math.round(r.latitude * 1000) / 1000,
    lon: Math.round(r.longitude * 1000) / 1000,
    ...structuredClone(SPOT_DEFAULTS),
  };
  cfg.spots.push(spot);
  saveConfig();
  state.query = "";
  state.results = [];
  state.returnTo = "#/";
  fetchSpot(spot).then(d => { state.data.set(spot.id, d); render(); })
                 .catch(() => {});
  go(`#/spot/${spot.id}/regola`);
}

function usaPosizione() {
  if (!navigator.geolocation) {
    state.searchMsg = "Questo dispositivo non dà la posizione.";
    renderResults();
    return;
  }
  navigator.geolocation.getCurrentPosition(p => {
    state.pos = { lat: p.coords.latitude, lon: p.coords.longitude };
    state.searchMsg = "";
    if (state.query.length >= 3) runSearch(state.query);
    else { state.searchMsg = "Posizione presa: i risultati mostrano la distanza da te."; renderResults(); }
  }, () => {
    state.searchMsg = "Permesso posizione negato.";
    renderResults();
  }, { timeout: 10000 });
}

function viewAdd() {
  const input = el("input", {
    class: "input",
    attrs: { type: "search", id: "cerca", value: state.query, autocomplete: "off",
             placeholder: "es. Civitanova Marche", enterkeyhint: "search" },
    on: { input: e => {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      searchTimer = setTimeout(() => runSearch(q), 350);
    } },
  });

  return [
    el("div", { class: "bar", style: "justify-content:flex-start" },
      el("button", {
        class: "link link--bar link--lead", text: "← Chiudi",
        attrs: { type: "button" }, on: { click: () => go("#/") },
      })),
    el("h1", { class: "screen-title", text: "Aggiungi spot" }),
    rules(),

    el("div", { class: "stack stack--8" },
      el("label", { class: "kicker", attrs: { for: "cerca" }, text: "Cerca località" }),
      input),

    el("div", { class: "stack" },
      el("div", { class: "kicker", style: "padding-bottom:8px", text: "Risultati" }),
      el("div", { class: "results", attrs: { id: "results" } }, resultRows())),

    el("div", { class: "stack stack--10" },
      kicker("Vicino a te"),
      el("button", {
        class: "btn-outline", text: "Usa la mia posizione",
        attrs: { type: "button" }, on: { click: usaPosizione },
      })),

    el("p", { class: "secondary push-down",
      text: `Il nuovo spot parte con soglia ${SPOT_DEFAULTS.min_knots} kn e ` +
            `direzioni ${SPOT_DEFAULTS.sectors.join(" / ")}: puoi correggerle subito dopo.` }),
  ];
}

/* ---------- render ---------- */

function render() {
  const app = document.getElementById("app");
  const viste = { home: viewHome, detail: viewDetail, settings: viewSettings, add: viewAdd };
  const nodi = (viste[state.view] || viewHome)();
  app.replaceChildren(...nodi.flat(Infinity).filter(Boolean));
}

/* ---------- avvio ---------- */

async function init() {
  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", applyTheme);

  cfg = await loadConfig();
  for (const spot of cfg.spots) {
    for (const [k, v] of Object.entries(SPOT_DEFAULTS)) {
      if (spot[k] === undefined) spot[k] = structuredClone(v);
    }
  }

  window.addEventListener("hashchange", route);
  route();
  await refresh();

  setInterval(refresh, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
