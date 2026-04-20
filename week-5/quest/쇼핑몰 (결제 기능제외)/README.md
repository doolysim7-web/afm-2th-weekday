# ✏️ 문구네 — 문구류 쇼핑몰 (결제 기능 제외)

Express 5 + PostgreSQL(Supabase) + JWT로 만든 미니 쇼핑몰 SPA입니다.
`server.js`, `index.html`, `client.js` 3-파일 구조로 구성되어 있고, 로컬/Vercel 서버리스 양쪽에서 동일하게 동작합니다.

**배포된 프로덕션 URL:** https://stationery-shop-blue.vercel.app

## 기능

- **회원가입 / 로그인 (JWT)** — 이메일 + 비밀번호, bcrypt 해시, 7일 만료 토큰
- **상품 목록 (공개)** — 로그인 없이 누구나 열람 가능
- **장바구니 (로그인 필요)** — 담기 / 조회 / 수량 +/- 변경 / 삭제 / 총 금액 자동 계산
- 같은 상품을 다시 담으면 UPSERT 로 수량이 누적됩니다 (최대 99)

## 실행

```bash
npm install

# 필요하면 .env 파일 생성 (기본값도 코드에 내장되어 있어 바로 실행 가능)
cp .env.example .env

npm start   # http://localhost:3000
```

첫 기동 시 `shop_products` 테이블이 비어있으면 15종의 문구류 시드 데이터를 자동 삽입합니다.

## DB 스키마

- `shop_users (id, email, password_hash, name, created_at)`
- `shop_products (id, name, price, image_url, description, created_at)`
- `shop_cart_items (id, user_id, product_id, quantity, added_at)` — `UNIQUE(user_id, product_id)`

## API

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/register` | — | 회원가입 (email, password, name) |
| POST | `/api/auth/login` | — | 로그인 |
| GET  | `/api/auth/me` | ✔️ | 내 정보 |
| GET  | `/api/products` | — | 상품 목록 |
| GET  | `/api/products/:id` | — | 상품 단건 |
| GET  | `/api/cart` | ✔️ | 내 장바구니 + 총계 |
| POST | `/api/cart` | ✔️ | 담기 (product_id, quantity) |
| PATCH | `/api/cart/:id` | ✔️ | 수량 변경 (quantity) |
| DELETE | `/api/cart/:id` | ✔️ | 삭제 |

응답 포맷: `{ success: boolean, data?, message? }`

## 환경변수

- `DATABASE_URL` — Supabase PostgreSQL pooler 엔드포인트 (6543)
- `JWT_SECRET` — 프로덕션에서 반드시 설정 (`openssl rand -hex 32`)
- `PORT` — 기본 3000
