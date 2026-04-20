// 나만의 AI 대시보드 - Frontend SPA
const TOKEN_KEY = 'dashboard.token.v1';
const USER_KEY = 'dashboard.user.v1';

// --------- Auth state ----------
const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  },
  save(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

// --------- API helper ----------
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({ success: false, message: '서버 응답 오류' }));
  if (res.status === 401 && auth.token) {
    auth.clear();
    renderHeader();
    navigate('#/login');
    throw new Error(data.message || '로그인이 필요합니다');
  }
  if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
  return data.data;
}

// --------- Utilities ----------
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function showMsg(el, text, type = 'error') {
  if (!el) return;
  el.innerHTML = `<div class="msg msg-${type}">${escapeHtml(text)}</div>`;
  if (type === 'success') setTimeout(() => { el.innerHTML = ''; }, 2200);
}
function formatWon(n) { return `${Math.round(Number(n)).toLocaleString('ko-KR')}원`; }
function navigate(hash) {
  if (location.hash === hash) router();
  else location.hash = hash;
}

// --------- Header ----------
function renderHeader() {
  const nav = document.getElementById('navArea');
  if (auth.user) {
    nav.innerHTML = `
      <span><span class="username">${escapeHtml(auth.user.name)}</span>님</span>
      <button class="btn btn-ghost" id="logoutBtn">로그아웃</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', () => {
      auth.clear();
      renderHeader();
      navigate('#/login');
    });
  } else {
    nav.innerHTML = `<button class="btn btn-primary" id="loginNavBtn">로그인</button>`;
    document.getElementById('loginNavBtn').addEventListener('click', () => navigate('#/login'));
  }
}

// --------- View mount ----------
function mountTemplate(id) {
  const tpl = document.getElementById(id);
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(tpl.content.cloneNode(true));
}

// ============================================================================
// AUTH VIEWS
// ============================================================================
function viewLogin() {
  if (auth.token) { navigate('#/'); return; }
  mountTemplate('tpl-login');
  const form = document.getElementById('loginForm');
  const msgBox = document.getElementById('authMsg');
  document.getElementById('goRegister').addEventListener('click', () => navigate('#/register'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
      });
      auth.save(data.token, data.user);
      renderHeader();
      navigate('#/');
    } catch (err) { showMsg(msgBox, err.message); }
  });
}

function viewRegister() {
  if (auth.token) { navigate('#/'); return; }
  mountTemplate('tpl-register');
  const form = document.getElementById('registerForm');
  const msgBox = document.getElementById('authMsg');
  document.getElementById('goLogin').addEventListener('click', () => navigate('#/login'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: fd.get('email'),
          name: fd.get('name'),
          password: fd.get('password'),
        }),
      });
      auth.save(data.token, data.user);
      renderHeader();
      showMsg(msgBox, '가입 완료! 대시보드로 이동합니다...', 'success');
      setTimeout(() => navigate('#/'), 500);
    } catch (err) { showMsg(msgBox, err.message); }
  });
}

// ============================================================================
// DASHBOARD
// ============================================================================
async function viewDashboard() {
  if (!auth.token) { navigate('#/login'); return; }
  mountTemplate('tpl-dashboard');

  // Brief button
  document.getElementById('briefBtn').addEventListener('click', generateBrief);

  // Memo add
  document.getElementById('memoAddBtn').addEventListener('click', addMemo);
  document.getElementById('memoInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addMemo(); }
  });

  // Habit add
  document.getElementById('habitForm').addEventListener('submit', addHabit);

  // Load data
  try {
    const data = await api('/api/dashboard');
    renderWeather(data.weather);
    renderTransactions(data.transactions);
    renderNotion(data.notion);
    renderHabits(data.habits);
    renderNews(data.news);
    renderMemos(data.memos);
  } catch (err) {
    document.getElementById('main').insertAdjacentHTML(
      'afterbegin',
      `<div class="msg msg-error">대시보드 로드 실패: ${escapeHtml(err.message)}</div>`
    );
  }
}

// --------- Weather ----------
function weatherEmoji(code) {
  if (code == null) return '🌡️';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if (code >= 51 && code <= 65) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}
function renderWeather(w) {
  const body = document.getElementById('weatherBody');
  if (!w || !w.current) {
    body.innerHTML = `<div class="empty">날씨를 불러올 수 없어요</div>`;
    return;
  }
  const c = w.current, t = w.today || {};
  body.innerHTML = `
    <div class="weather-main">
      <div class="weather-emoji">${weatherEmoji(c.code)}</div>
      <div>
        <div class="weather-temp">${Math.round(c.temp)}°</div>
        <div class="weather-desc">${escapeHtml(c.desc)} · ${escapeHtml(w.location?.label || '')}</div>
      </div>
    </div>
    <div class="weather-meta">
      <span>⬆️ ${t.max}° · ⬇️ ${t.min}°</span>
      <span>💧 습도 ${c.humidity}%</span>
      <span>☔ 강수 ${t.precip}%</span>
      <span>🌬️ ${c.wind} m/s</span>
    </div>
  `;
}

// --------- Transactions ----------
function renderTransactions(tx) {
  const body = document.getElementById('txBody');
  if (!tx) {
    body.innerHTML = `<div class="empty">가계부 데이터 없음</div>`;
    return;
  }
  const top = tx.top_categories || [];
  const maxVal = Math.max(1, ...top.map((c) => c.total));

  body.innerHTML = `
    <div class="tx-totals">
      <div class="box">
        <div class="label">수입 (${tx.month})</div>
        <div class="value income">${formatWon(tx.income)}</div>
      </div>
      <div class="box">
        <div class="label">지출</div>
        <div class="value expense">${formatWon(tx.expense)}</div>
      </div>
      <div class="box">
        <div class="label">잔액</div>
        <div class="value balance">${formatWon(tx.balance)}</div>
      </div>
    </div>
    ${top.length ? `
      <div class="tx-cats">
        ${top.map(c => `
          <div class="tx-cat-row">
            <span>${escapeHtml(c.category)}</span>
            <div class="tx-cat-bar"><div class="tx-cat-bar-fill" style="width:${(c.total/maxVal*100).toFixed(0)}%"></div></div>
            <span>${formatWon(c.total)}</span>
          </div>
        `).join('')}
      </div>
    ` : '<div class="empty">이번 달 지출 기록이 없어요</div>'}
    <div class="section-note">* transactions 테이블 공유 · 가계부 앱에서 추가/수정</div>
  `;
}

// --------- Notion ----------
function renderNotion(n) {
  const body = document.getElementById('notionBody');
  const source = document.getElementById('notionSource');
  if (!n) {
    body.innerHTML = `<div class="empty">노션 데이터 없음</div>`;
    return;
  }
  source.innerHTML = n.source === 'live'
    ? `<span class="notion-source live">LIVE</span>`
    : `<span class="notion-source snapshot">SNAPSHOT</span>`;

  const todos = n.todos || [];
  const books = n.books || [];
  if (todos.length === 0 && (!n.bullets || n.bullets.length === 0)) {
    body.innerHTML = `<div class="empty">노션 페이지에 할 일이 없어요</div>`;
    return;
  }

  const todoItems = todos.length ? todos : (n.bullets || []).map((b) => ({ text: b }));

  body.innerHTML = `
    ${todoItems.map(t => `
      <div class="notion-todo">
        <span>☐</span>
        <span>${escapeHtml(t.text)}</span>
        ${t.registered ? `<span class="notion-tag">등록 ${escapeHtml(t.registered)}</span>` : ''}
      </div>
    `).join('')}
    ${books.length ? `
      <div style="margin-top:14px; padding-top:10px; border-top:1px solid rgba(148,163,184,0.12); font-size:0.78rem; color:#94a3b8;">
        📚 추천 도서 ${books.length}권 동기화됨 — ${escapeHtml(books.slice(0,3).map(b => b.title).join(', '))}…
      </div>
    ` : ''}
    ${n.synced_at ? `<div class="section-note">동기화: ${new Date(n.synced_at).toLocaleString('ko-KR')}</div>` : ''}
  `;
}

// --------- Habits ----------
async function renderHabits(habits) {
  const body = document.getElementById('habitsBody');
  if (!habits || habits.length === 0) {
    body.innerHTML = `<div class="empty">아직 습관이 없어요. 아래에서 추가해보세요</div>`;
    return;
  }
  body.innerHTML = habits.map(h => `
    <div class="habit-row" data-id="${h.id}">
      <span class="habit-emoji">${escapeHtml(h.icon || '⭐')}</span>
      <span class="habit-name">${escapeHtml(h.name)}</span>
      <span class="habit-stats">${h.last_7_days}/7</span>
      <button class="btn-icon ${h.checked_today ? 'checked' : ''} toggle-btn" data-id="${h.id}" title="오늘 체크/해제">
        ${h.checked_today ? '✓' : '○'}
      </button>
      <button class="btn btn-danger del-habit" data-id="${h.id}">삭제</button>
    </div>
  `).join('');

  body.querySelectorAll('.toggle-btn').forEach(btn =>
    btn.addEventListener('click', () => toggleHabit(Number(btn.dataset.id)))
  );
  body.querySelectorAll('.del-habit').forEach(btn =>
    btn.addEventListener('click', () => delHabit(Number(btn.dataset.id)))
  );
}
async function refreshHabits() {
  try {
    const data = await api('/api/habits');
    renderHabits(data);
  } catch (err) { console.error(err); }
}
async function toggleHabit(id) {
  try {
    await api(`/api/habits/${id}/toggle`, { method: 'POST' });
    await refreshHabits();
  } catch (err) { alert(err.message); }
}
async function delHabit(id) {
  if (!confirm('이 습관을 삭제할까요?')) return;
  try {
    await api(`/api/habits/${id}`, { method: 'DELETE' });
    await refreshHabits();
  } catch (err) { alert(err.message); }
}
async function addHabit(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const name = String(fd.get('name')).trim();
  const icon = String(fd.get('icon') || '🌱').trim() || '🌱';
  if (!name) return;
  try {
    await api('/api/habits', {
      method: 'POST',
      body: JSON.stringify({ name, icon }),
    });
    form.reset();
    form.icon.value = '🌱';
    await refreshHabits();
  } catch (err) { alert(err.message); }
}

// --------- News ----------
function renderNews(list) {
  const body = document.getElementById('newsBody');
  if (!list || list.length === 0) {
    body.innerHTML = `<div class="empty">뉴스를 불러올 수 없어요</div>`;
    return;
  }
  body.innerHTML = list.map((n, i) => `
    <div class="news-row">
      <span class="news-idx">${i + 1}</span>
      <a href="${escapeHtml(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a>
      ${n.score != null ? `<span class="news-score">${n.score}</span>` : ''}
    </div>
  `).join('');
}

// --------- Memos ----------
function renderMemos(list) {
  const body = document.getElementById('memosBody');
  if (!list || list.length === 0) {
    body.innerHTML = `<div class="empty">아직 메모가 없어요</div>`;
    return;
  }
  body.innerHTML = list.map(m => `
    <div class="memo-row" data-id="${m.id}">
      <div class="content">${escapeHtml(m.content)}</div>
      <button class="btn btn-danger del-memo" data-id="${m.id}">삭제</button>
    </div>
  `).join('');
  body.querySelectorAll('.del-memo').forEach(btn =>
    btn.addEventListener('click', () => deleteMemo(Number(btn.dataset.id)))
  );
}
async function refreshMemos() {
  try {
    const list = await api('/api/memos');
    renderMemos(list);
  } catch (err) { console.error(err); }
}
async function addMemo() {
  const input = document.getElementById('memoInput');
  const content = input.value.trim();
  if (!content) return;
  try {
    await api('/api/memos', { method: 'POST', body: JSON.stringify({ content }) });
    input.value = '';
    await refreshMemos();
  } catch (err) { alert(err.message); }
}
async function deleteMemo(id) {
  try {
    await api(`/api/memos/${id}`, { method: 'DELETE' });
    await refreshMemos();
  } catch (err) { alert(err.message); }
}

// --------- AI Brief ----------
async function generateBrief() {
  const btn = document.getElementById('briefBtn');
  const content = document.getElementById('briefContent');
  const meta = document.getElementById('briefMeta');
  btn.disabled = true;
  btn.textContent = '생성 중...';
  content.innerHTML = `<span class="loading-dots" style="color:#cbd5e0;">AI가 데이터를 읽고 브리핑을 쓰는 중</span>`;
  meta.textContent = '';

  try {
    const data = await api('/api/brief', { method: 'POST', body: '{}' });
    content.textContent = data.brief;
    const cs = data.context_summary || {};
    meta.textContent = `참조: 노션 할일 ${cs.notion_todos}개 · 날씨 ${cs.weather_available ? 'O' : 'X'} · 뉴스 ${cs.news_count}건 · 습관 ${cs.habits_count}개 · 가계부 ${cs.tx_month}`;
  } catch (err) {
    content.innerHTML = `<span style="color:#fca5a5;">오류: ${escapeHtml(err.message)}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ 브리핑 생성';
  }
}

// ============================================================================
// ROUTER
// ============================================================================
function router() {
  const hash = location.hash || '#/';
  if (hash === '#/login') return viewLogin();
  if (hash === '#/register') return viewRegister();
  return viewDashboard();
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('homeBtn').addEventListener('click', () => navigate('#/'));

  if (auth.token) {
    try {
      const me = await api('/api/auth/me');
      auth.save(auth.token, me.user);
    } catch (_) { /* 토큰 무효 → 이미 clear */ }
  }

  renderHeader();
  router();
  window.addEventListener('hashchange', router);
});
