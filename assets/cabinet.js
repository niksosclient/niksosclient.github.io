// Niksos кабинет: навигация по разделам, тема, зеркалирование данных account.js в сайдбар/статистику
(function () {
  const $ = id => document.getElementById(id);
  const views = [...document.querySelectorAll(".view")];
  function go(v) {
    if (!views.some(x => x.dataset.v === v)) v = "overview";
    views.forEach(x => x.hidden = x.dataset.v !== v);
    document.querySelectorAll(".nv[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === v));
    if (location.hash.slice(1) !== v) history.replaceState(null, "", "#" + v);
    document.dispatchEvent(new CustomEvent("niksos:view", { detail: v }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-view],[data-go]");
    if (b) go(b.dataset.view || b.dataset.go);
  });
  // покупка из лендинга (?buy=) → раздел подписки
  go(new URLSearchParams(location.search).get("buy") ? "sub" : location.hash.slice(1) || "overview");
  window.addEventListener("hashchange", () => go(location.hash.slice(1)));

  $("themeBtn").addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("niksos_theme", t); } catch (e) {}
  });

  function sync() {
    const name = $("who").textContent;
    $("who2").textContent = name;
    if (name) $("ava").style.backgroundImage = `url(https://mc-heads.net/avatar/${encodeURIComponent(name)}/72)`;
    const on = $("pill").classList.contains("on");
    $("sideSub").textContent = on ? "Подписка активна" : "Нет подписки";
    $("stPlan").textContent = on ? $("statusBig").textContent : "Нет";
    $("stPlanSub").textContent = on ? "активна" : "не активна";
    $("stDev").textContent = $("devCount").textContent || "—";
    const b = $("betaState").textContent;
    $("stBeta").textContent = /активен/.test(b) ? "Активна" : /куплена|выдана/i.test(b) ? "Куплена" : "Нет";
  }
  const mo = new MutationObserver(sync);
  ["who", "pillText", "statusBig", "devCount", "betaState"].forEach(id => mo.observe($(id), { childList: true, characterData: true, subtree: true }));
})();
