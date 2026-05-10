# 당근마켓 클론 🥕

🔗 **Live**: https://carrot-market-clone-gray.vercel.app

이메일 가입(JWT) → 상품 등록(이미지 업로드) → 목록/검색/상세 → 1:1 채팅(폴링) → 마이페이지로 이어지는 핵심 흐름을 한 폴더 안에 구현한 미니 중고거래 앱입니다.

## 테스트 계정

| 역할 | 이메일 | 비밀번호 |
|---|---|---|
| 👑 관리자 | `admin@carrot.test` | `admin1234` |
| 판매자 | `minji@carrot.test` / `jihoon@carrot.test` / `soyeon@carrot.test` | `carrot123` |

## 기술 스택

- **Backend** : Node.js + Express 5, `pg`, `bcryptjs`, `jsonwebtoken`
- **Frontend** : React 18 (CDN) + Babel(JSX) + Tailwind CSS (CDN), 해시 라우팅
- **DB** : Supabase Postgres (테이블 prefix: `carrot_mkt_`)
- **Storage** : ImageKit (클라이언트 직접 업로드 + 시드 SVG 업로드)
- **Realtime** : 2초 주기 폴링 (`/api/rooms/:id/messages?since=`)
- **Deploy** : Vercel (`server.js` + 정적 자원)

## 기능 체크리스트

| #  | 기능                              | 구현 |
| -- | --------------------------------- | ---- |
| 1  | 이메일 가입 + 동네(직접/위치인증) | ✅   |
| 1  | JWT 로그인                        | ✅   |
| 2  | 상품 등록(최대 3장 이미지 + 정보) | ✅   |
| 2  | 본인만 수정/삭제 (RLS 동등 보호)  | ✅   |
| 3  | 최신순 목록 + 카테고리 + 키워드   | ✅   |
| 3  | 상세: 이미지 슬라이드 + 관심 버튼 | ✅   |
| 4  | 1:1 채팅 (Polling 2s)             | ✅   |
| 5  | 마이페이지: 내 상품/관심/채팅     | ✅   |
| 6  | Vercel 배포 준비                  | ✅   |
| 7  | Postgres 스키마 + 자동 init       | ✅   |
| 8  | ImageKit 시드 이미지 자동 생성    | ✅   |
| 9  | 이미지 업로드 + 이모지 아바타     | ✅   |

## 폴더 구조

```
당근마켓 클론/
├── server.js        # Express 5 API + DB init + ImageKit 서명
├── index.html       # React 부트스트랩 (Tailwind, Babel)
├── client.js        # SPA (auth, 목록, 등록, 상세, 채팅, 마이페이지)
├── seed.js          # 사용자 + 상품 + ImageKit SVG 자동 시딩
├── vercel.json      # Vercel rewrites
├── package.json
├── .env             # 로컬 환경변수 (커밋 안됨)
└── .env.example     # 예시
```

## 데이터베이스 스키마 (prefix: `carrot_mkt_`)

| 테이블                       | 핵심 컬럼                                                                |
| ---------------------------- | ------------------------------------------------------------------------ |
| `carrot_mkt_users`           | id, email(UNQ), password_hash, nickname, neighborhood, avatar_emoji      |
| `carrot_mkt_products`        | id, user_id→users, title, price, description, category, neighborhood     |
| `carrot_mkt_product_images`  | id, product_id→products, url, position(0~2)                              |
| `carrot_mkt_favorites`       | (user_id, product_id) PK — 관심 목록                                     |
| `carrot_mkt_rooms`           | id, product_id, buyer_id, seller_id (UNQ:product_id+buyer_id)            |
| `carrot_mkt_messages`        | id, room_id, sender_id, text, created_at                                 |

서버 첫 요청 시 `CREATE TABLE IF NOT EXISTS`로 자동 생성됩니다.

## 환경변수 (`.env`)

```env
DATABASE_URL=postgresql://...supabase.com:6543/postgres
JWT_SECRET=replace-me
IMAGEKIT_PUBLIC_KEY=public_xxx
IMAGEKIT_PRIVATE_KEY=private_xxx
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id
PORT=3000
```

## 로컬 실행

```bash
npm install
node server.js          # http://localhost:3000
node seed.js            # (선택) 샘플 사용자 + 상품 + ImageKit 이미지 시딩
```

`seed.js`는 다음을 수행합니다:
- 관리자 1명 + 일반 사용자 3명 시딩
  - **`admin@carrot.test` / `admin1234`** (👑 ADMIN)
  - `minji@carrot.test` / `carrot123`
  - `jihoon@carrot.test` / `carrot123`
  - `soyeon@carrot.test` / `carrot123`
- 9개의 상품마다 이모지+제목+그라디언트로 SVG 썸네일을 생성 → ImageKit에 업로드 → URL을 DB에 기록

## 관리자 (👑)

`is_admin = TRUE` 유저는 헤더에 **👑 관리자** 링크가 노출되며, `#/admin` 대시보드에서 다음을 수행할 수 있어요.

- 전체 통계 (사용자/상품/관심/채팅방/메시지 카운트)
- 사용자 관리: 권한 부여/해제, 강제 삭제 (본인 제외)
- 상품 관리: 모든 상품의 수정/삭제

서버 측에서도 상품 PUT/DELETE는 본인 또는 관리자만 통과하도록 검증합니다.

## API 요약

```
POST   /api/auth/signup          가입
POST   /api/auth/login           로그인
GET    /api/auth/me              내 정보 (JWT)
PATCH  /api/auth/me              프로필 수정 (JWT)

GET    /api/upload/auth          ImageKit 클라이언트 업로드 서명 (JWT)

GET    /api/categories           카테고리 목록
GET    /api/products             목록 (?q=&category=)
GET    /api/products/:id         상세
POST   /api/products             등록 (JWT)
PUT    /api/products/:id         수정 (본인만, JWT)
DELETE /api/products/:id         삭제 (본인만, JWT)
POST   /api/products/:id/favorite    관심 추가 (JWT)
DELETE /api/products/:id/favorite    관심 해제 (JWT)

GET    /api/me/products          내가 등록한 상품 (JWT)
GET    /api/me/favorites         관심 상품 (JWT)
GET    /api/me/rooms             내 채팅방 목록 (JWT)

POST   /api/rooms                채팅방 생성/get-or-create (JWT)
GET    /api/rooms/:id            채팅방 정보 (JWT)
GET    /api/rooms/:id/messages?since=N   메시지 폴링 (JWT)
POST   /api/rooms/:id/messages   메시지 전송 (JWT)

GET    /api/admin/stats          전체 통계 (👑)
GET    /api/admin/users          사용자 목록 (👑)
PATCH  /api/admin/users/:id      관리자 권한 토글 (👑)
DELETE /api/admin/users/:id      사용자 강제 삭제 (👑)
GET    /api/admin/products       전체 상품 (판매자 정보 포함, 👑)
```

## 권한 / 보안

- `Authorization: Bearer <JWT>` 헤더로 인증.
- 상품 수정/삭제, 채팅방 메시지 조회/전송 시 서버에서 user_id 일치 여부를 검증 (RLS 동등 보호).
- 본인 상품에는 채팅 시작 불가.

## ImageKit 통합 흐름

1. 클라이언트가 `GET /api/upload/auth`로 단명 서명(token, expire, signature)을 발급받음
2. 그 서명으로 `POST https://upload.imagekit.io/api/v1/files/upload`에 직접 업로드
3. 응답의 `url`을 DB(`carrot_mkt_product_images.url`)에 기록

## 1:1 채팅 (Polling)

- 채팅방 진입 시 최근 100개를 가져온 뒤 `since=<lastId>`로 2초마다 새 메시지를 polling.
- 메시지 전송은 즉시 화면에 추가하고 polling baseline을 갱신.

## Vercel 배포

```bash
vercel               # preview
vercel --prod        # production
```

`vercel.json`에서 `/api/*`는 `server.js`로, 나머지는 `index.html`로 rewrite.
배포 시 환경변수(`DATABASE_URL`, `JWT_SECRET`, `IMAGEKIT_*`)를 Vercel 프로젝트 설정에 동일하게 등록.

## 트러블슈팅

- **`(ENOTFOUND) tenant/user ... not found`** : Supabase 프로젝트가 휴면(pause)되었거나 자격증명이 잘못된 경우. Supabase 대시보드에서 프로젝트를 resume하거나 새 connection string을 `.env`의 `DATABASE_URL`에 넣으세요.
- **이미지 업로드 401** : 만료된 서명일 수 있음 — 페이지 새로고침 후 재시도.
- **로그인 후에도 홈에서 인증이 풀려 보임** : 브라우저 localStorage에서 `carrot_token` 삭제 후 다시 로그인.

---

🥕 made for AFM week-7 quest.
