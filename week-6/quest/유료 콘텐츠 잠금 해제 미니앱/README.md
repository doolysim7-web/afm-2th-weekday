# newsletter-unlock — 유료 콘텐츠 잠금 해제 미니앱

**Live:** https://newsletter-unlock.vercel.app
**Deployed:** 2026-04-26

Express 5 + PostgreSQL (Supabase) + JWT 인증 + TossPayments 결제로 동작하는 유료 뉴스레터 잠금 해제 미니앱.

## 구조

3-파일 SPA 패턴 (no /api 폴더, no build step):

- `server.js` — Express 5 서버. `/api/*` 라우트, JWT 발급/검증, Toss 결제 confirm, Postgres 풀, lazy schema 초기화.
- `index.html` — SPA 셸 (정적 호스팅).
- `client.js` — 클라이언트 라우팅 + 결제 플로우 (정적 호스팅).

배포 시 `vercel.json`이 다음을 처리:
- `server.js` → `@vercel/node` 함수
- `index.html`, `client.js` → `@vercel/static`
- `/api/(.*)` → 서버 함수, 그 외 → SPA

## 환경 변수 (Production)

대시보드에 직접 붙여넣지 말고 항상 `printf '%s' '<value>' | vercel env add KEY production` 형태로 설정 (개행 문자 오염 방지). 자세한 내용은 `.env.example` 참고.

| Key               | 용도 | 설정 방법 |
|-------------------|------|-----------|
| `DATABASE_URL`    | Supabase Postgres pooler URL (port 6543) | Supabase 대시보드 → Settings → Database → Connection string (Pooler) |
| `JWT_SECRET`      | JWT 서명 시크릿 | `openssl rand -hex 48` |
| `TOSS_SECRET_KEY` | TossPayments 시크릿 키. 테스트는 `test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6` |

서버는 위 키 모두에 `.trim()`을 적용해 잔여 공백을 방어한다.

## 로컬 실행

```bash
# 1) 환경 변수 동기화 (Production scope를 그대로 가져옴)
vercel env pull .env.local --yes --environment=production

# 2) 의존성
npm install

# 3) 실행 (포트 3000)
npm start
```

`server.js`는 `if (require.main === module)` 가드로 dual-mode 동작 — Vercel에서는 export된 app 핸들러로 호출되고, 로컬에서는 직접 listen.

## 배포

이미 `.vercel/project.json`에 링크된 상태. 새 배포는:

```bash
cd "week-6/quest/유료 콘텐츠 잠금 해제 미니앱"
vercel --prod --yes
```

배포 후 cold-start 워밍을 위해 `/api/contents`를 먼저 한 번 호출하면 schema가 초기화된다 (`CREATE TABLE IF NOT EXISTS`).

## 스모크 테스트

```bash
URL="https://newsletter-unlock.vercel.app"
curl -sI "$URL/" | head -1                # HTTP/2 200 (HTML)
curl -sI "$URL/api/contents" | head -1    # HTTP/2 200 (JSON)
curl -sI "$URL/client.js" | head -1       # HTTP/2 200 (정적 JS — 함수가 아닌 CDN에서 서빙)
```
