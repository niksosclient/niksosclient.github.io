(function () {
  const $ = id => document.getElementById(id);
  const C = window.NiksosCloud;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STATUS = { afk: ["AFK", "#ffc53d"], pvp: ["В бою", "#ff4d5e"], ah: ["На аукционе", "#5cc8ff"] };
  const DIM = { "minecraft:overworld": "Обычный мир", "minecraft:the_nether": "Незер", "minecraft:the_end": "Энд" };
  const ONLINE_MS = 7000;

  let mq = null, name = "", sk, seed, myId = "", storeTopic = "", store = null, gotStore = false;
  const cards = new Map();      // key -> {kind, title, sub, accs:Set, state, seen, acc}
  const routes = new Map();     // topic -> {card, acc, key}
  const profiles = new Map();   // topic -> {card, key}

  function msg(text, kind) { const el = $("vMsg"); el.textContent = text || ""; el.className = "msg" + (kind ? " " + kind : ""); }
  function show(id) { ["needLogin", "unlock", "view"].forEach(x => $(x).hidden = x !== id); }

  // ---------- вход ----------
  const sess = (() => { try { return JSON.parse(sessionStorage.getItem("niksos") || "null"); } catch (e) { return null; } })();
  const ck = (() => { try { return JSON.parse(sessionStorage.getItem("niksos_ck") || "null"); } catch (e) { return null; } })();
  if (ck && ck.d && ck.name) start(ck.name, C.unb64(ck.d));
  else if (!sess) show("needLogin");
  else { show("unlock"); $("uName").value = sess.name; $("uPass").focus(); }

  $("unlockForm").addEventListener("submit", async e => {
    e.preventDefault();
    const n = $("uName").value.trim(), p = $("uPass").value;
    const m = $("uMsg");
    if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) { m.textContent = "Ник: 3–16 символов, латиница, цифры, _"; m.className = "msg err"; return; }
    if (p.length < 4) { m.textContent = "Введи пароль"; m.className = "msg err"; return; }
    $("uBtn").disabled = true; $("uBtn").classList.add("busy"); m.textContent = "Считаем ключ…"; m.className = "msg";
    try {
      const d = await C.derive(n, p);
      sessionStorage.setItem("niksos_ck", JSON.stringify({ name: n, d: C.b64(d) }));
      $("uPass").value = "";
      start(n, d);
    } catch (err) { m.textContent = "Браузер не поддерживает шифрование — обнови его"; m.className = "msg err"; }
    finally { $("uBtn").disabled = false; $("uBtn").classList.remove("busy"); }
  });
  $("lockBtn").addEventListener("click", () => {
    sessionStorage.removeItem("niksos_ck");
    if (mq) mq.stop();
    location.reload();
  });

  // ---------- облако ----------
  async function start(n, d) {
    show("view");
    name = n; sk = d.slice(0, 32); seed = d.slice(32, 64);
    const pub = C.pubOf(seed);
    myId = n + "#" + (await C.sha("niksos-cloud|" + pub)).slice(0, 4);
    storeTopic = C.PFX + "cs/" + (await C.sha(C.b64(sk))).slice(0, 32);
    renderMe();
    mq = new C.Mqtt(onMsg, ok => { const c = $("conn"); c.classList.toggle("ok", ok); c.querySelector("span").textContent = ok ? "Онлайн-обновление" : "Подключение…"; });
    mq.start();
    mq.subscribe([storeTopic]);
    msg("Загружаем облако…");
    setTimeout(() => { if (!gotStore) msg("Облако не найдено. Зайди в клиент и войди в облако этим ником и паролем (Друзья → Облако или .cloud login), затем обнови страницу.", "err"); }, 12000);
    setInterval(render, 1000);
  }

  function renderMe() {
    const accs = store ? store.accs || [] : [];
    $("me").innerHTML = `<span class="chip">ID: <b style="color:#fff">${esc(myId)}</b></span>` +
      (accs.length ? `<span>Мои аккаунты:</span>` + accs.map(a => `<span class="chip">${esc(a)}</span>`).join("") : "");
  }

  async function onMsg(topic, payload) {
    if (topic === storeTopic) {
      if (!payload.length) return;
      const o = await C.decrypt(sk, payload);
      if (!o) { gotStore = true; msg("Не удалось расшифровать облако — проверь пароль (кнопка «Забыть ключ»).", "err"); return; }
      if (store && (o.ts || 0) < (store.ts || 0)) return;
      gotStore = true; store = o; msg("");
      await applyStore();
      return;
    }
    const pr = profiles.get(topic);
    if (pr) {
      if (!payload.length) return;
      const o = await C.decrypt(pr.key, payload);
      const c = cards.get(pr.card);
      if (o && c && Array.isArray(o.accs)) { o.accs.forEach(a => c.accs.add(a)); await subscribeStatuses(); render(); }
      return;
    }
    const r = routes.get(topic);
    if (r) {
      const o = await C.decrypt(r.key, payload);
      if (!o) return;
      const c = cards.get(r.card);
      if (!c) return;
      c.seen = Date.now();
      c.acc = r.acc;
      if (o.t === "st") c.state = o;
      render();
    }
  }

  async function applyStore() {
    renderMe();
    const keep = new Set();
    for (const f of store.friends || []) {
      const k = "c:" + C.low(f.id);
      keep.add(k);
      let c = cards.get(k);
      if (!c) {
        c = { kind: "cloud", title: f.id, accs: new Set(), pub: f.pub, seen: 0 };
        cards.set(k, c);
        c.key = await C.shared(seed, f.pub, C.tid(myId), C.tid(f.id));
        const pt = C.PFX + "c/" + C.tid(f.id) + "/p/" + C.tid(myId);
        profiles.set(pt, { card: k, key: c.key });
        mq.subscribe([pt]);
      }
      (f.accs || []).forEach(a => c.accs.add(a));
    }
    const cloudNames = new Set();
    for (const [k, c] of cards) if (c.kind === "cloud") c.accs.forEach(a => cloudNames.add(C.low(a)));
    const lf = store.lf || {};
    for (const acc of Object.keys(lf)) {
      for (const f of lf[acc] || []) {
        if (!f || !f.name || !f.key || cloudNames.has(C.low(f.name))) continue;
        const k = "l:" + C.low(f.name);
        keep.add(k);
        let c = cards.get(k);
        if (!c) { c = { kind: "local", title: f.name, accs: new Set([f.name]), seen: 0, my: new Set(), keys: {} }; cards.set(k, c); }
        c.my.add(acc); c.keys[C.low(acc)] = f.key;
      }
    }
    for (const k of [...cards.keys()]) if (!keep.has(k)) cards.delete(k);
    await subscribeStatuses();
    render();
  }

  const keyCache = new Map();
  async function subscribeStatuses() {
    const mine = (store && store.accs) || [];
    const topics = [];
    for (const [k, c] of cards) {
      if (c.kind === "cloud") {
        for (const F of c.accs) for (const A of mine) {
          if (C.low(F) === C.low(A)) continue;
          const t = C.PFX + C.low(F) + "/to/" + C.low(A);
          if (routes.has(t)) continue;
          const ck = c.pub + "|" + C.low(A) + "|" + C.low(F);
          let key = keyCache.get(ck);
          if (!key) { key = await C.shared(seed, c.pub, C.low(A), C.low(F)); keyCache.set(ck, key); }
          routes.set(t, { card: k, acc: F, key }); topics.push(t);
        }
      } else {
        for (const A of c.my) {
          const t = C.PFX + C.low(c.title) + "/to/" + C.low(A);
          if (routes.has(t)) continue;
          routes.set(t, { card: k, acc: c.title, key: C.unb64(c.keys[C.low(A)]) }); topics.push(t);
        }
      }
    }
    if (topics.length) mq.subscribe(topics);
  }

  // ---------- отрисовка ----------
  function server(s) {
    if (!s) return "";
    if (s.startsWith("sp:")) return "Одиночная игра";
    return s.replace(/^mp:/, "");
  }
  function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    return s < 60 ? s + " с назад" : s < 3600 ? Math.round(s / 60) + " мин назад" : Math.round(s / 3600) + " ч назад";
  }
  function card(c) {
    const on = Date.now() - c.seen < ONLINE_MS, st = c.state || {};
    const acc = c.acc || [...c.accs][0] || c.title.split("#")[0];
    const [nm, tag] = c.title.split("#");
    let state = on ? (st.ig ? "В игре" : "В меню") : c.seen ? "Был в сети " + ago(c.seen) : "Не в сети";
    const sts = on && st.ig && STATUS[st.sts];
    const rows = [];
    if (on && st.ig) {
      if (st.srv) rows.push(["Сервер", esc(server(st.srv))]);
      if (st.dim) rows.push(["Мир", esc(DIM[st.dim] || st.dim.replace(/^minecraft:/, ""))]);
      if (st.x !== undefined) rows.push(["Коорд.", `${Math.round(st.x)} ${Math.round(st.y)} ${Math.round(st.z)}`]);
      if (st.fd !== undefined) rows.push(["Еда / броня", `${st.fd} / ${st.ar ?? 0}`]);
    }
    if (on) rows.push(["Аккаунт", esc(acc)]);
    const hp = on && st.ig && st.hp !== undefined ? `<div><div class="kv" style="margin-bottom:4px"><b>HP</b><span>${(Math.round(st.hp * 10) / 10)} / ${Math.round(st.mhp || 20)}${st.ab ? " +" + Math.round(st.ab) : ""}</span></div>
      <div class="bar"><i style="width:${Math.max(0, Math.min(100, st.hp / (st.mhp || 20) * 100))}%"></i></div></div>` : "";
    const accChips = c.kind === "cloud" && c.accs.size ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${[...c.accs].map(a => `<span class="chip${on && C.low(a) === C.low(acc) ? " on" : ""}">${esc(a)}</span>`).join("")}</div>` : "";
    return `<div class="box fcard${on ? " online" : ""}">
      <div class="fhead"><div class="ava"><img src="https://mc-heads.net/avatar/${encodeURIComponent(acc)}/64" alt="" loading="lazy" onerror="this.remove()"><span class="st"></span></div>
        <div><div class="fname">${esc(nm)}${tag ? `<small>#${esc(tag)}</small>` : ""}${sts ? `<span class="badge2" style="background:${sts[1]}22;color:${sts[1]}">${sts[0]}</span>` : ""}</div>
        <div class="fstate">${esc(state)}</div></div></div>
      ${rows.length ? `<div class="kv">${rows.map(r => `<b>${r[0]}</b><span>${r[1]}</span>`).join("")}</div>` : ""}
      ${hp}${accChips}</div>`;
  }
  function section(title, list, hint) {
    const sorted = list.sort((a, b) => (Date.now() - b.seen < ONLINE_MS) - (Date.now() - a.seen < ONLINE_MS) || a.title.localeCompare(b.title));
    const on = list.filter(c => Date.now() - c.seen < ONLINE_MS).length;
    return `<div class="fr-sec"><h2>${title}</h2><span>${list.length} · в сети ${on}</span></div>` +
      (list.length ? `<div class="fgrid">${sorted.map(card).join("")}</div>` : `<div class="empty2">${hint}</div>`);
  }
  let lastHtml = "";
  function render() {
    if (!store) return;
    const all = [...cards.values()];
    let html = section("Облачные друзья", all.filter(c => c.kind === "cloud"), "Пока нет облачных друзей. В клиенте: <kbd>.cloud add Ник#tag</kbd>");
    const local = all.filter(c => c.kind === "local");
    if (local.length) html += section("Обычные друзья", local, "");
    const out = store.out || [];
    if (out.length) html += `<div class="fr-sec"><h2>Отправленные заявки</h2><span>${out.length}</span></div><div style="display:flex;gap:8px;flex-wrap:wrap">${out.map(o => `<span class="chip">${esc(o)}</span>`).join("")}</div>`;
    if (html !== lastHtml) { $("lists").innerHTML = html; lastHtml = html; }
  }
})();
