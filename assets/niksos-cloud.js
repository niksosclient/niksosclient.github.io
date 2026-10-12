// Niksos Cloud в браузере: ключи облака (как в клиенте), MQTT по WebSocket, расшифровка.
// Пароль никуда не отправляется: из него локально считаются ключи (PBKDF2), данные читаются с публичных брокеров зашифрованными.
(function () {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const PFX = "niksosclient/v1/u/";
  const b64 = u8 => btoa(String.fromCharCode(...u8));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const hex = u8 => [...u8].map(x => x.toString(16).padStart(2, "0")).join("");
  const low = s => String(s).toLowerCase();
  const tid = id => low(id).replace("#", "-");
  async function sha(s) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))); }

  // ---------- X25519 (RFC 7748) на BigInt ----------
  const P = (1n << 255n) - 19n, A24 = 121665n;
  const md = a => { a %= P; return a < 0n ? a + P : a; };
  function pw(b, e) { let r = 1n; b = md(b); while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; }
  const toN = u8 => { let n = 0n; for (let i = 31; i >= 0; i--) n = (n << 8n) | BigInt(u8[i]); return n; };
  function x25519(kIn, uIn) {
    const k = kIn.slice(0, 32); k[0] &= 248; k[31] &= 127; k[31] |= 64;
    const ub = uIn.slice(0, 32); ub[31] &= 127;
    const kn = toN(k), x1 = toN(ub);
    let x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0n;
    for (let t = 254; t >= 0; t--) {
      const kt = (kn >> BigInt(t)) & 1n; swap ^= kt;
      if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
      swap = kt;
      const A = md(x2 + z2), AA = A * A % P, B = md(x2 - z2), BB = B * B % P, E = md(AA - BB);
      const C = md(x3 + z3), D = md(x3 - z3), DA = D * A % P, CB = C * B % P;
      x3 = md((DA + CB) * (DA + CB)); z3 = md(x1 * md((DA - CB) * (DA - CB)));
      x2 = AA * BB % P; z2 = md(E * (AA + A24 * E));
    }
    if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
    let r = x2 * pw(z2, P - 2n) % P;
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) { out[i] = Number(r & 255n); r >>= 8n; }
    return out;
  }
  const SPKI = Uint8Array.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x03, 0x21, 0x00]);
  const BASE = (() => { const u = new Uint8Array(32); u[0] = 9; return u; })();
  const pubOf = seed => { const s = new Uint8Array(44); s.set(SPKI); s.set(x25519(seed, BASE), 12); return b64(s); };

  async function hmac(key, msg) {
    const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  }
  /** Общий ключ как FriendCrypto.shared: HMAC(X25519, "niksos-friends|a|b"), имена по алфавиту. */
  async function shared(seed, theirPub, a, b) {
    const raw = unb64(theirPub).slice(-32);
    const secret = x25519(seed, raw);
    return hmac(secret, "niksos-friends|" + (a < b ? a + "|" + b : b + "|" + a));
  }
  const aesCache = new Map();
  async function decrypt(key, data) {
    try {
      const id = b64(key);
      let k = aesCache.get(id);
      if (!k) { k = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]); aesCache.set(id, k); }
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, k, data.slice(12));
      return JSON.parse(dec.decode(pt));
    } catch (e) { return null; }
  }
  async function derive(name, pass) {
    const k = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode("niksos-cloud|" + low(name)), iterations: 120000 }, k, 512);
    return new Uint8Array(bits);
  }

  // ---------- минимальный MQTT 3.1.1 поверх WebSocket ----------
  const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt", "wss://test.mosquitto.org:8081/mqtt"];
  function str(s) { const b = enc.encode(s); const o = new Uint8Array(b.length + 2); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
  function packet(type, body) {
    const len = []; let n = body.length;
    do { let x = n % 128; n = Math.floor(n / 128); if (n > 0) x |= 128; len.push(x); } while (n > 0);
    const o = new Uint8Array(1 + len.length + body.length); o[0] = type; o.set(len, 1); o.set(body, 1 + len.length); return o;
  }
  const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };

  class Mqtt {
    constructor(onMsg, onState) { this.onMsg = onMsg; this.onState = onState || (() => {}); this.subs = new Set(); this.links = []; this.seen = new Map(); this.pid = 1; }
    start() { BROKERS.forEach(u => this.link(u)); }
    link(url) {
      const L = { url, ws: null, ok: false, buf: new Uint8Array(0), retry: 2000 };
      this.links.push(L);
      const open = () => {
        let ws;
        try { ws = new WebSocket(url, "mqtt"); } catch (e) { return setTimeout(open, L.retry); }
        L.ws = ws; ws.binaryType = "arraybuffer";
        ws.onopen = () => {
          const id = "niksos-web-" + Math.random().toString(36).slice(2, 10);
          ws.send(packet(0x10, cat(str("MQTT"), Uint8Array.from([4, 0x02, 0, 45]), str(id))));
        };
        ws.onmessage = ev => { L.buf = cat(L.buf, new Uint8Array(ev.data)); this.parse(L); };
        ws.onclose = () => { L.ok = false; this.onState(this.connected()); clearInterval(L.ping); setTimeout(open, L.retry); L.retry = Math.min(30000, L.retry * 2); };
        ws.onerror = () => {};
      };
      open();
    }
    connected() { return this.links.some(l => l.ok); }
    parse(L) {
      for (;;) {
        const b = L.buf; if (b.length < 2) return;
        let mul = 1, len = 0, i = 1, c;
        do { if (i >= b.length) return; c = b[i++]; len += (c & 127) * mul; mul *= 128; } while (c & 128);
        if (b.length < i + len) return;
        const type = b[0] >> 4, body = b.slice(i, i + len);
        L.buf = b.slice(i + len);
        if (type === 2) { // CONNACK
          if (body[1] === 0) {
            L.ok = true; L.retry = 2000; this.onState(true);
            L.ping = setInterval(() => { try { L.ws.send(Uint8Array.from([0xc0, 0])); } catch (e) {} }, 25000);
            if (this.subs.size) this.sendSub(L, [...this.subs]);
          }
        } else if (type === 3) { // PUBLISH
          const qos = (b[0] >> 1) & 3, tl = (body[0] << 8) | body[1];
          const topic = dec.decode(body.slice(2, 2 + tl));
          let p = 2 + tl; if (qos) p += 2;
          const payload = body.slice(p);
          const key = topic + "|" + b64(payload.slice(0, 24)) + payload.length, now = Date.now();
          if (this.seen.has(key) && now - this.seen.get(key) < 5000) continue; // тот же пакет с другого брокера
          this.seen.set(key, now);
          if (this.seen.size > 800) for (const [k, t] of this.seen) if (now - t > 5000) this.seen.delete(k);
          this.onMsg(topic, payload, !!(b[0] & 1));
        }
      }
    }
    sendSub(L, topics) {
      for (let i = 0; i < topics.length; i += 20) {
        const part = topics.slice(i, i + 20), id = this.pid++ & 0xffff || 1;
        L.ws.send(packet(0x82, cat(Uint8Array.from([id >> 8, id & 255]), ...part.map(t => cat(str(t), Uint8Array.from([0]))))));
      }
    }
    subscribe(topics) {
      const fresh = topics.filter(t => !this.subs.has(t));
      fresh.forEach(t => this.subs.add(t));
      if (fresh.length) this.links.forEach(L => { if (L.ok) this.sendSub(L, fresh); });
    }
    stop() { this.links.forEach(L => { L.ws && (L.ws.onclose = null); try { L.ws.close(); } catch (e) {} clearInterval(L.ping); }); this.links = []; }
  }

  window.NiksosCloud = { derive, pubOf, shared, decrypt, sha, b64, unb64, low, tid, PFX, Mqtt, x25519 };
})();
