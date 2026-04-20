// 커뮤니티 앱 - Frontend SPA (hash routing)
const TOKEN_KEY = 'community.token.v1';
const USER_KEY = 'community.user.v1';

// ---------- Auth state ----------
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

// ---------- API client ----------
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({ success: false, message: '서버 응답 오류' }));
  if (res.status === 401) {
    auth.clear();
    renderHeader();
    navigate('#/login');
    throw new Error(data.message || '로그인이 필요합니다');
  }
  if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
  return data.data;
}

// ---------- Utilities ----------
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtTime(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function showMsg(el, text, type = 'error') {
  if (!el) return;
  el.innerHTML = `<div class="msg msg-${type}">${escapeHtml(text)}</div>`;
  if (type === 'success') setTimeout(() => { el.innerHTML = ''; }, 2500);
}
function navigate(hash) { location.hash = hash; }

// ---------- Header ----------
function renderHeader() {
  const area = document.getElementById('userArea');
  if (auth.user) {
    area.innerHTML = `
      <span><span class="nickname">${escapeHtml(auth.user.nickname)}</span>님</span>
      <button class="btn btn-ghost" id="logoutBtn">로그아웃</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', () => {
      auth.clear();
      renderHeader();
      navigate('#/login');
    });
  } else {
    area.innerHTML = `<button class="btn btn-primary" id="loginNavBtn">로그인</button>`;
    document.getElementById('loginNavBtn').addEventListener('click', () => navigate('#/auth'));
  }
}

// ---------- Views ----------
function mountTemplate(id) {
  const tpl = document.getElementById(id);
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(tpl.content.cloneNode(true));
}

function viewLogin() {
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
    } catch (err) {
      showMsg(msgBox, err.message);
    }
  });
}

function viewRegister() {
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
          nickname: fd.get('nickname'),
          password: fd.get('password'),
        }),
      });
      auth.save(data.token, data.user);
      renderHeader();
      showMsg(msgBox, '가입이 완료되었습니다!', 'success');
      setTimeout(() => navigate('#/'), 600);
    } catch (err) {
      showMsg(msgBox, err.message);
    }
  });
}

async function viewList() {
  if (!auth.token) { navigate('#/auth'); return; }
  mountTemplate('tpl-list');
  document.getElementById('writeBtn').addEventListener('click', () => navigate('#/write'));
  const ul = document.getElementById('postList');
  ul.innerHTML = '<li class="empty">불러오는 중...</li>';
  try {
    const posts = await api('/api/posts');
    if (!posts || posts.length === 0) {
      ul.innerHTML = '<li class="empty">아직 게시글이 없습니다. 첫 글을 작성해보세요!</li>';
      return;
    }
    ul.innerHTML = posts.map(p => `
      <li class="post-item" data-id="${p.id}">
        <div class="post-title">${escapeHtml(p.title)}</div>
        <div class="post-meta">
          <span class="post-author">${escapeHtml(p.author)}</span>
          <span>${fmtTime(p.created_at)}</span>
          ${p.updated_at && p.updated_at !== p.created_at ? '<span>(수정됨)</span>' : ''}
        </div>
      </li>
    `).join('');
    ul.addEventListener('click', (e) => {
      const item = e.target.closest('.post-item');
      if (item) navigate(`#/post/${item.dataset.id}`);
    });
  } catch (err) {
    ul.innerHTML = `<li class="empty">${escapeHtml(err.message)}</li>`;
  }
}

async function viewDetail(id) {
  if (!auth.token) { navigate('#/auth'); return; }
  mountTemplate('tpl-detail');
  const body = document.getElementById('detailBody');
  body.innerHTML = '<div class="empty">불러오는 중...</div>';
  try {
    const p = await api(`/api/posts/${id}`);
    const isMine = auth.user && auth.user.id === p.user_id;
    body.innerHTML = `
      <div class="title">${escapeHtml(p.title)}</div>
      <div class="meta">
        <span class="post-author">${escapeHtml(p.author)}</span>
        · ${fmtTime(p.created_at)}
        ${p.updated_at && p.updated_at !== p.created_at ? ` · 수정됨 ${fmtTime(p.updated_at)}` : ''}
      </div>
      <div class="content">${escapeHtml(p.content)}</div>
      <div class="action-row">
        <button class="btn btn-ghost" id="backBtn">← 목록</button>
        ${isMine ? `
          <button class="btn btn-ghost" id="editBtn">수정</button>
          <button class="btn btn-danger" id="deleteBtn">삭제</button>
        ` : ''}
      </div>
    `;
    document.getElementById('backBtn').addEventListener('click', () => navigate('#/'));
    if (isMine) {
      document.getElementById('editBtn').addEventListener('click', () => navigate(`#/edit/${p.id}`));
      document.getElementById('deleteBtn').addEventListener('click', async () => {
        if (!confirm('이 게시글을 삭제하시겠습니까?')) return;
        try {
          await api(`/api/posts/${p.id}`, { method: 'DELETE' });
          navigate('#/');
        } catch (err) { alert(err.message); }
      });
    }
  } catch (err) {
    body.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

async function viewForm(editId) {
  if (!auth.token) { navigate('#/auth'); return; }
  mountTemplate('tpl-form');
  const form = document.getElementById('postForm');
  const titleEl = document.getElementById('formTitle');
  const msgBox = document.getElementById('formMsg');
  const submitBtn = document.getElementById('submitBtn');

  let originalPost = null;
  if (editId) {
    titleEl.textContent = '✏️ 게시글 수정';
    submitBtn.textContent = '수정';
    try {
      originalPost = await api(`/api/posts/${editId}`);
      if (!auth.user || auth.user.id !== originalPost.user_id) {
        showMsg(msgBox, '본인이 작성한 글만 수정할 수 있습니다.');
        submitBtn.disabled = true;
        return;
      }
      form.title.value = originalPost.title;
      form.content.value = originalPost.content;
    } catch (err) {
      showMsg(msgBox, err.message);
      submitBtn.disabled = true;
      return;
    }
  }

  document.getElementById('cancelBtn').addEventListener('click', () => {
    if (editId) navigate(`#/post/${editId}`);
    else navigate('#/');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    const body = { title: form.title.value.trim(), content: form.content.value.trim() };
    try {
      if (editId) {
        await api(`/api/posts/${editId}`, { method: 'PATCH', body: JSON.stringify(body) });
        navigate(`#/post/${editId}`);
      } else {
        const created = await api('/api/posts', { method: 'POST', body: JSON.stringify(body) });
        navigate(`#/post/${created.id}`);
      }
    } catch (err) {
      showMsg(msgBox, err.message);
      submitBtn.disabled = false;
    }
  });
}

// ---------- Router ----------
function router() {
  const hash = location.hash || '#/';
  if (hash === '#/login' || hash === '#/auth') return viewLogin();
  if (hash === '#/register') return viewRegister();
  if (hash === '#/write') return viewForm(null);

  const detailMatch = hash.match(/^#\/post\/(\d+)$/);
  if (detailMatch) return viewDetail(detailMatch[1]);

  const editMatch = hash.match(/^#\/edit\/(\d+)$/);
  if (editMatch) return viewForm(editMatch[1]);

  // default: list
  return viewList();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('homeBtn').addEventListener('click', () => navigate('#/'));

  // Validate existing token by calling /me
  if (auth.token) {
    try {
      const me = await api('/api/auth/me');
      auth.save(auth.token, me);
    } catch (_) {
      // token invalid - already cleared by api()
    }
  }

  renderHeader();
  router();
  window.addEventListener('hashchange', router);
});
