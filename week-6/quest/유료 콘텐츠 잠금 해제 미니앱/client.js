// =============================================================================
// 위클리 페이퍼 — 유료 뉴스레터 잠금 해제 미니앱 (SPA)
// =============================================================================

const TOKEN_KEY = 'paper.token.v1';
const USER_KEY = 'paper.user.v1';
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
// Utils
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

// 매우 단순한 마크다운 렌더 (#, ##, ### + 줄바꿈)
function renderArticle(body) {
  if (!body) return '';
  const lines = body.split('\n');
  return lines.map(line => {
    const t = line.trim();
    if (t.startsWith('### ')) return `<h3>${escapeHtml(t.slice(4))}</h3>`;
    if (t.startsWith('## ')) return `<h2>${escapeHtml(t.slice(3))}</h2>`;
    if (t.startsWith('# ')) return `<h1>${escapeHtml(t.slice(2))}</h1>`;
    if (t === '') return '<br/>';
    return `<p>${escapeHtml(line)}</p>`;
  }).join('');
}

function showMsg(el, text, type = 'error') {
  if (!el) return;
  if (!text) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="msg msg-${type}">${escapeHtml(text)}</div>`;
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

function mountTemplate(id) {
  const tpl = document.getElementById(id);
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.appendChild(tpl.content.cloneNode(true));
}

// =============================================================================
// Header
// =============================================================================
function renderHeader() {
  const nav = document.getElementById('navArea');
  if (!nav) return;
  if (auth.user) {
    nav.innerHTML = `
      <button class="btn btn-ghost" id="myBtn">📚 내 구매</button>
      <span style="color:#9ca3af; font-size:0.88rem;">
        <span class="username">${escapeHtml(auth.user.name)}</span>님
      </span>
      <button class="btn btn-ghost" id="logoutBtn">로그아웃</button>
    `;
    document.getElementById('myBtn').addEventListener('click', () => navigate('#/my-purchases'));
    document.getElementById('logoutBtn').addEventListener('click', () => {
      auth.clear();
      renderHeader();
      navigate('#/');
      toast('로그아웃되었습니다');
    });
  } else {
    nav.innerHTML = `
      <button class="btn btn-primary" id="loginBtn">로그인</button>
    `;
    document.getElementById('loginBtn').addEventListener('click', () => navigate('#/login'));
  }
}

// =============================================================================
// View: 콘텐츠 목록
// =============================================================================
async function viewList() {
  mountTemplate('tpl-list');
  const list = document.getElementById('contentList');
  list.innerHTML = `<div class="empty">불러오는 중...</div>`;
  try {
    const items = await api('/api/contents');
    if (!items || items.length === 0) {
      list.innerHTML = `<div class="empty"><div class="empty-emoji">📭</div>아직 발행된 콘텐츠가 없어요.</div>`;
      return;
    }
    list.innerHTML = items.map(c => `
      <article class="content-card" data-id="${c.id}">
        <div>
          <div class="content-meta">
            <span class="issue-label">${escapeHtml(c.issue_label || '구독자 전용')}</span>
            ${c.purchased ? '<span class="purchased-label">✓ 구매완료</span>' : ''}
            <span style="color:#6b7280; font-size:0.8rem;">${formatDate(c.created_at)}</span>
          </div>
          <div class="content-title">${escapeHtml(c.title)}</div>
          <div class="content-preview">${escapeHtml(c.preview)}</div>
        </div>
        <div class="content-price ${c.purchased ? 'content-price-free' : ''}">
          ${c.purchased ? '열람 가능' : formatWon(c.price)}
        </div>
      </article>
    `).join('');
    list.querySelectorAll('.content-card').forEach(card => {
      card.addEventListener('click', () => navigate(`#/content/${card.dataset.id}`));
    });
  } catch (err) {
    list.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

// =============================================================================
// View: 콘텐츠 상세 (잠금 / 열람)
// =============================================================================
async function viewDetail(id) {
  mountTemplate('tpl-detail');
  const body = document.getElementById('detailBody');
  body.innerHTML = `<div class="empty">불러오는 중...</div>`;
  try {
    const c = await api(`/api/contents/${id}`);
    body.innerHTML = `
      <div class="detail-head">
        <span class="issue-label">${escapeHtml(c.issue_label || '구독자 전용')}</span>
        ${c.purchased ? '<span class="purchased-label" style="margin-left:6px;">✓ 구매완료</span>' : ''}
        <h1 class="detail-title">${escapeHtml(c.title)}</h1>
        <div class="detail-meta">${formatDate(c.created_at)}</div>
      </div>

      <div class="preview-block">${escapeHtml(c.preview)}</div>

      ${c.purchased
        ? `<div class="article">${renderArticle(c.body)}</div>`
        : `
          <div class="lock-box">
            <div class="lock-blurred">
${escapeHtml(c.preview)}
${escapeHtml(c.preview)}
이번 주 호의 모든 본문은 결제하신 구독자만 열람하실 수 있습니다.
이 영역은 결제 후 즉시 잠금이 해제됩니다.
            </div>
            <div class="lock-overlay">
              <div class="lock-emoji">🔒</div>
              <div class="lock-title">이번 주 호는 구독자만 열람 가능합니다</div>
              <div class="lock-desc">
                결제하면 즉시 본문 전체가 열립니다 — ${formatWon(c.price)}<br/>
                한 번 결제한 콘텐츠는 언제든 다시 열람하실 수 있어요.
              </div>
              <button class="btn btn-primary lock-cta" id="unlockBtn">
                결제하고 열람 — ${formatWon(c.price)}
              </button>
            </div>
          </div>
        `}

      <div style="margin-top: 22px;">
        <button class="btn btn-ghost" id="backToListBtn">← 목록으로</button>
      </div>
    `;

    document.getElementById('backToListBtn').addEventListener('click', () => navigate('#/'));
    if (!c.purchased) {
      document.getElementById('unlockBtn').addEventListener('click', () => {
        if (!auth.token) {
          toast('먼저 로그인해주세요');
          navigate('#/login');
          return;
        }
        navigate(`#/checkout/${c.id}`);
      });
    }
  } catch (err) {
    body.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

// =============================================================================
// View: 결제 (Toss 위젯)
// =============================================================================
let _tossWidgets = null;
let _currentPurchase = null;
let _currentContent = null;

async function viewCheckout(id) {
  if (!auth.token) {
    toast('로그인이 필요합니다');
    navigate('#/login');
    return;
  }
  mountTemplate('tpl-checkout');
  const msgBox = document.getElementById('checkoutMsg');
  const summary = document.getElementById('checkoutSummary');
  summary.innerHTML = `<div class="empty" style="padding: 22px;">결제 준비 중...</div>`;

  try {
    // 콘텐츠 정보 + 구매 row 생성
    _currentContent = await api(`/api/contents/${id}`);
    if (_currentContent.purchased) {
      toast('이미 구매한 콘텐츠입니다');
      navigate(`#/content/${id}`);
      return;
    }
    _currentPurchase = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ content_id: Number(id) }),
    });

    summary.innerHTML = `
      <div class="checkout-summary">
        <div>
          <div style="font-size:0.78rem; color:#9ca3af; margin-bottom: 4px;">결제 항목</div>
          <div style="font-weight: 700; color: #f5f5f5;">${escapeHtml(_currentContent.title)}</div>
          <div class="left">${escapeHtml(_currentContent.issue_label || '구독자 전용')}</div>
        </div>
        <div class="total">${formatWon(_currentPurchase.amount)}</div>
      </div>
    `;

    await initTossWidget(_currentPurchase, msgBox);
  } catch (err) {
    summary.innerHTML = '';
    showMsg(msgBox, err.message);
  }
}

async function initTossWidget(purchase, msgBox) {
  if (typeof window.TossPayments !== 'function') {
    showMsg(msgBox, '결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    return;
  }
  try {
    const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
    const customerKey = auth.user?.id ? `paper_user_${auth.user.id}` : window.TossPayments.ANONYMOUS;
    const widgets = tossPayments.widgets({ customerKey });
    _tossWidgets = widgets;

    await widgets.setAmount({ currency: 'KRW', value: Number(purchase.amount) });
    await Promise.all([
      widgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
      widgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' }),
    ]);

    document.getElementById('payNowBtn').addEventListener('click', () => requestPayment(purchase, msgBox));
  } catch (err) {
    console.error('Toss widget init failed:', err);
    showMsg(msgBox, '결제창을 불러오지 못했습니다. (' + (err.message || 'unknown') + ')');
  }
}

async function requestPayment(purchase, msgBox) {
  if (!_tossWidgets || !purchase) return;
  const btn = document.getElementById('payNowBtn');
  btn.disabled = true;
  try {
    await _tossWidgets.requestPayment({
      orderId: purchase.toss_order_id,
      orderName: _currentContent?.title || '뉴스레터 콘텐츠',
      successUrl: window.location.origin + '/payments/success',
      failUrl: window.location.origin + '/payments/fail',
      customerName: auth.user?.name || undefined,
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
    body.innerHTML = `<div class="msg msg-error">로그인이 필요합니다.</div>`;
    return;
  }

  body.innerHTML = `<div class="empty" style="padding: 22px;">결제 승인 중...</div>`;
  try {
    const result = await api('/api/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });
    const purchase = result.purchase;
    body.innerHTML = `
      <div class="msg msg-success">결제가 정상 처리되었습니다. 본문이 잠금 해제되었어요.</div>
      <div style="margin-top: 14px; padding: 14px; background: #14141a; border-radius: 10px; font-size: 0.92rem; line-height: 1.7; text-align: left;">
        <div><strong style="color:#fde68a;">주문번호:</strong> ${escapeHtml(purchase.toss_order_id)}</div>
        <div><strong style="color:#fde68a;">결제 금액:</strong> ${formatWon(purchase.amount)}</div>
        <div><strong style="color:#fde68a;">상태:</strong> ${escapeHtml(purchase.status)}</div>
      </div>
      <div style="margin-top: 18px; display: flex; gap: 8px; justify-content: center;">
        <button class="btn btn-primary" id="readNowBtn">본문 읽으러 가기</button>
        <button class="btn btn-ghost" id="goMyBtn">내 구매 이력</button>
      </div>
    `;
    document.getElementById('readNowBtn').addEventListener('click', () => {
      history.replaceState(null, '', '/');
      navigate(`#/content/${purchase.content_id}`);
    });
    document.getElementById('goMyBtn').addEventListener('click', () => {
      history.replaceState(null, '', '/');
      navigate('#/my-purchases');
    });
  } catch (err) {
    body.innerHTML = `
      <div class="msg msg-error">${escapeHtml(err.message)}</div>
      <div style="margin-top: 14px;">
        <button class="btn btn-ghost" id="backHomeFromErr">홈으로</button>
      </div>
    `;
    document.getElementById('backHomeFromErr').addEventListener('click', () => {
      history.replaceState(null, '', '/');
      navigate('#/');
    });
  }
}

// =============================================================================
// View: 결제 실패
// =============================================================================
function viewPaymentFail() {
  mountTemplate('tpl-payment-fail');
  const body = document.getElementById('paymentFailBody');
  const params = new URLSearchParams(location.search);
  const code = params.get('code') || '';
  const message = params.get('message') || '결제 도중 문제가 발생했습니다.';
  body.innerHTML = `
    <div>${escapeHtml(message)}</div>
    ${code ? `<div style="font-size:0.78rem; color:#6b7280; margin-top:6px;">코드: ${escapeHtml(code)}</div>` : ''}
  `;
  document.getElementById('backHomeBtn').addEventListener('click', () => {
    history.replaceState(null, '', '/');
    navigate('#/');
  });
}

// =============================================================================
// View: 내 구매 이력
// =============================================================================
async function viewMyPurchases() {
  if (!auth.token) {
    toast('로그인이 필요합니다');
    navigate('#/login');
    return;
  }
  mountTemplate('tpl-purchases');
  const body = document.getElementById('purchasesBody');
  body.innerHTML = `<div class="empty">불러오는 중...</div>`;
  try {
    const items = await api('/api/purchases');
    if (!items || items.length === 0) {
      body.innerHTML = `
        <div class="empty">
          <div class="empty-emoji">📭</div>
          아직 결제하신 콘텐츠가 없어요.
          <div style="margin-top: 14px;">
            <button class="btn btn-primary" id="goShop">콘텐츠 보러 가기</button>
          </div>
        </div>`;
      document.getElementById('goShop').addEventListener('click', () => navigate('#/'));
      return;
    }
    body.innerHTML = items.map(p => {
      const statusClass = `status-${p.status}`;
      const statusLabel = ({ confirmed: '결제 완료', pending: '결제 대기' })[p.status] || p.status;
      return `
        <div class="purchase-card" data-content-id="${p.content_id}">
          <div>
            <div class="head">
              <span class="purchase-status ${statusClass}">${escapeHtml(statusLabel)}</span>
              <span class="issue-label">${escapeHtml(p.issue_label || '')}</span>
            </div>
            <div class="purchase-title">${escapeHtml(p.content_title)}</div>
            <div class="purchase-meta">
              주문번호 ${escapeHtml(p.toss_order_id || '#' + p.id)} · ${formatDate(p.confirmed_at || p.created_at)} · ${formatWon(p.amount)}
            </div>
          </div>
          <div>
            ${p.status === 'confirmed'
              ? `<button class="btn btn-primary read-btn" data-id="${p.content_id}">본문 열람</button>`
              : `<button class="btn btn-ghost retry-btn" data-id="${p.content_id}">결제 재시도</button>`}
          </div>
        </div>
      `;
    }).join('');
    body.querySelectorAll('.read-btn').forEach(btn =>
      btn.addEventListener('click', () => navigate(`#/content/${btn.dataset.id}`))
    );
    body.querySelectorAll('.retry-btn').forEach(btn =>
      btn.addEventListener('click', () => navigate(`#/checkout/${btn.dataset.id}`))
    );
  } catch (err) {
    body.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
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
      showMsg(msgBox, '가입이 완료되었습니다!', 'success');
      setTimeout(() => navigate('#/'), 600);
    } catch (err) {
      showMsg(msgBox, err.message);
    }
  });
}

// =============================================================================
// Router
// =============================================================================
function router() {
  // Toss redirect는 path-based
  if (location.pathname === '/payments/success') return viewPaymentSuccess();
  if (location.pathname === '/payments/fail') return viewPaymentFail();

  const hash = location.hash || '#/';
  if (hash === '#/login') return viewLogin();
  if (hash === '#/register') return viewRegister();
  if (hash === '#/my-purchases') return viewMyPurchases();

  const m = hash.match(/^#\/content\/(\d+)$/);
  if (m) return viewDetail(Number(m[1]));

  const c = hash.match(/^#\/checkout\/(\d+)$/);
  if (c) return viewCheckout(Number(c[1]));

  return viewList();
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
    } catch (_) { /* token invalid → cleared by api() */ }
  }
  renderHeader();
  router();
  window.addEventListener('hashchange', router);
});
