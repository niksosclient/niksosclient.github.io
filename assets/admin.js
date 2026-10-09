// Админ-панель Niksos. Все проверки прав — на сервере (функции niksos_admin_*), страница только показывает.
(function () {
  const $ = id => document.getElementById(id);
  const A = NiksosApi.admin;
  const ERR = {
    wrong: "Неверный пароль", none: "Профиль не найден", locked: "Слишком много попыток — подожди 10 минут",
    bad: "Неверные данные", banned: "Аккаунт заблокирован", forbidden: "У этого профиля нет прав администратора",
    no_user: "Игрок не найден", self: "Нельзя забанить самого себя",
    bad_code: "Код: 3–32 символа (латиница/цифры) и не начинается с NIKSOS", no_promo: "Промокод не найден",
  };
  const PLAN = { "7d": "7 дней", "30d": "30 дней", "90d": "90 дней", forever: "Навсегда" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = s => s ? new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const msg = (el, t, k) => { el.textContent = t || ""; el.className = "msg" + (k ? " " + k : ""); };
  const busy = (b, on) => { b.disabled = on; b.classList.toggle("busy", on); };
  let S = null, selected = null;

  function fail(r) { return ERR[r && r.status] || "Ошибка: " + (r && r.status || "нет связи"); }

  async function enter(s) {
    const r = await A.stats(s.name, s.hash);
    if (r.status !== "ok") throw new Error(fail(r));
    S = s; sessionStorage.setItem("niksos", JSON.stringify(s));
    $("auth").style.display = "none"; $("dash").style.display = "block"; $("who").textContent = s.name;
    renderStats(r); loadUsers(""); loadDownloads(); loadPromos(); loadPayments();
  }

  function renderStats(r) {
    const k = r.keys || {};
    const cards = [["Профилей", r.users], ["Активных подписок", r.active], ["Навсегда", r.forever], ["Онлайн за час", r.online_1h],
      ["Скачиваний за 24ч", r.dl_24h], ["Забанено", r.banned]]
      .concat(["7d", "30d", "90d", "forever"].map(p => ["Ключи " + PLAN[p] + " (своб./исп.)", (k[p]?.free ?? 0) + " / " + (k[p]?.used ?? 0)]));
    $("stats").innerHTML = cards.map(([l, v]) => `<div class="box stat"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");
  }
  async function refreshStats() { const r = await A.stats(S.name, S.hash); if (r.status === "ok") renderStats(r); }

  async function loadUsers(q) {
    const r = await A.users(S.name, S.hash, q);
    if (r.status !== "ok") { $("users").textContent = fail(r); return; }
    const u = r.users || [];
    $("users").innerHTML = u.length ? `<table><thead><tr><th>Ник</th><th>Подписка</th><th>До</th><th>ПК</th><th>Был в клиенте</th>
      <th>Скач. 7д</th><th>IP 7д</th><th>Ключей</th><th>Создан</th></tr></thead><tbody>` + u.map(x => `<tr data-n="${esc(x.name)}">
      <td><b>${esc(x.display)}</b> ${x.role === "admin" ? '<span class="tag adm">ADMIN</span>' : ""} ${x.banned ? '<span class="tag ban">БАН</span>' : ""}</td>
      <td>${x.active ? '<span class="tag on">' + (x.forever ? "навсегда" : "активна") + "</span>" : '<span class="tag off">нет</span>'}</td>
      <td>${x.forever ? "∞" : fmt(x.expires)}</td><td>${esc(x.devices)}</td><td>${fmt(x.last_seen)}</td>
      <td>${esc(x.dl_7d)}</td><td>${x.ips_7d > 2 ? '<span class="tag ban">' + esc(x.ips_7d) + "</span>" : esc(x.ips_7d)}</td>
      <td>${esc(x.keys_used)}</td><td>${fmt(x.created)}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="hint">Никого не нашлось</div>';
    $("users").querySelectorAll("tr[data-n]").forEach(tr => tr.addEventListener("click", () => select(tr.dataset.n)));
    if (selected) $("users").querySelector(`tr[data-n="${CSS.escape(selected)}"]`)?.classList.add("sel");
  }
  function select(n) {
    selected = n; $("selBox").hidden = false; $("selName").textContent = n; msg($("actMsg"));
    $("users").querySelectorAll("tr").forEach(tr => tr.classList.toggle("sel", tr.dataset.n === n));
  }

  const PST = { paid: "оплачен", created: "создан", processing: "в процессе", expired: "истёк", canceled: "отменён",
    refunded: "возврат", chargeback: "чарджбек", mismatch: "сумма не совпала", error: "ошибка создания" };
  async function loadPayments() {
    const r = await A.payments(S.name, S.hash);
    if (r.status !== "ok") { $("pays").textContent = fail(r); return; }
    $("paySum").textContent = `Выручка (без тестовых): 24ч — ${r.sum_24h} ₽ · 30 дней — ${r.sum_30d} ₽ · всего — ${r.sum_all} ₽`;
    const d = r.items || [];
    $("pays").innerHTML = d.length ? "<table><thead><tr><th>Когда</th><th>Ник</th><th>Тариф</th><th>Сумма</th><th>Статус</th><th>Касса</th><th>Заказ</th></tr></thead><tbody>" +
      d.map(x => `<tr><td>${fmt(x.paid_at || x.created)}</td><td>${esc(x.name)}</td><td>${esc(PLAN[x.plan] || x.plan)}</td><td>${esc(x.amount)} ₽</td>
        <td>${x.status === "paid" ? '<span class="tag on">' : ["refunded", "chargeback", "mismatch"].includes(x.status) ? '<span class="tag ban">' : '<span class="tag off">'}${esc(PST[x.status] || x.status)}</span>${x.test ? ' <span class="tag adm">ТЕСТ</span>' : ""}</td>
        <td>${esc(x.provider === "anypay" ? "AnyPay" : "RollyPay")}</td><td style="font-size:12px;color:var(--dim)">${esc(x.order_id)}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="hint">Оплат пока нет</div>';
  }

  async function loadDownloads() {
    const r = await A.downloads(S.name, S.hash);
    if (r.status !== "ok") { $("dls").textContent = fail(r); return; }
    const d = r.items || [];
    $("dls").innerHTML = d.length ? "<table><thead><tr><th>#</th><th>Ник</th><th>Когда</th><th>IP</th></tr></thead><tbody>" +
      d.map(x => `<tr><td>${esc(x.id)}</td><td>${esc(x.name)}</td><td>${fmt(x.at)}</td><td>${esc(x.ip)}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="hint">Скачиваний пока нет</div>';
  }

  $("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("name").value.trim(), pass = $("pass").value;
    busy($("authBtn"), true); msg($("authMsg"), "Проверяем…");
    try { await enter({ name, hash: await NiksosApi.authHash(name, pass) }); $("pass").value = ""; msg($("authMsg")); }
    catch (err) { msg($("authMsg"), err.message.startsWith("HTTP") ? "Нет связи с сервером" : err.message, "err"); }
    finally { busy($("authBtn"), false); }
  });

  $("searchForm").addEventListener("submit", e => { e.preventDefault(); loadUsers($("q").value); });

  const CONFIRM = { revoke: "Забрать подписку у %?", ban: "Забанить %? Клиент отключится при следующей проверке.", reset_hwid: "Сбросить привязку ПК у %?" };
  const DONE = { grant: "Подписка выдана", revoke: "Подписка забрана", reset_hwid: "ПК сброшен", unlock: "Блокировка входа снята", ban: "Игрок забанен", unban: "Игрок разбанен" };
  document.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
    if (!selected) return;
    const act = b.dataset.act;
    if (CONFIRM[act] && !confirm(CONFIRM[act].replace("%", selected))) return;
    busy(b, true); msg($("actMsg"), "…");
    try {
      const r = await A.action(S.name, S.hash, selected, act, act === "grant" ? parseInt($("days").value, 10) : null);
      if (r.status !== "ok") throw new Error(fail(r));
      msg($("actMsg"), DONE[act] + " — " + selected, "ok");
      loadUsers($("q").value); refreshStats();
    } catch (err) { msg($("actMsg"), err.message, "err"); }
    finally { busy(b, false); }
  }));

  $("genForm").addEventListener("submit", async e => {
    e.preventDefault();
    const plan = $("plan").value, count = parseInt($("count").value, 10);
    if (!(count >= 1 && count <= 500)) return msg($("genMsg"), "От 1 до 500 ключей", "err");
    busy($("genBtn"), true); msg($("genMsg"), "Создаём…");
    try {
      const r = await A.genKeys(S.name, S.hash, plan, count);
      if (r.status !== "ok") throw new Error(fail(r));
      $("keysOut").value = r.keys.join("\n");
      msg($("genMsg"), "Создано " + r.keys.length + " ключей на " + PLAN[plan] + ". Сохрани их — повторно не показать.", "ok");
      refreshStats();
    } catch (err) { msg($("genMsg"), err.message, "err"); }
    finally { busy($("genBtn"), false); }
  });
  $("copyKeys").addEventListener("click", async () => {
    if (!$("keysOut").value) return;
    try { await navigator.clipboard.writeText($("keysOut").value); msg($("genMsg"), "Скопировано", "ok"); }
    catch (e) { $("keysOut").select(); document.execCommand("copy"); }
  });

  // ---------------- промокоды
  async function loadPromos() {
    const r = await A.promos(S.name, S.hash);
    if (r.status !== "ok") { $("promos").textContent = fail(r); return; }
    const p = r.items || [];
    $("promos").innerHTML = p.length ? `<table><thead><tr><th>Код</th><th>Даёт</th><th>Использовано</th><th>За 24ч</th><th>До</th>
      <th>Условия</th><th>Заметка</th><th>Статус</th><th></th></tr></thead><tbody>` + p.map(x => {
        const expired = x.expires_at && new Date(x.expires_at) < new Date(), full = x.max_uses && x.uses >= x.max_uses;
        const st = !x.active ? '<span class="tag off">выкл</span>' : expired ? '<span class="tag ban">истёк</span>'
          : full ? '<span class="tag ban">закончился</span>' : '<span class="tag on">работает</span>';
        return `<tr data-code="${esc(x.code)}"><td><b>${esc(x.display)}</b></td><td>${x.days ? "+" + esc(x.days) + " дн." : "навсегда"}</td>
          <td>${esc(x.uses)}${x.max_uses ? " / " + esc(x.max_uses) : " / ∞"}</td><td>${esc(x.uses_24h)}</td><td>${x.expires_at ? fmt(x.expires_at) : "∞"}</td>
          <td>${[x.one_per_ip ? "1/IP" : "", x.new_only ? "новым" : ""].filter(Boolean).join(", ") || "—"}</td><td>${esc(x.note)}</td><td>${st}</td>
          <td><button class="linkbtn" data-p="users">кто</button><button class="linkbtn" data-p="${x.active ? "off" : "on"}">${x.active ? "выкл" : "вкл"}</button><button class="linkbtn" data-p="delete">удалить</button></td></tr>`;
      }).join("") + "</tbody></table>" : '<div class="hint">Промокодов пока нет</div>';
    $("promos").querySelectorAll("[data-p]").forEach(b => b.addEventListener("click", async ev => {
      ev.stopPropagation();
      const code = b.closest("tr").dataset.code, act = b.dataset.p;
      if (act === "users") return showPromoUsers(code);
      if (act === "delete" && !confirm("Удалить промокод " + code + "? Уже выданные дни у игроков останутся.")) return;
      const r = await A.promoSet(S.name, S.hash, code, act);
      msg($("pMsg"), r.status === "ok" ? "Готово" : fail(r), r.status === "ok" ? "ok" : "err");
      loadPromos();
    }));
  }
  async function showPromoUsers(code) {
    const r = await A.promoUsers(S.name, S.hash, code);
    if (r.status !== "ok") { $("promoUsers").textContent = fail(r); return; }
    const u = r.items || [];
    $("promoUsers").innerHTML = `<h2 style="margin-top:16px">Активировали ${esc(code)}: ${u.length}</h2>` + (u.length
      ? "<table><thead><tr><th>Ник</th><th>Когда</th><th>IP</th><th>Дней</th></tr></thead><tbody>" +
        u.map(x => `<tr><td>${esc(x.name)}</td><td>${fmt(x.at)}</td><td>${esc(x.ip)}</td><td>${x.days ? esc(x.days) : "∞"}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="hint">Пока никто</div>');
  }
  $("promoForm").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("pCode").value.trim();
    if (code.replace(/[^A-Za-z0-9]/g, "").length < 3) return msg($("pMsg"), ERR.bad_code, "err");
    const max = $("pMax").value ? parseInt($("pMax").value, 10) : null;
    const exp = $("pExp").value ? new Date($("pExp").value + "T23:59:59").toISOString() : null;
    busy($("pBtn"), true); msg($("pMsg"), "Сохраняем…");
    try {
      const r = await A.promoSave(S.name, S.hash, { code, days: parseInt($("pDays").value, 10), maxUses: max, expires: exp,
        onePerIp: $("pIp").checked, newOnly: $("pNew").checked, note: $("pNote").value.trim() || null });
      if (r.status !== "ok") throw new Error(fail(r));
      msg($("pMsg"), "Промокод " + r.code + " работает — игроки вводят его в кабинете", "ok");
      $("pCode").value = ""; $("pNote").value = ""; $("pMax").value = ""; $("pExp").value = "";
      loadPromos();
    } catch (err) { msg($("pMsg"), err.message, "err"); }
    finally { busy($("pBtn"), false); }
  });

  $("refresh").addEventListener("click", () => { refreshStats(); loadUsers($("q").value); loadDownloads(); loadPromos(); });
  $("logout").addEventListener("click", () => { sessionStorage.removeItem("niksos"); location.href = "account.html"; });

  // сессия из кабинета
  (async () => {
    try { const s = JSON.parse(sessionStorage.getItem("niksos") || "null"); if (s) await enter(s); } catch (e) {}
  })();
})();
