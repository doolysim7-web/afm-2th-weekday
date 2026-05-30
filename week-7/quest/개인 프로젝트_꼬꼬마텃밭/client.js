/* eslint-disable */
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

// ---------------------------------------------------------------------------
// API + token
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'small_forest_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const tok = getToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let res;
  try { res = await fetch(path, { ...opts, headers }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('네트워크 오류'); }
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok || !body || body.success === false) {
    const msg = (body && body.message) || `HTTP ${res.status}`;
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return body.data;
}

async function uploadImage(file) {
  const auth = await api('/api/upload/auth');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('fileName', `lf_${Date.now()}_${file.name.replace(/[^a-z0-9.\-_]/gi, '_')}`);
  fd.append('publicKey', auth.publicKey);
  fd.append('signature', auth.signature);
  fd.append('expire', auth.expire);
  fd.append('token', auth.token);
  fd.append('folder', '/little-farm/uploads');
  fd.append('useUniqueFileName', 'true');
  const r = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: fd });
  const j = await r.json();
  if (!r.ok || !j.url) throw new Error(j.message || 'ImageKit 업로드 실패');
  return j.url;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMOJIS = ['🌱','🌿','🍀','🌾','🌻','🌷','🌸','🌺','🌹','🥬','🌶️','🍅','🥒','🍆','🥕','🌽','🥔','🍓','🍎','🍊','🍋','🍇','🍑','🍒','🦊','🐰','🐶','🐱','🐻','🐼','🦁','🐯','🐸','🦄','⭐','🌈','🎈','🎁','📚','🎨','🤖','😀','😎','🤩','🥳','👑'];
const SIDOS = ['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원도','충청북도','충청남도','전라북도','전라남도','경상북도','경상남도','제주특별자치도'];

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function formatTimeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금 전';
  if (s < 3600) return Math.floor(s/60) + '분 전';
  if (s < 86400) return Math.floor(s/3600) + '시간 전';
  if (s < 86400*7) return Math.floor(s/86400) + '일 전';
  return new Date(iso).toLocaleDateString('ko-KR');
}
function formatPrice(n) { return Number(n||0).toLocaleString('ko-KR') + '원'; }
function thisMonthYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// ---------------------------------------------------------------------------
// Hash router
// ---------------------------------------------------------------------------
function useHashRoute() {
  const parse = () => {
    const raw = (location.hash || '#/').replace(/^#/, '');
    const [pathname, q = ''] = raw.split('?');
    return { pathname: pathname || '/', params: new URLSearchParams(q) };
  };
  const [route, setRoute] = useState(parse());
  useEffect(() => {
    const on = () => setRoute(parse());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
const navigate = (to) => { location.hash = to.startsWith('#') ? to : '#' + to; };

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try { setUser(await api('/api/auth/me')); }
    catch { setToken(null); setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(d.token); setUser(d.user); return d.user;
  };
  const signup = async (payload) => {
    const d = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
    setToken(d.token); setUser(d.user); return d.user;
  };
  const logout = () => { setToken(null); setUser(null); navigate('/'); };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshMe: refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
const useAuth = () => useContext(AuthContext);

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------
function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-leaf-100">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href="#/" className="flex items-center gap-1.5 font-bold text-leaf-700 text-lg">
          <span>🌱</span><span>꼬꼬마텃밭</span>
        </a>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <a className="px-2 py-1 rounded-md hover:bg-leaf-50 text-gray-700" href="#/calendar">📅 캘린더</a>
          <a className="px-2 py-1 rounded-md hover:bg-leaf-50 text-gray-700" href="#/crops">🌿 작목</a>
          <a className="px-2 py-1 rounded-md hover:bg-leaf-50 text-gray-700" href="#/board">💬 게시판</a>
          {user && <a className="px-2 py-1 rounded-md hover:bg-leaf-50 text-gray-700" href="#/chat">💚 채팅방</a>}
          <a className="px-2 py-1 rounded-md hover:bg-leaf-50 text-gray-700" href="#/feed">🌸 둘러보기</a>
        </nav>
        <nav className="flex items-center gap-1 text-sm">
          {user ? (
            <>
              {user.role === 'admin' && (
                <a href="#/admin" className="px-2 py-1 rounded-md bg-amber-100 text-amber-800 font-semibold hover:bg-amber-200 flex items-center gap-1">
                  <span>👑</span><span className="hidden sm:inline">관리자</span>
                </a>
              )}
              <a href="#/me/logs" className="px-2 py-1.5 rounded-md hover:bg-leaf-50 flex items-center gap-1">
                <span>📔</span><span className="hidden lg:inline">내 일지</span>
              </a>
              <a href="#/me/budget" className="px-2 py-1.5 rounded-md hover:bg-leaf-50 flex items-center gap-1">
                <span>💰</span><span className="hidden lg:inline">가계부</span>
              </a>
              <a href="#/logs/new" className="px-3 py-1.5 rounded-md bg-leaf-500 text-white font-semibold hover:bg-leaf-600">+ 일지</a>
              <a href="#/me" className="px-2 py-1.5 rounded-md hover:bg-leaf-50 flex items-center gap-1">
                <span className="text-base">{user.avatar_emoji}</span>
                <span className="hidden sm:inline">{user.display_name}</span>
              </a>
              <button onClick={logout} className="px-2 py-1.5 rounded-md hover:bg-leaf-50 text-gray-500">로그아웃</button>
            </>
          ) : (
            <>
              <a href="#/login" className="px-3 py-1.5 rounded-md hover:bg-leaf-50">로그인</a>
              <a href="#/signup" className="px-3 py-1.5 rounded-md bg-leaf-500 text-white font-semibold hover:bg-leaf-600">가입</a>
            </>
          )}
        </nav>
      </div>
      <nav className="md:hidden flex items-center gap-0 text-xs border-t border-leaf-100 bg-white">
        <a className="flex-1 text-center py-2 hover:bg-leaf-50" href="#/calendar">📅 캘린더</a>
        <a className="flex-1 text-center py-2 hover:bg-leaf-50" href="#/crops">🌿 작목</a>
        {user && <a className="flex-1 text-center py-2 hover:bg-leaf-50 font-semibold text-leaf-700" href="#/me/logs">📔 내 일지</a>}
        <a className="flex-1 text-center py-2 hover:bg-leaf-50" href="#/board">💬 게시판</a>
        {user && <a className="flex-1 text-center py-2 hover:bg-leaf-50" href="#/chat">💚 채팅</a>}
        <a className="flex-1 text-center py-2 hover:bg-leaf-50" href="#/feed">🌸 피드</a>
      </nav>
    </header>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-gray-700 mb-1">{label}</div>
      {children}
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </label>
  );
}

function EmptyState({ icon = '🌱', title, sub, action }) {
  return (
    <div className="text-center py-16 fade-in">
      <div className="text-5xl mb-3">{icon}</div>
      <div className="font-semibold text-gray-700">{title}</div>
      {sub && <div className="text-sm text-gray-500 mt-1">{sub}</div>}
      {action}
    </div>
  );
}

function EmojiPicker({ value, onChange }) {
  return (
    <div className="border border-leaf-100 rounded-lg p-2 bg-leaf-50/40">
      <div className="text-xs text-gray-500 mb-1.5">아바타 이모지</div>
      <div className="grid grid-cols-9 gap-1 max-h-40 overflow-auto no-scrollbar">
        {EMOJIS.map((e) => (
          <button type="button" key={e} onClick={() => onChange(e)}
            className={`text-2xl h-10 rounded-md hover:bg-white ${value === e ? 'bg-leaf-100 ring-2 ring-leaf-500' : ''}`}>{e}</button>
        ))}
      </div>
    </div>
  );
}

const CROP_EMOJI_MAP = {
  '상추': '🥬', '깻잎': '🌿', '부추': '🌿', '쪽파': '🧅', '대파': '🧅', '실파': '🧅',
  '시금치': '🥬', '쑥갓': '🌿', '케일': '🥬', '청경채': '🥬', '겨자채': '🥬',
  '배추': '🥬', '양배추': '🥬', '브로콜리': '🥦', '미나리': '🌿', '근대': '🌱',
  '고추': '🌶️', '토마토': '🍅', '방울토마토': '🍅', '가지': '🍆', '오이': '🥒',
  '호박': '🎃', '애호박': '🎃', '단호박': '🎃', '여주': '🌱', '참외': '🍈', '수박': '🍉',
  '감자': '🥔', '고구마': '🍠', '당근': '🥕', '무': '🌱', '비트': '🌱', '토란': '🌱',
  '옥수수': '🌽', '들깨': '🌿', '깨': '🌿',
  '바질': '🌿', '루꼴라': '🌿', '로즈마리': '🌿', '페퍼민트': '🌿', '민트': '🌿',
  '치커리': '🌿', '딜': '🌿', '파슬리': '🌿', '셀러리': '🥬',
  '레몬밤': '🌿', '오레가노': '🌿', '타임': '🌿', '라벤더': '💜',
  '완두콩': '🫛', '강낭콩': '🫘', '땅콩': '🥜', '딸기': '🍓',
  '마늘': '🧄', '양파': '🧅', '생강': '🌱',
};
function cropEmoji(crop) {
  if (!crop) return '🌱';
  const e = (crop.emoji || '').trim();
  if (e) return e;
  return CROP_EMOJI_MAP[crop.name_ko] || '🌱';
}

function CropThumb({ url, emoji, name, size = 'md' }) {
  const cls = size === 'sm' ? 'w-12 h-12' : size === 'lg' ? 'w-32 h-32' : 'w-20 h-20';
  const txt = size === 'sm' ? 'text-2xl' : size === 'lg' ? 'text-6xl' : 'text-4xl';
  if (url) return <img src={url} alt={name} className={`${cls} rounded-lg object-cover bg-leaf-50 shrink-0`} />;
  const e = cropEmoji({ emoji, name_ko: name });
  return <div className={`${cls} rounded-lg bg-leaf-50 flex items-center justify-center ${txt} shrink-0`}>{e}</div>;
}

// ---------------------------------------------------------------------------
// Login / Signup
// ---------------------------------------------------------------------------
function LoginPage() {
  const { login, user } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) navigate('/'); }, [user]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await login(email, password); navigate('/'); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">로그인</h1>
      <p className="text-sm text-gray-600 mb-6">이번 주말, 같이 텃밭 가요 🌱</p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="이메일"><input type="email" required className="input" value={email} onChange={(e)=>setEmail(e.target.value)} /></Field>
        <Field label="비밀번호"><input type="password" required className="input" value={password} onChange={(e)=>setPassword(e.target.value)} /></Field>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button disabled={busy} className="btn-primary w-full">{busy ? '로그인 중...' : '로그인'}</button>
      </form>
      <div className="text-center text-sm text-gray-500 mt-4">
        처음이세요? <a href="#/signup" className="text-leaf-700 font-semibold">가입하기</a>
      </div>
    </div>
  );
}

function SignupPage() {
  const { signup, user } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [display_name, setDn] = useState(''); const [region_sido, setSido] = useState('');
  const [region_sigungu, setSigu] = useState(''); const [avatar_emoji, setAv] = useState('🌱');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) navigate('/'); }, [user]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await signup({ email, password, display_name, region_sido, region_sigungu, avatar_emoji }); navigate('/'); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">회원가입</h1>
      <p className="text-sm text-gray-600 mb-6">텃밭 친구가 되어주세요 🌿</p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="이메일"><input type="email" required className="input" value={email} onChange={(e)=>setEmail(e.target.value)} /></Field>
        <Field label="비밀번호 (6자 이상)"><input type="password" minLength={6} required className="input" value={password} onChange={(e)=>setPassword(e.target.value)} /></Field>
        <Field label="닉네임"><input required maxLength={20} className="input" value={display_name} onChange={(e)=>setDn(e.target.value)} /></Field>
        <Field label="지역">
          <div className="flex gap-2">
            <select className="input flex-1" value={region_sido} onChange={(e)=>setSido(e.target.value)}>
              <option value="">시·도 선택</option>
              {SIDOS.map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="input flex-1" placeholder="시·군·구 (예: 남양주시)" value={region_sigungu} onChange={(e)=>setSigu(e.target.value)} />
          </div>
        </Field>
        <Field label="아바타"><EmojiPicker value={avatar_emoji} onChange={setAv} /></Field>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button disabled={busy} className="btn-primary w-full">{busy ? '가입 중...' : '가입하기'}</button>
      </form>
      <div className="text-center text-sm text-gray-500 mt-4">
        이미 계정이 있나요? <a href="#/login" className="text-leaf-700 font-semibold">로그인</a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home (이번 달 캘린더 + 인사말 + 시즌 추천)
// ---------------------------------------------------------------------------
function HomePage() {
  const { user } = useAuth();
  const [cal, setCal] = useState(null);
  const [feed, setFeed] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const ym = thisMonthYM();
        const [c, f] = await Promise.all([
          api(`/api/calendar?month=${ym}`),
          api(`/api/logs/public/feed`),
        ]);
        setCal(c); setFeed(f.slice(0, 6));
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  const greeting = user ? `${user.display_name}님, 이번 주말은 어떠세요?` : '주말농장러를 위한 따뜻한 텃밭 동반자';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <section className="bg-gradient-to-br from-leaf-100 to-leaf-50 rounded-3xl p-6 mb-6">
        <div className="text-leaf-700 text-sm font-semibold">🌱 꼬꼬마텃밭</div>
        <h1 className="text-2xl sm:text-3xl font-bold mt-1">{greeting}</h1>
        <p className="text-sm text-gray-600 mt-2">5평·10평 텃밭 단위로 환산된 작목 가이드. 토요일 아침에 펼치고, 일요일 저녁에 한 줄 일지.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="#/calendar" className="btn-primary">📅 이번 달 캘린더</a>
          <a href="#/crops" className="btn-ghost">🌿 작목 12종 보기</a>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-bold mb-3">🗓 {cal?.month || (new Date().getMonth()+1)}월에 심거나 가꾸기 좋은 작물</h2>
        {err && <div className="text-red-600 text-sm">{err}</div>}
        {!cal ? (
          <div className="text-center py-10 text-gray-400">불러오는 중...</div>
        ) : cal.crops.length === 0 ? (
          <EmptyState icon="🌾" title="이번 달은 시즌 작목이 없어요" sub="다른 달 캘린더를 둘러보세요" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {cal.crops.map((c) => (
              <a key={c.id} href={`#/crops/${c.id}`} className="bg-white rounded-2xl border border-leaf-100 p-3 hover:border-leaf-300 transition">
                <CropThumb url={c.hero_image_url} emoji={c.emoji} name={c.name_ko} size="md" />
                <div className="font-semibold mt-2">{c.name_ko} {c.beginner_friendly && <span className="text-xs text-leaf-600">초보♥</span>}</div>
                <div className="text-xs text-gray-500">{c.category}</div>
                {c.tasks && c.tasks.length > 0 && (
                  <div className="text-xs text-leaf-700 mt-1.5 line-clamp-2">
                    {c.tasks.slice(0, 2).map(t => `${t.task_type}`).join(' · ')}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">🌸 친구들 텃밭 보기</h2>
          <a href="#/feed" className="text-sm text-leaf-700 font-semibold">더보기 →</a>
        </div>
        {feed.length === 0 ? (
          <div className="text-sm text-gray-500">아직 공개 일지가 없어요</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {feed.map((l) => (
              <li key={l.id}>
                <a href={`#/logs/${l.id}`} className="block bg-white rounded-2xl border border-leaf-100 p-3 hover:border-leaf-300">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{l.avatar_emoji}</span>
                    <span className="font-semibold">{l.display_name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{formatDate(l.log_date)}</span>
                  </div>
                  <div className="font-bold mt-1.5 truncate">{l.title}</div>
                  <div className="text-sm text-gray-600 line-clamp-2 mt-1">{l.body_md}</div>
                  {l.crops && l.crops.length > 0 && (
                    <div className="text-xs text-leaf-700 mt-1 truncate">🌱 {l.crops.map((c) => c.name_ko).join(', ')}</div>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
function CalendarPage({ month }) {
  const ym = month || thisMonthYM();
  const [data, setData] = useState(null); const [err, setErr] = useState('');
  useEffect(() => {
    (async () => { try { setData(await api(`/api/calendar?month=${ym}`)); } catch (e) { setErr(e.message); } })();
  }, [ym]);
  const m = parseInt(ym.split('-')[1], 10);
  const change = (delta) => {
    const [y, mm] = ym.split('-').map(Number);
    let ny = y, nm = mm + delta;
    if (nm > 12) { nm = 1; ny++; } else if (nm < 1) { nm = 12; ny--; }
    navigate(`/calendar/${ny}-${String(nm).padStart(2,'0')}`);
  };
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => change(-1)} className="px-3 py-2 rounded-lg border border-leaf-200 hover:bg-leaf-50">← {m === 1 ? 12 : m - 1}월</button>
        <h1 className="text-2xl font-bold">📅 {m}월 텃밭 캘린더</h1>
        <button onClick={() => change(1)} className="px-3 py-2 rounded-lg border border-leaf-200 hover:bg-leaf-50">{m === 12 ? 1 : m + 1}월 →</button>
      </div>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      {!data ? (
        <div className="text-center py-12 text-gray-400">불러오는 중...</div>
      ) : data.crops.length === 0 ? (
        <EmptyState icon="🌾" title={`${m}월에는 시즌 작목이 없어요`} />
      ) : (
        <div className="space-y-3">
          {data.crops.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-leaf-100 p-4 flex gap-4">
              <CropThumb url={c.hero_image_url} emoji={c.emoji} name={c.name_ko} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <a href={`#/crops/${c.id}`} className="font-bold text-lg hover:text-leaf-700">{c.name_ko}</a>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-leaf-50 text-leaf-700">{c.category}</span>
                  {c.beginner_friendly && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">초보♥</span>}
                </div>
                {c.tasks && c.tasks.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {c.tasks.map((t) => (
                      <li key={t.id} className="text-sm text-gray-700">
                        <span className="font-semibold text-leaf-700">{t.task_type}</span>
                        {t.week_in_month > 0 && <span className="text-xs text-gray-400"> · {m}월 {t.week_in_month}주차</span>}
                        {t.instructions_md && <span className="text-gray-600"> — {t.instructions_md}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-500 mt-2">이번 달은 별도 작업 권장이 없어요. 잘 자라고 있는지 살피세요.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crops
// ---------------------------------------------------------------------------
const CROP_CATEGORIES_UI = ['전체','엽채','과채','근채','곡류','허브'];
function CropsPage() {
  const route = useHashRoute();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState(route.params.get('category') || '');
  const [beginner, setBeginner] = useState(route.params.get('beginner') === 'true');
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (category) qs.set('category', category);
        if (beginner) qs.set('beginner', 'true');
        setItems(await api('/api/crops' + (qs.toString() ? '?' + qs.toString() : '')));
      } catch (e) { setErr(e.message); }
    })();
  }, [category, beginner]);
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">🌿 작목 가이드</h1>
      <p className="text-sm text-gray-500 mb-4">5평/10평/20평 단위로 환산된 텃밭 안내서</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {CROP_CATEGORIES_UI.map((c) => {
          const v = c === '전체' ? '' : c;
          const active = category === v;
          return (
            <button key={c} onClick={()=>setCategory(v)}
              className={`px-3 h-9 rounded-full text-sm border ${active ? 'bg-leaf-500 text-white border-leaf-500' : 'bg-white border-leaf-200 text-gray-700'}`}>{c}</button>
          );
        })}
        <button onClick={()=>setBeginner(b=>!b)}
          className={`px-3 h-9 rounded-full text-sm border ${beginner ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white border-leaf-200 text-gray-700'}`}>♥ 초보용만</button>
      </div>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((c) => (
          <a key={c.id} href={`#/crops/${c.id}`} className="bg-white rounded-2xl border border-leaf-100 p-3 hover:border-leaf-300 transition">
            <CropThumb url={c.hero_image_url} emoji={c.emoji} name={c.name_ko} size="md" />
            <div className="font-semibold mt-2 flex items-center gap-1">
              {c.name_ko}
              {c.beginner_friendly && <span className="text-xs text-amber-700">♥</span>}
            </div>
            <div className="text-xs text-gray-500">{c.category} · {c.season_start_month}~{c.season_end_month}월</div>
            <div className="text-xs text-gray-600 mt-1.5 line-clamp-2">{c.summary_md}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function CropDetailPage({ id }) {
  const { user } = useAuth();
  const [c, setC] = useState(null); const [err, setErr] = useState('');
  const [py, setPy] = useState(5); // 5/10/20 평
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => { try { setC(await api(`/api/crops/${id}`)); } catch (e) { setErr(e.message); } })();
  }, [id]);
  const addToMine = async () => {
    if (!user) { navigate('/login'); return; }
    setBusy(true);
    try {
      await api('/api/me/crops', { method: 'POST', body: JSON.stringify({ crop_id: id, area_pyeong: py }) });
      alert(`내 작물에 ${c.name_ko}(${py}평)을 추가했어요 🌱`);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };
  if (err) return <div className="max-w-3xl mx-auto p-4 text-red-600">{err}</div>;
  if (!c) return <div className="max-w-3xl mx-auto p-8 text-center text-gray-400">불러오는 중...</div>;

  // 정보 보강이 필요한지 판별 — 즉석 추가된 작목 기본 패턴 또는 빈 값
  const isIncomplete =
    !c.summary_md ||
    c.summary_md.includes('직접 추가한 작목') ||
    c.summary_md.length < 10 ||
    !c.sunlight ||
    (c.tasks || []).length === 0;
  // tasks group by month
  const byMonth = {};
  (c.tasks || []).forEach(t => { (byMonth[t.month] ||= []).push(t); });
  const months = Object.keys(byMonth).map(Number).sort((a,b)=>a-b);
  const pyKey = py === 5 ? 'per_5pyeong_amount' : py === 10 ? 'per_10pyeong_amount' : 'per_20pyeong_amount';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {isIncomplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3 flex items-start gap-3">
          <div className="text-2xl">🌱</div>
          <div className="flex-1">
            <div className="font-semibold text-amber-900">이 작목 가이드가 아직 비어 있어요</div>
            <div className="text-sm text-amber-800/80 mt-0.5">언제 심고, 어떻게 가꾸는지 직접 적어주시면 다른 텃밭러에게도 큰 도움이 돼요.</div>
          </div>
          {user && (
            <a href={`#/crops/${id}/edit`} className="btn-primary text-sm shrink-0">📝 추가 정보 만들기</a>
          )}
        </div>
      )}
      <div className="bg-white rounded-3xl border border-leaf-100 overflow-hidden">
        {c.hero_image_url ? (
          <img src={c.hero_image_url} className="w-full aspect-[4/3] object-cover bg-leaf-50" />
        ) : (
          <div className="w-full aspect-[4/3] bg-leaf-50 flex items-center justify-center text-9xl">{cropEmoji(c)}</div>
        )}
        <div className="p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-leaf-700 font-semibold">{c.category} · {c.season_start_month}~{c.season_end_month}월 시즌</div>
            {user && !isIncomplete && (
              <a href={`#/crops/${id}/edit`} className="text-xs text-leaf-700 hover:text-leaf-800 font-semibold">✎ 정보 편집</a>
            )}
          </div>
          <h1 className="text-2xl font-bold mt-1">{c.name_ko} <span className="text-base font-normal text-gray-500">{c.name_en}</span></h1>
          <p className="text-gray-700 mt-2 prose-mini">{c.summary_md || <span className="text-gray-400">한 줄 소개가 아직 없어요</span>}</p>
          <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
            <div className="bg-leaf-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">햇빛</div><div className="font-semibold mt-0.5">{c.sunlight || '-'}</div></div>
            <div className="bg-leaf-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">물주기</div><div className="font-semibold mt-0.5">{c.water_freq_days}일에 1회</div></div>
            <div className="bg-leaf-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">흙</div><div className="font-semibold mt-0.5">{c.soil_pref || '-'}</div></div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700">규모:</span>
        {[5, 10, 20].map((n) => (
          <button key={n} onClick={()=>setPy(n)}
            className={`px-3 h-8 rounded-full text-sm border ${py === n ? 'bg-leaf-500 text-white border-leaf-500' : 'bg-white border-leaf-200 text-gray-700'}`}>{n}평</button>
        ))}
        <div className="ml-auto">
          <button onClick={addToMine} disabled={busy} className="btn-primary text-sm">{user ? `내 ${py}평 텃밭에 추가` : '로그인 후 추가'}</button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 mb-3">
        <h2 className="text-xl font-bold">🗓 월별 작업 ({py}평 기준)</h2>
        {user && (
          <a href={`#/crops/${id}/edit`} className="text-sm text-leaf-700 font-semibold">+ 작업 추가</a>
        )}
      </div>
      {months.length === 0 ? (
        <div className="bg-leaf-50 rounded-2xl p-5 text-center text-sm text-gray-600">
          <div className="text-2xl mb-1">🗓</div>
          <div>아직 등록된 월별 작업이 없어요.</div>
          {user && (
            <a href={`#/crops/${id}/edit`} className="inline-block mt-2 btn-primary text-sm">📝 첫 작업 추가하기</a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {months.map((m) => (
            <div key={m} className="bg-white rounded-2xl border border-leaf-100 p-4">
              <div className="font-bold text-leaf-700">{m}월</div>
              <ul className="mt-2 space-y-2">
                {byMonth[m].map((t) => (
                  <li key={t.id} className="text-sm">
                    <span className="font-semibold">{t.task_type}</span>
                    {t.week_in_month > 0 && <span className="text-xs text-gray-400"> · {m}월 {t.week_in_month}주차</span>}
                    {t.instructions_md && <span className="text-gray-700"> — {t.instructions_md}</span>}
                    {t[pyKey] && <span className="ml-2 text-xs text-leaf-700 font-semibold">📐 {t[pyKey]}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crop edit (정보·작업 보강)
// ---------------------------------------------------------------------------
const TASK_TYPES_UI = ['모종', '시비', '관수', '수확', '풀뽑기', '병해충관리'];
function CropEditPage({ id }) {
  const { user, loading: authLoading } = useAuth();
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // 작목 기본 정보
  const [category, setCategory] = useState('엽채');
  const [seasonStart, setSeasonStart] = useState(3);
  const [seasonEnd, setSeasonEnd] = useState(10);
  const [sunlight, setSunlight] = useState('');
  const [waterFreq, setWaterFreq] = useState(2);
  const [soilPref, setSoilPref] = useState('');
  const [summary, setSummary] = useState('');
  const [hero, setHero] = useState('');
  const [beginner, setBeginner] = useState(false);

  // 작업 추가 폼
  const [taskType, setTaskType] = useState('모종');
  const [taskMonth, setTaskMonth] = useState(4);
  const [taskWeek, setTaskWeek] = useState(0);
  const [taskInst, setTaskInst] = useState('');
  const [taskP5, setTaskP5] = useState('');
  const [taskP10, setTaskP10] = useState('');
  const [taskP20, setTaskP20] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskErr, setTaskErr] = useState('');

  useEffect(() => { if (!authLoading && !user) navigate('/login'); }, [authLoading, user]);

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/crops/${id}`);
      setC(data);
      setCategory(data.category || '엽채');
      setSeasonStart(data.season_start_month || 3);
      setSeasonEnd(data.season_end_month || 10);
      setSunlight(data.sunlight || '');
      setWaterFreq(data.water_freq_days || 2);
      setSoilPref(data.soil_pref || '');
      // 자동 생성 placeholder는 비워두기
      setSummary((data.summary_md || '').includes('직접 추가한 작목') ? '' : (data.summary_md || ''));
      setHero(data.hero_image_url || '');
      setBeginner(!!data.beginner_friendly);
    } catch (e) { setErr(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const saveInfo = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api(`/api/crops/${id}/info`, {
        method: 'PUT',
        body: JSON.stringify({
          category, season_start_month: seasonStart, season_end_month: seasonEnd,
          sunlight, water_freq_days: waterFreq, soil_pref: soilPref,
          summary_md: summary, hero_image_url: hero, beginner_friendly: beginner,
        }),
      });
      alert('정보가 저장됐어요 🌱');
      await load();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  const addTask = async (e) => {
    e.preventDefault(); setTaskErr(''); setTaskBusy(true);
    try {
      await api(`/api/crops/${id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          task_type: taskType, month: taskMonth, week_in_month: taskWeek,
          instructions_md: taskInst,
          per_5pyeong_amount: taskP5, per_10pyeong_amount: taskP10, per_20pyeong_amount: taskP20,
        }),
      });
      // reset 폼
      setTaskInst(''); setTaskP5(''); setTaskP10(''); setTaskP20('');
      await load();
    } catch (ex) { setTaskErr(ex.message); }
    finally { setTaskBusy(false); }
  };

  const removeTask = async (taskId) => {
    if (!confirm('이 작업을 삭제할까요? (관리자만 가능)')) return;
    try { await api(`/api/crops/${id}/tasks/${taskId}`, { method: 'DELETE' }); await load(); }
    catch (ex) { alert(ex.message); }
  };

  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const aiFill = async () => {
    if (!confirm(`"${c?.name_ko}" 재배 정보를 AI로 다시 채울까요?\n기본 정보와 월별 작업이 자동 생성됩니다.\n(기존 월별 작업은 모두 삭제돼요)`)) return;
    setAiBusy(true); setAiMsg('');
    try {
      await api(`/api/crops/${id}/ai-fill`, { method: 'POST', body: JSON.stringify({ replace_tasks: true }) });
      setAiMsg('✨ AI가 가이드를 새로 채웠어요!');
      await load();
      setTimeout(() => setAiMsg(''), 5000);
    } catch (ex) { setAiMsg('AI 생성 실패: ' + ex.message); }
    finally { setAiBusy(false); }
  };

  if (!user) return null;
  if (err && !c) return <div className="max-w-3xl mx-auto p-4 text-red-600">{err}</div>;
  if (!c) return <div className="max-w-3xl mx-auto p-8 text-center text-gray-400">불러오는 중...</div>;

  const tasksByMonth = {};
  (c.tasks || []).forEach(t => { (tasksByMonth[t.month] ||= []).push(t); });
  const months = Object.keys(tasksByMonth).map(Number).sort((a,b)=>a-b);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <a href={`#/crops/${id}`} className="text-leaf-700 text-xl">←</a>
        <h1 className="text-2xl font-bold flex-1">{c.name_ko} 정보 보강</h1>
        <button
          type="button" onClick={aiFill} disabled={aiBusy}
          className="text-xs px-3 h-9 rounded-full bg-leaf-500 text-white hover:bg-leaf-600 disabled:opacity-50"
          title="Google Gemini로 재배 정보·월별 작업을 자동 생성합니다"
        >{aiBusy ? '✨ 생성 중…' : '✨ AI로 자동 채우기'}</button>
      </div>
      {aiMsg && (
        <div className="text-sm bg-leaf-50 text-leaf-800 rounded-xl px-3 py-2 border border-leaf-200">{aiMsg}</div>
      )}

      {/* 1. 작목 기본 정보 */}
      <form onSubmit={saveInfo} className="bg-white rounded-2xl border border-leaf-100 p-5 space-y-3">
        <h2 className="font-bold flex items-center gap-1.5">📋 기본 정보</h2>
        <Field label="한 줄 소개">
          <textarea rows={2} maxLength={500} className="input" value={summary} onChange={(e)=>setSummary(e.target.value)}
            placeholder="예: 한 번 심으면 가을까지 잎을 따 먹어요. 향이 진해서 쌈에 잘 어울려요." />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="카테고리">
            <select className="input" value={category} onChange={(e)=>setCategory(e.target.value)}>
              {['엽채','과채','근채','곡류','허브'].map((x)=><option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="물주기 (일)">
            <input type="number" min={1} max={30} className="input" value={waterFreq}
              onChange={(e)=>setWaterFreq(Number(e.target.value))} />
          </Field>
          <Field label="시즌 시작월">
            <select className="input" value={seasonStart} onChange={(e)=>setSeasonStart(Number(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m)=><option key={m} value={m}>{m}월</option>)}
            </select>
          </Field>
          <Field label="시즌 종료월">
            <select className="input" value={seasonEnd} onChange={(e)=>setSeasonEnd(Number(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m)=><option key={m} value={m}>{m}월</option>)}
            </select>
          </Field>
          <Field label="햇빛">
            <input className="input" value={sunlight} onChange={(e)=>setSunlight(e.target.value)} placeholder="예: 양지 / 반양지" />
          </Field>
          <Field label="좋아하는 흙">
            <input className="input" value={soilPref} onChange={(e)=>setSoilPref(e.target.value)} placeholder="예: 비옥한 토양" />
          </Field>
        </div>
        <Field label="hero 이미지 URL (선택)" hint="ImageKit/외부 이미지 URL을 붙여 넣을 수 있어요. 없으면 🌱 기본 아이콘이 보여요.">
          <input className="input" value={hero} onChange={(e)=>setHero(e.target.value)} placeholder="https://..." />
        </Field>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-leaf-500" checked={beginner} onChange={(e)=>setBeginner(e.target.checked)} />
          <span>♥ 초보용 작목 (쉬워서 처음 시작하기 좋음)</span>
        </label>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button disabled={busy} className="btn-primary w-full">{busy ? '저장 중...' : '기본 정보 저장'}</button>
      </form>

      {/* 2. 월별 작업 목록 + 추가 폼 */}
      <div className="bg-white rounded-2xl border border-leaf-100 p-5 space-y-3">
        <h2 className="font-bold flex items-center gap-1.5">🗓 월별 작업 <span className="text-sm text-gray-500 font-normal">({(c.tasks || []).length}건)</span></h2>
        {months.length === 0 ? (
          <div className="text-sm text-gray-500 bg-leaf-50 rounded-xl p-4 text-center">
            아직 작업이 없어요. 아래에서 첫 작업을 추가해보세요 🌱
          </div>
        ) : (
          <div className="space-y-2">
            {months.map((m) => (
              <div key={m} className="rounded-xl border border-leaf-100 p-3">
                <div className="font-semibold text-leaf-700">{m}월</div>
                <ul className="mt-1 space-y-1">
                  {tasksByMonth[m].map((t) => (
                    <li key={t.id} className="text-sm flex gap-2 items-start">
                      <span className="font-semibold">{t.task_type}</span>
                      {t.week_in_month > 0 && <span className="text-xs text-gray-400">{m}월 {t.week_in_month}주차</span>}
                      <span className="text-gray-700 flex-1">{t.instructions_md || <span className="text-gray-400">(설명 없음)</span>}</span>
                      {t.per_5pyeong_amount && <span className="text-xs text-leaf-700 shrink-0">5평 {t.per_5pyeong_amount}</span>}
                      {user.role === 'admin' && (
                        <button onClick={()=>removeTask(t.id)} className="text-xs text-red-500 shrink-0">✕</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addTask} className="bg-leaf-50 rounded-xl p-4 mt-3 space-y-2">
          <div className="text-sm font-semibold text-gray-700">＋ 작업 추가</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="유형">
              <select className="input" value={taskType} onChange={(e)=>setTaskType(e.target.value)}>
                {TASK_TYPES_UI.map((x)=><option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="월">
              <select className="input" value={taskMonth} onChange={(e)=>setTaskMonth(Number(e.target.value))}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((m)=><option key={m} value={m}>{m}월</option>)}
              </select>
            </Field>
            <Field label="주차 (0=무관)">
              <select className="input" value={taskWeek} onChange={(e)=>setTaskWeek(Number(e.target.value))}>
                {[0,1,2,3,4,5].map((w)=><option key={w} value={w}>{w === 0 ? '—' : `${w}주차`}</option>)}
              </select>
            </Field>
          </div>
          <Field label="작업 설명">
            <input className="input" value={taskInst} onChange={(e)=>setTaskInst(e.target.value)}
              placeholder="예: 서리 끝난 후 모종. 줄간격 50cm, 지지대 같이 박기" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="5평 분량 (선택)">
              <input className="input" value={taskP5} onChange={(e)=>setTaskP5(e.target.value)} placeholder="예: 5그루" />
            </Field>
            <Field label="10평 분량 (선택)">
              <input className="input" value={taskP10} onChange={(e)=>setTaskP10(e.target.value)} placeholder="예: 10그루" />
            </Field>
            <Field label="20평 분량 (선택)">
              <input className="input" value={taskP20} onChange={(e)=>setTaskP20(e.target.value)} placeholder="예: 20그루" />
            </Field>
          </div>
          {taskErr && <div className="text-sm text-red-600">{taskErr}</div>}
          <button disabled={taskBusy} className="btn-primary w-full text-sm">{taskBusy ? '추가 중...' : '+ 작업 추가'}</button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
function LogsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState([]); const [err, setErr] = useState('');
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user]);
  const load = useCallback(async () => {
    if (!user) return;
    try { setItems(await api('/api/me/logs')); } catch (e) { setErr(e.message); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const onDelete = async (e, id, title) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`"${title}" 일지를 정말 삭제할까요?`)) return;
    try { await api(`/api/logs/${id}`, { method: 'DELETE' }); await load(); }
    catch (ex) { alert(ex.message); }
  };

  if (!user) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">📔 내 일지</h1>
          <p className="text-sm text-gray-500 mt-0.5">총 {items.length}개</p>
        </div>
        <a href="#/logs/new" className="btn-primary text-sm">+ 일지 쓰기</a>
      </div>
      {err && <div className="text-red-600 text-sm mb-2">{err}</div>}
      {items.length === 0 ? (
        <EmptyState
          icon="📔"
          title="아직 일지가 없어요"
          sub="이번 주말 사진 한 장과 한 줄로 남겨보세요"
          action={<a href="#/logs/new" className="inline-block mt-3 btn-primary text-sm">+ 첫 일지 쓰기</a>}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((l) => (
            <li key={l.id} className="relative bg-white rounded-2xl border border-leaf-100 hover:border-leaf-300 transition group">
              <a href={`#/logs/${l.id}`} className="block p-4 pr-24">
                <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                  <span>{formatDate(l.log_date)}</span>
                  {l.crops && l.crops.length > 0 && <span>· 🌱 {l.crops.map((c) => c.name_ko).join(', ')}</span>}
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {l.visibility === 'private' ? '🔒 비공개' : l.visibility === 'friends' ? '👥 친구공개' : '🌐 전체공개'}
                  </span>
                </div>
                <div className="font-bold mt-1">{l.title}</div>
                <div className="text-sm text-gray-700 line-clamp-2 mt-1">{l.body_md}</div>
                {l.image_urls && l.image_urls.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {l.image_urls.slice(0,3).map((u,i)=>(<img key={i} src={u} className="w-16 h-16 rounded-md object-cover" />))}
                  </div>
                )}
              </a>
              <div className="absolute top-3 right-3 flex gap-1">
                <a href={`#/logs/${l.id}/edit`}
                  className="px-2 py-1 rounded-md text-xs bg-leaf-50 text-leaf-700 hover:bg-leaf-100 border border-leaf-200">
                  ✎ 수정
                </a>
                <button onClick={(e) => onDelete(e, l.id, l.title)}
                  className="px-2 py-1 rounded-md text-xs bg-red-50 text-red-600 hover:bg-red-100 border border-red-200">
                  ✕ 삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PublicLogsPage() {
  const [items, setItems] = useState([]); const [err, setErr] = useState('');
  useEffect(() => {
    (async () => { try { setItems(await api('/api/logs/public/feed')); } catch (e) { setErr(e.message); } })();
  }, []);
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">🌸 둘러보기 — 공개 일지</h1>
      <p className="text-sm text-gray-500 mb-4">다른 텃밭러의 한 주말</p>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      {items.length === 0 ? (
        <EmptyState icon="🌸" title="아직 공개 일지가 없어요" />
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((l) => (
            <li key={l.id}>
              <a href={`#/logs/${l.id}`} className="block bg-white rounded-2xl border border-leaf-100 p-4 hover:border-leaf-300">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{l.avatar_emoji}</span>
                  <span className="font-semibold">{l.display_name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{formatDate(l.log_date)}</span>
                </div>
                <div className="font-bold mt-1.5">{l.title}</div>
                <div className="text-sm text-gray-600 line-clamp-2 mt-1">{l.body_md}</div>
                {l.crop_name && <div className="text-xs text-leaf-700 mt-1">🌱 {l.crop_name}</div>}
                {l.image_urls && l.image_urls.length > 0 && <img src={l.image_urls[0]} className="w-full aspect-video object-cover rounded-lg mt-2" />}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LogFormPage({ id }) {
  const { user, loading: authLoading } = useAuth();
  const isEdit = !!id;
  const [crops, setCrops] = useState([]);
  const [cropIds, setCropIds] = useState([]); // 다중 선택
  const [log_date, setDate] = useState(formatDate(new Date()));
  const [title, setTitle] = useState(''); const [body_md, setBody] = useState('');
  const [images, setImages] = useState([]); const [mood, setMood] = useState('보통');
  const [visibility, setVis] = useState('private');
  const [uploading, setUploading] = useState(false); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef();

  useEffect(() => { if (!authLoading && !user) navigate('/login'); }, [authLoading, user]);
  useEffect(() => { (async () => { try { setCrops(await api('/api/crops')); } catch {} })(); }, []);
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const l = await api(`/api/logs/${id}`);
        if (l.user_id !== user?.id) { setErr('본인 일지만 수정 가능'); return; }
        const ids = Array.isArray(l.crops) && l.crops.length ? l.crops.map((c) => c.id) : (l.crop_id ? [l.crop_id] : []);
        setCropIds(ids);
        setDate(formatDate(l.log_date)); setTitle(l.title);
        setBody(l.body_md); setImages(l.image_urls || []); setMood(l.mood); setVis(l.visibility);
      } catch (e) { setErr(e.message); }
    })();
  }, [id, isEdit, user]);

  const toggleCrop = (cid) => {
    setCropIds((prev) => prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid].slice(0, 10));
  };

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickCat, setQuickCat] = useState('엽채');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickErr, setQuickErr] = useState('');
  const [quickNotice, setQuickNotice] = useState('');
  const handleQuickAdd = async () => {
    setQuickErr(''); setQuickNotice('');
    const n = quickName.trim();
    if (!n) { setQuickErr('작목명을 적어주세요'); return; }
    setQuickBusy(true);
    try {
      const created = await api('/api/crops/quick', {
        method: 'POST',
        body: JSON.stringify({ name_ko: n, category: quickCat }),
      });
      // 목록에 없으면 추가, 자동 토글 ON
      setCrops((prev) => prev.find((c) => c.id === created.id) ? prev : [...prev, created]);
      setCropIds((prev) => prev.includes(created.id) ? prev : [...prev, created.id].slice(0, 10));
      setQuickName(''); setQuickCat('엽채'); setShowQuickAdd(false);
      if (created.reused) {
        setQuickNotice(`이미 있던 ${created.name_ko}을(를) 선택했어요.`);
      } else if (created.ai_filled) {
        setQuickNotice(`✨ ${created.name_ko} 재배 가이드를 AI가 만들어줬어요. 작목 상세에서 확인해보세요!`);
      } else if (created.ai_error) {
        setQuickNotice(`${created.name_ko}을(를) 추가했어요. AI 가이드 생성은 실패해서 직접 채워야 해요.`);
      }
      setTimeout(() => setQuickNotice(''), 6000);
    } catch (e) { setQuickErr(e.message); }
    finally { setQuickBusy(false); }
  };

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remain = 5 - images.length;
    const list = files.slice(0, remain);
    setUploading(true); setErr('');
    try {
      const urls = [];
      for (const f of list) {
        if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name}: 10MB 이하`);
        urls.push(await uploadImage(f));
      }
      setImages((p) => [...p, ...urls].slice(0, 5));
    } catch (ex) { setErr(ex.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const payload = { crop_ids: cropIds, log_date, title, body_md, image_urls: images, mood, visibility };
      if (isEdit) {
        await api(`/api/logs/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        navigate(`/logs/${id}`);
      } else {
        const created = await api('/api/logs', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`/logs/${created.id}`);
      }
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!confirm('일지를 삭제할까요?')) return;
    try { await api(`/api/logs/${id}`, { method: 'DELETE' }); navigate('/me/logs'); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">{isEdit ? '일지 수정' : '오늘 텃밭 어땠어요?'}</h1>
      <form onSubmit={submit} className="space-y-3">
        <Field label="날짜"><input type="date" required className="input" value={log_date} onChange={(e)=>setDate(e.target.value)} /></Field>
        <Field label={`작목 (선택, 여러 개 가능 — ${cropIds.length}개 선택됨)`} hint="필요한 작목을 모두 눌러주세요. 다시 누르면 해제돼요. 없으면 + 새 작목으로 추가할 수 있어요.">
          <div className="flex flex-wrap gap-1.5">
            {crops.map((c) => {
              const active = cropIds.includes(c.id);
              return (
                <button
                  type="button" key={c.id} onClick={() => toggleCrop(c.id)}
                  className={`px-3 h-9 rounded-full text-sm border transition ${active ? 'bg-leaf-500 text-white border-leaf-500' : 'bg-white border-leaf-200 text-gray-700 hover:border-leaf-400'}`}
                >
                  {active && '✓ '}{c.name_ko}
                </button>
              );
            })}
            {!showQuickAdd && (
              <button
                type="button" onClick={() => setShowQuickAdd(true)}
                className="px-3 h-9 rounded-full text-sm border border-dashed border-leaf-400 text-leaf-700 hover:bg-leaf-50"
              >+ 새 작목</button>
            )}
          </div>
          {showQuickAdd && (
            <div className="mt-2 bg-leaf-50 rounded-xl p-3 border border-leaf-100">
              <div className="text-xs text-gray-600 mb-2">목록에 없는 작목을 추가할게요. 작목명만 적으면 ✨AI가 재배 가이드까지 자동으로 채워줘요 🌱</div>
              <div className="flex gap-2 flex-wrap">
                <input
                  className="input flex-1 min-w-[140px]"
                  placeholder="예: 들깨, 바질, 옥수수 …"
                  maxLength={20}
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleQuickAdd();
                    }
                  }}
                />
                <select className="input flex-none w-32" value={quickCat} onChange={(e) => setQuickCat(e.target.value)}>
                  {['엽채','과채','근채','곡류','허브'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {quickErr && <div className="text-xs text-red-600 mt-2">{quickErr}</div>}
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={handleQuickAdd} disabled={quickBusy || !quickName.trim()}
                  className="btn-primary text-sm flex-1">{quickBusy ? '✨ AI가 가이드 만드는 중…' : '+ 추가 (AI 자동 채움)'}</button>
                <button type="button" onClick={() => { setShowQuickAdd(false); setQuickName(''); setQuickErr(''); }}
                  className="btn-ghost text-sm">취소</button>
              </div>
            </div>
          )}
          {quickNotice && (
            <div className="mt-2 text-xs bg-leaf-100 text-leaf-800 rounded-lg px-3 py-2 border border-leaf-200">
              {quickNotice}
            </div>
          )}
        </Field>
        <Field label="제목"><input required maxLength={80} className="input" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="예: 상추 첫 모종 심기" /></Field>
        <Field label="내용 (자유롭게)"><textarea rows={6} maxLength={4000} className="input" value={body_md} onChange={(e)=>setBody(e.target.value)} placeholder="비 와서 풀이 무성했어요 ☔ 다음주 풀뽑기부터..." /></Field>
        <Field label={`사진 (${images.length}/5)`}>
          <div className="flex gap-2 flex-wrap">
            {images.map((u, i) => (
              <div key={u + i} className="relative w-24 h-24">
                <img src={u} className="w-24 h-24 object-cover rounded-lg" />
                <button type="button" onClick={()=>setImages(p=>p.filter((_,j)=>j!==i))}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/70 text-white text-xs">✕</button>
              </div>
            ))}
            {images.length < 5 && (
              <button type="button" onClick={()=>fileRef.current?.click()} disabled={uploading}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-leaf-300 flex flex-col items-center justify-center text-leaf-500">
                <span className="text-2xl">{uploading ? '⏳' : '＋'}</span>
                <span className="text-xs">{uploading ? '업로드중' : '사진추가'}</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPickFiles} className="hidden" />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="기분">
            <select className="input" value={mood} onChange={(e)=>setMood(e.target.value)}>
              <option value="좋음">😊 좋음</option>
              <option value="보통">🙂 보통</option>
              <option value="힘듦">😣 힘듦</option>
            </select>
          </Field>
          <Field label="공개 범위">
            <select className="input" value={visibility} onChange={(e)=>setVis(e.target.value)}>
              <option value="private">🔒 비공개 (나만)</option>
              <option value="friends">👥 친구공개 (링크)</option>
              <option value="public">🌐 전체공개</option>
            </select>
          </Field>
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex gap-2">
          <button disabled={busy || uploading} className="btn-primary flex-1">{busy ? '저장 중...' : isEdit ? '수정 완료' : '일지 저장'}</button>
          {isEdit && <button type="button" onClick={onDelete} className="px-4 h-11 rounded-lg bg-red-50 text-red-600 font-semibold hover:bg-red-100">삭제</button>}
        </div>
      </form>
    </div>
  );
}

function LogDetailPage({ id }) {
  const { user } = useAuth();
  const [l, setL] = useState(null); const [err, setErr] = useState('');
  const [lightbox, setLightbox] = useState(null);
  useEffect(() => {
    (async () => { try { setL(await api(`/api/logs/${id}`)); } catch (e) { setErr(e.message); } })();
  }, [id]);
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);
  if (err) return <div className="max-w-2xl mx-auto p-4 text-red-600">{err}</div>;
  if (!l) return <div className="max-w-2xl mx-auto p-8 text-center text-gray-400">불러오는 중...</div>;
  const isOwner = user?.id === l.user_id;
  const imgs = Array.isArray(l.image_urls) ? l.image_urls : [];
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="bg-white rounded-3xl border border-leaf-100 overflow-hidden">
        {imgs.length > 0 && (
          <div className="bg-leaf-50">
            <button type="button" onClick={()=>setLightbox(0)} className="block w-full">
              <img src={imgs[0]} className="w-full aspect-[4/3] object-cover" />
            </button>
            {imgs.length > 1 && (
              <div className="grid grid-cols-2 gap-1 p-1">
                {imgs.slice(1).map((u, i) => (
                  <button key={u + i} type="button" onClick={()=>setLightbox(i+1)} className="block">
                    <img src={u} className="w-full aspect-square object-cover rounded-md" />
                  </button>
                ))}
              </div>
            )}
            <div className="px-4 pb-2 text-xs text-gray-500 text-right">📷 {imgs.length}장 · 이미지를 누르면 크게 볼 수 있어요</div>
          </div>
        )}
        {lightbox !== null && imgs[lightbox] && (
          <div onClick={()=>setLightbox(null)} className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
            <img src={imgs[lightbox]} className="max-w-full max-h-full object-contain" onClick={(e)=>e.stopPropagation()} />
            <button onClick={()=>setLightbox(null)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white text-xl">✕</button>
            {imgs.length > 1 && (
              <>
                <button onClick={(e)=>{e.stopPropagation(); setLightbox((lightbox - 1 + imgs.length) % imgs.length);}} className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 text-white text-2xl">‹</button>
                <button onClick={(e)=>{e.stopPropagation(); setLightbox((lightbox + 1) % imgs.length);}} className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 text-white text-2xl">›</button>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm">{lightbox + 1} / {imgs.length}</div>
              </>
            )}
          </div>
        )}
        <div className="p-5">
          <div className="flex items-center gap-2">
            <span className="text-xl">{l.avatar_emoji}</span>
            <span className="font-semibold">{l.display_name}</span>
            <span className="text-xs text-gray-400 ml-auto">{formatDate(l.log_date)} · {l.mood}</span>
          </div>
          <h1 className="text-xl font-bold mt-2">{l.title}</h1>
          {l.crops && l.crops.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {l.crops.map((c) => (
                <a key={c.id} href={`#/crops/${c.id}`} className="text-xs px-2 py-0.5 rounded-full bg-leaf-50 text-leaf-700 hover:bg-leaf-100">
                  🌱 {c.name_ko}
                </a>
              ))}
            </div>
          )}
          <p className="mt-3 text-gray-800 prose-mini">{l.body_md}</p>
          {isOwner && (
            <div className="mt-5 flex gap-2">
              <a href={`#/logs/${l.id}/edit`} className="btn-ghost text-sm">수정</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------
const BUDGET_CATS = ['모종/씨앗','비료/퇴비','농약','도구','임차료','운반비','기타'];
function BudgetPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState([]); const [summary, setSummary] = useState(null);
  const [month, setMonth] = useState(thisMonthYM());
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [list, sum] = await Promise.all([
        api(`/api/budgets?month=${month}`),
        api(`/api/budgets/summary?month=${month}`),
      ]);
      setItems(list); setSummary(sum);
    } catch (e) { setErr(e.message); }
  }, [user, month]);
  useEffect(() => { load(); }, [load]);

  const totalExpense = (summary?.byCategory || []).filter(r => r.kind === 'expense').reduce((s, r) => s + r.total, 0);
  const totalIncome = (summary?.byCategory || []).filter(r => r.kind === 'income').reduce((s, r) => s + r.total, 0);

  if (!user) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">💰 농사 가계부</h1>
        <button onClick={()=>setShowForm(s=>!s)} className="btn-primary text-sm">{showForm ? '닫기' : '+ 입력'}</button>
      </div>

      <div className="bg-white rounded-2xl border border-leaf-100 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-gray-500">월</span>
          <input type="month" value={month} onChange={(e)=>setMonth(e.target.value)} className="input flex-none" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-red-50 rounded-lg p-3"><div className="text-xs text-red-600">지출</div><div className="font-bold text-lg mt-0.5">{formatPrice(totalExpense)}</div></div>
          <div className="bg-emerald-50 rounded-lg p-3"><div className="text-xs text-emerald-700">수입</div><div className="font-bold text-lg mt-0.5">{formatPrice(totalIncome)}</div></div>
          <div className="bg-leaf-50 rounded-lg p-3"><div className="text-xs text-leaf-700">차액</div><div className="font-bold text-lg mt-0.5">{formatPrice(totalIncome - totalExpense)}</div></div>
        </div>
        {summary && summary.byCategory.length > 0 && (
          <div className="mt-3">
            <div className="text-sm font-semibold text-gray-700 mb-1">카테고리별</div>
            <div className="space-y-1">
              {summary.byCategory.map((r, i) => (
                <div key={i} className="flex items-center text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs mr-2 ${r.kind === 'expense' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.kind === 'expense' ? '지출' : '수입'}</span>
                  <span>{r.category}</span>
                  <span className="ml-auto font-semibold">{formatPrice(r.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && <BudgetForm onSaved={()=>{ load(); setShowForm(false); }} />}

      {err && <div className="text-red-600 text-sm">{err}</div>}
      <ul className="space-y-2 mt-4">
        {items.length === 0 ? (
          <EmptyState icon="💰" title={`${month}에 입력된 항목이 없어요`} />
        ) : items.map((b) => (
          <li key={b.id} className="bg-white rounded-xl border border-leaf-100 p-3 flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${b.kind === 'expense' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{b.kind === 'expense' ? '지출' : '수입'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{b.memo || b.category}</div>
              <div className="text-xs text-gray-500">{formatDate(b.occurred_at)} · {b.category}</div>
            </div>
            <div className="font-bold">{formatPrice(b.amount)}</div>
            <button onClick={async()=>{ if(confirm('삭제할까요?')) { await api(`/api/budgets/${b.id}`, { method: 'DELETE' }); load(); } }} className="text-xs text-red-500 hover:text-red-700">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BudgetForm({ onSaved }) {
  const [kind, setKind] = useState('expense'); const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(BUDGET_CATS[0]); const [memo, setMemo] = useState('');
  const [occurred_at, setDate] = useState(formatDate(new Date()));
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await api('/api/budgets', { method: 'POST', body: JSON.stringify({ kind, amount: Number(amount), category, memo, occurred_at }) });
      setAmount(''); setMemo('');
      onSaved();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-leaf-100 p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="구분">
          <select className="input" value={kind} onChange={(e)=>setKind(e.target.value)}>
            <option value="expense">지출</option><option value="income">수입</option>
          </select>
        </Field>
        <Field label="카테고리">
          <select className="input" value={category} onChange={(e)=>setCategory(e.target.value)}>
            {BUDGET_CATS.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="금액 (원)"><input type="number" min={1} required className="input" value={amount} onChange={(e)=>setAmount(e.target.value)} /></Field>
        <Field label="날짜"><input type="date" required className="input" value={occurred_at} onChange={(e)=>setDate(e.target.value)} /></Field>
      </div>
      <Field label="메모"><input className="input" value={memo} onChange={(e)=>setMemo(e.target.value)} placeholder="예: 모종시장에서 상추 6포기 + 깻잎 5포기" /></Field>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button disabled={busy} className="btn-primary w-full">{busy ? '저장 중...' : '저장'}</button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
const BOARDS_UI = ['전체','질문','자랑','정보','자유'];
function BoardPage() {
  const route = useHashRoute();
  const [board, setBoard] = useState(route.params.get('board') || '');
  const [items, setItems] = useState([]); const [err, setErr] = useState('');
  const { user } = useAuth();
  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (board) qs.set('board', board);
        setItems(await api('/api/posts' + (qs.toString() ? '?' + qs.toString() : '')));
      } catch (e) { setErr(e.message); }
    })();
  }, [board]);
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">💬 게시판</h1>
        {user && <a href="#/posts/new" className="btn-primary text-sm">+ 글 쓰기</a>}
      </div>
      <div className="flex gap-2 mb-4">
        {BOARDS_UI.map((b) => {
          const v = b === '전체' ? '' : b;
          const active = board === v;
          return (
            <button key={b} onClick={()=>setBoard(v)} className={`px-3 h-9 rounded-full text-sm border ${active ? 'bg-leaf-500 text-white border-leaf-500' : 'bg-white border-leaf-200 text-gray-700'}`}>{b}</button>
          );
        })}
      </div>
      {err && <div className="text-red-600 text-sm">{err}</div>}
      {items.length === 0 ? (
        <EmptyState icon="💬" title="아직 글이 없어요" sub={user ? '첫 글을 남겨주세요' : '로그인 후 글을 남길 수 있어요'} />
      ) : (
        <ul className="bg-white rounded-2xl border border-leaf-100 divide-y divide-leaf-100">
          {items.map((p) => (
            <li key={p.id}>
              <a href={`#/posts/${p.id}`} className="block p-4 hover:bg-leaf-50/40">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="px-1.5 py-0.5 rounded bg-leaf-50 text-leaf-700 font-semibold">{p.board}</span>
                  <span>{p.avatar_emoji} {p.display_name}</span>
                  <span className="ml-auto">{formatTimeAgo(p.created_at)}</span>
                </div>
                <div className="font-bold mt-1">{p.title}</div>
                <div className="text-sm text-gray-600 line-clamp-2 mt-0.5">{p.body_md}</div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                  <span>💬 {p.comment_count}</span>
                  <span>♥ {p.like_count}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PostFormPage() {
  const { user, loading } = useAuth();
  const [board, setBoard] = useState('질문'); const [title, setTitle] = useState('');
  const [body_md, setBody] = useState(''); const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''); const fileRef = useRef();
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user]);
  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remain = 5 - images.length;
    setUploading(true);
    try {
      const urls = [];
      for (const f of files.slice(0, remain)) urls.push(await uploadImage(f));
      setImages(p => [...p, ...urls].slice(0, 5));
    } catch (ex) { setErr(ex.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api('/api/posts', { method: 'POST', body: JSON.stringify({ board, title, body_md, image_urls: images }) });
      navigate(`/posts/${r.id}`);
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  if (!user) return null;
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">글 쓰기</h1>
      <form onSubmit={submit} className="space-y-3">
        <Field label="게시판">
          <select className="input" value={board} onChange={(e)=>setBoard(e.target.value)}>
            {['질문','자랑','정보','자유'].map(b=><option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="제목"><input required maxLength={80} className="input" value={title} onChange={(e)=>setTitle(e.target.value)} /></Field>
        <Field label="내용"><textarea rows={8} maxLength={4000} className="input" value={body_md} onChange={(e)=>setBody(e.target.value)} /></Field>
        <Field label={`사진 (${images.length}/5)`}>
          <div className="flex gap-2 flex-wrap">
            {images.map((u, i) => (
              <div key={u + i} className="relative w-24 h-24">
                <img src={u} className="w-24 h-24 object-cover rounded-lg" />
                <button type="button" onClick={()=>setImages(p=>p.filter((_,j)=>j!==i))} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/70 text-white text-xs">✕</button>
              </div>
            ))}
            {images.length < 5 && (
              <button type="button" onClick={()=>fileRef.current?.click()} disabled={uploading} className="w-24 h-24 rounded-lg border-2 border-dashed border-leaf-300 flex flex-col items-center justify-center text-leaf-500">
                <span className="text-2xl">{uploading ? '⏳' : '＋'}</span>
                <span className="text-xs">{uploading ? '업로드중' : '사진추가'}</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPickFiles} className="hidden" />
          </div>
        </Field>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button disabled={busy || uploading} className="btn-primary w-full">{busy ? '저장 중...' : '글 올리기'}</button>
      </form>
    </div>
  );
}

function PostDetailPage({ id }) {
  const { user } = useAuth();
  const [p, setP] = useState(null); const [err, setErr] = useState('');
  const [comment, setComment] = useState(''); const [busy, setBusy] = useState(false);
  const load = async () => { try { setP(await api(`/api/posts/${id}`)); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(); }, [id]);
  const sendComment = async (e) => {
    e.preventDefault();
    if (!user) { navigate('/login'); return; }
    if (!comment.trim()) return;
    setBusy(true);
    try { await api(`/api/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: comment }) }); setComment(''); await load(); }
    catch (ex) { alert(ex.message); }
    finally { setBusy(false); }
  };
  const toggleLike = async () => {
    if (!user) { navigate('/login'); return; }
    try {
      if (p.my_liked) await api(`/api/posts/${id}/like`, { method: 'DELETE' });
      else await api(`/api/posts/${id}/like`, { method: 'POST' });
      await load();
    } catch (e) { alert(e.message); }
  };
  const onDelete = async () => {
    if (!confirm('정말 삭제할까요?')) return;
    try { await api(`/api/posts/${id}`, { method: 'DELETE' }); navigate('/board'); }
    catch (e) { alert(e.message); }
  };
  if (err) return <div className="max-w-2xl mx-auto p-4 text-red-600">{err}</div>;
  if (!p) return <div className="max-w-2xl mx-auto p-8 text-center text-gray-400">불러오는 중...</div>;
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="bg-white rounded-2xl border border-leaf-100 p-5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="px-1.5 py-0.5 rounded bg-leaf-50 text-leaf-700 font-semibold">{p.board}</span>
          <span>{p.avatar_emoji} {p.display_name}</span>
          <span className="ml-auto">{formatTimeAgo(p.created_at)}</span>
        </div>
        <h1 className="text-xl font-bold mt-2">{p.title}</h1>
        <p className="mt-3 text-gray-800 prose-mini">{p.body_md}</p>
        {p.image_urls && p.image_urls.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            {p.image_urls.map((u, i) => <img key={i} src={u} className="rounded-lg w-full aspect-video object-cover" />)}
          </div>
        )}
        <div className="flex items-center gap-3 mt-4">
          <button onClick={toggleLike} className={`px-3 h-9 rounded-full border text-sm ${p.my_liked ? 'bg-pink-50 border-pink-300 text-pink-700' : 'border-leaf-200 text-gray-700'}`}>
            {p.my_liked ? '♥' : '♡'} {p.like_count}
          </button>
          {(p.is_owner || user?.role === 'admin') && (
            <button onClick={onDelete} className="text-sm text-red-500 hover:text-red-700 ml-auto">삭제</button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <h2 className="font-bold mb-2">💬 댓글 {p.comments.length}</h2>
        <ul className="space-y-2">
          {p.comments.map((c) => (
            <li key={c.id} className="bg-white rounded-xl border border-leaf-100 p-3">
              <div className="text-xs text-gray-500">{c.avatar_emoji} {c.display_name} · {formatTimeAgo(c.created_at)}</div>
              <div className="text-sm mt-1">{c.body}</div>
            </li>
          ))}
        </ul>
        <form onSubmit={sendComment} className="mt-3 flex gap-2">
          <input className="input flex-1" placeholder={user ? '댓글을 남겨주세요' : '로그인 후 댓글 가능'} value={comment} onChange={(e)=>setComment(e.target.value)} />
          <button disabled={busy || !user} className="btn-primary text-sm">전송</button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MyPage
// ---------------------------------------------------------------------------
function MyPage() {
  const { user, loading, setUser } = useAuth();
  const [myCrops, setMyCrops] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user]);
  const load = async () => {
    try {
      const [c, l] = await Promise.all([api('/api/me/crops'), api('/api/me/logs')]);
      setMyCrops(c);
      setRecentLogs((l || []).slice(0, 3));
    } catch {}
  };
  useEffect(() => { if (user) load(); }, [user]);
  const removeCrop = async (id) => {
    if (!confirm('내 작물에서 빼낼까요?')) return;
    try { await api(`/api/me/crops/${id}`, { method: 'DELETE' }); load(); }
    catch (e) { alert(e.message); }
  };
  if (!user) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">🌿 내 텃밭</h1>

      {!editing ? (
        <div className="bg-white rounded-2xl border border-leaf-100 p-4 flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-leaf-50 flex items-center justify-center text-3xl">{user.avatar_emoji}</div>
          <div className="flex-1">
            <div className="font-bold">{user.display_name} {user.role === 'admin' && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 ml-1">ADMIN</span>}</div>
            <div className="text-sm text-gray-500">{user.region_sido} {user.region_sigungu}</div>
            <div className="text-xs text-gray-400 mt-0.5">{user.email}</div>
          </div>
          <button onClick={()=>setEditing(true)} className="text-sm text-leaf-700 font-semibold">프로필 수정</button>
        </div>
      ) : (
        <ProfileEdit user={user} onCancel={()=>setEditing(false)} onSaved={(u)=>{ setUser(u); setEditing(false); }} />
      )}

      <h2 className="font-bold mt-6 mb-3">🌱 내가 키우는 작물</h2>
      {myCrops.length === 0 ? (
        <EmptyState icon="🌱" title="아직 등록한 작물이 없어요" sub="작목 가이드에서 마음에 드는 걸 골라보세요" action={<a href="#/crops" className="inline-block mt-3 btn-ghost">작목 둘러보기</a>} />
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {myCrops.map((c) => (
            <li key={c.id} className="bg-white rounded-2xl border border-leaf-100 p-3">
              <div className="flex items-start gap-2">
                <CropThumb url={c.hero_image_url} emoji={c.emoji} name={c.name_ko} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name_ko}</div>
                  <div className="text-xs text-gray-500">{Number(c.area_pyeong)}평 · {formatDate(c.planted_at)}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <a href={`#/crops/${c.crop_id}`} className="text-xs text-leaf-700 font-semibold">가이드</a>
                <button onClick={()=>removeCrop(c.id)} className="text-xs text-red-500 ml-auto">제거</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <a href="#/me/logs" className="bg-white rounded-2xl border border-leaf-100 p-4 text-center hover:border-leaf-300">
          <div className="text-2xl">📔</div>
          <div className="font-semibold mt-1">내 일지</div>
        </a>
        <a href="#/me/budget" className="bg-white rounded-2xl border border-leaf-100 p-4 text-center hover:border-leaf-300">
          <div className="text-2xl">💰</div>
          <div className="font-semibold mt-1">가계부</div>
        </a>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">📔 최근 일지</h2>
          <div className="flex gap-2">
            <a href="#/logs/new" className="text-sm text-leaf-700 font-semibold">+ 쓰기</a>
            <span className="text-gray-300">·</span>
            <a href="#/me/logs" className="text-sm text-leaf-700 font-semibold">전체 보기 →</a>
          </div>
        </div>
        {recentLogs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-leaf-100 p-6 text-center text-gray-500 text-sm">
            아직 일지가 없어요. 첫 일지를 남겨보세요 🌱
          </div>
        ) : (
          <ul className="space-y-2">
            {recentLogs.map((l) => (
              <li key={l.id}>
                <a href={`#/logs/${l.id}`} className="block bg-white rounded-2xl border border-leaf-100 p-3 hover:border-leaf-300">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{formatDate(l.log_date)}</span>
                    {l.crops && l.crops.length > 0 && <span>· 🌱 {l.crops.map((c) => c.name_ko).join(', ')}</span>}
                    <span className="ml-auto">{l.visibility === 'private' ? '🔒' : l.visibility === 'friends' ? '👥' : '🌐'}</span>
                  </div>
                  <div className="font-semibold mt-0.5 truncate">{l.title}</div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProfileEdit({ user, onCancel, onSaved }) {
  const [display_name, setDn] = useState(user.display_name);
  const [region_sido, setSido] = useState(user.region_sido || '');
  const [region_sigungu, setSigu] = useState(user.region_sigungu || '');
  const [avatar_emoji, setAv] = useState(user.avatar_emoji);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const u = await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ display_name, region_sido, region_sigungu, avatar_emoji }) });
      onSaved(u);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-2xl border border-leaf-100 p-4 space-y-3">
      <Field label="닉네임"><input className="input" value={display_name} onChange={(e)=>setDn(e.target.value)} /></Field>
      <Field label="지역">
        <div className="flex gap-2">
          <select className="input flex-1" value={region_sido} onChange={(e)=>setSido(e.target.value)}>
            <option value="">시·도 선택</option>
            {SIDOS.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <input className="input flex-1" value={region_sigungu} onChange={(e)=>setSigu(e.target.value)} />
        </div>
      </Field>
      <Field label="아바타"><EmojiPicker value={avatar_emoji} onChange={setAv} /></Field>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="btn-primary flex-1">{busy ? '저장중' : '저장'}</button>
        <button onClick={onCancel} className="btn-ghost">취소</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null); const [users, setUsers] = useState([]);
  const [crops, setCrops] = useState([]); const [err, setErr] = useState('');
  useEffect(() => { if (!loading && (!user || user.role !== 'admin')) navigate('/'); }, [loading, user]);
  const load = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    try {
      const [s, u, c] = await Promise.all([api('/api/admin/stats'), api('/api/admin/users'), api('/api/crops')]);
      setStats(s); setUsers(u); setCrops(c);
    } catch (e) { setErr(e.message); }
  }, [user]);
  useEffect(() => { load(); }, [load]);
  const deleteUser = async (u) => {
    if (u.id === user.id) return alert('본인은 삭제 불가');
    if (!confirm(`${u.display_name} 삭제할까요?\n관련 데이터 모두 삭제됩니다`)) return;
    try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); load(); }
    catch (e) { alert(e.message); }
  };
  const deleteCrop = async (c) => {
    if (!confirm(`작목 "${c.name_ko}" 삭제할까요?`)) return;
    try { await api(`/api/admin/crops/${c.id}`, { method: 'DELETE' }); load(); }
    catch (e) { alert(e.message); }
  };
  if (!user || user.role !== 'admin') return null;
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
        <div className="font-bold text-amber-900 flex items-center gap-2"><span className="text-xl">👑</span> 관리자 대시보드</div>
        <div className="text-xs text-amber-700/80 mt-0.5">{user.email}</div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[['users','사용자'],['crops','작목'],['crop_tasks','작업'],['user_crops','내작물'],['logs','일지'],['budgets','가계부'],['posts','게시글'],['comments','댓글']].map(([k, l]) => (
            <div key={k} className="bg-white rounded-xl border border-leaf-100 p-3 text-center">
              <div className="text-xs text-gray-500">{l}</div>
              <div className="text-xl font-bold mt-0.5">{stats[k]}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex bg-white rounded-xl border border-leaf-100 overflow-hidden text-sm font-semibold mb-3">
        {[['stats','통계'],['users',`사용자 (${users.length})`],['crops',`작목 (${crops.length})`]].map(([k, l]) => (
          <button key={k} onClick={()=>setTab(k)} className={`flex-1 py-3 ${tab === k ? 'bg-leaf-500 text-white' : 'text-gray-600 hover:bg-leaf-50'}`}>{l}</button>
        ))}
      </div>

      {err && <div className="text-red-600 text-sm mb-2">{err}</div>}

      {tab === 'users' && (
        <ul className="bg-white rounded-2xl border border-leaf-100 divide-y divide-leaf-100">
          {users.map((u) => (
            <li key={u.id} className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-leaf-50 flex items-center justify-center text-2xl">{u.avatar_emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-1.5">
                  {u.display_name}
                  {u.role === 'admin' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">ADMIN</span>}
                  {u.id === user.id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">나</span>}
                </div>
                <div className="text-xs text-gray-500 truncate">{u.email} · {u.region_sido} {u.region_sigungu}</div>
              </div>
              <button onClick={()=>deleteUser(u)} disabled={u.id === user.id} className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-30">삭제</button>
            </li>
          ))}
        </ul>
      )}

      {tab === 'crops' && (
        <ul className="bg-white rounded-2xl border border-leaf-100 divide-y divide-leaf-100">
          {crops.map((c) => (
            <li key={c.id} className="p-3 flex items-center gap-3">
              <CropThumb url={c.hero_image_url} emoji={c.emoji} name={c.name_ko} size="sm" />
              <div className="flex-1 min-w-0">
                <a href={`#/crops/${c.id}`} className="font-semibold hover:text-leaf-700">{c.name_ko}</a>
                <div className="text-xs text-gray-500">{c.category} · {c.season_start_month}~{c.season_end_month}월 {c.beginner_friendly && '· 초보♥'}</div>
              </div>
              <button onClick={()=>deleteCrop(c)} className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50">삭제</button>
            </li>
          ))}
        </ul>
      )}

      {tab === 'stats' && stats && (
        <div className="bg-white rounded-2xl border border-leaf-100 p-4 text-sm">
          <div className="text-gray-700">전체 통계는 위 카드 참고. 추가 지표는 v1.1에서 차트로 보강 예정.</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard popup (login 직후 1회)
// ---------------------------------------------------------------------------
function DashboardModal() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [closed, setClosed] = useState(false);
  const [dontShowToday, setDontShowToday] = useState(false);

  useEffect(() => {
    if (!user) return;
    const key = `dashboard_dismissed_${new Date().toISOString().slice(0,10)}_${user.id}`;
    if (localStorage.getItem(key) === '1') { setClosed(true); return; }
    (async () => { try { setData(await api('/api/me/dashboard')); } catch {} })();
  }, [user]);

  if (!user || closed || !data) return null;

  const dismiss = () => {
    if (dontShowToday) {
      const key = `dashboard_dismissed_${new Date().toISOString().slice(0,10)}_${user.id}`;
      localStorage.setItem(key, '1');
    }
    setClosed(true);
  };

  // 체크박스 토글 — 즉시 localStorage에 반영해 새로고침해도 유지
  const toggleDontShow = (checked) => {
    setDontShowToday(checked);
    const key = `dashboard_dismissed_${new Date().toISOString().slice(0,10)}_${user.id}`;
    if (checked) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  };

  const hasContent = (data.my_crop_tasks || []).filter(t => t.task_type).length > 0 || (data.season_tip || []).length > 0;
  if (!hasContent) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={dismiss}>
      <div className="bg-white rounded-3xl max-w-md w-full p-5 fade-in" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🌿</span>
          <div>
            <div className="font-bold">{user.display_name}님, 이번 주말은 어떠세요?</div>
            <div className="text-xs text-gray-500">{data.month}월에 챙길 일</div>
          </div>
          <button onClick={dismiss} className="ml-auto text-gray-400 text-xl hover:text-gray-600">✕</button>
        </div>
        {data.my_crop_tasks.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-700 mb-1">🌱 내 작물 작업</div>
            <ul className="space-y-1.5">
              {data.my_crop_tasks.filter(t => t.task_type).slice(0, 4).map((t, i) => (
                <li key={i} className="text-sm">
                  <span className="font-semibold text-leaf-700">{t.name_ko}</span>
                  {' — '}
                  <span>{t.task_type}</span>
                  {t.instructions_md && <span className="text-gray-600">: {t.instructions_md}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.season_tip.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-gray-700 mb-1">🌷 이번 달 시즌 시작 작목</div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {data.season_tip.map((c) => (
                <a key={c.id} href={`#/crops/${c.id}`} onClick={dismiss} className="shrink-0 bg-leaf-50 px-3 py-2 rounded-xl text-sm">
                  {c.name_ko} {c.beginner_friendly && '♥'}
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 pt-3 border-t border-leaf-100 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-leaf-500 cursor-pointer"
              checked={dontShowToday}
              onChange={(e) => toggleDontShow(e.target.checked)}
            />
            <span>오늘 다시 보지 않기</span>
          </label>
          <button onClick={dismiss} className="text-sm text-leaf-700 font-semibold hover:text-leaf-800">닫기</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat — 전체 공개 채팅방
// ---------------------------------------------------------------------------
function ChatPage() {
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef();
  const scrollRef = useRef();
  const lastIdRef = useRef(0);

  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const data = await api('/api/chat?limit=50');
        if (!alive) return;
        setMessages(data);
        lastIdRef.current = data.length ? data[data.length - 1].id : 0;
        setTimeout(() => scrollToBottom(false), 0);
      } catch (e) { if (alive) setErr(e.message); }
    })();
    const timer = setInterval(async () => {
      try {
        const after = lastIdRef.current;
        const fresh = await api(`/api/chat?after=${after}&limit=50`);
        if (!alive || !fresh.length) return;
        setMessages((prev) => [...prev, ...fresh]);
        lastIdRef.current = fresh[fresh.length - 1].id;
        setTimeout(() => scrollToBottom(true), 0);
      } catch { /* ignore polling errors */ }
    }, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [user, scrollToBottom]);

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setErr('이미지는 10MB 이하'); return; }
    setUploading(true); setErr('');
    try { setPendingImage(await uploadImage(f)); }
    catch (ex) { setErr(ex.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const send = async (e) => {
    e?.preventDefault?.();
    const t = text.trim();
    if (!t && !pendingImage) return;
    setSending(true); setErr('');
    try {
      const sent = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ body: t, image_url: pendingImage }),
      });
      setMessages((prev) => [...prev, sent]);
      lastIdRef.current = Math.max(lastIdRef.current, sent.id);
      setText(''); setPendingImage('');
      setTimeout(() => scrollToBottom(true), 0);
    } catch (ex) { setErr(ex.message); }
    finally { setSending(false); }
  };

  const onDelete = async (id) => {
    if (!confirm('이 메시지를 삭제할까요?')) return;
    try {
      await api(`/api/chat/${id}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (ex) { setErr(ex.message); }
  };

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold">💚 텃밭 채팅방</h1>
        <span className="text-xs text-gray-500">모두에게 보여요 · 실시간(3초)</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white rounded-2xl border border-leaf-100 p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-12">
            아직 대화가 없어요. 첫 메시지를 남겨보세요 🌱
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.user_id === user.id;
          const prev = messages[i - 1];
          const showHead = !prev || prev.user_id !== m.user_id ||
            (new Date(m.created_at) - new Date(prev.created_at) > 5 * 60 * 1000);
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} ${showHead ? 'mt-3' : 'mt-0.5'}`}>
              {!mine && (
                <div className="w-8 mr-2 shrink-0 text-2xl text-center">
                  {showHead ? m.avatar_emoji : ''}
                </div>
              )}
              <div className={`max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                {showHead && !mine && (
                  <div className="text-xs text-gray-600 mb-0.5">{m.display_name}</div>
                )}
                <div className={`group relative rounded-2xl px-3 py-2 ${mine ? 'bg-leaf-500 text-white rounded-tr-md' : 'bg-leaf-50 text-gray-800 rounded-tl-md'}`}>
                  {m.image_url && (
                    <a href={m.image_url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={m.image_url} className={`rounded-lg max-h-64 object-cover ${m.body ? 'mb-1.5' : ''}`} />
                    </a>
                  )}
                  {m.body && <div className="whitespace-pre-wrap break-words text-sm">{m.body}</div>}
                  {mine && (
                    <button type="button" onClick={() => onDelete(m.id)}
                      className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500">
                      🗑
                    </button>
                  )}
                </div>
                <div className={`text-[10px] text-gray-400 mt-0.5 ${mine ? 'text-right' : 'text-left'}`}>
                  {formatTimeAgo(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {err && <div className="text-xs text-red-600 mt-2">{err}</div>}

      {pendingImage && (
        <div className="mt-2 flex items-center gap-2 bg-leaf-50 rounded-xl p-2 border border-leaf-100">
          <img src={pendingImage} className="w-14 h-14 rounded-lg object-cover" />
          <span className="text-xs text-gray-600 flex-1">사진을 함께 보낼게요</span>
          <button onClick={()=>setPendingImage('')} className="text-sm text-gray-500 hover:text-red-500">✕</button>
        </div>
      )}

      <form onSubmit={send} className="mt-2 flex gap-2 items-end">
        <button type="button" onClick={()=>fileRef.current?.click()} disabled={uploading || !!pendingImage}
          className="h-11 w-11 rounded-xl border border-leaf-200 bg-white flex items-center justify-center text-xl shrink-0">
          {uploading ? '⏳' : '📷'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
        <textarea
          rows={1}
          maxLength={1000}
          value={text}
          onChange={(e)=>setText(e.target.value)}
          onKeyDown={(e)=>{
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="텃밭 이야기를 나눠보세요…  (Enter 전송, Shift+Enter 줄바꿈)"
          className="input flex-1 resize-none"
          style={{ height: '44px', minHeight: '44px', maxHeight: '120px' }}
        />
        <button disabled={sending || (!text.trim() && !pendingImage)} className="btn-primary shrink-0">
          {sending ? '...' : '보내기'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App / Router
// ---------------------------------------------------------------------------
function App() {
  const route = useHashRoute();
  const { loading } = useAuth();
  const path = route.pathname;
  let body;
  if (loading) body = <div className="max-w-2xl mx-auto p-8 text-center text-gray-400">불러오는 중...</div>;
  else if (path === '/' || path === '') body = <HomePage />;
  else if (path === '/login') body = <LoginPage />;
  else if (path === '/signup') body = <SignupPage />;
  else if (path === '/calendar') body = <CalendarPage />;
  else if (path.match(/^\/calendar\/(\d{4}-\d{2})$/)) body = <CalendarPage month={path.match(/^\/calendar\/(\d{4}-\d{2})$/)[1]} />;
  else if (path === '/crops') body = <CropsPage />;
  else if (path.match(/^\/crops\/(\d+)\/edit$/)) body = <CropEditPage id={path.match(/^\/crops\/(\d+)\/edit$/)[1]} />;
  else if (path.match(/^\/crops\/(\d+)$/)) body = <CropDetailPage id={path.match(/^\/crops\/(\d+)$/)[1]} />;
  else if (path === '/me') body = <MyPage />;
  else if (path === '/me/logs') body = <LogsPage />;
  else if (path === '/me/budget') body = <BudgetPage />;
  else if (path === '/feed') body = <PublicLogsPage />;
  else if (path === '/logs/new') body = <LogFormPage />;
  else if (path.match(/^\/logs\/(\d+)\/edit$/)) body = <LogFormPage id={path.match(/^\/logs\/(\d+)\/edit$/)[1]} />;
  else if (path.match(/^\/logs\/(\d+)$/)) body = <LogDetailPage id={path.match(/^\/logs\/(\d+)$/)[1]} />;
  else if (path === '/board') body = <BoardPage />;
  else if (path === '/posts/new') body = <PostFormPage />;
  else if (path.match(/^\/posts\/(\d+)$/)) body = <PostDetailPage id={path.match(/^\/posts\/(\d+)$/)[1]} />;
  else if (path === '/chat') body = <ChatPage />;
  else if (path === '/admin') body = <AdminPage />;
  else body = <EmptyState icon="🌿" title="페이지를 찾지 못했어요" action={<a href="#/" className="inline-block mt-3 text-leaf-700 font-semibold">홈으로</a>} />;

  return (
    <div className="min-h-full">
      <Header />
      {body}
      <DashboardModal />
      <style>{`
        .input { width: 100%; height: 44px; padding: 0 14px; border-radius: 12px; border: 1px solid #d8e8cf; background: white; outline: none; font-size: 15px; }
        .input:focus { border-color: #67ac57; box-shadow: 0 0 0 3px rgba(103,172,87,.15); }
        textarea.input { height: auto; padding: 12px 14px; line-height: 1.6; }
        select.input { padding-right: 30px; }
        .btn-primary { display: inline-flex; align-items: center; justify-content: center; height: 44px; padding: 0 18px; border-radius: 12px; background: #4f8e41; color: white; font-weight: 700; cursor: pointer; }
        .btn-primary:hover { background: #3e7233; }
        .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
        .btn-ghost { display: inline-flex; align-items: center; justify-content: center; height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid #c2e3a9; color: #3e7233; font-weight: 600; background: white; }
        .btn-ghost:hover { background: #f1f9ec; }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AuthProvider><App /></AuthProvider>);
