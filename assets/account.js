(function () {
  const $ = id => document.getElementById(id);
  const PLAN = { "7d": "7 дней", "30d": "30 дней", "90d": "90 дней", forever: "Навсегда" };
  const AUTH_ERR = {
    wrong: "Неверный пароль", none: "Такого профиля нет — зарегистрируйся",
    locked: "Слишком много попыток — подожди 10 минут", banned: "Аккаунт заблокирован администрацией", bad: "Ник: 3–16 символов, латиница, цифры, _",
  };
  const KEY_ERR = {
    bad_key: "Ключ или промокод не найден — проверь, что ввёл без ошибок", used: "Этот ключ уже активирован",
    promo_used: "Ты уже активировал этот промокод", promo_limit: "Промокод закончился — лимит активаций исчерпан",
    promo_expired: "Срок действия промокода истёк", promo_ip: "С этой сети промокод уже активировали",
    promo_new_only: "Этот промокод только для новых игроков",
    locked: "Слишком много неверных ключей — подожди 10 минут", ...AUTH_ERR,
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = s => new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  let session = null, mode = "login";

  const qs = new URLSearchParams(location.search);
  const wantPlan = qs.get("buy"), payBack = qs.get("pay");
  if (wantPlan || payBack) history.replaceState(null, "", location.pathname);
  const PAY_ERR = {
    too_many: "Слишком много попыток оплаты — подожди час", bad_plan: "Неизвестный тариф",
    not_configured: "Оплата ещё не настроена — напиши в поддержку", pay_error: "Платёжная система не ответила — попробуй через минуту",
    net: "Нет связи с сервером — попробуй ещё раз", ...AUTH_ERR,
  };

  function busy(btn, on) { btn.disabled = on; btn.classList.toggle("busy", on); }
  function msg(el, text, kind) { el.textContent = text || ""; el.className = "msg" + (kind ? " " + kind : ""); }

  // вкладки
  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
    mode = b.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", x === b));
    $("pass2wrap").hidden = mode !== "register";
    $("pass").autocomplete = mode === "register" ? "new-password" : "current-password";
    $("authBtn").querySelector(".t").textContent = mode === "register" ? "Создать профиль" : "Войти";
    msg($("authMsg"));
  }));

  let lastLic = null;
  function render(lic) {
    lastLic = lic;
    $("who").textContent = lic.name || session.name;
    $("adminLink").hidden = lic.role !== "admin";
    $("testWrap").style.display = lic.role === "admin" && PROVS.includes("rollypay") ? "block" : "none";
    const on = !!lic.active;
    $("pill").classList.toggle("on", on);
    $("pillText").textContent = on ? "Подписка активна" : "Нет подписки";
    if (lic.forever) {
      $("statusBig").textContent = "Навсегда"; $("statusSmall").textContent = "Доступ без ограничения по времени";
    } else if (on) {
      const left = Math.max(0, Math.ceil((new Date(lic.expires) - Date.now()) / 864e5));
      $("statusBig").textContent = "Осталось " + left + " " + (left % 10 === 1 && left % 100 !== 11 ? "день" : (left % 10 >= 2 && left % 10 <= 4 && (left % 100 < 10 || left % 100 >= 20)) ? "дня" : "дней");
      $("statusSmall").textContent = "Действует до " + fmtDate(lic.expires);
    } else {
      $("statusBig").textContent = lic.expires ? "Подписка закончилась" : "Подписки нет";
      $("statusSmall").textContent = lic.expires ? "Закончилась " + fmtDate(lic.expires) + ". Продли ниже." : "Купи подписку ниже или активируй ключ/промокод справа.";
    }
    $("dlBtn").disabled = !on;
    // привязка к ПК
    const dev = lic.devices || 0, maxDev = lic.max_devices || 1;
    $("devCount").textContent = dev + " / " + maxDev;
    $("devText").textContent = dev
      ? "Клиент привязан к ПК. Чтобы играть на другом компьютере, сбрось привязку — новый ПК привяжется при первом запуске."
      : "ПК пока не привязан — привяжется автоматически при первом запуске клиента с активной подпиской.";
    $("resetBtn").disabled = !dev || !!lic.reset_next;
    $("resetNote").textContent = lic.reset_next ? "Следующий сброс доступен " + fmtDate(lic.reset_next) : "Сброс доступен раз в 7 дней.";
    const h = lic.history || [];
    $("hist").innerHTML = h.length
      ? "<table><thead><tr><th>Тариф</th><th>Дата активации</th></tr></thead><tbody>" +
        h.map(x => `<tr><td>${x.plan === "promo" ? "Промокод " + esc(x.code) + " (" + (x.days ? "+" + x.days + " дн." : "навсегда") + ")"
          : (PLAN[x.plan] || esc(x.plan)) + (x.via === "pay" ? " — оплата " + esc(x.amount) + " ₽" + (x.test ? " (тест)" : "")
          + (x.state === "refunded" ? " · возврат, дни сняты" : x.state === "chargeback" ? " · отменена банком, дни сняты" : "") : "")}</td><td>${fmtDate(x.at)}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="empty">Пока нет покупок и активаций</div>';
  }

  function showDash(lic) {
    $("auth").style.display = "none"; $("dash").style.display = "block"; render(lic);
    if (wantPlan && !afterLogin.done) {
      afterLogin.done = true;
      const b = document.querySelector(`[data-plan="${CSS.escape(wantPlan)}"]`);
      if (b) { b.classList.add("pick"); $("buyBox").scrollIntoView({ behavior: "smooth", block: "center" }); }
    }
    if (payBack && !afterPay.done) { afterPay.done = true; checkPaid(); }
  }
  const afterLogin = {}, afterPay = {};
  const PROVS = (NIKSOS.pay && NIKSOS.pay.length ? NIKSOS.pay : ["anypay"]);
  document.querySelectorAll('input[name="prov"]').forEach(r => { r.parentElement.style.display = PROVS.includes(r.value) ? "" : "none"; r.checked = r.value === PROVS[0]; });
  $("provWrap").style.display = PROVS.length > 1 ? "block" : "none";

  // Вернулись со страницы оплаты: ждём колбэк, заодно сверяем платёж сами
  async function checkPaid() {
    if (payBack === "fail") return msg($("buyMsg"), "Оплата не прошла или отменена. Деньги не списаны — можно попробовать ещё раз.", "err");
    const was = lastLic ? (lastLic.forever ? Infinity : +new Date(lastLic.expires || 0)) : 0;
    msg($("buyMsg"), "Проверяем оплату…");
    $("buyBox").scrollIntoView({ behavior: "smooth", block: "center" });
    for (let i = 0; i < 12; i++) {
      if (i % 3 === 1) await NiksosApi.paySync(session.name, session.hash);
      try {
        const lic = await NiksosApi.license(session.name, session.hash);
        if (lic.status === "ok") {
          const now = lic.forever ? Infinity : +new Date(lic.expires || 0);
          if (now > was) { render(lic); return msg($("buyMsg"), "Оплата прошла, подписка начислена 🎉 Можно скачивать клиент.", "ok"); }
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 5000));
    }
    msg($("buyMsg"), "Платёж ещё обрабатывается — обнови страницу через пару минут. Если деньги списались, а подписки нет — напиши в поддержку.", "err");
  }

  document.querySelectorAll("[data-plan]").forEach(b => b.addEventListener("click", async () => {
    if (!session) return;
    document.querySelectorAll("[data-plan]").forEach(x => { x.disabled = true; x.classList.remove("pick"); });
    b.classList.add("busy"); msg($("buyMsg"), "Создаём платёж…");
    const prov = (document.querySelector('input[name="prov"]:checked') || {}).value || PROVS[0];
    const r = await NiksosApi.buy(session.name, session.hash, b.dataset.plan, $("testPay").checked, prov);
    if (r.status === "ok" && r.pay_url) { msg($("buyMsg"), "Переходим к оплате…", "ok"); location.href = r.pay_url; return; }
    msg($("buyMsg"), PAY_ERR[r.status] || "Не удалось создать платёж — попробуй позже", "err");
    document.querySelectorAll("[data-plan]").forEach(x => x.disabled = false); b.classList.remove("busy");
  }));
  function showAuth() { $("dash").style.display = "none"; $("auth").style.display = "block"; }

  $("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("name").value.trim(), pass = $("pass").value;
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return msg($("authMsg"), AUTH_ERR.bad, "err");
    if (pass.length < 4) return msg($("authMsg"), "Пароль слишком короткий", "err");
    if (mode === "register" && pass !== $("pass2").value) return msg($("authMsg"), "Пароли не совпадают", "err");
    busy($("authBtn"), true); msg($("authMsg"), "Проверяем…");
    try {
      const hash = await NiksosApi.authHash(name, pass);
      if (mode === "register") {
        const r = await NiksosApi.register(name, hash);
        if (r === "taken") throw new Error("Ник занят. Если это твой — войди на вкладке «Вход»");
        if (r !== "created") throw new Error(AUTH_ERR.bad);
      }
      const lic = await NiksosApi.license(name, hash);
      if (lic.status !== "ok") throw new Error(AUTH_ERR[lic.status] || "Не удалось войти");
      session = { name, hash };
      sessionStorage.setItem("niksos", JSON.stringify(session));
      $("pass").value = $("pass2").value = "";
      msg($("authMsg"));
      showDash(lic);
    } catch (err) {
      msg($("authMsg"), err.message.startsWith("HTTP") || err.name === "TypeError" ? "Нет связи с сервером — попробуй ещё раз" : err.message, "err");
    } finally { busy($("authBtn"), false); }
  });

  $("keyForm").addEventListener("submit", async e => {
    e.preventDefault();
    const key = $("key").value.trim();
    if (key.replace(/[^A-Za-z0-9]/g, "").length < 3) return msg($("keyMsg"), "Введи ключ или промокод", "err");
    busy($("keyBtn"), true); msg($("keyMsg"), "Активируем…");
    try {
      const r = await NiksosApi.activate(session.name, session.hash, key);
      if (r.status !== "ok") throw new Error(KEY_ERR[r.status] || "Не удалось активировать");
      $("key").value = "";
      msg($("keyMsg"), r.activated === "promo"
        ? "Промокод " + r.promo + " активирован: " + (r.promo_days ? "+" + r.promo_days + " дн." : "доступ навсегда") + " 🎉"
        : "Готово! Активирован тариф «" + (PLAN[r.activated] || r.activated) + "»", "ok");
      render(r);
    } catch (err) {
      msg($("keyMsg"), err.message.startsWith("HTTP") || err.name === "TypeError" ? "Нет связи с сервером — попробуй ещё раз" : err.message, "err");
    } finally { busy($("keyBtn"), false); }
  });

  $("dlBtn").addEventListener("click", async () => {
    busy($("dlBtn"), true); msg($("dlMsg"), "Готовим файл…");
    try {
      const r = await NiksosApi.download(session.name, session.hash);
      if (r.status === "ok" && r.blob) {
        const url = URL.createObjectURL(r.blob), a = document.createElement("a");
        a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        msg($("dlMsg"), "Скачивание началось. Файл привязан к твоему профилю — не передавай его.", "ok");
      }
      else if (r.status === "no_license") msg($("dlMsg"), "Нет активной подписки", "err");
      else if (r.status === "limit") msg($("dlMsg"), "Лимит скачиваний на сегодня исчерпан — попробуй завтра", "err");
      else if (r.status === "no_file") msg($("dlMsg"), "Файл клиента ещё не загружен — напиши в поддержку", "err");
      else msg($("dlMsg"), AUTH_ERR[r.status] || "Не удалось скачать — попробуй позже", "err");
    } catch (err) { msg($("dlMsg"), "Нет связи с сервером — попробуй ещё раз", "err"); }
    finally { busy($("dlBtn"), false); $("dlBtn").disabled = !$("pill").classList.contains("on"); }
  });

  $("resetBtn").addEventListener("click", async () => {
    if (!confirm("Сбросить привязку к ПК? Следующий сброс будет доступен только через 7 дней.")) return;
    busy($("resetBtn"), true); msg($("resetMsg"), "Сбрасываем…");
    try {
      const r = await NiksosApi.hwidReset(session.name, session.hash);
      if (r.status === "ok") { render(r); msg($("resetMsg"), "Готово — запусти клиент на нужном ПК", "ok"); }
      else if (r.status === "cooldown") { if (lastLic) lastLic.reset_next = r.reset_next; msg($("resetMsg"), "Сбрасывать можно раз в 7 дней. Следующий — " + fmtDate(r.reset_next), "err"); }
      else msg($("resetMsg"), AUTH_ERR[r.status] || "Не удалось сбросить", "err");
    } catch (err) { msg($("resetMsg"), "Нет связи с сервером — попробуй ещё раз", "err"); }
    finally { busy($("resetBtn"), false); $("resetBtn").disabled = !(lastLic && lastLic.devices) || !!(lastLic && lastLic.reset_next); }
  });

  $("logout").addEventListener("click", () => { sessionStorage.removeItem("niksos"); session = null; showAuth(); });

  // восстановление сессии вкладки
  (async () => {
    try {
      const s = JSON.parse(sessionStorage.getItem("niksos") || "null");
      if (!s) return;
      const lic = await NiksosApi.license(s.name, s.hash);
      if (lic.status === "ok") { session = s; showDash(lic); } else sessionStorage.removeItem("niksos");
    } catch (e) {}
  })();
})();
