# 꼬꼬마텃밭 🌱 (LittleFarm)

🔗 **Live**: https://little-farm-ten.vercel.app

> 주말농장러를 위한 따뜻한 텃밭 동반자. 1년 캘린더 · 작목 가이드(5/10/20평 환산) · 일지 · 가계부 · 게시판.

📄 기획 문서: [MISSION.md](./MISSION.md) · [AUDIENCES.md](./AUDIENCES.md) · [DEV.md](./DEV.md)

## 기술 스택

| 영역 | 선택 |
|---|---|
| Backend | Node.js + Express 5, `pg`, `bcryptjs`, `jsonwebtoken` |
| Frontend | React 18 (CDN) + Babel(JSX) + Tailwind (CDN), 해시 라우팅 |
| DB | Supabase Postgres — 테이블 prefix **`small_forest_`** |
| Storage | ImageKit (클라이언트 직접 업로드 + 서버 HMAC 서명) |
| Deploy | Vercel (`@vercel/node` + 정적) |

## 데이터베이스 (9 테이블)

```
small_forest_users         — 사용자 (member|admin)
small_forest_crops         — 작목 마스터 (12종 시드)
small_forest_crop_tasks    — 월별 작업 (5/10/20평 환산값 포함)
small_forest_user_crops    — 내가 키우는 작물
small_forest_logs          — 농사일기 (사진 + 공개범위)
small_forest_budgets       — 가계부 (수입/지출)
small_forest_posts         — 게시판 (질문/자랑/정보/자유)
small_forest_comments      — 댓글
small_forest_post_likes    — 좋아요
```

서버 첫 요청 시 `CREATE TABLE IF NOT EXISTS`로 자동 생성됩니다.

## 핵심 기능 (v1)

- **F1 인증/JWT** — 이메일+비밀번호 가입, 7일 토큰
- **F2 1년 캘린더 (공개)** — 월별 시즌 작목 + 작업 카드, 비로그인 열람
- **F3 작목 가이드 (공개)** — 12 작목 × 5/10/20평 환산값 + 월별 타임라인
- **F4 농사일기** — CRUD + ImageKit 업로드 (최대 5장) + 공개범위 3단계 (비공개/친구/전체)
- **F5 가계부** — 수입/지출 + 카테고리 + 월별 합계
- **F6 게시판** — 4개 보드, 댓글, 좋아요, 검색
- **F8 시기 알림 대시보드** — 로그인 직후 모달 ("이번 주말 할 일")
- **F10 관리자 콘솔** — 통계, 사용자/작목 관리
- **F11 RBAC** — 비로그인/회원/관리자 분리

> 다음 차수 (v1.1 예정): F7 자재 결제(Toss), F9 카카오 공유, F12 Gemini AI 보강

## 로컬 실행

```bash
npm install
node seed.js           # 작목 12 + 작업 47 + 사용자 4 + 일지/가계부/게시판 샘플
node server.js         # http://localhost:3001
```

`seed.js`는 ImageKit에 12개 작목의 hero 이미지를 SVG로 업로드하고 URL을 DB에 기록합니다.

## 환경변수 (`.env`)

```env
DATABASE_URL=postgresql://...supabase.com:6543/postgres
JWT_SECRET=replace-me
IMAGEKIT_PUBLIC_KEY=public_xxx
IMAGEKIT_PRIVATE_KEY=private_xxx
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id
PORT=3001
```

## 테스트 계정

| 역할 | 이메일 | 비밀번호 |
|---|---|---|
| 👑 관리자 | `admin@littlefarm.test` | `admin1234` |
| 회원 | `haneul@littlefarm.test` | `farmer123` |
| 회원 | `minji@littlefarm.test` | `farmer123` |
| 회원 | `jisoo@littlefarm.test` | `farmer123` |

## 페이지 / 라우트 (해시)

```
#/                     이번 달 캘린더 + 인사말 + 공개 일지 피드
#/calendar             현재 월 캘린더
#/calendar/2026-05     특정 월 캘린더
#/crops                작목 12종 그리드 + 카테고리/초보 필터
#/crops/:id            작목 상세 + 5/10/20평 토글 + 내 작물 등록
#/login, #/signup      인증
#/me                   프로필 + 내가 키우는 작물 + 진입 카드
#/me/logs              내 일지 목록
#/logs/new, /:id, /:id/edit  일지 작성/상세/수정
#/me/budget            가계부 + 카테고리 합계
#/feed                 공개 일지 둘러보기
#/board                게시판 (4탭)
#/posts/new, /:id      글 쓰기/상세
#/admin                관리자 대시보드 (👑 한정)
```

## API 요약

```
# Public
GET  /api/health
GET  /api/categories
GET  /api/calendar?month=YYYY-MM
GET  /api/crops?category=&beginner=&month=
GET  /api/crops/:id
GET  /api/posts?board=&q=
GET  /api/posts/:id
GET  /api/logs/public/feed
GET  /api/logs/:id          # 비공개는 본인만

# Auth
POST /api/auth/signup
POST /api/auth/login
GET  /api/auth/me
PATCH /api/auth/me

# Member
GET  /api/upload/auth                       # ImageKit 서명
GET  /api/me/dashboard
GET  /api/me/crops          POST  /api/me/crops          DELETE /api/me/crops/:id
GET  /api/me/logs           POST  /api/logs              PUT/DELETE /api/logs/:id
GET  /api/budgets           POST  /api/budgets           DELETE /api/budgets/:id
GET  /api/budgets/summary?month=
POST /api/posts             DELETE /api/posts/:id
POST /api/posts/:id/comments
POST /api/posts/:id/like    DELETE /api/posts/:id/like

# Admin
GET    /api/admin/stats
GET    /api/admin/users     DELETE /api/admin/users/:id
POST   /api/admin/crops     PUT/DELETE /api/admin/crops/:id
POST   /api/admin/posts/:id/hide
```

## 권한 매트릭스

| 자원 | 비로그인 | 회원 | 관리자 |
|---|---|---|---|
| 캘린더 / 작목 가이드 | ✓ 열람 | ✓ + 즐겨찾기 | ✓ + CRUD |
| 게시판 열람 | ✓ | ✓ | ✓ |
| 게시판 작성/댓글/좋아요 | ✗ | ✓ | ✓ + 숨김 |
| 일지 | ✗ | 본인만 (visibility별) | 모든 일지 모더레이션 |
| 가계부 | ✗ | 본인만 | ✗ (개인정보) |
| 사용자/작목 관리 | ✗ | ✗ | ✓ |

## ImageKit 통합

1. 클라이언트가 `GET /api/upload/auth`로 단명 서명 발급 (HMAC-SHA1)
2. `POST https://upload.imagekit.io/api/v1/files/upload`에 직접 업로드
3. 응답의 `url`을 DB(JSONB `image_urls`)에 기록

## 톤 / 디자인

- 색상: 연두(`leaf-500 #67ac57`) · 베이지(`#fbf6e9`) · 주황(`#f97e30`)
- 둥근 모서리(rounded-2xl), 큰 여백, 친절체 마이크로카피
- 모바일 우선 + 데스크톱 5열 그리드

## 트러블슈팅

- **DB init 실패** : Supabase 프로젝트 휴면 가능 → 대시보드에서 resume
- **이미지 업로드 401** : 서명 만료 (5분) → 페이지 새로고침
- **로그인 직후 대시보드 모달이 매번 나옴** : `localStorage.dashboard_dismissed_*`로 일일 1회만 표시 — 오늘 다시 보지 않기 클릭으로 영구 숨김

---

🌱 made for AFM week-7 quest.
