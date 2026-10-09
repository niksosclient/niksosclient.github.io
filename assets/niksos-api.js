// API кабинета Niksos: хэш пароля (как в клиенте) + вызовы Supabase.
(function () {
  const C = window.NIKSOS;
  const base = C.supabaseUrl.replace(/\/+$/, "");

  // Тот же хэш, что CloudServer.authHash в клиенте:
  // PBKDF2-HMAC-SHA256, соль "niksos-auth|" + ник в нижнем регистре, 120 000 итераций, первые 32 байта → hex.
  // Пароль никуда не отправляется — только этот хэш.
  async function authHash(name, password) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: enc.encode("niksos-auth|" + name.toLowerCase()), iterations: 120000 },
      key, 512);
    return [...new Uint8Array(bits).slice(0, 32)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function headers() {
    const h = { "Content-Type": "application/json", apikey: C.supabaseKey };
    if (C.supabaseKey.startsWith("eyJ")) h.Authorization = "Bearer " + C.supabaseKey;
    return h;
  }

  async function rpc(fn, body) {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  window.NiksosApi = {
    authHash,
    register: (name, hash) => rpc("niksos_register", { p_name: name, p_pass: hash }),
    license: (name, hash) => rpc("niksos_license", { p_name: name, p_pass: hash }),
    activate: (name, hash, key) => rpc("niksos_activate", { p_name: name, p_pass: hash, p_key: key }),
    admin: {
      stats: (n, h) => rpc("niksos_admin_stats", { p_name: n, p_pass: h }),
      users: (n, h, q) => rpc("niksos_admin_users", { p_name: n, p_pass: h, p_query: q || "" }),
      action: (n, h, target, action, days) => rpc("niksos_admin_action", { p_name: n, p_pass: h, p_target: target, p_action: action, p_days: days ?? null }),
      genKeys: (n, h, plan, count) => rpc("niksos_admin_gen_keys", { p_name: n, p_pass: h, p_plan: plan, p_count: count }),
      promoSave: (n, h, o) => rpc("niksos_admin_promo_save", { p_name: n, p_pass: h, p_code: o.code, p_days: o.days,
        p_max_uses: o.maxUses, p_expires: o.expires, p_one_per_ip: o.onePerIp, p_new_only: o.newOnly, p_note: o.note }),
      promos: (n, h) => rpc("niksos_admin_promos", { p_name: n, p_pass: h }),
      promoSet: (n, h, code, action) => rpc("niksos_admin_promo_set", { p_name: n, p_pass: h, p_code: code, p_action: action }),
      promoUsers: (n, h, code) => rpc("niksos_admin_promo_users", { p_name: n, p_pass: h, p_code: code }),
      payments: (n, h) => rpc("niksos_admin_payments", { p_name: n, p_pass: h }),
      downloads: (n, h) => rpc("niksos_admin_downloads", { p_name: n, p_pass: h }),
    },
    // Оплата RollyPay (Edge Function niksos-pay)
    async pay(body) {
      try {
        const r = await fetch(`${base}/functions/v1/niksos-pay`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        return j.status ? j : { status: "error" };
      } catch (e) { return { status: "net" }; }
    },
    buy: (name, hash, plan, test, provider) => NiksosApi.pay({ action: "create", name, pass: hash, plan, test: !!test, provider }),
    paySync: (name, hash) => NiksosApi.pay({ action: "sync", name, pass: hash }),
    hwidReset: (name, hash) => rpc("niksos_hwid_reset", { p_name: name, p_pass: hash }),
    // Edge Function отдаёт сам jar (с меткой владельца), а при ошибке — JSON {status}
    async download(name, hash) {
      const r = await fetch(`${base}/functions/v1/niksos-download`, {
        method: "POST", headers: headers(), body: JSON.stringify({ name, pass: hash }) });
      const type = r.headers.get("content-type") || "";
      if (r.ok && !type.includes("application/json")) {
        const blob = await r.blob();
        const cd = r.headers.get("content-disposition") || "";
        const m = /filename="?([^";]+)"?/i.exec(cd);
        return { status: "ok", blob, filename: m ? m[1] : "niksos-client.jar" };
      }
      let j = {}; try { j = await r.json(); } catch (e) {}
      return j.status ? j : { status: "error" };
    },
  };
})();
