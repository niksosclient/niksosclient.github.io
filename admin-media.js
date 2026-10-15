// Админка: заявки в медиа (cloud/media.sql)
(function () {
  const $ = id => document.getElementById(id);
  const C = window.NIKSOS, base = C.supabaseUrl.replace(/\/+$/, "");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const PF = { youtube: "YouTube", tiktok: "TikTok", twitch: "Twitch", other: "Другое" };
  const ST = { new: "🟡 Новая", ok: "🟢 Медиа", no: "🔴 Отказ", revoked: "⚪ Снят" };
  async function rpc(fn, body) {
    const h = { "Content-Type": "application/json", apikey: C.supabaseKey };
    if (C.supabaseKey.startsWith("eyJ")) h.Authorization = "Bearer " + C.supabaseKey;
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(body) });
    if (r.status === 404) return { status: "not_installed" };
    return r.json();
  }
  const sess = () => { try { return JSON.parse(sessionStorage.getItem("niksos") || "null"); } catch (e) { return null; } };
  let loaded = false;
  async function load() {
    const s = sess(); if (!s) return;
    const r = await rpc("niksos_admin_media", { p_name: s.name, p_pass: s.hash }).catch(() => null);
    if (!r) return;
    if (r.status === "not_installed") { $("mediaBox").hidden = false; $("mediaApps").innerHTML = '<div class="desc">Выполни <b>cloud/media.sql</b> в Supabase → SQL Editor, чтобы включить заявки.</div>'; return; }
    if (r.status !== "ok") return;
    $("mediaBox").hidden = false;
    const apps = r.apps || [];
    $("mediaCount").textContent = "· новых " + apps.filter(a => a.status === "new").length;
    $("mediaApps").innerHTML = apps.length ? `<table><thead><tr><th>Ник</th><th>Канал</th><th>Подп.</th><th>Связь</th><th>О себе</th><th>Статус</th><th></th></tr></thead><tbody>` +
      apps.map(a => `<tr><td><b>${esc(a.name)}</b></td><td>${PF[a.platform] || esc(a.platform)}<br><a href="${esc(a.url)}" target="_blank" rel="noopener" style="text-decoration:underline">${esc(a.url).slice(0, 40)}</a></td>
        <td>${a.subs || 0}</td><td>${esc(a.contact)}</td><td style="max-width:260px;white-space:normal">${esc(a.about)}</td>
        <td>${ST[a.status] || esc(a.status)}${a.decided_by ? "<br><small>" + esc(a.decided_by) + "</small>" : ""}</td>
        <td style="white-space:nowrap">${a.status === "new" || a.status === "no" ? `<button class="btn primary" data-md="approve" data-id="${a.id}">Одобрить</button> ` : ""}${a.status === "new" ? `<button class="btn ghost" data-md="reject" data-id="${a.id}">Отказ</button>` : ""}${a.status === "ok" ? `<button class="btn ghost" data-md="revoke" data-id="${a.id}">Снять</button>` : ""}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="desc">Заявок пока нет</div>';
    $("mediaApps").querySelectorAll("[data-md]").forEach(b => b.addEventListener("click", async () => {
      const act = b.dataset.md;
      const note = act === "revoke" ? "" : prompt(act === "approve" ? "Комментарий для медиа (необязательно):" : "Причина отказа (увидит игрок):", "");
      if (note === null) return;
      b.disabled = true;
      const s = sess();
      const res = await rpc("niksos_admin_media_set", { p_name: s.name, p_pass: s.hash, p_id: +b.dataset.id, p_action: act, p_note: note }).catch(() => ({ status: "net" }));
      const m = $("mdMsg"); m.textContent = res.status === "ok" ? "Готово" : "Ошибка: " + res.status; m.className = "msg" + (res.status === "ok" ? " ok" : " err");
      load();
    }));
  }
  const t = setInterval(() => { if (!loaded && sess() && $("dash") && getComputedStyle($("dash")).display !== "none") { loaded = true; load(); } }, 800);
  document.addEventListener("click", e => { if (e.target && e.target.id === "refresh") load(); if (e.target && e.target.id === "logout") loaded = false; });
})();
