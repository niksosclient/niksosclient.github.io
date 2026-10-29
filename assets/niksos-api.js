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
      accountAction: (n, h, target, action, confirmName = null, reason = null) =>
        rpc("niksos_admin_account_action", { p_name: n, p_pass: h, p_target: target,
          p_action: action, p_confirm: confirmName, p_reason: reason || null }),
      accountLog: (n, h) => rpc("niksos_admin_account_log", { p_name: n, p_pass: h }),
      genKeys: (n, h, plan, count) => rpc("niksos_admin_gen_keys", { p_name: n, p_pass: h, p_plan: plan, p_count: count }),
      promoSave: (n, h, o) => rpc("niksos_admin_promo_save", { p_name: n, p_pass: h, p_code: o.code, p_days: o.days,
        p_max_uses: o.maxUses, p_expires: o.expires, p_one_per_ip: o.onePerIp, p_new_only: o.newOnly, p_note: o.note }),
      promos: (n, h) => rpc("niksos_admin_promos", { p_name: n, p_pass: h }),
      promoSet: (n, h, code, action) => rpc("niksos_admin_promo_set", { p_name: n, p_pass: h, p_code: code, p_action: action }),
      promoUsers: (n, h, code) => rpc("niksos_admin_promo_users", { p_name: n, p_pass: h, p_code: code }),
      discounts: (n, h) => rpc("niksos_admin_discounts", { p_name: n, p_pass: h }),
      discountSave: (n, h, o) => rpc("niksos_admin_discount_save", { p_name: n, p_pass: h, p_code: o.code, p_percent: o.percent,
        p_plans: o.plans, p_max_uses: o.maxUses, p_expires: o.expires, p_one_per_user: o.onePerUser, p_note: o.note }),
      discountSet: (n, h, code, active) => rpc("niksos_admin_discount_set", { p_name: n, p_pass: h, p_code: code, p_active: active }),
      payments: (n, h) => rpc("niksos_admin_payments", { p_name: n, p_pass: h }),
      downloads: (n, h) => rpc("niksos_admin_downloads", { p_name: n, p_pass: h }),
      staff: (n, h) => rpc("niksos_staff", { p_name: n, p_pass: h }),
      staffSet: (n, h, target, admin) => rpc("niksos_staff_set", { p_name: n, p_pass: h, p_target: target, p_admin: !!admin }),
    },
    // Оплата RollyPay (Edge Function niksos-pay)
    async pay(body) {
      try {
        const r = await fetch(`${base}/functions/v1/niksos-pay`, { method: "POST", headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
        const j = await r.json().catch(() => ({}));
        return j.status ? j : { status: "error" };
      } catch (e) { return { status: "net" }; }
    },
    quote: (name, hash, plan, promo) => NiksosApi.pay({ action: "quote", name, pass: hash, plan, promo: promo || "" }),
    buy: (name, hash, plan, test, provider, checkout = {}) => NiksosApi.pay({ action: "create", name, pass: hash, plan, test: !!test, provider, ...checkout }),
    paySync: (name, hash) => NiksosApi.pay({ action: "sync", name, pass: hash }),
    hwidReset: (name, hash) => rpc("niksos_hwid_reset", { p_name: name, p_pass: hash }),
    // ── Публичный профиль (без пароля) ──
    publicProfile: (name) => rpc("niksos_public_profile", { p_name: name }),
    // ── Топ игроков ──
    leaderboard: (limit = 50) => rpc("niksos_leaderboard", { p_limit: limit }),
    // ── Прицел ──
    crosshairSave: (name, hash, data) => rpc("niksos_crosshair_save", { p_name: name, p_pass: hash, p_data: data }),
    // ── Статистика: пуш из клиента ──
    statsPush: (name, hash, o) => rpc("niksos_stats_push", {
      p_name: name, p_pass: hash,
      p_hours: o.hours || 0, p_kills: o.kills || 0, p_deaths: o.deaths || 0, p_blocks: o.blocks || 0,
      p_srv_funtime: o.funtime || 0, p_srv_holyworld: o.holyworld || 0,
      p_srv_reallyworld: o.reallyworld || 0, p_srv_other: o.other || 0,
    }),
    // Edge authorizes once; Storage serves four private parts directly.
    // Verify every part before offering a single ordinary EXE to the user.
    async download(name, hash, onProgress = () => {}) {
      const r = await fetch(`${base}/functions/v1/niksos-download`, {
        method: "POST", headers: headers(), body: JSON.stringify({ name, pass: hash }) });
      const type = r.headers.get("content-type") || "";
      // Compatibility with the previous binary download handler during rollout.
      if (r.ok && !type.includes("application/json")) {
        const blob = await r.blob();
        const cd = r.headers.get("content-disposition") || "";
        const m = /filename="?([^";]+)"?/i.exec(cd);
        return { status: "ok", blob, filename: m ? m[1] : "Niksos-Launcher-Setup.exe" };
      }
      let j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok || j.status !== "parts") return j.status ? j : { status: "error" };
      const origin = new URL(base).origin;
      if (!Array.isArray(j.parts) || j.parts.length !== 4 ||
          !["Niksos-Launcher-Setup-0.1.13.exe", "Niksos-Launcher-Setup.exe"].includes(j.filename) ||
          !Number.isSafeInteger(j.bytes) || j.bytes <= 0 || j.bytes > 200000000 ||
          !/^[a-f0-9]{64}$/.test(j.sha256)) return { status: "bad_download" };
      let total = 0;
      // Validate the whole manifest BEFORE fetching anything. Never send account
      // hashes or API keys to storage URLs, and never follow their redirects.
      const urls = [];
      for (let i = 0; i < j.parts.length; i++) {
        const part = j.parts[i];
        if (!part || !Number.isSafeInteger(part.bytes) || part.bytes <= 0 ||
            part.bytes >= 50000000 || !/^[a-f0-9]{64}$/.test(part.sha256) ||
            typeof part.url !== "string") return { status: "bad_download" };
        let url; try { url = new URL(part.url); } catch (e) { return { status: "bad_download" }; }
        if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password ||
            url.pathname !== `/storage/v1/object/sign/niksos-builds/${j.filename}.part${i + 1}`) {
          return { status: "bad_download" };
        }
        urls.push(url.href); total += part.bytes;
      }
      if (total !== j.bytes) return { status: "bad_download" };
      const chunks = [];
      for (let i = 0; i < j.parts.length; i++) {
        onProgress(i + 1, j.parts.length);
        let response;
        try {
          response = await fetch(urls[i], { credentials: "omit", cache: "no-store",
            referrerPolicy: "no-referrer", redirect: "error", signal: AbortSignal.timeout(300000) });
        } catch (e) { return { status: "download_error" }; }
        if (!response.ok) return { status: "no_file" };
        const blob = await response.blob();
        if (blob.size !== j.parts[i].bytes) return { status: "integrity" };
        const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
        const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
        if (hex !== j.parts[i].sha256) return { status: "integrity" };
        chunks.push(blob);
      }
      const blob = new Blob(chunks, { type: "application/vnd.microsoft.portable-executable" });
      if (blob.size !== j.bytes) return { status: "integrity" };
      return { status: "ok", blob, filename: j.filename };
    },
  };
})();
