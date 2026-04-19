// Household Budget - Frontend
const api = {
  list: () => fetch('/api/transactions').then(r => r.json()),
  summary: () => fetch('/api/transactions/summary').then(r => r.json()),
  create: (body) => fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()),
  remove: (id) => fetch(`/api/transactions/${id}`, { method: 'DELETE' }).then(r => r.json()),
};

const DEFAULT_CATEGORIES = {
  expense: ['식비', '교통', '주거', '구독료', '경조사', '의료', '쇼핑', '문화/여가', '기타'],
  income: ['급여', '상여금', '용돈', '이자', '부업', '기타수입'],
};
const CAT_STORAGE_KEY = 'budget.categories.v1';

function loadCategories() {
  try {
    const raw = localStorage.getItem(CAT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        expense: Array.isArray(parsed.expense) ? parsed.expense : [...DEFAULT_CATEGORIES.expense],
        income: Array.isArray(parsed.income) ? parsed.income : [...DEFAULT_CATEGORIES.income],
      };
    }
  } catch (_) {}
  return { expense: [...DEFAULT_CATEGORIES.expense], income: [...DEFAULT_CATEGORIES.income] };
}

function saveCategories() {
  localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify(state.categories));
}

const state = { type: 'expense', categories: loadCategories() };

function renderCategoryOptions() {
  const sel = document.getElementById('category');
  const list = state.categories[state.type] || [];
  const prev = sel.value;
  sel.innerHTML = list.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (list.includes(prev)) sel.value = prev;
}

const fmtWon = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const fmtDate = (d) => {
  const date = new Date(d);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
};

function setType(type) {
  state.type = type;
  document.querySelectorAll('.type-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  renderCategoryOptions();
  const first = (state.categories[type] || [])[0];
  if (first) document.getElementById('category').value = first;
}

async function loadSummary() {
  const res = await api.summary();
  if (!res.success) return;
  const { totalIncome, totalExpense, balance, byCategory } = res.data;
  document.getElementById('totalIncome').textContent = fmtWon(totalIncome);
  document.getElementById('totalExpense').textContent = fmtWon(totalExpense);
  document.getElementById('balance').textContent = fmtWon(balance);

  const ul = document.getElementById('categoryList');
  if (!byCategory || byCategory.length === 0) {
    ul.innerHTML = '<li class="empty">내역을 추가하면 표시됩니다.</li>';
    return;
  }
  ul.innerHTML = byCategory.map(c => `
    <li>
      <span class="cat-name">
        <span class="cat-badge badge-${c.type}">${c.type === 'income' ? '수입' : '지출'}</span>
        ${escapeHtml(c.category)}
      </span>
      <span style="font-weight:600;color:${c.type === 'income' ? '#2f855a' : '#c53030'};">
        ${fmtWon(c.total)}
      </span>
    </li>
  `).join('');
}

async function loadList() {
  const res = await api.list();
  const box = document.getElementById('txList');
  if (!res.success || !res.data || res.data.length === 0) {
    box.innerHTML = '<div class="empty">등록된 내역이 없습니다.</div>';
    return;
  }
  box.innerHTML = res.data.map(tx => `
    <div class="tx-item">
      <div class="tx-date">${fmtDate(tx.date)}</div>
      <div class="tx-info">
        <div class="category">
          <span class="cat-badge badge-${tx.type}">${tx.type === 'income' ? '수입' : '지출'}</span>
          ${escapeHtml(tx.category)}
        </div>
        ${tx.memo ? `<div class="memo">${escapeHtml(tx.memo)}</div>` : ''}
      </div>
      <div class="tx-amount ${tx.type}">
        ${tx.type === 'income' ? '+' : '-'}${fmtWon(tx.amount)}
      </div>
      <button class="delete-btn" data-id="${tx.id}">삭제</button>
    </div>
  `).join('');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function refresh() {
  await Promise.all([loadSummary(), loadList()]);
}

document.addEventListener('DOMContentLoaded', () => {
  // default date = today
  const today = new Date();
  document.getElementById('date').value = fmtDate(today);

  // initial category render
  renderCategoryOptions();

  // type toggle
  document.querySelectorAll('.type-toggle button').forEach(btn => {
    btn.addEventListener('click', () => setType(btn.dataset.type));
  });

  // add/remove category
  const newRow = document.getElementById('newCategoryRow');
  const newInput = document.getElementById('newCategoryInput');
  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    newRow.hidden = false;
    newInput.value = '';
    newInput.focus();
  });
  document.getElementById('cancelCategoryBtn').addEventListener('click', () => {
    newRow.hidden = true;
  });
  const confirmAdd = () => {
    const name = newInput.value.trim();
    if (!name) { alert('카테고리명을 입력하세요.'); return; }
    const list = state.categories[state.type];
    if (list.includes(name)) { alert('이미 존재하는 카테고리입니다.'); return; }
    list.push(name);
    saveCategories();
    renderCategoryOptions();
    document.getElementById('category').value = name;
    newRow.hidden = true;
  };
  document.getElementById('confirmCategoryBtn').addEventListener('click', confirmAdd);
  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmAdd(); }
    else if (e.key === 'Escape') { newRow.hidden = true; }
  });
  document.getElementById('removeCategoryBtn').addEventListener('click', () => {
    const sel = document.getElementById('category');
    const name = sel.value;
    if (!name) return;
    const defaults = DEFAULT_CATEGORIES[state.type] || [];
    if (defaults.includes(name)) {
      alert('기본 카테고리는 삭제할 수 없습니다. 사용자가 추가한 카테고리만 삭제할 수 있어요.');
      return;
    }
    if (!confirm(`"${name}" 카테고리를 목록에서 삭제하시겠습니까?\n(기존에 등록된 거래 내역은 유지됩니다.)`)) return;
    state.categories[state.type] = state.categories[state.type].filter(c => c !== name);
    saveCategories();
    renderCategoryOptions();
  });

  // form submit
  document.getElementById('txForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    const body = {
      type: state.type,
      date: document.getElementById('date').value,
      amount: Number(document.getElementById('amount').value),
      category: document.getElementById('category').value,
      memo: document.getElementById('memo').value || null,
    };

    try {
      const res = await api.create(body);
      if (!res.success) {
        alert(res.message || '등록 실패');
      } else {
        document.getElementById('amount').value = '';
        document.getElementById('memo').value = '';
        await refresh();
      }
    } catch (err) {
      alert('네트워크 오류: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '등록하기';
    }
  });

  // delete via event delegation
  document.getElementById('txList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm('이 내역을 삭제하시겠습니까?')) return;
    const res = await api.remove(id);
    if (!res.success) {
      alert(res.message || '삭제 실패');
      return;
    }
    await refresh();
  });

  refresh();
});
