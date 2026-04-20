# 🧭 나만의 AI 대시보드

로그인하면 **내 데이터(DB + Notion + 날씨 + 뉴스)** 가 한 화면에 모이고, **AI가 그 전부를 종합해 오늘의 브리핑**을 써주는 개인 대시보드.

Express 5 + PostgreSQL(Supabase) + JWT + Gemini 3-파일 SPA.

## 🚀 Production

- **Live:** https://personal-ai-dashboard-puce.vercel.app
- **호스팅:** Vercel Serverless (Node 20)
- **DB:** Supabase PostgreSQL (pooler 6543)
- **Notion:** `notion-snapshot.json` (MCP 스냅샷 모드)

## 데이터 소스 한눈에

| 위젯 | 소스 | 비고 |
|---|---|---|
| 🌤️ 오늘 날씨 | **Open-Meteo** (무인증) | 서울 기본, 현재 기온/습도/풍속/강수확률 |
| 💰 이달 가계부 요약 | **Supabase `transactions` 테이블** | 가계부 앱과 공유. 수입·지출·Top 5 카테고리 |
| 📝 노션 할 일 | **Notion** (MCP 스냅샷) | 환경변수 `NOTION_TOKEN` 있으면 라이브, 없으면 `notion-snapshot.json` |
| 🎯 내 습관 | **Supabase `dash_habits` / `dash_habit_checks`** | 회원가입 시 기본 3개 시드, 최근 7일 체크율 |
| 📰 테크 뉴스 | **Hacker News Firebase API** (무인증) | 상위 5개 |
| 🗒️ 퀵 메모 | **Supabase `dash_memos`** | 개인별 500자 한도 |
| ✨ AI 브리핑 | **Gemini (gemma-3-12b-it)** | 위 전부를 프롬프트로 묶어 한국어 브리핑 생성 |

## 구성

```
나만의 AI 대시보드/
├── server.js              ← Express 5 + PG + JWT + Gemini + 모든 외부 호출
├── index.html             ← 로그인/회원가입 + 대시보드 위젯 그리드
├── client.js              ← SPA 해시 라우팅 + 위젯 렌더
├── notion-snapshot.json   ← Notion 페이지 "나의 할일" MCP 스냅샷 (커밋됨)
├── package.json / vercel.json
├── .env.example / .gitignore
```

## 실행

```bash
cp .env.example .env.local
# .env.local:
#   DATABASE_URL=postgres://...
#   GEMINI_API_KEY=...
#   JWT_SECRET=$(openssl rand -hex 32)
#   NOTION_TOKEN=secret_...    (선택)

npm install
npm start                    # http://localhost:3000
```

회원가입 시 기본 습관 3종(물 2L / 독서 30분 / 스트레칭 10분)이 자동 시드됩니다.

## DB 스키마

```sql
CREATE TABLE dash_users (
  id SERIAL PRIMARY KEY, email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL, name VARCHAR(30) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE dash_memos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES dash_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE dash_habits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES dash_users(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL, icon VARCHAR(8) DEFAULT '⭐',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE dash_habit_checks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES dash_users(id) ON DELETE CASCADE,
  habit_id INTEGER NOT NULL REFERENCES dash_habits(id) ON DELETE CASCADE,
  date DATE NOT NULL, created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (habit_id, date)
);
```

`transactions` 테이블은 가계부 앱에서 생성된 공유 테이블을 **읽기만** 합니다.

## API

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/register` | — | 회원가입 (email, password, name) |
| POST | `/api/auth/login` | — | 로그인 |
| GET  | `/api/auth/me` | ✔️ | 내 정보 |
| GET  | `/api/dashboard` | ✔️ | 모든 위젯 데이터 한 번에 |
| POST | `/api/brief` | ✔️ | AI "오늘의 브리핑" 생성 (Gemini) |
| GET  | `/api/memos` / POST / DELETE :id | ✔️ | 메모 CRUD |
| GET  | `/api/habits` / POST / DELETE :id | ✔️ | 습관 관리 |
| POST | `/api/habits/:id/toggle` | ✔️ | 오늘 체크/해제 |
| GET  | `/api/notion/todos` | — | 노션 할 일 (라이브 or 스냅샷) |
| GET  | `/api/weather?lat=&lon=` | — | Open-Meteo, 기본 서울 |
| GET  | `/api/news` | — | Hacker News top 5 |

## AI 브리핑 — 실제 출력 예시

로그인 후 `✨ 브리핑 생성` 버튼:

> 안녕하세요, 브리핑테스터님! 😊
>
> 🌤️ **오늘 날씨:** 서울 6.9°C, 맑음. 최고 12.7°C, 강수확률 33%.
> 📋 **오늘의 할 일:** 다음 주 월요일 현업 회의(4/21) 준비를 미리 생각해두세요.
> 💰 **이달 지출 요약:** 수입 322만원, 지출 240만원(문화/여가·식비 상위). 잔액 82만원.
> ✨ **추천 액션:** 물 2L와 독서 30분은 완료 ✓. 스트레칭 10분 아직 미체크 — 오늘 꼭 챙기세요.

## 환경변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | ✔️ | Supabase pooler (6543) |
| `JWT_SECRET` | ✔️ | `openssl rand -hex 32` |
| `GEMINI_API_KEY` | ✔️ | AI 브리핑용 |
| `NOTION_TOKEN` | — | 라이브 노션. 없으면 committed snapshot 사용 |
| `NOTION_PAGE_ID` | — | 기본값: "나의 할일" 페이지 ID |
| `GEMINI_MODEL` | — | 기본 `gemma-3-12b-it` |
| `PORT` | — | 기본 3000 |

## 노션 MCP 연동 방식

두 모드 지원:

1. **스냅샷 모드 (기본)** — 본 저장소에는 `notion-snapshot.json`이 커밋되어 있고, 서버는 MCP로 한 번 뽑아둔 이 파일을 읽습니다. 배포 후에도 바로 동작.
2. **라이브 모드** — 환경변수 `NOTION_TOKEN`(Notion integration secret)을 넣으면 `https://api.notion.com/v1/blocks/{page_id}/children` 를 직접 호출해 실시간 반영. 실패 시 자동으로 스냅샷으로 fallback.

노션 페이지를 바꾸면:
- 로컬: `NOTION_TOKEN` 설정 → 즉시 반영
- Vercel 등 배포: `NOTION_TOKEN` env에 추가 or MCP로 재스냅샷 후 커밋
