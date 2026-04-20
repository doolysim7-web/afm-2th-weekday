# 커뮤니티 앱

Express 5 + PostgreSQL(Supabase) + JWT 인증으로 동작하는 SPA 커뮤니티 앱. Vercel 서버리스로 배포된다.

## Production

- **Live**: https://community-app-ruby.vercel.app
- **Stack**: Express 5 (serverless function), Supabase PostgreSQL (pooler), JWT (HS256), bcryptjs, static SPA (`index.html` + `client.js`)
- **Runtime**: Node 20.x on `@vercel/node`

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | `{email, password, nickname}` → user + token |
| POST | `/api/auth/login` | no | `{email, password}` → user + token |
| GET | `/api/auth/me` | yes | Current user profile |
| GET | `/api/posts` | yes | List all posts (desc) |
| GET | `/api/posts/:id` | yes | Single post |
| POST | `/api/posts` | yes | `{title, content}` |
| PATCH | `/api/posts/:id` | yes (owner) | Partial update |
| DELETE | `/api/posts/:id` | yes (owner) | Delete |
| GET | `/*` | no | SPA fallback (`index.html`) |

`Authorization: Bearer <JWT>` is required for everything under `/api` except `/api/auth/register` and `/api/auth/login`.

## Environment variables

Set in Vercel (Production + Development). See `.env.example` for shape.

| Name | Purpose | Generate with |
|---|---|---|
| `DATABASE_URL` | Supabase pooler connection string (port 6543) | Supabase dashboard → Connection string → "Session pooler" |
| `JWT_SECRET` | Symmetric secret for JWT HS256 | `openssl rand -hex 32` |

Never paste the dev fallback `dev-secret-change-me` into production. Values must be free of trailing newlines — use `printf` or the Vercel dashboard (not `echo`).

## Local dev

```sh
cp .env.example .env.local
# fill DATABASE_URL and JWT_SECRET
node server.js          # listens on PORT (default 3000)
```

`server.js` auto-creates the `community_users` and `community_posts` tables on the first `/api/*` request.

## Deploy

```sh
cd "week-5/quest/커뮤니티 앱"
vercel --prod --yes
```

`vercel.json` uses the classic `@vercel/node` + `@vercel/static` builders so the Express app is bundled as a single serverless function and the SPA assets are served statically. SPA fallback is handled by Express 5's `/{*splat}` route.

## Notes

- This folder lives inside a monorepo-style tree; its own `package.json` exists specifically so Vercel has a self-contained build unit. The repo-root `package.json` is only for local experimentation.
- `if (require.main === module)` guards `app.listen()` so the same `server.js` works both locally and in the Vercel serverless runtime.
- DB initialization is lazy + idempotent (`CREATE TABLE IF NOT EXISTS`) to tolerate cold starts.
