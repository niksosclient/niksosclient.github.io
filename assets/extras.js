// Niksos — интерактив главной: прицел, примерка, сервера
(() => {
  // ---------- Редактор прицела (15×15) ----------
  const N = 15, grid = document.getElementById('nx-grid'); if (!grid) return;
  let px = JSON.parse(localStorage.nxCross || 'null') || Array(N * N).fill(0), color = localStorage.nxCrossColor || '#ffffff', mirror = true, tool = 1, down = false;
  const cells = [];
  for (let i = 0; i < N * N; i++) { const d = document.createElement('div'); d.dataset.i = i; grid.appendChild(d); cells.push(d); }
  const prev = document.getElementById('nx-cprev'), ctx = prev.getContext('2d');
  function draw() {
    cells.forEach((c, i) => c.style.background = px[i] ? color : '');
    ctx.clearRect(0, 0, N, N); ctx.fillStyle = color;
    px.forEach((v, i) => v && ctx.fillRect(i % N, (i / N) | 0, 1, 1));
    localStorage.nxCross = JSON.stringify(px); localStorage.nxCrossColor = color;
    document.getElementById('nx-ccode').value = code();
  }
  function set(i, v) {
    const x = i % N, y = (i / N) | 0, pts = mirror ? [[x, y], [N - 1 - x, y], [x, N - 1 - y], [N - 1 - x, N - 1 - y]] : [[x, y]];
    pts.forEach(([a, b]) => px[b * N + a] = v); draw();
  }
  // код для вставки в клиент: NKX1:<цвет>:<hex битовой маски>
  function code() {
    let bits = ''; for (let i = 0; i < N * N; i += 4) bits += parseInt(px.slice(i, i + 4).concat([0, 0, 0]).slice(0, 4).join(''), 2).toString(16);
    return 'NKX1:' + color.slice(1) + ':' + bits;
  }
  const at = e => { const t = document.elementFromPoint(e.clientX, e.clientY); return t && t.dataset.i != null ? +t.dataset.i : -1; };
  grid.addEventListener('pointerdown', e => { down = true; const i = at(e); if (i >= 0) set(i, e.button === 2 ? 0 : tool); });
  grid.addEventListener('pointermove', e => { if (!down) return; const i = at(e); if (i >= 0) set(i, e.buttons === 2 ? 0 : tool); });
  addEventListener('pointerup', () => down = false);
  grid.addEventListener('contextmenu', e => e.preventDefault());
  document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
    const t = b.dataset.tool;
    if (t === 'mirror') { mirror = !mirror; b.classList.toggle('on', mirror); return; }
    if (t === 'clear') { px.fill(0); draw(); return; }
    tool = t === 'brush' ? 1 : 0;
    document.querySelectorAll('[data-tool=brush],[data-tool=eraser]').forEach(x => x.classList.toggle('on', x === b));
  });
  const presets = {
    'Крест': (x, y) => (x === 7 || y === 7) && Math.abs(x - 7) + Math.abs(y - 7) > 1 && Math.abs(x - 7) < 6 && Math.abs(y - 7) < 6,
    'Точка': (x, y) => Math.abs(x - 7) <= 1 && Math.abs(y - 7) <= 1,
    'Кольцо': (x, y) => { const d = Math.hypot(x - 7, y - 7); return d > 3.5 && d < 4.6; },
    'Уголки': (x, y) => (Math.abs(x - 7) === 4 && Math.abs(y - 7) >= 2 && Math.abs(y - 7) <= 4) || (Math.abs(y - 7) === 4 && Math.abs(x - 7) >= 2 && Math.abs(x - 7) <= 4),
  };
  const pr = document.getElementById('nx-presets');
  Object.entries(presets).forEach(([n, f]) => { const b = document.createElement('button'); b.className = 'nx-btn'; b.textContent = n; b.onclick = () => { px = px.map((_, i) => f(i % N, (i / N) | 0) ? 1 : 0); draw(); }; pr.appendChild(b); });
  document.getElementById('nx-color').value = color;
  document.getElementById('nx-color').oninput = e => { color = e.target.value; draw(); };
  document.getElementById('nx-copy').onclick = async () => { try { await navigator.clipboard.writeText(code()); document.getElementById('nx-copy').textContent = 'Скопировано ✓'; } catch { } };
  if (!px.some(Boolean)) px = px.map((_, i) => presets['Крест'](i % N, (i / N) | 0) ? 1 : 0);
  draw();


  // ---------- Облако (общий аккаунт с кабинетом) ----------
  const st = document.getElementById('nx-cstat'), sess = () => { try { return JSON.parse(sessionStorage.niksos || 'null'); } catch { return null; } };
  async function rpc(fn, body) {
    const r = await fetch(NIKSOS.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST',
      headers: { apikey: NIKSOS.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  }
  const need = () => { const s = sess(); if (!s) st.innerHTML = '<a href="account.html">Войди в кабинет</a>, чтобы сохранять в облако'; return s; };
  document.getElementById('nx-csave').onclick = async () => { const s = need(); if (!s) return; st.textContent = 'Сохраняем…';
    try { const r = await rpc('niksos_crosshair_save', { p_name: s.name, p_pass: s.hash, p_code: code() }); st.textContent = r.status === 'ok' ? 'Сохранено ✓ — открой клиент' : 'Ошибка: ' + r.status; } catch (e) { st.textContent = 'Нет связи с облаком'; } };
  document.getElementById('nx-cload').onclick = async () => { const s = need(); if (!s) return; st.textContent = 'Загружаем…';
    try { const r = await rpc('niksos_crosshair_get', { p_name: s.name, p_pass: s.hash });
      if (r.status !== 'ok') { st.textContent = 'Ошибка: ' + r.status; return; }
      if (!r.code) { st.textContent = 'В облаке пока пусто'; return; }
      const [, c, hex] = r.code.split(':'); color = '#' + c; document.getElementById('nx-color').value = color;
      px = []; for (const h of hex) { const v = parseInt(h, 16); for (let k = 3; k >= 0; k--) px.push((v >> k) & 1); } px = px.slice(0, N * N);
      draw(); st.textContent = 'Загружено ✓'; } catch (e) { st.textContent = 'Нет связи с облаком'; } };
  if (sess()) st.textContent = 'Аккаунт: ' + sess().name;

  // ---------- Примерка косметики ----------
  const box = document.getElementById('nx-skin'), img = box.querySelector('img'), nick = document.getElementById('nx-nick');
  const load = () => { const n = (nick.value || 'Steve').trim().replace(/[^A-Za-z0-9_]/g, '') || 'Steve'; img.src = 'https://mc-heads.net/body/' + encodeURIComponent(n) + '/260'; localStorage.nxNick = n; };
  nick.value = localStorage.nxNick || ''; document.getElementById('nx-try').onclick = load; nick.onkeydown = e => e.key === 'Enter' && load();
  document.querySelectorAll('[data-cos]').forEach(b => b.onclick = () => { box.classList.toggle(b.dataset.cos); b.classList.toggle('on'); });
  load();

  // ---------- Сервера ----------
  const list = (window.NIKSOS && NIKSOS.servers) || [
    { name: 'FunTime', ip: 'mc.funtime.su' }, { name: 'HolyWorld', ip: 'mc.holyworld.ru' }, { name: 'ReallyWorld', ip: 'mc.reallyworld.ru' }];
  const wrap = document.getElementById('nx-servers');
  list.forEach(s => {
    const c = document.createElement('div'); c.className = 'nx-card';
    c.innerHTML = `<b>${s.name}</b><small>${s.ip}</small><span class="on-line">…</span><button class="nx-btn">Скопировать IP</button>`;
    c.querySelector('button').onclick = e => { navigator.clipboard.writeText(s.ip); e.target.textContent = 'Скопировано ✓'; };
    wrap.appendChild(c);
    fetch('https://api.mcsrvstat.us/3/' + s.ip).then(r => r.json()).then(j => {
      c.querySelector('.on-line').innerHTML = j.online ? `<i class="nx-dot"></i>${(j.players?.online ?? 0).toLocaleString('ru')} игроков` : 'офлайн';
    }).catch(() => c.querySelector('.on-line').textContent = '');
  });
})();
