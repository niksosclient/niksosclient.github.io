// Админ-панель Niksos. Все проверки прав — на сервере (функции niksos_admin_*), страница только показывает.
(function () {
  const $ = id => document.getElementById(id);
  const A = NiksosApi.admin;
  const ERR = {
    wrong: "Неверный пароль", none: "Профиль не найден", locked: "Слишком много попыток — подожди 10 минут",
    bad: "Неверные данные", banned: "Аккаунт заблокирован", forbidden: "У этого профиля нет прав администратора",
    protected: "Главного администратора нельзя блокировать, удалять или лишать защиты",
    staff_protected: "Управлять аккаунтом другого администратора может только главный админ",
    confirm_required: "Для удаления введи точный ник выбранного игрока",
    dependent_data: "Удаление отменено: найдены дополнительные связанные данные. Ничего не удалено",
    retry: "Данные одновременно менялись другим запросом. Обнови список и повтори действие",
    deleted: "Этот аккаунт удалён администрацией; ник зарезервирован",
 no_user: "Игрок не найден — сначала зарегистрируй профиль в кабинете", self: "Нельзя менять самого себя", already: "Уже так и есть",
    bad_code: "Код: 3–32 символа (латиница/цифры) и не начинается с NIKSOS", no_promo: "Промокод не найден",
  };
  const PLAN = { "7d": "7 дней", "30d": "30 дней", "90d": "90 дней", forever: "Навсегда" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = s => s ? new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const msg = (el, t, k) => { el.textContent = t || ""; el.className = "msg" + (k ? " " + k : ""); };
  const busy = (b, on) => { b.disabled = on; b.classList.toggle("busy", on); };
  let S = null, selected = null, canManageStaff = false;
  let userItems = [], accountApiReady = false, canManageAdminAccounts = false, actionBusy = false;
  let deleteTarget = null;


  function fail(r) { return ERR[r && r.status] || "Ошибка: " + (r && r.status || "нет связи"); }

  async function enter(s) {
    const r = await A.stats(s.name, s.hash);
    if (r.status !== "ok") throw new Error(fail(r));
    S = s; sessionStorage.setItem("niksos", JSON.stringify(s));
    $("auth").style.display = "none"; $("dash").style.display = "block"; $("who").textContent = s.name;
    renderStats(r); loadUsers(""); loadDownloads(); loadPromos(); loadPayments(); loadStaff(); loadDiscounts(); loadAccountLog();
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
    userItems = u;
    accountApiReady = r.account_api_version === 1;
    canManageAdminAccounts = r.can_manage_admins === true;
    $("accountApiHint").textContent = accountApiReady
      ? "Бан, разбан и удаление проверяют права на сервере. Главный админ защищён; обычный админ не может менять другого админа."
      : "Для управления аккаунтами сначала выполни supabase/admin-accounts.sql в Supabase → SQL Editor, затем обнови панель.";
    updateAccountButtons();
    $("users").innerHTML = u.length ? `<table><thead><tr><th>Ник</th><th>Подписка</th><th>До</th><th>ПК</th><th>Был в клиенте</th>
      <th>Скач. 7д</th><th>IP 7д</th><th>Ключей</th><th>Создан</th></tr></thead><tbody>` + u.map(x => `<tr data-n="${esc(x.name)}">
      <td><b>${esc(x.display)}</b> ${x.owner ? '<span class="tag adm" style="background:#ffc83d22;color:#ffc83d">ГЛ. АДМИН</span>' : x.role === "admin" ? '<span class="tag adm">ADMIN</span>' : ""} ${x.banned ? '<span class="tag ban">БАН</span>' : ""}</td>
      <td>${x.active ? '<span class="tag on">' + (x.forever ? "навсегда" : "активна") + "</span>" : '<span class="tag off">нет</span>'}</td>
      <td>${x.forever ? "∞" : fmt(x.expires)}</td><td>${esc(x.devices)}</td><td>${fmt(x.last_seen)}</td>
      <td>${esc(x.dl_7d)}</td><td>${x.ips_7d > 2 ? '<span class="tag ban">' + esc(x.ips_7d) + "</span>" : esc(x.ips_7d)}</td>
      <td>${esc(x.keys_used)}</td><td>${fmt(x.created)}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="hint">Никого не нашлось</div>';
    $("users").querySelectorAll("tr[data-n]").forEach(tr => tr.addEventListener("click", () => select(tr.dataset.n)));
    if (selected) $("users").querySelector(`tr[data-n="${CSS.escape(selected)}"]`)?.classList.add("sel");
  }
  function select(n) {
    if (actionBusy) return;
    selected = n; $("selBox").hidden = false; $("selName").textContent = n;
    $("accountReason").value = ""; msg($("actMsg")); updateAccountButtons();
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

  function updateAccountButtons() {
    const u = userItems.find(x => x.name === selected);
    const self = S && selected === S.name.toLowerCase();
    const protectedTarget = !u || u.owner || self || (u.role === "admin" && !canManageAdminAccounts);
    document.querySelectorAll("[data-act]").forEach(b => {
      const account = ["ban", "unban", "delete"].includes(b.dataset.act);
      b.disabled = actionBusy || (account && (!accountApiReady || protectedTarget));
    });
    $("accountReason").disabled = actionBusy;
    $("deleteCancel").disabled = $("deleteConfirm").disabled = actionBusy;
    $("deleteTyped").disabled = actionBusy;
    $("deleteSubmit").disabled = actionBusy || !deleteTarget || $("deleteTyped").value !== deleteTarget || !$("deleteConfirm").checked;
  }
  async function loadAccountLog() {
    if (!S) return;
    try {
      const r = await A.accountLog(S.name, S.hash);
      if (r.status !== "ok") throw new Error(fail(r));
      const names = { ban: "Бан", unban: "Разбан", delete: "Удаление" };
      $("accountLog").innerHTML = (r.items || []).length
        ? '<table><thead><tr><th>Когда</th><th>Админ</th><th>Игрок</th><th>Действие</th><th>Причина</th></tr></thead><tbody>' +
          r.items.map(x => `<tr><td>${fmt(x.at)}</td><td>${esc(x.by_name)}</td><td>${esc(x.target)}</td><td>${esc(names[x.action] || x.action)}</td><td class="reason-cell">${esc(x.reason || "—")}</td></tr>`).join("") + '</tbody></table>'
        : '<div class="hint">Действий пока нет. Журнал ведётся с момента установки обновления.</div>';
    } catch (e) {
      $("accountLog").textContent = /^HTTP (400|404)$/.test(e.message || "")
        ? "Установи supabase/admin-accounts.sql, чтобы включить журнал."
        : "Журнал недоступен: " + e.message;
    }
  }
  const CONFIRM = { revoke: "Забрать подписку у %?", ban: "Забанить %? Вход и API будут заблокированы. Запущенный клиент узнает о бане при следующей серверной проверке.", unban: "Разбанить %?", reset_hwid: "Сбросить привязку ПК у %?" };
  const DONE = { grant: "Подписка выдана", revoke: "Подписка забрана", reset_hwid: "ПК сброшен", unlock: "Блокировка входа снята", ban: "Игрок забанен", unban: "Игрок разбанен", delete: "Аккаунт удалён, платежи сохранены, ник зарезервирован" };
  async function runAction(act, target, confirmation = null) {
    if (!S || actionBusy) return;
    const session = S;
    const reason = $("accountReason").value.trim();
    actionBusy = true; updateAccountButtons();
    msg($("actMsg"), "Выполняем…"); msg($("deleteMsg"));
    try {
      const r = ["ban", "unban", "delete"].includes(act)
        ? await A.accountAction(session.name, session.hash, target, act, confirmation, reason)
        : await A.action(session.name, session.hash, target, act, act === "grant" ? parseInt($("days").value, 10) : null);
      if (r.status !== "ok") throw new Error(fail(r));
      const text = DONE[act] + " — " + target;
      msg($("usersMsg"), text, "ok"); msg($("actMsg"), text, "ok");
      if (act === "delete") {
        $("deleteDialog").close(); deleteTarget = null;
        if (selected === target) { selected = null; $("selBox").hidden = true; }
      }
      await Promise.allSettled([loadUsers($("q").value), refreshStats(), loadAccountLog(), loadPayments(), loadDownloads(), loadStaff()]);
      document.dispatchEvent(new CustomEvent("niksos:accounts-updated"));
    } catch (err) {
      const text = /^HTTP (400|404)$/.test(err.message || "")
        ? "API не установлено или недоступно. Выполни supabase/admin-accounts.sql и обнови панель."
        : /^HTTP /.test(err.message || "") ? "Сервер не подтвердил результат (" + err.message + "). Обнови список перед повтором." : err.message;
      msg($("actMsg"), text, "err"); msg($("usersMsg"), text, "err");
      if (act === "delete") msg($("deleteMsg"), text, "err");
    } finally { actionBusy = false; updateAccountButtons(); }
  }
  document.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
    if (!selected || actionBusy || b.disabled) return;
    const act = b.dataset.act, target = selected;
    if (act === "delete") {
      deleteTarget = target; $("deleteName").textContent = target;
      $("deleteTyped").value = ""; $("deleteConfirm").checked = false; msg($("deleteMsg"));
      updateAccountButtons(); $("deleteDialog").showModal(); $("deleteTyped").focus();
      return;
    }
    if (CONFIRM[act] && !confirm(CONFIRM[act].replace("%", target))) return;
    await runAction(act, target);
  }));
  $("deleteTyped").addEventListener("input", updateAccountButtons);
  $("deleteConfirm").addEventListener("change", updateAccountButtons);
  $("deleteCancel").addEventListener("click", () => { if (!actionBusy) { $("deleteDialog").close(); deleteTarget = null; } });
  $("deleteDialog").addEventListener("cancel", e => { if (actionBusy) e.preventDefault(); else deleteTarget = null; });
  $("deleteForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (actionBusy || !deleteTarget || $("deleteTyped").value !== deleteTarget || !$("deleteConfirm").checked) return;
    await runAction("delete", deleteTarget, $("deleteTyped").value);
  });

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

  // ---------------- скидочные промокоды (отдельно от кодов на дни)
  let discountItems = [];
  async function loadDiscounts() {
    try {
      const r = await A.discounts(S.name, S.hash);
      if (r.status !== "ok") throw new Error(fail(r));
      discountItems = r.items || [];
      $("discounts").innerHTML = discountItems.length ? '<table><thead><tr><th>Код</th><th>Скидка</th><th>Тарифы</th><th>Оплачено / занято / лимит</th><th>До</th><th>Статус</th><th></th></tr></thead><tbody>' + discountItems.map(x => {
        const expired = x.expires_at && new Date(x.expires_at) <= new Date();
        return `<tr><td><b>${esc(x.code)}</b></td><td>−${esc(x.percent)}%</td><td>${(x.plans || []).map(p => esc(PLAN[p] || p)).join(", ")}</td>
          <td>${esc(x.uses)} / ${esc(x.reserved)} / ${x.max_uses == null ? "∞" : esc(x.max_uses)}</td><td>${x.expires_at ? fmt(x.expires_at) : "∞"}</td>
          <td>${!x.active ? "Выключен" : expired ? "Истёк" : "Включён"}</td><td class="discount-actions"><button class="linkbtn" type="button" data-edit-discount="${esc(x.code)}">Изменить</button>
          <button class="linkbtn" type="button" data-toggle-discount="${esc(x.code)}">${x.active ? "Выключить" : "Включить"}</button></td></tr>`;
      }).join("") + '</tbody></table>' : '<div class="hint">Скидочных кодов пока нет</div>';
      $("discounts").querySelectorAll("[data-edit-discount]").forEach(b => b.addEventListener("click", () => {
        const x = discountItems.find(x => x.code === b.dataset.editDiscount); if (!x) return;
        $("dCode").value = x.code; $("dPercent").value = x.percent; $("dMax").value = x.max_uses || "";
        $("dExpires").value = x.expires_at ? new Date(new Date(x.expires_at).getTime() - new Date(x.expires_at).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "";
        $("dOne").checked = x.one_per_user; $("dNote").value = x.note || "";
        document.querySelectorAll('[name="dPlan"]').forEach(p => p.checked = x.plans.includes(p.value));
        $("dCode").focus(); $("discountForm").scrollIntoView({ behavior: "smooth", block: "center" });
      }));
      $("discounts").querySelectorAll("[data-toggle-discount]").forEach(b => b.addEventListener("click", async () => {
        const x = discountItems.find(x => x.code === b.dataset.toggleDiscount); if (!x) return;
        b.disabled = true;
        try { const r = await A.discountSet(S.name, S.hash, x.code, !x.active); if (r.status !== "ok") throw new Error(fail(r)); await loadDiscounts(); }
        catch (e) { msg($("dMsg"), e.message, "err"); b.disabled = false; }
      }));
    } catch (e) { $("discounts").textContent = "Скидочные коды недоступны. Проверь установку discounts.sql. " + e.message; }
  }
  $("discountForm").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("dCode").value.trim().toUpperCase(), percent = Number($("dPercent").value);
    const plans = [...document.querySelectorAll('[name="dPlan"]:checked')].map(p => p.value);
    const maxUses = $("dMax").value ? Number($("dMax").value) : null;
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return msg($("dMsg"), "Код: 3–32 символа, латиница, цифры, _ или -.", "err");
    if (!Number.isInteger(percent) || percent < 1 || percent > 95 || !plans.length || (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1))) return msg($("dMsg"), "Проверь скидку (1–95%), лимит и тарифы.", "err");
    busy($("dSave"), true);
    try {
      const r = await A.discountSave(S.name, S.hash, { code, percent, plans, maxUses,
        expires: $("dExpires").value ? new Date($("dExpires").value + "T23:59:59").toISOString() : null,
        onePerUser: $("dOne").checked, note: $("dNote").value.trim() || null });
      if (r.status !== "ok") throw new Error(fail(r));
      msg($("dMsg"), "Код " + code + " сохранён: скидка " + percent + "% в окне покупки.", "ok"); await loadDiscounts();
    } catch (e) { msg($("dMsg"), e.message, "err"); } finally { busy($("dSave"), false); }
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

  // ---------------- выдача админки. Блок виден, но право выдачи проверяет только сервер.
  function staffAccess(allowed, hint, badge) {
    canManageStaff = allowed;
    $("staffBox").hidden = false;
    $("stName").disabled = !allowed;
    $("stGive").disabled = !allowed;
    $("staffHint").textContent = hint;
    $("staffBadge").textContent = badge;
  }
  async function loadStaff() {
    staffAccess(false, "Проверяем право управления администраторами…", "Проверка прав…");
    let r;
    try { r = await A.staff(S.name, S.hash); }
    catch (e) {
      const missing = /^HTTP (404|400)$/.test(e.message || "");
      staffAccess(false, missing
        ? "Серверная выдача админки не установлена. Выполни admin-staff.sql в Supabase → SQL Editor, затем нажми «Обновить»."
        : "Не удалось проверить права. Нажми «Обновить»; если ошибка повторится — проверь ответ niksos_staff.", "Недоступно");
      $("staff").textContent = ""; $("staffHistory").textContent = "";
      return;
    }
    if (r.status !== "ok") {
      staffAccess(false, r.status === "forbidden"
        ? "Ты обычный администратор. Выдавать и снимать админку может только главный. Владелец проекта назначает главного через SQL Editor — инструкция в комплекте."
        : fail(r), r.status === "forbidden" ? "Только главный админ" : "Нет доступа");
      $("staff").textContent = ""; $("staffHistory").textContent = "";
      return;
    }
    staffAccess(true, "Укажи ник зарегистрированного профиля. Новый админ получит доступ к панели, но не сможет выдавать админку или менять роль главного. Подписка выдаётся отдельно.", "ГЛ. АДМИН");
    const a = r.admins || [];
    $("staff").innerHTML = "<table><thead><tr><th>Ник</th><th>Роль</th><th>Выдана</th><th></th></tr></thead><tbody>" + a.map(x =>
      `<tr data-n="${esc(x.name)}"><td><b>${esc(x.display || x.name)}</b></td><td>${x.owner ? '<span class="tag adm">ГЛ. АДМИН</span>' : '<span class="tag adm">ADMIN</span>'}</td>
       <td>${fmt(x.since)}</td><td>${x.owner ? "" : '<button class="linkbtn" data-take>Снять админку</button>'}</td></tr>`).join("") + "</tbody></table>";
    const log = r.log || [];
    $("staffHistory").innerHTML = log.length ? '<h2 style="margin-top:18px">История выдачи</h2><table><thead><tr><th>Когда</th><th>Кто</th><th>Кому</th><th>Действие</th></tr></thead><tbody>'
      + log.map(x => `<tr><td>${fmt(x.at)}</td><td>${esc(x.by_name)}</td><td>${esc(x.target)}</td><td>${x.action === "give" ? "Выдал админку" : "Снял админку"}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="hint">История выдачи пока пуста</div>';
    $("staff").querySelectorAll("[data-take]").forEach(b => b.addEventListener("click", async () => {
      if (!canManageStaff || b.disabled) return;
      const n = b.closest("tr").dataset.n;
      if (!confirm("Снять админку с " + n + "? Подписка останется без изменений.")) return;
      busy(b, true);
      try {
        const x = await A.staffSet(S.name, S.hash, n, false);
        if (x.status !== "ok") throw new Error(fail(x));
        msg($("stMsg"), "Админка снята — " + (x.target || n), "ok");
        await loadStaff(); loadUsers($("q").value);
      } catch (err) { msg($("stMsg"), err.message, "err"); }
      finally { busy(b, false); }
    }));
  }
  $("staffForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!S || !canManageStaff || $("stGive").disabled) return;
    const n = $("stName").value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(n)) return msg($("stMsg"), "Ник: 3–16 символов, латиница, цифры, _", "err");
    if (n.toLowerCase() === S.name.toLowerCase()) return msg($("stMsg"), "Нельзя менять собственную роль", "err");
    if (!confirm("Выдать админку профилю " + n + "? Он получит управление игроками, подписками, ключами и промокодами.")) return;
    busy($("stGive"), true); msg($("stMsg"), "Выдаём админку…");
    try {
      const x = await A.staffSet(S.name, S.hash, n, true);
      if (x.status !== "ok") throw new Error(fail(x));
      msg($("stMsg"), "Админка выдана — " + (x.target || n) + ". Пусть выйдет и заново войдёт в кабинет.", "ok");
      $("stName").value = ""; await loadStaff(); loadUsers($("q").value);
    } catch (err) { msg($("stMsg"), err.message, "err"); }
    finally { busy($("stGive"), false); $("stGive").disabled = !canManageStaff; }
  });

  $("refresh").addEventListener("click", () => { refreshStats(); loadUsers($("q").value); loadDownloads(); loadPromos(); loadStaff(); loadPayments(); loadAccountLog(); });
  $("logout").addEventListener("click", () => { sessionStorage.removeItem("niksos"); location.href = "account.html"; });

  // сессия из кабинета
  (async () => {
    try { const s = JSON.parse(sessionStorage.getItem("niksos") || "null"); if (s) await enter(s); } catch (e) {}
  })();
})();
