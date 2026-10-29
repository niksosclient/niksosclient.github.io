// Account settings UI: only server-confirmed features are marked available.
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const tabButtons = [...document.querySelectorAll("[data-settings-tab]")];
  const panels = [...document.querySelectorAll("[data-settings-panel]")];
  if (!$("settingsThemeToggle")) return;

  let license = null;
  let checking = false;
  let checkedName = "";

  function setTab(name, focus = false) {
    const selected = tabButtons.findIndex(b => b.dataset.settingsTab === name);
    if (selected < 0) return;
    tabButtons.forEach((b, i) => {
      const on = i === selected;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panels.forEach(p => { p.hidden = p.dataset.settingsPanel !== name; });
    if (focus) tabButtons[selected].focus();
  }
  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => setTab(button.dataset.settingsTab));
    button.addEventListener("keydown", event => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabButtons.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabButtons.length) % tabButtons.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabButtons.length - 1;
      else return;
      event.preventDefault();
      setTab(tabButtons[next].dataset.settingsTab, true);
    });
  });

  function readSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem("niksos") || "null");
      return s && typeof s.name === "string" && /^[0-9a-f]{64}$/.test(s.hash) ? s : null;
    } catch (_) { return null; }
  }
  function updateThemeLabel() {
    const dark = document.documentElement.dataset.theme === "dark";
    $("settingsThemeValue").textContent = "Текущая тема: " + (dark ? "тёмная" : "светлая");
    $("settingsThemeToggle").textContent = dark ? "Включить светлую тему" : "Включить тёмную тему";
  }
  $("settingsThemeToggle").addEventListener("click", () => {
    $("themeBtn").click();
    updateThemeLabel();
  });
  $("themeBtn").addEventListener("click", updateThemeLabel);
  updateThemeLabel();

  function renderLicense() {
    if (!license) return;
    const devices = Number.isFinite(Number(license.devices)) ? String(license.devices) : "—";
    const limit = Number.isFinite(Number(license.max_devices)) ? String(license.max_devices) : "—";
    $("settingsHwidCount").textContent = devices;
    $("settingsHwidLimit").textContent = limit;
    $("settingsHwidState").textContent = license.status === "ok"
      ? "Данные обновлены по ответу лицензии сервера. Для сброса используй существующий подтверждённый поток."
      : "Не удалось подтвердить состояние у сервера.";
  }

  async function checkCapabilities() {
    const session = readSession();
    const status = $("accountPasswordAvailability");
    if (!session) {
      status.textContent = "Войди в кабинет, чтобы проверить серверные возможности.";
      return;
    }
    if (checking && checkedName === session.name) return;
    checking = true;
    checkedName = session.name;
    status.textContent = "Проверяем серверные возможности…";
    try {
      const data = await NiksosApi.settingsCapabilities(session.name, session.hash);
      if (!data || data.status !== "ok") {
        status.textContent = "Не удалось подтвердить настройки на сервере. Все новые функции остаются выключенными.";
      } else if (data.password_change === false) {
        status.textContent = "Отключено сервером: безопасного переноса password-derived cloud identity пока нет.";
      } else if (data.password_change === true) {
        // Fail closed: this client intentionally does not ship a password-change
        // form until the cloud-identity migration and launcher rollout are ready.
        status.textContent = "Сервер сообщил о функции смены пароля, но она выключена в этом клиенте до безопасного переноса облачной идентичности.";
      } else {
        status.textContent = "Серверная функция не подтверждена. Управление выключено.";
      }
    } catch (error) {
      status.textContent = /HTTP 404/.test(String(error && error.message))
        ? "Миграция настроек не установлена. Новые функции выключены."
        : "Не удалось проверить сервер. Новые функции выключены.";
    } finally {
      checking = false;
    }
  }

  document.addEventListener("niksos:license", event => {
    license = event.detail || null;
    renderLicense();
    if (!document.querySelector('[data-v="settings"]').hidden) checkCapabilities();
  });
  document.addEventListener("niksos:view", event => {
    if (event.detail === "settings") {
      updateThemeLabel();
      renderLicense();
      checkCapabilities();
    }
  });
  document.addEventListener("niksos:logout", () => {
    license = null;
    checkedName = "";
    $("settingsHwidCount").textContent = "—";
    $("settingsHwidLimit").textContent = "—";
    $("settingsHwidState").textContent = "Войди в кабинет, чтобы загрузить данные.";
    $("accountPasswordAvailability").textContent = "Войди в кабинет, чтобы проверить серверные возможности.";
  });
  if (!document.querySelector('[data-v="settings"]').hidden) checkCapabilities();
})();
