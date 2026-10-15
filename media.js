(function () {
  const $ = id => document.getElementById(id);
  const C = window.NIKSOS, M = C.media || {};
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const PF = { youtube: "YouTube", tiktok: "TikTok", twitch: "Twitch", other: "Канал" };
  const base = C.supabaseUrl.replace(/\/+$/, "");
  async function rpc(fn, body) {
    const h = { "Content-Type": "application/json", apikey: C.supabaseKey };
    if (C.supabaseKey.startsWith("eyJ")) h.Authorization = "Bearer " + C.supabaseKey;
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(body || {}) });
    if (r.status === 404) return { status: "not_installed" };
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(".0", "") + "K" : String(n || 0);
  const handle = url => { try { const u = new URL(url); return decodeURIComponent(u.pathname.replace(/^\/+|\/+$/g, "")) || u.host; } catch (e) { return url; } };

  $("perks").innerHTML = (M.perks || []).map((p, i) => `<div class="box perk"><div class="n">0${i + 1}</div><h3>${esc(p[0])}</h3><p>${esc(p[1])}</p></div>`).join("");
  $("req").innerHTML = (M.requirements || []).map(r => `<li>${esc(r)}</li>`).join("");

  // список медиа: из облака + вписанные вручную в config.js
  (async () => {
    let list = [];
    try { const r = await rpc("niksos_media_list"); if (Array.isArray(r)) list = r; } catch (e) {}
    const seen = new Set(list.map(x => String(x.name).toLowerCase()));
    for (const x of M.creators || []) if (!seen.has(String(x.name).toLowerCase())) list.push(x);
    list.sort((a, b) => (b.subs || 0) - (a.subs || 0));
    $("crList").innerHTML = list.length ? list.map(x => `<a class="box cr" href="${esc(/^https?:\/\//.test(x.url) ? x.url : "#")}" target="_blank" rel="noopener">
        <div class="ava"><img src="https://mc-heads.net/avatar/${encodeURIComponent(x.name)}/64" alt="" loading="lazy" onerror="this.remove()"></div>
        <div><b>${esc(x.name)}</b><span><i class="pf ${esc(PF[x.platform] ? x.platform : "other")}">${PF[x.platform] || "Канал"}</i>${x.subs ? fmt(x.subs) + " подписчиков" : esc(handle(x.url))}</span></div></a>`).join("")
      : `<div class="empty2" style="grid-column:1/-1">Здесь появятся наши медиа. Стань первым — заявка ниже.</div>`;
  })();

  // заявка
  const sess = (() => { try { return JSON.parse(sessionStorage.getItem("niksos") || "null"); } catch (e) { return null; } })();
  const ST = { new: ["new", "Заявка на рассмотрении — ответим в течение пары дней."], ok: ["ok", "Ты — медиа Niksos! Напиши в поддержку, чтобы получить промокод и бонусы."],
               no: ["no", "Заявка отклонена."], revoked: ["no", "Статус медиа снят."] };
  const ERR = { pending: "У тебя уже есть заявка на рассмотрении", already: "Ты уже медиа Niksos", limit: "Слишком много заявок — попробуй через месяц",
                bad_platform: "Выбери площадку", bad_url: "Ссылка должна начинаться с https://", wrong: "Сессия устарела — войди в кабинет заново",
                none: "Профиль не найден", banned: "Аккаунт заблокирован", locked: "Слишком много попыток — подожди 10 минут",
                not_installed: "Приём заявок ещё не включён — напиши в поддержку" };
  function showMine(r) {
    const a = r && r.app;
    if (r && r.media) { $("myApp").innerHTML = `<div class="mst ok">${ST.ok[1]}</div>`; $("mForm").hidden = true; return; }
    if (!a) { $("myApp").innerHTML = ""; $("mForm").hidden = false; return; }
    const s = ST[a.status] || ST.new;
    $("myApp").innerHTML = `<div class="mst ${s[0]}"><b>${PF[a.platform] || ""}</b> · ${esc(a.url)}<br>${s[1]}${a.note ? "<br>Комментарий: " + esc(a.note) : ""}</div>`;
    $("mForm").hidden = a.status === "new";
  }
  if (!sess) $("needAuth").hidden = false;
  else {
    $("mForm").hidden = false;
    rpc("niksos_media_my", { p_name: sess.name, p_pass: sess.hash }).then(r => { if (r.status === "ok") showMine(r); }).catch(() => {});
  }
  $("mForm").addEventListener("submit", async e => {
    e.preventDefault();
    const m = $("mMsg"), btn = $("mBtn");
    const url = $("mUrl").value.trim();
    if (!/^https?:\/\/\S{4,}$/.test(url)) { m.textContent = ERR.bad_url; m.className = "msg err"; return; }
    btn.disabled = true; btn.classList.add("busy"); m.textContent = "Отправляем…"; m.className = "msg";
    try {
      const r = await rpc("niksos_media_apply", { p_name: sess.name, p_pass: sess.hash, p_platform: $("mPlat").value, p_url: url,
        p_subs: parseInt($("mSubs").value, 10) || 0, p_contact: $("mContact").value.trim(), p_about: $("mAbout").value.trim() });
      if (r.status === "ok") {
        m.textContent = "Заявка отправлена!"; m.className = "msg ok";
        const my = await rpc("niksos_media_my", { p_name: sess.name, p_pass: sess.hash }); if (my.status === "ok") showMine(my);
      } else { m.textContent = ERR[r.status] || "Не получилось: " + r.status; m.className = "msg err"; }
    } catch (err) { m.textContent = "Нет связи с сервером — попробуй ещё раз"; m.className = "msg err"; }
    finally { btn.disabled = false; btn.classList.remove("busy"); }
  });
})();
