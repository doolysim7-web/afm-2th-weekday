// =============================================================================
// 문구네 쇼핑몰 (완성판) — Frontend SPA
// 해시 라우팅 + 토스 결제 redirect path 라우팅 혼용
// =============================================================================

const TOKEN_KEY = 'shop.token.v2';
const USER_KEY = 'shop.user.v2';

// 토스페이먼츠 클라이언트 키 (공개 가능)
const TOSS_CLIENT_KEY = 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';

// =============================================================================
// Auth state
// =============================================================================
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
  isAdmin() { return this.user?.role === 'admin'; },
};

// =============================================================================
// API client
// =============================================================================
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

// =============================================================================
// Utilities
// =============================================================================
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatWon(n) { return `${Number(n).toLocaleString('ko-KR')}원`; }
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function showMsg(el, text, type = 'error') {
  if (!el) return;
  el.innerHTML = `<div class="msg msg-${type}">${escapeHtml(text)}</div>`;
  if (type === 'success') setTimeout(() => { el.innerHTML = ''; }, 2500);
}
function navigate(hash) {
  // path-based routes 처리는 location.assign 사용
  if (hash.startsWith('/')) {
    location.assign(hash);
    return;
  }
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

// 이미지 url이 ImageKit URL이면 <img>, 아니면 이모지 <span>
function renderProductImage(url, classes = '') {
  if (!url) return `📦`;
  if (/^https?:\/\//.test(url)) {
    return `<img src="${escapeHtml(url)}" alt="" class="${classes}" />`;
  }
  return escapeHtml(url);
}

// =============================================================================
// Cart badge
// =============================================================================
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
  } catch { cartBadgeCount = 0; }
  renderHeader();
}

// =============================================================================
// Header
// =============================================================================
function renderHeader() {
  const nav = document.getElementById('navArea');
  if (!nav) return;
  const isAdmin = auth.isAdmin();
  if (auth.user) {
    nav.innerHTML = `
      ${isAdmin ? `<button class="btn btn-warn" id="adminBtn">⚙️ 관리자</button>` : ''}
      <button class="btn btn-ghost" id="myOrdersBtn">📦 내 주문</button>
      <button class="btn btn-ghost cart-btn" id="cartBtn">
        🛒 장바구니
        ${cartBadgeCount > 0 ? `<span class="cart-badge">${cartBadgeCount}</span>` : ''}
      </button>
      <div class="user-area">
        <span>
          <span class="username">${escapeHtml(auth.user.name)}</span>님
          ${isAdmin ? `<span class="role-badge">ADMIN</span>` : ''}
        </span>
        <button class="btn btn-ghost" id="logoutBtn">로그아웃</button>
      </div>
    `;
    if (isAdmin) {
      document.getElementById('adminBtn').addEventListener('click', () => navigate('#/admin'));
    }
    document.getElementById('myOrdersBtn').addEventListener('click', () => navigate('#/my-orders'));
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

// =============================================================================
// Template mounting
// =============================================================================
function mountTemplate(id) {
  const tpl = document.getElementById(id);
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(tpl.content.cloneNode(true));
}

// =============================================================================
// View: 상품 목록
// =============================================================================
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
        <div class="product-thumb">${renderProductImage(p.image_url)}</div>
        <div class="product-body">
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-desc">${escapeHtml(p.description)}</div>
          <div class="product-price">${formatWon(p.price)}</div>
          <div class="product-actions">
            <button class="btn btn-primary add-to-cart-btn" data-id="${p.id}">
              🛒 담기
            </button>
          </div>
        </div>
      </article>
    `).join('');
    grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('.add-to-cart-btn');
      if (!btn) return;
      await addToCart(Number(btn.dataset.id), btn);
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

// =============================================================================
// View: 장바구니
// =============================================================================
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
          <div class="cart-thumb">${renderProductImage(it.image_url)}</div>
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
      <div><div class="label">총 ${cart.totalCount}개</div></div>
      <div>
        <div class="label" style="text-align:right; margin-bottom:4px;">총 금액</div>
        <div class="total">${formatWon(cart.subtotal)}</div>
      </div>
    </div>
    <div class="cart-cta">
      <button class="btn btn-ghost" id="continueShopping">계속 쇼핑하기</button>
      <button class="btn btn-primary" id="checkoutBtn">💳 결제하기</button>
    </div>
  `;
  body.querySelectorAll('.qty-inc').forEach(btn =>
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.id), +1))
  );
  body.querySelectorAll('.qty-dec').forEach(btn =>
    btn.addEventListener('click', () => changeQty(Number(btn.dataset.id), -1))
  );
  body.querySelectorAll('.remove-btn').forEach(btn =>
    btn.addEventListener('click', () => removeCartItem(Number(btn.dataset.id)))
  );
  document.getElementById('continueShopping').addEventListener('click', () => navigate('#/'));
  document.getElementById('checkoutBtn').addEventListener('click', () => navigate('#/checkout'));
}

async function changeQty(itemId, delta) {
  const valueEl = document.querySelector(`.cart-item[data-id="${itemId}"] .qty-value`);
  if (!valueEl) return;
  const next = Number(valueEl.textContent) + delta;
  if (next < 1 || next > 99) return;
  try {
    await api(`/api/cart/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity: next }) });
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

// =============================================================================
// View: 결제 (장바구니 → 주문 생성 → Toss 위젯 렌더 → 결제 요청)
// =============================================================================
let _tossWidgets = null;
let _currentOrder = null;
let _checkoutCart = null;

async function viewCheckout() {
  if (!auth.token) {
    toast('로그인이 필요합니다');
    navigate('#/login');
    return;
  }
  mountTemplate('tpl-checkout');
  const msgBox = document.getElementById('checkoutMsg');
  const summaryBox = document.getElementById('orderSummary');

  // 장바구니 로드 + 요약 렌더
  try {
    _checkoutCart = await api('/api/cart');
  } catch (err) {
    showMsg(msgBox, err.message);
    return;
  }
  if (!_checkoutCart.items || _checkoutCart.items.length === 0) {
    showMsg(msgBox, '장바구니가 비어있어요. 먼저 상품을 담아주세요.', 'info');
    setTimeout(() => navigate('#/cart'), 1200);
    return;
  }

  summaryBox.innerHTML = `
    <div class="order-summary-list">
      ${_checkoutCart.items.map(it => `
        <div class="order-summary-item">
          <div class="order-thumb">${renderProductImage(it.image_url)}</div>
          <div>
            <div style="font-weight:600;">${escapeHtml(it.name)}</div>
            <div style="color:#718096; font-size:0.8rem;">
              ${formatWon(it.price)} × ${it.quantity}
            </div>
          </div>
          <div style="font-weight:700;">${formatWon(it.price * it.quantity)}</div>
        </div>
      `).join('')}
    </div>
    <div class="cart-summary" style="margin-top:0;">
      <div class="label">총 ${_checkoutCart.totalCount}개</div>
      <div class="total">${formatWon(_checkoutCart.subtotal)}</div>
    </div>
  `;

  // 폼 자동 채우기
  const form = document.getElementById('checkoutForm');
  if (auth.user?.name) {
    form.querySelector('[name="customer_name"]').value = auth.user.name;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg(msgBox, '', 'info');
    const fd = new FormData(form);
    const submitBtn = document.getElementById('checkoutSubmit');
    submitBtn.disabled = true;
    try {
      _currentOrder = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: fd.get('customer_name'),
          customer_phone: fd.get('customer_phone'),
          shipping_address: fd.get('shipping_address'),
        }),
      });
      // 폼 입력 잠그기
      form.querySelectorAll('input, textarea').forEach(el => el.disabled = true);
      submitBtn.style.display = 'none';
      // 위젯 영역 표시
      document.getElementById('paymentArea').style.display = 'block';
      await initTossWidget(_currentOrder, msgBox);
    } catch (err) {
      showMsg(msgBox, err.message);
      submitBtn.disabled = false;
    }
  });
}

async function initTossWidget(order, msgBox) {
  if (typeof window.TossPayments !== 'function') {
    showMsg(msgBox, '결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    return;
  }
  try {
    const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
    // 로그인 사용자 → customerKey로 user.id 사용
    const customerKey = auth.user?.id ? `user_${auth.user.id}` : window.TossPayments.ANONYMOUS;
    const widgets = tossPayments.widgets({ customerKey });
    _tossWidgets = widgets;

    await widgets.setAmount({
      currency: 'KRW',
      value: Number(order.total_amount),
    });
    await Promise.all([
      widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
      widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
    ]);

    document.getElementById('payNowBtn').addEventListener('click', () => requestPayment(order, msgBox));
  } catch (err) {
    console.error('Toss widget init failed:', err);
    showMsg(msgBox, '결제창을 불러오지 못했습니다. (' + (err.message || 'unknown') + ')');
  }
}

async function requestPayment(order, msgBox) {
  if (!_tossWidgets || !order) return;
  const items = _checkoutCart?.items || [];
  const firstName = items[0]?.name || '주문상품';
  const orderName = items.length > 1 ? `${firstName} 외 ${items.length - 1}건` : firstName;

  const btn = document.getElementById('payNowBtn');
  btn.disabled = true;
  try {
    await _tossWidgets.requestPayment({
      orderId: order.toss_order_id,
      orderName,
      successUrl: window.location.origin + '/payments/success',
      failUrl: window.location.origin + '/payments/fail',
      customerName: order.customer_name,
    });
  } catch (err) {
    if (err.code === 'USER_CANCEL') {
      showMsg(msgBox, '결제가 취소되었습니다.');
    } else {
      showMsg(msgBox, err.message || '결제 요청 중 오류가 발생했습니다.');
    }
    btn.disabled = false;
  }
}

// =============================================================================
// View: 결제 성공 (Toss redirect)
// =============================================================================
async function viewPaymentSuccess() {
  mountTemplate('tpl-payment-success');
  const body = document.getElementById('paymentSuccessBody');

  const params = new URLSearchParams(location.search);
  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amount = params.get('amount');

  if (!paymentKey || !orderId || !amount) {
    body.innerHTML = `<div class="msg msg-error">결제 정보가 누락되었습니다.</div>`;
    return;
  }
  if (!auth.token) {
    body.innerHTML = `<div class="msg msg-error">로그인이 필요합니다. 다시 로그인해주세요.</div>`;
    return;
  }

  body.innerHTML = `<div class="empty" style="box-shadow:none;">결제 승인 중...</div>`;
  try {
    const result = await api('/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });
    const order = result.order;
    cartBadgeCount = 0;
    renderHeader();
    body.innerHTML = `
      <div style="text-align:left; max-width:480px; margin: 0 auto;">
        <div class="msg msg-success">결제가 정상 처리되었습니다.</div>
        <div style="background:#f7fafc; border-radius:10px; padding:14px; margin-top:14px; font-size:0.9rem; line-height:1.7;">
          <div><strong>주문번호:</strong> ${escapeHtml(order.toss_order_id)}</div>
          <div><strong>주문자:</strong> ${escapeHtml(order.customer_name)}</div>
          <div><strong>결제 금액:</strong> ${formatWon(order.total_amount)}</div>
          <div><strong>결제 상태:</strong> ${escapeHtml(order.status)}</div>
        </div>
        <div style="margin-top:18px; display:flex; gap:8px; justify-content:center;">
          <button class="btn btn-primary" id="goMyOrders">📦 내 주문 보기</button>
          <button class="btn btn-ghost" id="goShopping">🛍️ 계속 쇼핑하기</button>
        </div>
      </div>
    `;
    document.getElementById('goMyOrders').addEventListener('click', () => {
      history.replaceState(null, '', '/');
      navigate('#/my-orders');
    });
    document.getElementById('goShopping').addEventListener('click', () => {
      history.replaceState(null, '', '/');
      navigate('#/');
    });
  } catch (err) {
    body.innerHTML = `
      <div class="msg msg-error">${escapeHtml(err.message)}</div>
      <button class="btn btn-ghost" id="backHome" style="margin-top:14px;">홈으로</button>
    `;
    document.getElementById('backHome').addEventListener('click', () => {
      history.replaceState(null, '', '/');
      navigate('#/');
    });
  }
}

// =============================================================================
// View: 결제 실패 (Toss redirect)
// =============================================================================
function viewPaymentFail() {
  mountTemplate('tpl-payment-fail');
  const body = document.getElementById('paymentFailBody');
  const params = new URLSearchParams(location.search);
  const code = params.get('code') || '';
  const message = params.get('message') || '결제 도중 문제가 발생했습니다.';
  body.innerHTML = `
    <div>${escapeHtml(message)}</div>
    ${code ? `<div style="font-size:0.8rem; color:#a0aec0; margin-top:6px;">코드: ${escapeHtml(code)}</div>` : ''}
  `;
  document.getElementById('retryCart').addEventListener('click', () => {
    history.replaceState(null, '', '/');
    navigate('#/cart');
  });
}

// =============================================================================
// View: 마이페이지 — 내 주문 내역
// =============================================================================
async function viewMyOrders() {
  if (!auth.token) {
    toast('로그인이 필요합니다');
    navigate('#/login');
    return;
  }
  mountTemplate('tpl-my-orders');
  const body = document.getElementById('ordersBody');
  body.innerHTML = `<div class="empty" style="box-shadow:none;">불러오는 중...</div>`;
  try {
    const orders = await api('/api/orders');
    if (!orders || orders.length === 0) {
      body.innerHTML = `
        <div class="empty" style="box-shadow:none; padding:40px 10px;">
          <div class="empty-emoji">📭</div>
          아직 주문 내역이 없어요.
          <div><button class="btn btn-primary" id="goShop">상품 보러 가기</button></div>
        </div>`;
      document.getElementById('goShop').addEventListener('click', () => navigate('#/'));
      return;
    }
    body.innerHTML = orders.map(o => {
      const items = Array.isArray(o.items) ? o.items : [];
      const itemsLine = items.map(it =>
        `${escapeHtml(it.name)} × ${it.quantity}`
      ).join(', ');
      const statusClass = `status-${o.status}`;
      const statusLabel = ({ pending: '결제 대기', confirmed: '결제 완료', cancelled: '취소' })[o.status] || o.status;
      return `
        <div class="order-card">
          <div class="order-head">
            <div>
              <div class="order-id">주문번호 ${escapeHtml(o.toss_order_id || '#' + o.id)}</div>
              <div class="order-meta">${formatDate(o.created_at)}</div>
            </div>
            <div class="order-status ${statusClass}">${escapeHtml(statusLabel)}</div>
          </div>
          <div class="order-items">${itemsLine || '(상품 없음)'}</div>
          <div class="order-meta" style="margin-top:6px;">
            받는 분: ${escapeHtml(o.customer_name)} · 연락처: ${escapeHtml(o.customer_phone)}
          </div>
          <div class="order-meta">
            배송지: ${escapeHtml(o.shipping_address)}
          </div>
          <div class="order-total">
            <span>결제 금액</span>
            <span>${formatWon(o.total_amount)}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    body.innerHTML = `<div class="empty" style="box-shadow:none;">${escapeHtml(err.message)}</div>`;
  }
}

// =============================================================================
// View: 관리자 — 상품 관리 + ImageKit 이미지 업로드
// =============================================================================

// 파일명을 ASCII로 sanitize (한글/공백 → ASCII URL 안전)
function sanitizeFileName(name) {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const safeBase = (base.normalize('NFC')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')) || 'product';
  const safeExt = ext.replace(/[^A-Za-z0-9.]+/g, '');
  return safeBase + safeExt;
}

async function uploadToImageKit(file, { folder = '/shop2-products' } = {}) {
  const authData = await api('/api/imagekit-auth');
  const { token, expire, signature, publicKey } = authData;

  const form = new FormData();
  form.append('file', file);
  form.append('fileName', sanitizeFileName(file.name));
  form.append('publicKey', publicKey);
  form.append('token', token);
  form.append('expire', String(expire));
  form.append('signature', signature);
  form.append('useUniqueFileName', 'true');
  if (folder) form.append('folder', folder);

  const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `업로드 실패 (${res.status})`);
  }
  return data;
}

async function viewAdmin() {
  if (!auth.token) {
    toast('로그인이 필요합니다');
    navigate('#/login');
    return;
  }
  if (!auth.isAdmin()) {
    toast('관리자 권한이 필요합니다');
    navigate('#/');
    return;
  }
  mountTemplate('tpl-admin');
  await refreshAdminProducts();
  setupAdminForm();
  setupDropzone();
}

async function refreshAdminProducts() {
  const list = document.getElementById('adminList');
  const counter = document.getElementById('productCount');
  list.innerHTML = `<div class="empty" style="box-shadow:none;">불러오는 중...</div>`;
  try {
    const products = await api('/api/products');
    counter.textContent = products.length;
    if (products.length === 0) {
      list.innerHTML = `<div class="empty" style="box-shadow:none;">등록된 상품이 없어요.</div>`;
      return;
    }
    list.innerHTML = products.map(p => `
      <div class="admin-list-item" data-id="${p.id}">
        <div class="admin-thumb">${renderProductImage(p.image_url)}</div>
        <div class="admin-info">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="price">${formatWon(p.price)}</div>
          <div class="desc">${escapeHtml(p.description || '')}</div>
        </div>
        <div class="admin-actions">
          <button class="btn btn-ghost edit-btn" data-id="${p.id}">수정</button>
          <button class="btn btn-danger del-btn" data-id="${p.id}">삭제</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.edit-btn').forEach(btn =>
      btn.addEventListener('click', () => loadProductIntoForm(Number(btn.dataset.id)))
    );
    list.querySelectorAll('.del-btn').forEach(btn =>
      btn.addEventListener('click', () => deleteProductAdmin(Number(btn.dataset.id)))
    );
  } catch (err) {
    list.innerHTML = `<div class="empty" style="box-shadow:none;">${escapeHtml(err.message)}</div>`;
  }
}

function setupAdminForm() {
  const form = document.getElementById('productForm');
  const msgBox = document.getElementById('adminMsg');
  document.getElementById('adminCancel').addEventListener('click', () => resetAdminForm());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const id = fd.get('id');
    const payload = {
      name: fd.get('name'),
      price: Number(fd.get('price')),
      image_url: fd.get('image_url') || '',
      description: fd.get('description') || '',
    };
    try {
      if (id) {
        await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showMsg(msgBox, '상품이 수정되었습니다.', 'success');
      } else {
        await api('/api/products', { method: 'POST', body: JSON.stringify(payload) });
        showMsg(msgBox, '상품이 등록되었습니다.', 'success');
      }
      resetAdminForm();
      await refreshAdminProducts();
    } catch (err) {
      showMsg(msgBox, err.message);
    }
  });
}

function setupDropzone() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('fileInput');
  const previewArea = document.getElementById('imagePreviewArea');
  const msgBox = document.getElementById('adminMsg');

  function openPicker() { input.click(); }
  dz.addEventListener('click', openPicker);
  dz.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.add('dragover');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFileUpload(file);
  });

  async function handleFileUpload(file) {
    if (!file.type.startsWith('image/')) {
      showMsg(msgBox, '이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showMsg(msgBox, '파일 크기는 10MB 이하여야 합니다.');
      return;
    }
    dz.classList.add('uploading');
    document.getElementById('dropzoneBody').innerHTML = `
      <div style="font-size: 1.2rem;">⏳</div>
      <div style="margin-top: 6px;">업로드 중...</div>
    `;
    try {
      const result = await uploadToImageKit(file);
      const url = result.url;
      document.querySelector('input[name="image_url"]').value = url;
      previewArea.innerHTML = `<img src="${escapeHtml(url)}" class="image-preview" />`;
      document.getElementById('dropzoneBody').innerHTML = `
        <div style="font-size: 1.6rem;">✅</div>
        <div style="margin-top: 6px; font-weight:600; color:#2f855a;">업로드 완료</div>
        <div style="font-size: 0.78rem; color:#a0aec0; margin-top:4px; word-break: break-all;">${escapeHtml(url)}</div>
        <div style="font-size: 0.78rem; color:#a0aec0; margin-top:4px;">다른 이미지로 교체하려면 다시 클릭/드롭</div>
      `;
      showMsg(msgBox, '이미지가 업로드되었습니다.', 'success');
    } catch (err) {
      showMsg(msgBox, '업로드 실패: ' + err.message);
      resetDropzone();
    } finally {
      dz.classList.remove('uploading');
      input.value = '';
    }
  }
}

function resetDropzone() {
  document.getElementById('dropzoneBody').innerHTML = `
    <div style="font-size: 2rem;">📤</div>
    <div style="margin-top: 6px; font-size: 0.9rem; font-weight: 600;">
      이미지를 드래그하거나 클릭하여 선택하세요
    </div>
    <div style="font-size: 0.8rem; color: #a0aec0; margin-top: 4px;">
      PNG, JPG, GIF 등 (최대 10MB) — 비워두면 이모지로 표시
    </div>
  `;
  document.getElementById('imagePreviewArea').innerHTML = '';
}

function resetAdminForm() {
  const form = document.getElementById('productForm');
  form.reset();
  form.querySelector('[name="id"]').value = '';
  document.getElementById('adminFormTitle').textContent = '➕ 상품 등록';
  resetDropzone();
}

async function loadProductIntoForm(id) {
  try {
    const p = await api(`/api/products/${id}`);
    const form = document.getElementById('productForm');
    form.querySelector('[name="id"]').value = p.id;
    form.querySelector('[name="name"]').value = p.name;
    form.querySelector('[name="price"]').value = p.price;
    form.querySelector('[name="description"]').value = p.description || '';
    form.querySelector('[name="image_url"]').value = p.image_url || '';
    document.getElementById('adminFormTitle').textContent = '✏️ 상품 수정';

    const previewArea = document.getElementById('imagePreviewArea');
    if (p.image_url && /^https?:\/\//.test(p.image_url)) {
      previewArea.innerHTML = `<img src="${escapeHtml(p.image_url)}" class="image-preview" />`;
    } else if (p.image_url) {
      previewArea.innerHTML = `<span class="image-preview-emoji">${escapeHtml(p.image_url)}</span>`;
    } else {
      previewArea.innerHTML = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    toast(err.message);
  }
}

async function deleteProductAdmin(id) {
  if (!confirm('정말 이 상품을 삭제할까요?')) return;
  try {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    toast('상품이 삭제되었습니다.');
    await refreshAdminProducts();
  } catch (err) {
    toast(err.message);
  }
}

// =============================================================================
// View: 로그인 / 회원가입
// =============================================================================
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

// =============================================================================
// Router — path 라우팅 (Toss redirect) + hash 라우팅 동시 지원
// =============================================================================
function router() {
  // Toss 결제 redirect — pathname 으로 들어옴
  if (location.pathname === '/payments/success') return viewPaymentSuccess();
  if (location.pathname === '/payments/fail') return viewPaymentFail();

  const hash = location.hash || '#/';
  if (hash === '#/login') return viewLogin();
  if (hash === '#/register') return viewRegister();
  if (hash === '#/cart') return viewCart();
  if (hash === '#/checkout') return viewCheckout();
  if (hash === '#/my-orders') return viewMyOrders();
  if (hash === '#/admin') return viewAdmin();
  return viewProducts();
}

// =============================================================================
// Init
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('homeBtn').addEventListener('click', () => {
    if (location.pathname !== '/') {
      history.replaceState(null, '', '/');
    }
    navigate('#/');
  });
  if (auth.token) {
    try {
      const me = await api('/api/auth/me');
      auth.save(auth.token, me.user);
      await refreshCartBadge();
    } catch (_) { /* token invalid → cleared by api() */ }
  }
  renderHeader();
  router();
  window.addEventListener('hashchange', router);
});
