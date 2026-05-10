/* eslint-disable */
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'carrot_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok || !body || body.success === false) {
    const msg = (body && body.message) || `HTTP ${res.status}`;
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return body.data;
}

// ---------------------------------------------------------------------------
// ImageKit client-side upload
// ---------------------------------------------------------------------------
async function uploadImage(file) {
  const auth = await api('/api/upload/auth');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('fileName', `carrot_${Date.now()}_${file.name.replace(/[^a-z0-9.\-_]/gi, '_')}`);
  fd.append('publicKey', auth.publicKey);
  fd.append('signature', auth.signature);
  fd.append('expire', auth.expire);
  fd.append('token', auth.token);
  fd.append('folder', '/carrot-market');
  fd.append('useUniqueFileName', 'true');
  const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST', body: fd,
  });
  const json = await res.json();
  if (!res.ok || !json.url) {
    throw new Error(json.message || 'ImageKit 업로드 실패');
  }
  return json.url;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const EMOJIS = ['🥕','🍎','🍊','🍋','🍇','🍓','🍑','🥝','🍒','🥑','🌽','🍞','🍔','🍕','🍣','🍜','🍩','🍰','🧋','☕','🐶','🐱','🐰','🐻','🐼','🦊','🐨','🦁','🐯','🐸','🦄','🐳','⭐','🌈','🌸','🌻','🌵','🍀','🎈','🎁','🚗','✈️','🎮','🎵','📚','💎','👑','😀','😎','🤩','🥳','🤓','🤖','👻','🎃'];

function formatPrice(p) {
  if (!Number.isFinite(p)) return '';
  if (p === 0) return '나눔';
  return p.toLocaleString('ko-KR') + '원';
}
function formatTimeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금 전';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
  return new Date(iso).toLocaleDateString('ko-KR');
}
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Hash router
// ---------------------------------------------------------------------------
function useHashRoute() {
  const parse = () => {
    const raw = (window.location.hash || '#/').replace(/^#/, '');
    const [pathname, queryStr = ''] = raw.split('?');
    const params = new URLSearchParams(queryStr);
    return { pathname: pathname || '/', params };
  };
  const [route, setRoute] = useState(parse());
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
const navigate = (to) => { window.location.hash = to.startsWith('#') ? to : '#' + to; };

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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <a href="#/" className="flex items-center gap-1.5 font-bold text-carrot-600 text-lg">
          <span>🥕</span><span>당근마켓</span>
        </a>
        <nav className="flex items-center gap-1 text-sm">
          {user ? (
            <>
              {user.is_admin && (
                <a href="#/admin" className="px-2 py-1 rounded-md bg-amber-100 text-amber-800 font-semibold hover:bg-amber-200 flex items-center gap-1">
                  <span>👑</span><span className="hidden sm:inline">관리자</span>
                </a>
              )}
              <a href="#/products/new" className="px-3 py-1.5 rounded-md bg-carrot-500 text-white font-semibold hover:bg-carrot-600">+ 등록</a>
              <a href="#/me" className="px-2 py-1.5 rounded-md hover:bg-gray-100 flex items-center gap-1">
                <span className="text-base">{user.avatar_emoji || '🥕'}</span>
                <span className="hidden sm:inline">{user.nickname}</span>
              </a>
              <button onClick={logout} className="px-2 py-1.5 rounded-md hover:bg-gray-100 text-gray-600">로그아웃</button>
            </>
          ) : (
            <>
              <a href="#/login" className="px-3 py-1.5 rounded-md hover:bg-gray-100">로그인</a>
              <a href="#/signup" className="px-3 py-1.5 rounded-md bg-carrot-500 text-white font-semibold hover:bg-carrot-600">가입</a>
            </>
          )}
        </nav>
      </div>
    </header>
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
    <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
      <div className="text-xs text-gray-500 mb-1.5">아바타 이모지 선택</div>
      <div className="grid grid-cols-9 gap-1 max-h-40 overflow-auto no-scrollbar">
        {EMOJIS.map((e) => (
          <button
            type="button"
            key={e}
            onClick={() => onChange(e)}
            className={`text-2xl h-10 rounded-md hover:bg-white transition ${value === e ? 'bg-carrot-100 ring-2 ring-carrot-500' : ''}`}
          >{e}</button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
const CATEGORIES = ['디지털기기','생활가전','가구/인테리어','의류','도서','뷰티/미용','취미/게임','식물','기타'];

function HomePage() {
  const route = useHashRoute();
  const initialQ = route.params.get('q') || '';
  const initialCat = route.params.get('category') || '';
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(initialCat);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (category) qs.set('category', category);
      const data = await api('/api/products' + (qs.toString() ? '?' + qs.toString() : ''));
      setProducts(data);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [q, category]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2 mb-3">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="물품을 검색해보세요"
          className="flex-1 h-11 px-4 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-carrot-400"
        />
        <button type="submit" className="px-4 h-11 rounded-lg bg-carrot-500 text-white font-semibold hover:bg-carrot-600">검색</button>
      </form>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar">
        <button
          onClick={() => setCategory('')}
          className={`px-3 h-8 rounded-full text-sm whitespace-nowrap border ${category === '' ? 'bg-carrot-500 text-white border-carrot-500' : 'bg-white border-gray-200 text-gray-700'}`}
        >전체</button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(category === c ? '' : c)}
            className={`px-3 h-8 rounded-full text-sm whitespace-nowrap border ${category === c ? 'bg-carrot-500 text-white border-carrot-500' : 'bg-white border-gray-200 text-gray-700'}`}
          >{c}</button>
        ))}
      </div>
      {err && <div className="text-red-600 text-sm mb-2">{err}</div>}
      {loading ? (
        <div className="text-center py-12 text-gray-400">불러오는 중...</div>
      ) : products.length === 0 ? (
        <EmptyState icon="🥕" title="등록된 상품이 없어요" sub="첫 상품을 등록해 보세요" />
      ) : (
        <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {products.map((p) => (
            <li key={p.id}>
              <a href={`#/products/${p.id}`} className="flex gap-3 p-3 hover:bg-gray-50 transition">
                <Thumbnail url={p.thumbnail} title={p.title} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{p.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {p.neighborhood} · {formatTimeAgo(p.created_at)}
                  </div>
                  <div className="font-bold mt-1">{formatPrice(p.price)}</div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                    <span>{p.seller_avatar} {p.seller_nickname}</span>
                    {p.favorite_count > 0 && <span>· ❤️ {p.favorite_count}</span>}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumbnail({ url, title }) {
  if (url) {
    return <img src={url} alt={title} className="w-24 h-24 rounded-lg object-cover bg-gray-100 shrink-0" />;
  }
  return (
    <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-carrot-100 to-carrot-200 flex items-center justify-center text-3xl shrink-0">🥕</div>
  );
}

function LoginPage() {
  const { login, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) navigate('/'); }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(email, password); navigate('/'); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">로그인</h1>
      <p className="text-sm text-gray-500 mb-6">이메일로 로그인하고 거래를 시작해요</p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="이메일">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </Field>
        <Field label="비밀번호">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </Field>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button disabled={busy} className="btn-primary w-full">{busy ? '로그인 중...' : '로그인'}</button>
      </form>
      <div className="text-center text-sm text-gray-500 mt-4">
        아직 계정이 없으신가요? <a href="#/signup" className="text-carrot-600 font-semibold">가입하기</a>
      </div>
    </div>
  );
}

function SignupPage() {
  const { signup, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [avatar, setAvatar] = useState('🥕');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => { if (user) navigate('/'); }, [user]);

  const useGeolocation = () => {
    if (!navigator.geolocation) { setErr('이 기기는 위치 인증을 지원하지 않습니다'); return; }
    setLocating(true); setErr('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14&accept-language=ko`);
          const j = await r.json();
          const a = j.address || {};
          const guess = a.city_district || a.suburb || a.borough || a.district || a.town || a.city || a.county || a.village || '';
          if (guess) setNeighborhood(guess);
          else setErr('동네를 찾지 못했어요. 직접 입력해주세요.');
        } catch {
          setErr('위치 변환 실패. 직접 입력해주세요.');
        } finally { setLocating(false); }
      },
      () => { setErr('위치 권한을 거절했어요.'); setLocating(false); },
      { timeout: 8000 }
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await signup({ email, password, nickname, neighborhood, avatar_emoji: avatar }); navigate('/'); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">회원가입</h1>
      <p className="text-sm text-gray-500 mb-6">동네 이웃과 따뜻한 거래를 시작해요</p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="이메일">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </Field>
        <Field label="비밀번호 (6자 이상)">
          <input type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
        </Field>
        <Field label="닉네임">
          <input required maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} className="input" />
        </Field>
        <Field label="동네">
          <div className="flex gap-2">
            <input required maxLength={40} placeholder="예: 역삼동" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="input flex-1" />
            <button type="button" onClick={useGeolocation} disabled={locating} className="px-3 h-11 rounded-lg border border-carrot-500 text-carrot-600 text-sm font-semibold hover:bg-carrot-50">
              {locating ? '확인중' : '📍 위치인증'}
            </button>
          </div>
        </Field>
        <Field label="아바타">
          <EmojiPicker value={avatar} onChange={setAvatar} />
        </Field>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <button disabled={busy} className="btn-primary w-full">{busy ? '가입 중...' : '가입하기'}</button>
      </form>
      <div className="text-center text-sm text-gray-500 mt-4">
        이미 계정이 있으신가요? <a href="#/login" className="text-carrot-600 font-semibold">로그인</a>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-gray-700 mb-1">{label}</div>
      {children}
    </label>
  );
}

function ProductFormPage({ id }) {
  const { user, loading: authLoading } = useAuth();
  const isEdit = Boolean(id);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [authLoading, user]);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const p = await api(`/api/products/${id}`);
        if (!p.is_owner && !p.can_modify) { setErr('본인 상품만 수정할 수 있어요'); return; }
        setTitle(p.title); setPrice(String(p.price)); setCategory(p.category);
        setDescription(p.description || ''); setImages(p.images.map((i) => i.url));
      } catch (e) { setErr(e.message); }
    })();
  }, [id, isEdit]);

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = 3 - images.length;
    const toUpload = files.slice(0, remaining);
    if (!toUpload.length) { setErr('이미지는 최대 3장입니다'); return; }
    setUploading(true); setErr('');
    try {
      const urls = [];
      for (const f of toUpload) {
        if (f.size > 10 * 1024 * 1024) { throw new Error(`${f.name}: 10MB 이하만 업로드 가능합니다`); }
        const url = await uploadImage(f);
        urls.push(url);
      }
      setImages((prev) => [...prev, ...urls].slice(0, 3));
    } catch (ex) { setErr(ex.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const removeImage = (idx) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const payload = { title, price: Number(price), description, category, images };
      if (isEdit) {
        await api(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        navigate(`/products/${id}`);
      } else {
        const created = await api('/api/products', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`/products/${created.id}`);
      }
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!confirm('정말 삭제하시겠어요?')) return;
    try { await api(`/api/products/${id}`, { method: 'DELETE' }); navigate('/me'); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">{isEdit ? '상품 수정' : '상품 등록'}</h1>
      <form onSubmit={submit} className="space-y-3">
        <Field label={`이미지 (${images.length}/3)`}>
          <div className="flex gap-2 flex-wrap">
            {images.map((url, idx) => (
              <div key={url + idx} className="relative w-24 h-24">
                <img src={url} className="w-24 h-24 object-cover rounded-lg" />
                <button type="button" onClick={() => removeImage(idx)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/70 text-white text-xs">✕</button>
              </div>
            ))}
            {images.length < 3 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500 hover:border-carrot-400 hover:text-carrot-500"
              >
                <span className="text-2xl">{uploading ? '⏳' : '＋'}</span>
                <span className="text-xs">{uploading ? '업로드중' : '사진추가'}</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPickFiles} className="hidden" />
          </div>
        </Field>
        <Field label="제목">
          <input required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="제품 이름" />
        </Field>
        <Field label="가격 (원)">
          <input required type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="input" placeholder="0" />
        </Field>
        <Field label="카테고리">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="설명">
          <textarea rows={6} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="상품 상태, 거래 방법 등을 자세히 적어주세요" />
        </Field>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex gap-2">
          <button disabled={busy || uploading} className="btn-primary flex-1">
            {busy ? '저장 중...' : isEdit ? '수정 완료' : '등록 완료'}
          </button>
          {isEdit && (
            <button type="button" onClick={onDelete} className="px-4 h-11 rounded-lg bg-red-50 text-red-600 font-semibold hover:bg-red-100">삭제</button>
          )}
        </div>
      </form>
    </div>
  );
}

function ProductDetailPage({ id }) {
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [imgIdx, setImgIdx] = useState(0);
  const [favBusy, setFavBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);

  const load = useCallback(async () => {
    try { setP(await api(`/api/products/${id}`)); }
    catch (e) { setErr(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const toggleFav = async () => {
    if (!user) { navigate('/login'); return; }
    setFavBusy(true);
    try {
      if (p.is_favorite) await api(`/api/products/${id}/favorite`, { method: 'DELETE' });
      else await api(`/api/products/${id}/favorite`, { method: 'POST' });
      await load();
    } catch (e) { setErr(e.message); }
    finally { setFavBusy(false); }
  };

  const startChat = async () => {
    if (!user) { navigate('/login'); return; }
    setChatBusy(true);
    try {
      const room = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ product_id: Number(id) }) });
      navigate(`/rooms/${room.id}`);
    } catch (e) { setErr(e.message); }
    finally { setChatBusy(false); }
  };

  if (err) return <div className="max-w-2xl mx-auto p-4 text-red-600">{err}</div>;
  if (!p) return <div className="max-w-2xl mx-auto p-8 text-center text-gray-400">불러오는 중...</div>;

  return (
    <div className="max-w-2xl mx-auto pb-28">
      <div className="bg-gray-100 aspect-square relative">
        {p.images.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-7xl">🥕</div>
        ) : (
          <>
            <img src={p.images[imgIdx].url} className="w-full h-full object-cover" />
            {p.images.length > 1 && (
              <>
                <button onClick={() => setImgIdx((i) => (i - 1 + p.images.length) % p.images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white">‹</button>
                <button onClick={() => setImgIdx((i) => (i + 1) % p.images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white">›</button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {p.images.map((_, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === imgIdx ? 'bg-white' : 'bg-white/50'}`} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      <div className="px-4 pt-3 pb-4 bg-white border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-carrot-100 flex items-center justify-center text-2xl">{p.seller_avatar}</div>
        <div className="flex-1">
          <div className="font-semibold">{p.seller_nickname}</div>
          <div className="text-sm text-gray-500">{p.seller_neighborhood}</div>
        </div>
        {(p.is_owner || p.can_modify) && (
          <a href={`#/products/${p.id}/edit`} className="text-sm text-carrot-600 font-semibold">
            {p.is_owner ? '수정' : '👑 수정'}
          </a>
        )}
      </div>
      <div className="px-4 py-4 bg-white">
        <div className="text-xs text-gray-500">
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{p.category}</span>
          <span className="ml-2">{formatTimeAgo(p.created_at)}</span>
        </div>
        <h1 className="text-xl font-bold mt-2">{p.title}</h1>
        <div className="text-2xl font-bold mt-1">{formatPrice(p.price)}</div>
        <p className="mt-4 text-gray-800 whitespace-pre-wrap leading-relaxed">{p.description || ' '}</p>
        <div className="text-sm text-gray-500 mt-6 flex gap-4">
          <span>❤️ 관심 {p.favorite_count}</span>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={toggleFav} disabled={favBusy}
            className={`w-12 h-12 rounded-lg border flex items-center justify-center text-2xl ${p.is_favorite ? 'border-carrot-500 bg-carrot-50' : 'border-gray-200'}`}>
            {p.is_favorite ? '❤️' : '🤍'}
          </button>
          <div className="flex-1 font-bold text-lg">{formatPrice(p.price)}</div>
          {p.is_owner ? (
            <a href={`#/products/${p.id}/edit`} className="btn-primary">수정하기</a>
          ) : (
            <button onClick={startChat} disabled={chatBusy} className="btn-primary">
              {chatBusy ? '...' : '채팅하기'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MyPage() {
  const { user, loading: authLoading, refreshMe, setUser } = useAuth();
  const [tab, setTab] = useState('products');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);

  useEffect(() => { if (!authLoading && !user) navigate('/login'); }, [authLoading, user]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const path = tab === 'products' ? '/api/me/products'
        : tab === 'favorites' ? '/api/me/favorites'
        : '/api/me/rooms';
      setItems(await api(path));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      <ProfileCard user={user} onEdit={() => setEditingProfile((v) => !v)} editing={editingProfile} onSaved={(u) => { setUser(u); setEditingProfile(false); }} />

      <div className="mt-4 flex bg-white rounded-xl border border-gray-100 overflow-hidden text-sm font-semibold">
        {[
          ['products','내 상품'],
          ['favorites','관심'],
          ['rooms','채팅'],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-3 ${tab === k ? 'bg-carrot-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {err && <div className="text-red-600 text-sm mb-2">{err}</div>}
        {loading ? (
          <div className="text-center py-12 text-gray-400">불러오는 중...</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={tab === 'products' ? '📦' : tab === 'favorites' ? '🤍' : '💬'}
            title={tab === 'products' ? '아직 등록한 상품이 없어요' : tab === 'favorites' ? '관심 상품이 없어요' : '채팅 내역이 없어요'}
          />
        ) : tab === 'rooms' ? (
          <RoomList rooms={items} meId={user.id} />
        ) : (
          <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
            {items.map((p) => (
              <li key={p.id}>
                <a href={`#/products/${p.id}`} className="flex gap-3 p-3 hover:bg-gray-50">
                  <Thumbnail url={p.thumbnail} title={p.title} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.category} · {formatTimeAgo(p.created_at)}</div>
                    <div className="font-bold mt-1">{formatPrice(p.price)}</div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProfileCard({ user, editing, onEdit, onSaved }) {
  const [nickname, setNickname] = useState(user.nickname);
  const [neighborhood, setNeighborhood] = useState(user.neighborhood);
  const [avatar, setAvatar] = useState(user.avatar_emoji);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setNickname(user.nickname); setNeighborhood(user.neighborhood); setAvatar(user.avatar_emoji);
  }, [user, editing]);

  if (!editing) {
    return (
      <div className="bg-white rounded-xl p-4 border border-gray-100 flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-carrot-100 flex items-center justify-center text-3xl">{user.avatar_emoji}</div>
        <div className="flex-1">
          <div className="font-bold">{user.nickname}</div>
          <div className="text-sm text-gray-500">{user.neighborhood}</div>
          <div className="text-xs text-gray-400 mt-0.5">{user.email}</div>
        </div>
        <button onClick={onEdit} className="text-sm text-carrot-600 font-semibold">프로필 수정</button>
      </div>
    );
  }

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const u = await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ nickname, neighborhood, avatar_emoji: avatar }) });
      onSaved(u);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-2">
      <Field label="닉네임"><input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} /></Field>
      <Field label="동네"><input className="input" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} /></Field>
      <Field label="아바타"><EmojiPicker value={avatar} onChange={setAvatar} /></Field>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={busy} className="btn-primary flex-1">{busy ? '저장중...' : '저장'}</button>
        <button onClick={onEdit} className="px-4 h-11 rounded-lg bg-gray-100 hover:bg-gray-200">취소</button>
      </div>
    </div>
  );
}

function RoomList({ rooms, meId }) {
  return (
    <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
      {rooms.map((r) => {
        const isBuyer = r.buyer_id === meId;
        const otherNickname = isBuyer ? r.seller_nickname : r.buyer_nickname;
        const otherAvatar = isBuyer ? r.seller_avatar : r.buyer_avatar;
        return (
          <li key={r.id}>
            <a href={`#/rooms/${r.id}`} className="flex gap-3 p-3 hover:bg-gray-50">
              <div className="w-12 h-12 rounded-full bg-carrot-100 flex items-center justify-center text-2xl shrink-0">{otherAvatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{otherNickname}</span>
                  <span className="text-xs text-gray-400">{formatTimeAgo(r.last_at || r.created_at)}</span>
                </div>
                <div className="text-sm text-gray-600 truncate">{r.last_text || '대화를 시작해 보세요'}</div>
              </div>
              {r.product_thumbnail && <img src={r.product_thumbnail} className="w-12 h-12 rounded-lg object-cover shrink-0" />}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function ChatRoomPage({ id }) {
  const { user, loading: authLoading } = useAuth();
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const sinceRef = useRef(0);
  const bottomRef = useRef();

  useEffect(() => { if (!authLoading && !user) navigate('/login'); }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    let timer;
    (async () => {
      try {
        const r = await api(`/api/rooms/${id}`);
        if (!alive) return;
        setRoom(r);
        const initial = await api(`/api/rooms/${id}/messages`);
        if (!alive) return;
        setMessages(initial);
        sinceRef.current = initial.length ? initial[initial.length - 1].id : 0;
        const poll = async () => {
          if (!alive) return;
          try {
            const fresh = await api(`/api/rooms/${id}/messages?since=${sinceRef.current}`);
            if (fresh.length) {
              setMessages((prev) => [...prev, ...fresh]);
              sinceRef.current = fresh[fresh.length - 1].id;
            }
          } catch { /* swallow */ }
          timer = setTimeout(poll, 2000);
        };
        timer = setTimeout(poll, 2000);
      } catch (e) { if (alive) setErr(e.message); }
    })();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [id, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const m = await api(`/api/rooms/${id}/messages`, { method: 'POST', body: JSON.stringify({ text: t }) });
      setMessages((prev) => [...prev, m]);
      sinceRef.current = m.id;
      setText('');
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  if (err && !room) return <div className="max-w-2xl mx-auto p-4 text-red-600">{err}</div>;
  if (!room || !user) return <div className="max-w-2xl mx-auto p-8 text-center text-gray-400">불러오는 중...</div>;

  const isBuyer = room.buyer_id === user.id;
  const otherNickname = isBuyer ? room.seller_nickname : room.buyer_nickname;
  const otherAvatar = isBuyer ? room.seller_avatar : room.buyer_avatar;

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => history.back()} className="text-gray-500 text-xl">←</button>
        <div className="text-2xl">{otherAvatar}</div>
        <div className="flex-1">
          <div className="font-semibold">{otherNickname}</div>
          <div className="text-xs text-gray-500">{isBuyer ? '판매자' : '구매희망자'}</div>
        </div>
      </div>
      <a href={`#/products/${room.product_id}`} className="px-4 py-2 bg-carrot-50 border-b border-carrot-100 flex items-center gap-3 hover:bg-carrot-100">
        {room.product_thumbnail
          ? <img src={room.product_thumbnail} className="w-10 h-10 rounded-md object-cover" />
          : <div className="w-10 h-10 rounded-md bg-carrot-200 flex items-center justify-center">🥕</div>}
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{room.product_title}</div>
          <div className="font-bold">{formatPrice(room.product_price)}</div>
        </div>
      </a>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
        {messages.length === 0 && <div className="text-center text-sm text-gray-400 py-12">아직 메시지가 없어요. 첫 메시지를 보내보세요!</div>}
        {messages.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="flex flex-col max-w-[75%]">
                <div className={`px-3 py-2 rounded-2xl ${mine ? 'bg-carrot-500 text-white rounded-br-md' : 'bg-white border border-gray-200 rounded-bl-md'}`}>
                  <div className="whitespace-pre-wrap break-words text-sm">{m.text}</div>
                </div>
                <div className={`text-[10px] text-gray-400 mt-0.5 ${mine ? 'text-right' : ''}`}>{formatTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="bg-white border-t border-gray-200 px-3 py-2 flex gap-2">
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="메시지 입력"
          className="flex-1 h-11 px-4 rounded-full bg-gray-100 focus:outline-none focus:ring-2 focus:ring-carrot-400"
        />
        <button disabled={busy || !text.trim()} className="px-4 h-11 rounded-full bg-carrot-500 text-white font-semibold disabled:opacity-50">전송</button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState('users');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || !user.is_admin)) navigate('/');
  }, [authLoading, user]);

  const load = useCallback(async () => {
    if (!user?.is_admin) return;
    setLoading(true); setErr('');
    try {
      const [s, u, p] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/admin/users'),
        api('/api/admin/products'),
      ]);
      setStats(s); setUsers(u); setProducts(p);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggleAdmin = async (u) => {
    if (u.id === user.id) { alert('본인 권한은 스스로 해제할 수 없어요'); return; }
    if (!confirm(`${u.nickname} 님을 ${u.is_admin ? '일반 사용자' : '관리자'}로 변경할까요?`)) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ is_admin: !u.is_admin }) });
      await load();
    } catch (e) { alert(e.message); }
  };

  const deleteUser = async (u) => {
    if (u.id === user.id) { alert('본인은 삭제할 수 없어요'); return; }
    if (!confirm(`${u.nickname}(${u.email}) 사용자를 삭제할까요?\n등록 상품과 채팅도 모두 함께 삭제됩니다.`)) return;
    try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { alert(e.message); }
  };

  const deleteProduct = async (p) => {
    if (!confirm(`상품 "${p.title}" 을(를) 삭제할까요?`)) return;
    try { await api(`/api/products/${p.id}`, { method: 'DELETE' }); await load(); }
    catch (e) { alert(e.message); }
  };

  if (!user || !user.is_admin) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4">
      <div className="bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div className="text-amber-900 font-bold flex items-center gap-2">
          <span className="text-xl">👑</span><span>관리자 대시보드</span>
        </div>
        <div className="text-sm text-amber-800/80 mt-1">{user.email}</div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {[
            ['users','사용자'],['products','상품'],['favorites','관심'],
            ['rooms','채팅방'],['messages','메시지'],
          ].map(([k, label]) => (
            <div key={k} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="text-xl font-bold mt-0.5">{stats[k]}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex bg-white rounded-xl border border-gray-100 overflow-hidden text-sm font-semibold mb-3">
        {[['users','사용자 관리'],['products','상품 관리']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-3 ${tab === k ? 'bg-carrot-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{l}</button>
        ))}
      </div>

      {err && <div className="text-red-600 text-sm mb-2">{err}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">불러오는 중...</div>
      ) : tab === 'users' ? (
        <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {users.map((u) => (
            <li key={u.id} className="p-3 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-carrot-100 flex items-center justify-center text-2xl shrink-0">{u.avatar_emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                  <span>{u.nickname}</span>
                  {u.is_admin && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">ADMIN</span>}
                  {u.id === user.id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">나</span>}
                </div>
                <div className="text-xs text-gray-500 truncate">{u.email}</div>
                <div className="text-xs text-gray-400">{u.neighborhood} · 상품 {u.product_count}개 · {formatTimeAgo(u.created_at)}</div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => toggleAdmin(u)} disabled={u.id === user.id}
                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40">
                  {u.is_admin ? '권한 해제' : '관리자 지정'}
                </button>
                <button onClick={() => deleteUser(u)} disabled={u.id === user.id}
                  className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40">
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {products.length === 0 && <EmptyState icon="📦" title="등록된 상품이 없어요" />}
          {products.map((p) => (
            <li key={p.id} className="p-3 flex items-center gap-3">
              <Thumbnail url={p.thumbnail} title={p.title} />
              <div className="flex-1 min-w-0">
                <a href={`#/products/${p.id}`} className="font-semibold truncate block hover:text-carrot-600">{p.title}</a>
                <div className="text-sm text-gray-700">{formatPrice(p.price)} · {p.category}</div>
                <div className="text-xs text-gray-500 truncate">@{p.seller_nickname} ({p.seller_email}) · {formatTimeAgo(p.created_at)}</div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <a href={`#/products/${p.id}/edit`} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 text-center">수정</a>
                <button onClick={() => deleteProduct(p)}
                  className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50">삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
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
  else if (path === '/me') body = <MyPage />;
  else if (path === '/admin') body = <AdminPage />;
  else if (path === '/products/new') body = <ProductFormPage />;
  else {
    let m = path.match(/^\/products\/(\d+)\/edit$/);
    if (m) body = <ProductFormPage id={m[1]} />;
    else if ((m = path.match(/^\/products\/(\d+)$/))) body = <ProductDetailPage id={m[1]} />;
    else if ((m = path.match(/^\/rooms\/(\d+)$/))) body = <ChatRoomPage id={m[1]} />;
    else body = <EmptyState icon="🤔" title="페이지를 찾을 수 없어요" action={<a href="#/" className="inline-block mt-3 text-carrot-600 font-semibold">홈으로</a>} />;
  }

  return (
    <div className="min-h-full">
      <Header />
      {body}
      <style>{`
        .input { width: 100%; height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid #e5e7eb; background: white; outline: none; }
        .input:focus { border-color: #ff8533; box-shadow: 0 0 0 3px rgba(255,133,51,.18); }
        textarea.input { height: auto; padding: 12px 14px; line-height: 1.5; }
        .btn-primary { display: inline-flex; align-items: center; justify-content: center; height: 44px; padding: 0 18px; border-radius: 10px; background: #ff6f0f; color: white; font-weight: 700; }
        .btn-primary:hover { background: #e85700; }
        .btn-primary:disabled { opacity: .6; }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider><App /></AuthProvider>
);
