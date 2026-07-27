/* WingFoil Alert — dashboard PWA.
   Config effettiva: localStorage["wingfoil-config"] se presente, altrimenti
   config.json del repo. I dati Open-Meteo buoni vengono tenuti in
   localStorage["wingfoil-cache"] come fallback offline. */

const LS_CONFIG = "wingfoil-config";
const LS_CACHE = "wingfoil-cache";
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const SPOT_DEFAULTS = {
  enabled: true, min_knots: 12, sectors: ["N", "NE", "E", "SE"],
  day_start: 8, day_end: 20, min_hours: 2,
};

let cfg = null;

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

/* ---------- dati ---------- */

function forecastUrl(spot) {
  const p = new URLSearchParams({
    latitude: spot.lat, longitude: spot.lon,
    hourly: "wind_speed_10m,wind_gusts_10m,wind_direction_10m",
    wind_speed_unit: "kn", timezone: "Europe/Rome", forecast_days: "4",
    models: cfg.forecast.model,
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

function parseHours(apiJson) {
  const h = apiJson.hourly;
  const out = [];
  for (let i = 0; i < h.time.length; i++) {
    if (h.wind_speed_10m[i] == null || h.wind_direction_10m[i] == null) continue;
    out.push({ time: h.time[i], speed: h.wind_speed_10m[i],
               gust: h.wind_gusts_10m[i] ?? h.wind_speed_10m[i],
               dir: h.wind_direction_10m[i] });
  }
  return out;
}

function nowLocalIso() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHoursIso(iso, hours) {
  const d = new Date(iso);
  d.setHours(d.getHours() + hours);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchForecast(spot) {
  const cache = JSON.parse(localStorage.getItem(LS_CACHE) || "{}");
  try {
    const resp = await fetch(forecastUrl(spot));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    cache[spot.id] = { at: nowLocalIso(), data };
    localStorage.setItem(LS_CACHE, JSON.stringify(cache));
    return { data, stale: null };
  } catch (e) {
    const c = cache[spot.id];
    if (c) return { data: c.data, stale: c.at };
    throw e;
  }
}

/* ---------- render ---------- */

function fmtWindow(w) {
  const s = new Date(w.start), e = new Date(w.end);
  const giorno = `${GIORNI[s.getDay()]} ${String(s.getDate()).padStart(2, "0")}/` +
                 `${String(s.getMonth() + 1).padStart(2, "0")}`;
  return `${giorno} ${s.getHours()}–${e.getHours()} · ` +
         `${Math.round(w.min_speed)}–${Math.round(w.max_speed)} kn ` +
         `da ${w.sectors.join("/")}`;
}

function renderSpotCard(spot, result) {
  const card = document.createElement("section");
  card.className = "card";

  const head = document.createElement("div");
  head.className = "card-head";
  const semaforo = document.createElement("span");
  semaforo.className = "semaforo";
  const title = document.createElement("h2");
  title.textContent = spot.name;
  const gear = document.createElement("button");
  gear.className = "icon-btn";
  gear.textContent = "⚙️";
  gear.title = `Impostazioni ${spot.name}`;
  gear.addEventListener("click", () => openSettings(spot.id));
  head.append(semaforo, title, gear);
  card.append(head);

  if (result.error) {
    semaforo.textContent = "⚪";
    const err = document.createElement("p");
    err.className = "error";
    err.textContent = `Dati non disponibili: ${result.error}`;
    card.append(err);
    return card;
  }

  const now = nowLocalIso();
  const hours = parseHours(result.data)
    .filter(h => h.time > now && h.time <= addHoursIso(now, cfg.forecast.display_hours));
  const windows = WindLogic.findWindows(hours, spot);
  const alertLimit = addHoursIso(now, cfg.forecast.alert_hours);
  const soon = windows.filter(w => w.start <= alertLimit);

  semaforo.textContent = soon.length ? "🟢" : "🔴";
  const status = document.createElement("p");
  status.className = `card-status ${soon.length ? "good" : "bad"}`;
  status.textContent = soon.length
    ? `Si esce! ${soon.length === 1 ? "1 finestra" : soon.length + " finestre"} nelle prossime ${cfg.forecast.alert_hours} ore`
    : `Niente vento utile nelle prossime ${cfg.forecast.alert_hours} ore ` +
      `(soglia ${spot.min_knots} kn da ${spot.sectors.join("/")})`;
  card.append(status);

  if (windows.length) {
    const ul = document.createElement("ul");
    ul.className = "windows";
    for (const w of windows) {
      const li = document.createElement("li");
      li.textContent = `🪁 ${fmtWindow(w)}`;
      ul.append(li);
    }
    card.append(ul);
  }

  const canvas = document.createElement("canvas");
  canvas.className = "meteogram";
  card.append(canvas);
  requestAnimationFrame(() => renderMeteogram(canvas, hours, spot));

  if (result.stale) {
    const stale = document.createElement("p");
    stale.className = "muted small";
    stale.textContent = `⚠ Dati in cache del ${result.stale.replace("T", " ")}`;
    card.append(stale);
  }
  return card;
}

function renderMeteogram(canvas, hours, rules) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600, cssH = canvas.clientHeight || 180;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!hours.length) return;

  const padL = 26, padR = 4, padT = 18, padB = 26;
  const plotW = cssW - padL - padR, plotH = cssH - padT - padB;
  const maxY = Math.max(20, ...hours.map(h => h.gust)) * 1.1;
  const barW = plotW / hours.length;
  const y = v => padT + plotH - (v / maxY) * plotH;

  // griglia + assi
  ctx.font = "10px system-ui";
  ctx.fillStyle = "#7d8aa5";
  ctx.strokeStyle = "#1e2a44";
  for (let v = 0; v <= maxY; v += 5) {
    ctx.beginPath();
    ctx.moveTo(padL, y(v));
    ctx.lineTo(cssW - padR, y(v));
    ctx.stroke();
    ctx.fillText(String(v), 4, y(v) + 3);
  }

  // barre velocità (verdi se l'ora è "buona")
  for (let i = 0; i < hours.length; i++) {
    const h = hours[i];
    ctx.fillStyle = WindLogic.hourOk(h, rules) ? "#34d399" : "#334155";
    ctx.fillRect(padL + i * barW, y(h.speed), Math.max(barW - 1, 1),
                 padT + plotH - y(h.speed));
  }

  // linea raffiche
  ctx.strokeStyle = "#fbbf24";
  ctx.beginPath();
  hours.forEach((h, i) => {
    const px = padL + i * barW + barW / 2;
    i === 0 ? ctx.moveTo(px, y(h.gust)) : ctx.lineTo(px, y(h.gust));
  });
  ctx.stroke();

  // soglia
  ctx.strokeStyle = "#38bdf8";
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, y(rules.min_knots));
  ctx.lineTo(cssW - padR, y(rules.min_knots));
  ctx.stroke();
  ctx.setLineDash([]);

  // frecce direzione ogni 3 ore (la freccia indica dove VA il vento)
  ctx.fillStyle = "#e2e8f0";
  for (let i = 0; i < hours.length; i += 3) {
    const px = padL + i * barW + barW * 1.5;
    ctx.save();
    ctx.translate(px, padT - 8);
    ctx.rotate(((hours[i].dir + 180) * Math.PI) / 180);
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(3.5, 4);
    ctx.lineTo(-3.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // etichette giorno a mezzanotte + tacche ore
  ctx.fillStyle = "#7d8aa5";
  for (let i = 0; i < hours.length; i++) {
    const hh = hours[i].time.slice(11, 13);
    if (hh === "00") {
      const px = padL + i * barW;
      ctx.strokeStyle = "#7d8aa5";
      ctx.beginPath();
      ctx.moveTo(px, padT);
      ctx.lineTo(px, padT + plotH);
      ctx.stroke();
      const d = new Date(hours[i].time);
      ctx.fillText(`${GIORNI[d.getDay()]} ${d.getDate()}`, px + 3, cssH - 12);
    }
    if (hh === "12") ctx.fillText("12", padL + i * barW, cssH - 2);
  }
}

async function render() {
  const main = document.getElementById("cards");
  main.replaceChildren();
  const banner = document.getElementById("offline-banner");
  banner.classList.add("hidden");

  const spots = cfg.spots.filter(s => s.enabled);
  if (!spots.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Nessuno spot attivo. Aggiungine uno con ➕.";
    main.append(p);
  }

  const results = await Promise.all(spots.map(async spot => {
    try { return { spot, ...(await fetchForecast(spot)) }; }
    catch (e) { return { spot, error: e.message }; }
  }));

  let anyStale = false;
  for (const r of results) {
    main.append(renderSpotCard(r.spot, r));
    if (r.stale) anyStale = true;
  }
  if (anyStale) {
    banner.textContent = "⚠ Rete assente: mostro gli ultimi dati salvati.";
    banner.classList.remove("hidden");
  }
  document.getElementById("last-update").textContent =
    `agg. ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

/* ---------- impostazioni ---------- */

function openSettings(spotId) {
  const spot = cfg.spots.find(s => s.id === spotId);
  const dlg = document.getElementById("dlg-settings");
  dlg.dataset.spotId = spotId;
  document.getElementById("set-title").textContent = `Impostazioni — ${spot.name}`;
  document.getElementById("set-enabled").checked = spot.enabled;
  const knots = document.getElementById("set-knots");
  knots.value = spot.min_knots;
  document.getElementById("set-knots-value").textContent = spot.min_knots;
  dlg.querySelectorAll(".wind-rose input").forEach(cb => {
    cb.checked = spot.sectors.includes(cb.value);
  });
  document.getElementById("set-day-start").value = spot.day_start;
  document.getElementById("set-day-end").value = spot.day_end;
  document.getElementById("set-min-hours").value = spot.min_hours;
  dlg.showModal();
}

function saveSettings() {
  const dlg = document.getElementById("dlg-settings");
  const spot = cfg.spots.find(s => s.id === dlg.dataset.spotId);
  spot.enabled = document.getElementById("set-enabled").checked;
  spot.min_knots = Number(document.getElementById("set-knots").value);
  spot.sectors = [...dlg.querySelectorAll(".wind-rose input:checked")]
    .map(cb => cb.value);
  spot.day_start = Number(document.getElementById("set-day-start").value);
  spot.day_end = Number(document.getElementById("set-day-end").value);
  spot.min_hours = Number(document.getElementById("set-min-hours").value);
  saveConfig();
  dlg.close();
  render();
}

function deleteSpot() {
  const dlg = document.getElementById("dlg-settings");
  const spot = cfg.spots.find(s => s.id === dlg.dataset.spotId);
  if (!confirm(`Eliminare lo spot ${spot.name}?`)) return;
  cfg.spots = cfg.spots.filter(s => s.id !== spot.id);
  saveConfig();
  dlg.close();
  render();
}

/* ---------- aggiungi spot ---------- */

async function addSpotSearch(query) {
  const url = "https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({ name: query, count: "6", language: "it" });
  const resp = await fetch(url);
  const data = await resp.json();
  return data.results || [];
}

function slugify(name) {
  let base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let id = base, n = 2;
  while (cfg.spots.some(s => s.id === id)) id = `${base}-${n++}`;
  return id;
}

function wireAddDialog() {
  const dlg = document.getElementById("dlg-add");
  const input = document.getElementById("add-query");
  const list = document.getElementById("add-results");
  let timer = null;

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) { list.replaceChildren(); return; }
    timer = setTimeout(async () => {
      try {
        const results = await addSpotSearch(q);
        list.replaceChildren(...results.map(r => {
          const li = document.createElement("li");
          const admin = r.admin1 ? `, ${r.admin1}` : "";
          li.textContent = `${r.name}${admin} (${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)})`;
          li.addEventListener("click", () => {
            cfg.spots.push({
              id: slugify(r.name), name: r.name,
              lat: Math.round(r.latitude * 1000) / 1000,
              lon: Math.round(r.longitude * 1000) / 1000,
              ...structuredClone(SPOT_DEFAULTS),
            });
            saveConfig();
            dlg.close();
            input.value = "";
            list.replaceChildren();
            render();
          });
          return li;
        }));
      } catch { /* rete assente: lascia la lista vuota */ }
    }, 350);
  });

  document.getElementById("btn-add").addEventListener("click", () => dlg.showModal());
}

/* ---------- avvio ---------- */

async function init() {
  cfg = await loadConfig();

  const start = document.getElementById("set-day-start");
  const end = document.getElementById("set-day-end");
  for (let h = 0; h <= 23; h++) {
    start.add(new Option(`${h}:00`, h));
    end.add(new Option(`${h + 1}:00`, h + 1));
  }

  document.getElementById("set-save").addEventListener("click", saveSettings);
  document.getElementById("set-delete").addEventListener("click", deleteSpot);
  document.getElementById("btn-export").addEventListener("click", exportConfig);
  document.getElementById("set-knots").addEventListener("input", e => {
    document.getElementById("set-knots-value").textContent = e.target.value;
  });
  wireAddDialog();

  await render();

  setInterval(render, 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) render();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
