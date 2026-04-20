// 나를 아는 AI 트레이너 — Frontend

// -------- API helper --------
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({ success: false, message: '서버 응답 오류' }));
  if (!res.ok || !data.success) throw new Error(data.message || `HTTP ${res.status}`);
  return data.data;
}

// -------- Utilities --------
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
function fmtDate(s) { return String(s).slice(0, 10); }

// ============================================================================
// TABS
// ============================================================================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.id !== `tab-${name}`));
  if (name === 'context') loadContext();
  if (name === 'workouts') loadWorkouts();
}

// ============================================================================
// CONTEXT
// ============================================================================
async function loadContext() {
  const preview = document.getElementById('contextPreview');
  const editor = document.getElementById('contextEditor');
  preview.textContent = '(로딩 중...)';
  try {
    const { content } = await api('/api/context');
    preview.textContent = content || '(Context가 비어 있습니다)';
    editor.value = content || '';
  } catch (err) {
    preview.textContent = `(로드 실패: ${err.message})`;
  }
}

async function saveContext() {
  const msgBox = document.getElementById('contextMsg');
  const content = document.getElementById('contextEditor').value;
  const btn = document.getElementById('saveContextBtn');
  btn.disabled = true;
  try {
    const r = await api('/api/context', { method: 'PUT', body: JSON.stringify({ content }) });
    document.getElementById('contextPreview').textContent = content || '(Context가 비어 있습니다)';
    showMsg(msgBox, `저장 완료 (${r.length.toLocaleString()}자). 다음 AI 호출부터 반영됩니다.`, 'success');
  } catch (err) {
    showMsg(msgBox, err.message);
  } finally {
    btn.disabled = false;
  }
}

// ============================================================================
// WORKOUTS
// ============================================================================
async function loadWorkouts() {
  const list = document.getElementById('workoutList');
  list.innerHTML = '<p class="muted">불러오는 중...</p>';
  try {
    const rows = await api('/api/workouts');
    if (!rows || rows.length === 0) {
      list.innerHTML = '<p class="muted">아직 기록이 없어요.</p>';
      return;
    }
    list.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>날짜</th><th>부위</th><th>운동</th>
            <th class="num">세트×회</th><th class="num">무게/시간</th>
            <th>메모</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-id="${r.id}">
              <td>${escapeHtml(fmtDate(r.date))}</td>
              <td><span class="tag">${escapeHtml(r.body_part)}</span></td>
              <td>${escapeHtml(r.exercise)}</td>
              <td class="num">${r.sets}×${r.reps}</td>
              <td class="num">${r.weight_kg != null ? `${r.weight_kg}kg` : (r.duration_min != null ? `${r.duration_min}분` : '-')}</td>
              <td class="muted">${escapeHtml(r.notes || '')}</td>
              <td><button class="btn btn-danger del-btn" data-id="${r.id}">삭제</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    list.querySelectorAll('.del-btn').forEach((btn) =>
      btn.addEventListener('click', () => deleteWorkout(Number(btn.dataset.id)))
    );
  } catch (err) {
    list.innerHTML = `<div class="msg msg-error">${escapeHtml(err.message)}</div>`;
  }
}

async function deleteWorkout(id) {
  if (!confirm('이 기록을 삭제할까요?')) return;
  try {
    await api(`/api/workouts/${id}`, { method: 'DELETE' });
    loadWorkouts();
  } catch (err) {
    alert(err.message);
  }
}

function initWorkoutForm() {
  const form = document.getElementById('workoutForm');
  // 날짜 기본값 = 오늘
  form.date.valueAsDate = new Date();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      date: fd.get('date'),
      body_part: fd.get('body_part'),
      exercise: String(fd.get('exercise')).trim(),
      sets: Number(fd.get('sets')),
      reps: Number(fd.get('reps')),
      weight_kg: fd.get('weight_kg') ? Number(fd.get('weight_kg')) : null,
      duration_min: fd.get('duration_min') ? Number(fd.get('duration_min')) : null,
      notes: null,
    };
    try {
      await api('/api/workouts', { method: 'POST', body: JSON.stringify(body) });
      form.exercise.value = '';
      form.weight_kg.value = '';
      form.duration_min.value = '';
      showMsg(document.getElementById('workoutMsg'), '기록이 추가됐어요', 'success');
      loadWorkouts();
    } catch (err) {
      showMsg(document.getElementById('workoutMsg'), err.message);
    }
  });
}

// ============================================================================
// CHAT (비교 호출)
// ============================================================================
function initChat() {
  const askBtn = document.getElementById('askBtn');
  const input = document.getElementById('questionInput');
  const msgBox = document.getElementById('chatMsg');

  document.querySelectorAll('.sample-q button').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.dataset.q;
      input.focus();
    })
  );

  askBtn.addEventListener('click', async () => {
    const q = input.value.trim();
    if (!q) { showMsg(msgBox, '질문을 입력하세요'); return; }
    await askCompare(q);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      askBtn.click();
    }
  });
}

async function askCompare(question) {
  const askBtn = document.getElementById('askBtn');
  const msgBox = document.getElementById('chatMsg');
  const panels = document.getElementById('panels');
  const aWithout = document.getElementById('answerWithout');
  const aWith = document.getElementById('answerWith');
  const pWithout = document.getElementById('promptWithout');
  const pWith = document.getElementById('promptWith');
  const mWithout = document.getElementById('metaWithout');
  const mWith = document.getElementById('metaWith');

  askBtn.disabled = true;
  askBtn.textContent = '분석 중...';
  msgBox.innerHTML = '';
  panels.style.display = 'grid';
  aWithout.innerHTML = '<span class="loading-dots">답변 생성 중</span>';
  aWith.innerHTML = '<span class="loading-dots">답변 생성 중</span>';
  pWithout.classList.remove('show'); pWith.classList.remove('show');
  mWithout.textContent = ''; mWith.textContent = '';

  try {
    const data = await api('/api/compare', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
    aWithout.textContent = data.without_context.answer;
    aWith.textContent = data.with_context.answer;
    pWithout.textContent = data.without_context.prompt;
    pWith.textContent = data.with_context.prompt;
    const meta = data.with_context.meta || {};
    mWithout.textContent = '프롬프트: 질문만';
    mWith.textContent = `Context ${meta.contextChars?.toLocaleString() || 0}자 + 최근 기록 ${meta.workoutsIncluded || 0}건`;
  } catch (err) {
    aWithout.innerHTML = `<span style="color:#c53030;">오류: ${escapeHtml(err.message)}</span>`;
    aWith.innerHTML = `<span style="color:#c53030;">오류: ${escapeHtml(err.message)}</span>`;
    showMsg(msgBox, err.message);
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = '비교 질문 🚀';
  }
}

function initPromptToggles() {
  document.querySelectorAll('.prompt-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const open = target.classList.toggle('show');
      btn.textContent = (open ? '▾' : '▸') + ' 실제 전달된 프롬프트 ' + (open ? '숨기기' : '보기');
    });
  });
}

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initChat();
  initPromptToggles();
  initWorkoutForm();
  // 처음 열리는 탭은 chat. Context를 미리 로드해두면 첫 호출 대기 줄어듦
  loadContext();
});
