// 문구네 쇼핑몰 - Frontend SPA (hash routing)
const TOKEN_KEY = 'shop.token.v1';
const USER_KEY = 'shop.user.v1';

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
  if (res.status === 401 && auth.token) {
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
function formatWon(n) {
  return `${Number(n).toLocaleString('ko-KR')}원`;
}
function showMsg(el, text, type = 'error') {
  if (!el) return;
  el.innerHTML = `<div class="msg msg-${type}">${escapeHtml(text)}</div>`;
  if (type === 'success') setTimeout(() => { el.innerHTML = ''; }, 2500);
}
function navigate(hash) {
  if (location.hash === hash) router();
  else location.hash = hash;
}

let toastTimer = null;
function toast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------- Cart badge (total quantity in cart) ----------
let cartBadgeCount = 0;
async function refreshCartBadge() {
  if (!auth.token) {
    cartBadgeCount = 0;
    renderHeader();
    return;
  }
  try {
    const data = await api('/api/cart');
    cartBadgeCount = data.totalCount || 0;
  } catch {
    cartBadgeCount = 0;
  }
  renderHeader();
}

// ---------- Header ----------
function renderHeader() {
  const nav = document.getElementById('navArea');
  if (auth.user) {
    nav.innerHTML = `
      <button class="btn btn-ghost cart-btn" id="cartBtn">
        🛒 장바구니
        ${cartBadgeCount > 0 ? `<span class="cart-badge">${cartBadgeCount}</span>` : ''}
      </button>
      <div class="user-area">
        <span><span class="username">${escapeHtml(auth.user.name)}</span>님</span>
        <button class="btn btn-ghost" id="logoutBtn">로그아웃</button>
      </div>
    `;
    document.getElementById('cartBtn').addEventListener('click', () => navigate('#/cart'));
    document.getElementById('logoutBtn').addEventListener('click', () => {
      auth.clear();
      cartBadgeCount = 0;
      renderHeader();
      navigate('#/');
      toast('로그아웃되었습니다');
    });
  } else {
    nav.innerHTML = `
      <button class="btn btn-ghost cart-btn" id="cartBtn">🛒 장바구니</button>
      <button class="btn btn-primary" id="loginNavBtn">로그인</button>
    `;
    document.getElementById('cartBtn').addEventListener('click', () => navigate('#/cart'));
    document.getElementById('loginNavBtn').addEventListener('click', () => navigate('#/login'));
  }
}

// ---------- View mounting ----------
function mountTemplate(id) {
  const tpl = document.getElementById(id);
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(tpl.content.cloneNode(true));
}

// ---------- View: product list (public) ----------
async function viewProducts() {
  mountTemplate('tpl-products');
  const grid = document.getElementById('productGrid');
  grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">불러오는 중...</div>`;

  try {
    const products = await api('/api/products');
    if (!products || products.length === 0) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">
        <div class="empty-emoji">🗃️</div>등록된 상품이 없어요.
      </div>`;
      return;
    }

    grid.innerHTML = products.map(p => `
      <article class="product-card" data-id="${p.id}">
        <div class="product-thumb">${escapeHtml(p.image_url || '📦')}</div>
        <div class="product-body">
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-desc">${escapeHtml(p.description)}</div>
          <div class="product-price">${formatWon(p.price)}</div>
          <div class="product-actions">
            <button class="btn btn-primary add-to-cart-btn" data-id="${p.id}">
              🛒 장바구니 담기
            </button>
          </div>
        </div>
      </article>
    `).join('');

    grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.add-to-cart-btn');
      if (!btn) return;
      const pid = Number(btn.dataset.id);
      await addToCart(pid, btn);
    });
  } catch (err) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">${escapeHtml(err.message)}</div>`;
  }
}

async function addToCart(productId, btn) {
  if (!auth.token) {
    toast('로그인이 필요합니다');
    navigate('#/login');
    return;
  }
  if (btn) btn.disabled = true;
  try {
    await api('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity: 1 }),
    });
    toast('장바구니에 담았어요 🛒');
    await refreshCartBadge();
  } catch (err) {
    toast(err.message || '담기에 실패했습니다');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- View: cart ----------
async function viewCart() {
  mountTemplate('tpl-cart');
  const body = document.getElementById('cartBody');

  if (!auth.token) {
    body.innerHTML = `
      <div class="empty" style="box-shadow:none; padding:40px 10px;">
        <div class="empty-emoji">🔐</div>
        장바구니를 사용하려면 로그인이 필요해요.
        <div><button class="btn btn-primary" id="toLoginBtn">로그인하러 가기</button></div>
      </div>`;
    document.getElementById('toLoginBtn').addEventListener('click', () => navigate('#/login'));
    return;
  }

  body.innerHTML = `<div class="empty" style="box-shadow:none;">불러오는 중...</div>`;

  try {
    const cart = await api('/api/cart');
    renderCart(cart);
  } catch (err) {
    body.innerHTML = `<div class="empty" style="box-shadow:none;">${escapeHtml(err.message)}</div>`;
  }
}

function renderCart(cart) {
  const body = document.getElementById('cartBody');
  const items = cart.items || [];

  if (items.length === 0) {
    body.innerHTML = `
      <div class="empty" style="box-shadow:none; padding:40px 10px;">
        <div class="empty-emoji">🛒</div>
        장바구니가 비어있어요.
        <div><button class="btn btn-primary" id="goShop">상품 보러 가기</button></div>
      </div>`;
    document.getElementById('goShop').addEventListener('click', () => navigate('#/'));
    return;
  }

  body.innerHTML = `
    <div class="cart-list">
      ${items.map(it => `
        <div class="cart-item" data-id="${it.id}">
          <div class="cart-thumb">${escapeHtml(it.image_url || '📦')}</div>
          <div class="cart-info">
            <div class="name">${escapeHtml(it.name)}</div>
            <div class="unit">단가 ${formatWon(it.price)}</div>
            <div class="qty-control">
              <button class="btn-icon qty-dec" data-id="${it.id}" ${it.quantity <= 1 ? 'disabled' : ''}>−</button>
              <span class="qty-value">${it.quantity}</span>
              <button class="btn-icon qty-inc" data-id="${it.id}" ${it.quantity >= 99 ? 'disabled' : ''}>＋</button>
            </div>
          </div>
          <div class="cart-side">
            <div class="line-total">${formatWon(it.price * it.quantity)}</div>
            <button class="btn btn-danger remove-btn" data-id="${it.id}">삭제</button>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="cart-summary">
      <div>
        <div class="label">총 ${cart.totalCount}개</div>
      </div>
      <div>
        <div class="label" style="text-align:right; margin-bottom:4px;">총 금액</div>
        <div class="total">${formatWon(cart.subtotal)}</div>
      </div>
    </div>
  `;

  // Bind handlers
  body.querySelectorAll('.qty-inc').forEach(btn =>
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.id), +1))
  );
  body.querySelectorAll('.qty-dec').forEach(btn =>
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.id), -1))
  );
  body.querySelectorAll('.remove-btn').forEach(btn =>
    btn.addEventListener('click', () => removeCartItem(Number(btn.dataset.id)))
  );
}

async function changeQty(itemId, delta) {
  const valueEl = document.querySelector(`.cart-item[data-id="${itemId}"] .qty-value`);
  if (!valueEl) return;
  const current = Number(valueEl.textContent);
  const next = current + delta;
  if (next < 1 || next > 99) return;

  try {
    await api(`/api/cart/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: next }),
    });
    // 간단하게 전체 장바구니 다시 로드 (합계 재계산)
    const cart = await api('/api/cart');
    renderCart(cart);
    cartBadgeCount = cart.totalCount;
    renderHeader();
  } catch (err) {
    toast(err.message || '수량 변경에 실패했습니다');
  }
}

async function removeCartItem(itemId) {
  if (!confirm('장바구니에서 제거할까요?')) return;
  try {
    await api(`/api/cart/${itemId}`, { method: 'DELETE' });
    const cart = await api('/api/cart');
    renderCart(cart);
    cartBadgeCount = cart.totalCount;
    renderHeader();
    toast('장바구니에서 제거했어요');
  } catch (err) {
    toast(err.message || '삭제에 실패했습니다');
  }
}

// ---------- View: login ----------
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
      await refreshCartBadge();
      navigate('#/');
      toast(`${data.user.name}님, 환영합니다!`);
    } catch (err) {
      showMsg(msgBox, err.message);
    }
  });
}

// ---------- View: register ----------
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
      await refreshCartBadge();
      showMsg(msgBox, '가입이 완료되었습니다!', 'success');
      setTimeout(() => navigate('#/'), 600);
    } catch (err) {
      showMsg(msgBox, err.message);
    }
  });
}

// ---------- Router ----------
function router() {
  const hash = location.hash || '#/';
  if (hash === '#/login') return viewLogin();
  if (hash === '#/register') return viewRegister();
  if (hash === '#/cart') return viewCart();
  return viewProducts();
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('homeBtn').addEventListener('click', () => navigate('#/'));

  // Validate existing token by calling /me
  if (auth.token) {
    try {
      const me = await api('/api/auth/me');
      auth.save(auth.token, me.user);
      await refreshCartBadge();
    } catch (_) {
      // 토큰이 무효하면 api()가 이미 clear 했음
    }
  }

  renderHeader();
  router();
  window.addEventListener('hashchange', router);
});
