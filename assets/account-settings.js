// Account settings UI. Only reflect server-backed license and media-application data.
(function () {
  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  const panels = [...document.querySelectorAll("[data-settings-panel]")];
  if (!tabs.length || !panels.length) return;

  function activate(tab, moveFocus = false) {
    const key = tab.dataset.settingsTab;
    tabs.forEach(item => {
      const active = item === tab;
      item.setAttribute("aria-selected", active ? "true" : "false");
      item.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== key; });
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (moveFocus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", e => {
      let next = null;
      if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next !== null) { e.preventDefault(); activate(tabs[next], true); }
    });
  });
  activate(tabs.find(t => t.getAttribute("aria-selected") === "true") || tabs[0]);

  const hwidCount = document.getElementById("settingsHwidCount");
  const hwidStatus = document.getElementById("settingsHwidStatus");
  window.addEventListener("niksos:license", event => {
    const detail = event.detail || {};
    if (!Number.isFinite(detail.devices)) {
      hwidCount.textContent = "Статус привязки не передан сервером.";
      hwidStatus.textContent = "Нет данных";
      hwidStatus.classList.add("is-muted");
      return;
    }
    const devices = detail.devices;
    const max = Number.isFinite(detail.maxDevices) ? ` из ${detail.maxDevices}` : "";
    hwidCount.textContent = devices > 0 ? `Привязанных устройств: ${devices}${max}.` : "Компьютер пока не привязан.";
    hwidStatus.textContent = devices > 0 ? "Привязан" : "Не привязан";
    hwidStatus.classList.toggle("is-muted", devices === 0);
  });

  const mediaState = document.getElementById("settingsMediaState");
  const mediaBadge = document.getElementById("settingsMediaBadge");
  const platformNames = { youtube: "YouTube", tiktok: "TikTok", twitch: "Twitch", other: "Канал" };
  const appStatus = { new: "Заявка на рассмотрении", ok: "Заявка одобрена", no: "Заявка отклонена", revoked: "Статус участника снят" };
  let mediaRequest = 0;

  function readSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem("niksos") || "null");
      return session && typeof session.name === "string" && typeof session.hash === "string" ? session : null;
    } catch (_) { return null; }
  }

  async function refreshMediaStatus() {
    const session = readSession();
    const request = ++mediaRequest;
    if (!session) {
      mediaState.textContent = "Войдите в кабинет, чтобы проверить статус серверной заявки.";
      mediaBadge.textContent = "Не проверено";
      mediaBadge.classList.add("is-muted");
      return;
    }
    mediaState.textContent = "Проверяем статус заявки на сервере…";
    mediaBadge.textContent = "Проверяем…";
    mediaBadge.classList.add("is-muted");
    try {
      const result = await window.NiksosApi.mediaMy(session.name, session.hash);
      if (request !== mediaRequest) return;
      if (!result || result.status !== "ok") throw new Error("status unavailable");
      if (result.media === true) {
        mediaState.textContent = "Сервер отмечает аккаунт как участника медиа-программы.";
        mediaBadge.textContent = "Участник программы";
        mediaBadge.classList.remove("is-muted");
        return;
      }
      const app = result.app;
      if (!app) {
        mediaState.textContent = "На сервере нет заявки на медиа-программу для этого аккаунта.";
        mediaBadge.textContent = "Заявок нет";
        mediaBadge.classList.add("is-muted");
        return;
      }
      const platform = platformNames[app.platform] || "Медиа-канал";
      const status = appStatus[app.status] || "Статус заявки получен";
      const url = typeof app.url === "string" && app.url.length ? ` · ${app.url}` : "";
      mediaState.textContent = `${platform}: ${status}${url}`;
      mediaBadge.textContent = status;
      mediaBadge.classList.toggle("is-muted", app.status !== "ok");
    } catch (_) {
      if (request !== mediaRequest) return;
      mediaState.textContent = "Не удалось получить серверный статус заявки. Проверь соединение или открой медиа-раздел.";
      mediaBadge.textContent = "Статус недоступен";
      mediaBadge.classList.add("is-muted");
    }
  }
  window.addEventListener("niksos:account-ready", refreshMediaStatus);

  const discordLink = document.getElementById("settingsDiscordLink");
  try {
    const configured = new URL(window.NIKSOS.links.discord);
    if (configured.protocol === "https:") discordLink.href = configured.href;
  } catch (_) {
    discordLink.hidden = true;
  }
})();
