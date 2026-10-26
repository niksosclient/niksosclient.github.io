// Niksos: ивенты HolyWorld (api.holyworld.me, через Edge Function niksos-events из-за CORS) и FunTime (облако Niksos)
(function () {
  const $ = id => document.getElementById(id);
  const C = window.NIKSOS || {};
  const HW_DIRECT = "https://api.holyworld.me/v1/events";
  const HW_PROXY = C.supabaseUrl + "/functions/v1/niksos-events?src=holyworld";
  const FT_URL = C.supabaseUrl + "/storage/v1/object/public/ft/events.json";
  const REFRESH = 15000;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BOLT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
  const PICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 4c3 0 6 2 7 4-3-1-6-1-9 1M14 4l-2 5M12 9 3 20"/></svg>';

  let src = "holyworld", rows = [], loadedAt = 0, timer = null, sortK = "time", sortD = 1, err = "";

  // ---------- редкости: ранг 0..4 + подпись
  const RAR = {
    common: [0, "Обычная"], default: [0, "Обычная"], low: [0, "Low"], easy: [0, "Лёгкая"],
    uncommon: [1, "Необычная"], rare: [1, "Редкая"], medium: [1, "Medium"],
    epic: [2, "Эпическая"], hard: [2, "Hard"], elite: [2, "Элитная"],
    mythic: [3, "Мифическая"], mythical: [3, "Мифическая"], legendary: [4, "Легендарная"], legend: [4, "Легендарная"],
  };
  function rar(r) {
    const s = String(r || "").trim(); if (!s) return [-1, "—"];
    const k = s.toLowerCase(), hit = RAR[k];
    if (hit) return hit;
    // русские подписи FunTime/HolyWorld
    if (/^легенд/i.test(s)) return [4, s]; if (/^миф/i.test(s)) return [3, s];
    if (/^(эпич|элит)/i.test(s)) return [2, s]; if (/^(редк|богат)/i.test(s)) return [1, s];
    return [0, s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()];
  }

  // ---------- HolyWorld
  function hwServer(k) {
    return String(k).split("_").map(p => ({ LITE: "Лайт", CLAN: "Клан", ANARCHY: "Анархия", CLANLITE: "КланЛайт", CLASSIC: "Классик", NEW: "Нью" }[p] || p))
      .join(" ").replace("Клан Лайт", "КланЛайт").replace(/ Анархия/, "");
  }
  function parseHW(d) {
    const out = [];
    for (const [server, list] of Object.entries(d || {})) {
      if (!Array.isArray(list)) continue;
      for (const e of list) {
        const m = e.metadata || {}, id = String(e.id || "");
        const secs = +(m.timeLeft ?? m.secondsLeft ?? e.timeLeft ?? 0) || 0;
        const r = rar(m.rare ?? m.rarity);
        out.push({
          kind: /MINE|SHAFT/i.test(id) ? "mine" : "event", name: m.displayName || id.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase()),
          server: hwServer(server), rawServer: server, mode: hwServer(server).replace(/\s*\d+.*$/, "") || "Прочие",
          rank: r[0], rarity: r[1], phase: "Идёт", pcls: "run", secs, coords: m.location ? [m.location.x, m.location.y, m.location.z].filter(v => v != null).join(" ") : "",
        });
      }
    }
    return out;
  }
  async function getJSON(url, opt) {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000), ...opt });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function loadHW() {
    try { return parseHW(await getJSON(HW_DIRECT)); } catch (e) {}
    return parseHW(await getJSON(HW_PROXY, { headers: { apikey: C.supabaseKey } }));
  }

  // ---------- FunTime (те же правила, что FtApi.java)
  const FT_NAMES = { myst_beacon: "Мистический маяк", altarundead: "Алтарь нежити", airdrop: "Аирдроп", beacon: "Маяк", geyser: "Гейзер", vulkan: "Вулкан",
    meteor_rain: "Метеоритный дождь", hellm: "Адская резня", deathchest: "Сундук смерти", mystchest: "Мистический сундук", myst_chest: "Мистический сундук", mystic_chest: "Мистический сундук" };
  const FT_PH = { WAITING: ["Ожидание", "wait"], ACTIVATING: ["Активация", "wait"], RUNNING: ["Идёт", "run"], LOOTING: ["Лутают", "run"], OPENED: ["Открыт", "run"], STOPPING: ["Заканчивается", "end"] };
  const ftNum = s => +String(s).replace(/\D/g, "") || 0;
  const ftName = s => ftNum(s) ? "Анархия-" + ftNum(s) : s;
  const ftMode = s => { const n = ftNum(s), f = n >= 100 ? String(n)[0] : ""; return { 1: "Соло", 2: "Дуо", 3: "Трио", 5: "5x" }[f] || "Прочие"; };
  function parseFT(d) {
    const out = [], age = Math.max(0, Date.now() - (d.at || Date.now()));
    const lag = s => Math.max(0, s - Math.round(age / 1000));
    for (const so of d.events || []) for (const e of so.events || []) {
      const id = String(e.id || "").toLowerCase(), r = rar(e.loot && e.loot !== "null" ? e.loot : "");
      const ph = id ? (FT_PH[String(e.phase || "").toUpperCase()] || [e.phase ? e.phase : "Скоро", "wait"]) : ["Скоро", "wait"];
      const l = e["location-event"];
      out.push({ kind: "event", name: id ? (FT_NAMES[id] || id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ")) : (e["event-type"] === "system" ? "Системный ивент" : "Ивент игрока"),
        server: ftName(so.server), rawServer: so.server, mode: ftMode(so.server), rank: r[0], rarity: r[1], phase: ph[0], pcls: ph[1],
        secs: lag(+e["time-seconds-left"] || 0), coords: l ? `${l.x} ${l.y ?? 64} ${l.z}` : "" });
    }
    const mAge = Math.max(0, Date.now() - (d.minesAt || d.at || Date.now()));
    for (const [server, list] of Object.entries(d.mines || {})) for (const m of list || []) {
      const r = rar(m["mine-rarity"]), nx = rar(m["next-mine-rarity"]);
      out.push({ kind: "mine", name: "Шахта " + String(m["mine-name"] || "").replace(/\D/g, ""), server: m["server-ru-name"] || ftName(server), rawServer: server, mode: ftMode(server),
        rank: r[0], rarity: r[1], phase: "След.: " + nx[1], pcls: "end", secs: Math.max(0, (+m["reset-seconds-left"] || 0) - Math.round(mAge / 1000)), coords: "" });
    }
    return out;
  }
  const loadFT = async () => parseFT(await getJSON(FT_URL + "?t=" + Math.floor(Date.now() / 5000)));

  // ---------- отрисовка
  const fmt = s => s <= 0 ? "—" : s >= 3600 ? `${s / 3600 | 0}:${String(s / 60 % 60 | 0).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${s / 60 | 0}:${String(s % 60).padStart(2, "0")}`;
  const left = r => Math.max(0, r.secs - Math.floor((Date.now() - loadedAt) / 1000));
  const coll = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });
  function cmp(a, b) {
    let v = 0;
    if (sortK === "time") { const x = left(a), y = left(b); v = (x <= 0) - (y <= 0) || x - y; if ((x <= 0) !== (y <= 0)) return v; }
    else if (sortK === "rar") v = a.rank - b.rank;
    else if (sortK === "phase") v = ["run", "wait", "end"].indexOf(a.pcls) - ["run", "wait", "end"].indexOf(b.pcls);
    else v = coll.compare(a[sortK], b[sortK]);
    return v * sortD || coll.compare(a.name, b.name) || coll.compare(a.server, b.server);
  }
  function filtered() {
    const q = $("evQ").value.trim().toLowerCase(), t = $("evType").value, m = $("evMode").value;
    return rows.filter(r => (t === "all" || r.kind === t) && (!m || r.mode === m) &&
      (!q || [r.name, r.server, r.rawServer, r.rarity, r.phase, r.coords].join(" ").toLowerCase().includes(q))).sort(cmp);
  }
  function draw() {
    const list = filtered();
    $("evShown").textContent = list.length;
    document.querySelectorAll("#evTable th").forEach(th => { th.classList.toggle("sorted", th.dataset.k === sortK); th.classList.toggle("desc", th.dataset.k === sortK && sortD < 0); });
    $("evBody").innerHTML = err && !rows.length ? `<tr><td colspan="5" class="empty">${esc(err)}</td></tr>`
      : !list.length ? `<tr><td colspan="5" class="empty">${rows.length ? "Ничего не найдено" : "Сейчас ивентов нет"}</td></tr>`
      : list.slice(0, 400).map(r => `<tr><td><div class="nm">${r.kind === "mine" ? PICK : BOLT}<div>${esc(r.name)}${r.coords ? `<span class="co">${esc(r.coords)}</span>` : ""}</div></div></td>
        <td class="sv" title="${esc(r.rawServer)}">${esc(r.server)}</td><td>${r.rank < 0 ? '<span class="muted">—</span>' : `<span class="rar r${r.rank}">${esc(r.rarity)}</span>`}</td>
        <td><span class="ph ${r.pcls}">${esc(r.phase)}</span></td><td class="r" data-t="${rows.indexOf(r)}">${fmt(left(r))}</td></tr>`).join("");
  }
  function tick() {
    document.querySelectorAll("#evBody td[data-t]").forEach(td => { const r = rows[+td.dataset.t]; if (r) td.textContent = fmt(left(r)); });
    const s = Math.round((Date.now() - loadedAt) / 1000);
    if (loadedAt) $("evUpd").textContent = s < 5 ? "только что" : s + " сек назад";
  }
  function stats() {
    const ev = rows.filter(r => r.kind === "event"), mi = rows.filter(r => r.kind === "mine");
    $("evTotal").textContent = rows.length; $("evCount").textContent = ev.length; $("evMines").textContent = mi.length;
    $("evSub").textContent = "Что идёт на " + (src === "holyworld" ? "HolyWorld" : "FunTime") + " прямо сейчас.";
    const modes = [...new Set(rows.map(r => r.mode))].sort(coll.compare), cur = $("evMode").value;
    $("evMode").innerHTML = '<option value="">Все режимы</option>' + modes.map(m => `<option${m === cur ? " selected" : ""}>${esc(m)}</option>`).join("");
  }
  async function load() {
    const want = src;
    try {
      const data = want === "holyworld" ? await loadHW() : await loadFT();
      if (want !== src) return;
      rows = data; loadedAt = Date.now(); err = "";
    } catch (e) {
      if (want !== src) return;
      err = want === "holyworld" ? "HolyWorld API недоступно. Проверь, что Edge Function niksos-events задеплоена." : "Сервер ивентов FunTime не отвечает — попробуй позже.";
    }
    stats(); draw(); tick();
  }
  function start() { if (timer) return; load(); timer = setInterval(() => { tick(); if (Date.now() - loadedAt > REFRESH) load(); }, 1000); }
  function stop() { clearInterval(timer); timer = null; }

  document.querySelectorAll("#evSrv [data-src]").forEach(b => b.addEventListener("click", () => {
    if (src === b.dataset.src) return;
    src = b.dataset.src; rows = []; loadedAt = 0; $("evMode").value = "";
    document.querySelectorAll("#evSrv [data-src]").forEach(x => x.setAttribute("aria-selected", x === b));
    $("evBody").innerHTML = '<tr><td colspan="5" class="empty">Загрузка…</td></tr>'; load();
  }));
  document.querySelectorAll("#evTable th[data-k]").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k; sortD = sortK === k ? -sortD : (k === "rar" ? -1 : 1); sortK = k;
    const o = [...$("evSort").options].find(o => o.value === k + ":" + sortD); if (o) $("evSort").value = o.value;
    draw();
  }));
  $("evSort").addEventListener("change", () => { const [k, d] = $("evSort").value.split(":"); sortK = k; sortD = +d; draw(); });
  ["evQ", "evType", "evMode"].forEach(id => $(id).addEventListener(id === "evQ" ? "input" : "change", draw));
  document.addEventListener("niksos:view", e => e.detail === "events" ? start() : stop());
  if (location.hash === "#events") start();
})();
