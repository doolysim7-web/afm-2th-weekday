# 🏋️ 나를 아는 AI 에이전트 — 퍼스널 트레이너

**Context 파일 + DB 운동 기록을 결합**해 "나에게 딱 맞는" 운동 루틴을 추천하는 AI 에이전트입니다.

같은 질문이라도 Context를 빼면 평범한 일반론, Context를 주면 부상·컨디션·최근 무게까지 반영된 맞춤 답변이 나옵니다. UI에서 한 번에 비교해볼 수 있습니다.

## 구성

```
나를 아는 AI 에이전트/
├── server.js         ← Express 5 + PostgreSQL + Gemini API
├── index.html        ← 3-탭 SPA (AI 트레이너 / Context / 운동 기록)
├── client.js         ← 프론트 로직 (compare 호출, Context 편집, 기록 CRUD)
├── context.md        ← 나의 프로파일 (체력 수준 / 부상 이력 / 목표 / 오늘의 컨디션)
├── package.json
├── vercel.json
├── .env.example
└── .gitignore
```

## 데이터 소스

| 소스 | 저장소 | 내용 |
|---|---|---|
| **Context** | `context.md` (파일) | 정적인 "나"에 대한 정보 — 부상, 목표, 선호, 환경 |
| **DB** | Supabase Postgres `workout_logs` 테이블 | 동적인 "내가 한 일" — 날짜·부위·세트·무게 |

이 둘을 동시에 프롬프트에 합쳐 Gemini에 보냅니다.

## 핵심 기능

### 1. AI 트레이너 비교 호출 (`POST /api/compare`)
같은 질문을 **Context 없이** vs **Context + DB 결합** 두 가지 방식으로 동시 호출, 답변을 좌우 패널로 보여주고 실제 프롬프트도 펼쳐볼 수 있음.

### 2. Context 라이브 편집 (`/api/context`)
브라우저에서 `context.md`를 즉시 수정/저장. 다음 AI 호출부터 반영. (Vercel은 read-only fs라 로컬 dev 전용)

### 3. 운동 기록 CRUD (`/api/workouts`)
부위/세트/회/무게/시간/메모 입력. AI는 최근 25건을 자동으로 프롬프트에 포함.

## 실행

```bash
cp .env.example .env.local
# .env.local 에 DATABASE_URL, GEMINI_API_KEY 채우기

npm install
npm start                 # http://localhost:3000
# 다른 포트로: PORT=3200 npm start
```

첫 기동 시 `workout_logs` 테이블이 비어있으면 19건의 샘플 운동 기록을 자동 시드합니다.

## API

| Method | Path | 설명 |
|---|---|---|
| GET  | `/api/context` | context.md 내용 |
| PUT  | `/api/context` | context.md 갱신 (`{ content }`) |
| GET  | `/api/workouts` | 최근 운동 기록 (최대 100건) |
| POST | `/api/workouts` | 기록 추가 |
| DELETE | `/api/workouts/:id` | 기록 삭제 |
| POST | `/api/chat` | 단일 호출 (`{ question, withContext: bool }`) |
| POST | `/api/compare` | 비교 호출 (`{ question }` → without/with 둘 다) |

## "Context 없이 vs 있이" 비교 예시

질문: **"오늘 할 운동 루틴을 짜줘"**

| | Context 없이 (❌) | Context + DB (✅) |
|---|---|---|
| 호칭 | 일반 표현 | "숙녀님, 안녕하세요!" |
| 컨디션 | 무시 | "어제 야근으로 피로도 6 — 볼륨 줄이고…" |
| 부상 | "기저질환 있으면 상담" | "왼쪽 무릎 풀 스쿼트 금지, 오른쪽 손목 플랭크 시 보호" |
| 무게 | "본인 체중 또는 가벼운 무게" | "덤벨 숄더프레스 6kg × 8회"(=DB 기록 그대로) |
| 종목 선택 | 푸쉬업·크런치 등 일반 | "밴드 Y-레이즈 / 페이스 풀 / 힙 쓰러스트"(라운드숄더 목표 + 선호 운동) |
| 다음 계획 | 없음 | "수요일 헬스장 상체 / 금요일 전신 서킷"(루틴 반영) |

→ Context 있이: **부상 회피, 본인 데이터 기반 무게, 목표 정렬, 선호 종목 선택** 까지.

## 환경변수

- `DATABASE_URL` — Supabase Postgres pooler endpoint (6543)
- `GEMINI_API_KEY` — https://aistudio.google.com/apikey
- `GEMINI_MODEL` (선택) — 기본 `gemma-3-12b-it`. Gemini 2.0 Flash 무료 쿼터 소진 시 Gemma로 fallback

## Notion 연동 메모
이 Context 파일의 원본 source는 Notion 페이지로 관리하시되, MCP integration이 해당 페이지에 공유되어 있어야 자동 동기화 가능합니다. (현재 README 기준 시점에는 미공유 상태라 로컬 `context.md`로 동작).
