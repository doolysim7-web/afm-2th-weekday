# DEV.md - 개발 가이드

> 한글 거래내역서를 30초 안에 영문 PDF·엑셀로 변환하는 사내 업무 도구.
> Architecture: **Option 1 — Single-File (index.html + single.js)**

---

## Requirements

- [ ] 엑셀(.xlsx) / CSV / 이미지(.png, .jpg) 업로드 지원
- [ ] 업로드된 입력에서 거래 행(날짜·종목명·적요·수량·금액 등) 인식
- [ ] 한글 종목명 → 영문 종목명 자동 치환 (사전 우선, 없으면 Gemini)
- [ ] 한글 적요명 → 영문 적요명 자동 치환 (사전 우선, 없으면 Gemini)
- [ ] 이미지 입력은 ImageKit 업로드 → Gemini multimodal로 인식·번역
- [ ] 변환 결과를 영문 엑셀(.xlsx)과 영문 PDF 두 형식으로 다운로드
- [ ] 신규 번역어는 사전 테이블에 자동 누적
- [ ] 모든 변환 작업(원본+결과)은 Postgres에 저장
- [ ] Vercel 프로덕션 배포

## Non-goals

- 파생상품·펀드·해외주식 거래 (v2)
- 영어 외 다국어 출력 (v2)
- 사전 수동 편집 UI (v2)
- 직원 로그인·권한·감사 로그 (v2)
- PDF 자동 이메일 전송 (v2)
- 회계 합계 검증 (직원 책임)

## Style

- 부드러운 베이지/네이비 톤, 금융 문서 느낌
- 표는 줄무늬(zebra) + 우측 정렬 숫자
- **각 섹션 사이 구분기호는 우아하게**: 얇은 그라데이션 라인 + 작은 중앙 마크(✦ 또는 ◇)
- 버튼은 라운드 + 그림자 약간, 비활성 상태 명확히
- 한글 입력본·영문 출력본을 좌우 또는 상하로 동시 비교 가능

## Key Concepts

- **사전(Dictionary)**: 한글 ↔ 영문 매칭. 두 종류 — 종목(stock) / 적요(memo). 같은 한글은 항상 같은 영문(일관성 100% 보장).
- **AI Fallback**: 사전 미스인 경우 Gemini가 영문 후보를 생성하고, 그 결과를 즉시 사전에 INSERT → 다음번부터는 캐시 히트.
- **Job**: 한 번의 업로드부터 결과 다운로드까지의 단위. 원본 형식·파일명·결과 row 수·생성 PDF/엑셀 정보를 jobs 테이블에 보관.
- **Row**: 한 거래내역서의 개별 거래. 한글 원본과 영문 변환본을 함께 저장 (감사·재출력용).

## Open Questions

- 공식 PDF 양식(레이아웃·로고·면책문구)이 확정되면 그 형식에 맞춰 PDF 템플릿 교체
- 이미지 화질·포맷 허용 범위 (현재는 png/jpg, 10MB 이하)
- AI 신규 번역 검수 책임자
- 개인정보 처리(고객 성명·계좌번호) 컴플라이언스
- 파일럿 지점 선정

---

## 선택된 개발 구조

**Single-File Architecture (Option 1)**

이유:
1. 단일 사용자 흐름(업로드 → 결과) — 라우팅·인증 인프라 불필요
2. v1 검증 목표가 "30초 변환" — 인프라보다 변환 품질이 핵심
3. 사전·작업 이력만 외부 DB(Postgres)에 두고 나머지는 두 파일에 집중

## 개발 에이전트

- **`single-react-dev`**: `index.html` 전담. React 18 (CDN) + Tailwind (CDN) + Babel standalone. 모든 UI 컴포넌트가 `<script type="text/babel">` 한 블록 안에 거주. 별도 JS/CSS 파일 분리 금지.
- **`single-server-specialist`**: `single.js` 전담. Express + pg + xlsx + pdfkit + imagekit + multer. API 엔드포인트와 DB 마이그레이션을 한 파일에 집중.

## 프로젝트 구조

```
week-9/거래내역서영문전환/
├── index.html              # 프론트엔드 전체 (React + Tailwind CDN)
├── single.js               # Express 서버 (API + DB + 파일 변환)
├── package.json
├── vercel.json             # 정적 + 서버 라우팅
├── .env                    # 로컬용 (gitignore)
├── .env.example            # 키 이름만
├── .gitignore
└── documents/
    ├── MISSION.md          # (작성됨)
    └── DEV.md              # (이 문서)
```

---

## TODO List

### Phase 1: 디자인 & 프로토타이핑

- [ ] 🟢 `prototype-v1.html` — 더미 한글 거래 데이터 입력 폼 + 더미 영문 결과 테이블 + 다운로드 버튼 UI만 (서버 X)
- 📌 체크포인트: 브라우저에서 직접 열어 업로드 → 미리보기 → 다운로드 버튼 흐름이 시각적으로 완성

### Phase 2: 기본 기능

- [ ] 🟢 프로젝트 초기화: `package.json` + Express(`single.js`) + 정적 서빙
- [ ] 🟢 `prototype-v1.html` → `index.html` 전환, 더미 데이터를 진짜 fetch로 연결
- [ ] 🟢 `.env` 로드 + Postgres 연결 (`pg.Pool`, prefix `trans_kr2eng_`)
- [ ] 🟢 DB 마이그레이션 (lazy init): `trans_kr2eng_dictionary`, `trans_kr2eng_jobs`, `trans_kr2eng_rows`
- [ ] 🟢 `POST /api/convert` — 한글 row 배열 → 사전 조회 → 영문 row 배열 (사전 없는 경우는 임시로 빈 영문 반환, AI는 Phase 3)
- [ ] 🟢 `POST /api/parse-excel` — multer + xlsx로 .xlsx/.csv 파싱해서 한글 row 배열 반환
- [ ] 🟡 `POST /api/generate-excel` — 영문 row → .xlsx Buffer
- [ ] 🟡 `POST /api/generate-pdf` — 영문 row → pdfkit PDF Buffer
- 📌 체크포인트: 엑셀/CSV 업로드 → 사전 기반 영문 변환 → PDF/엑셀 다운로드까지 동작 (Gemini·이미지 제외)

### Phase 3: 핵심 & 어려운 기능

- [ ] 🔴 **Gemini 텍스트 번역 fallback** ⚠️ 실패 시 우회: 빈 영문 + 사용자에게 "AI 일시 장애" 메시지. `convertRows()` 안에 사전 미스 행을 모아 Gemini에 batch 번역 → 결과를 dictionary에 INSERT + row에 영문 채움
- [ ] 🔴 **ImageKit 직접 업로드 인증** + **Gemini Vision 이미지 OCR/번역**
  - `GET /api/upload/auth` — HMAC-SHA1 서명 발급 (꼬꼬마텃밭 패턴 참조)
  - 클라이언트가 ImageKit에 직접 PUT → 받은 URL을 `POST /api/convert-image`로 전송
  - 서버는 Gemini multimodal에 이미지 URL + JSON 스키마 prompt → 한글 행 추출 → 사전 변환 흐름과 동일
  - ⚠️ 실패 시 우회: 사용자에게 "이미지 인식 실패, 엑셀로 다시 시도" 안내
- [ ] 🟡 **Job/Row DB 영속화**: 각 변환을 jobs에 INSERT, 각 거래 행을 rows에 INSERT (감사용)
- [ ] 🟡 **사전 일관성**: 같은 한글에 두 번째 Gemini 호출이 일어나지 않도록 UNIQUE 제약 + ON CONFLICT
- 📌 체크포인트: 엑셀+이미지 두 경로 모두에서 사전 누적이 작동하고, DB에 작업 이력이 쌓임

### Phase 4: 마무리 & 배포

- [ ] 🟡 UI 폴리싱: 우아한 구분선(얇은 그라데이션 라인 + 중앙 마크), 로딩 상태, 에러 메시지
- [ ] 🟡 `vercel.json` 작성: builds + rewrites (꼬꼬마텃밭 패턴)
- [ ] 🟡 Vercel 대시보드에 환경변수 등록 (`GEMINI_API_KEY`, `DATABASE_URL`, `IMAGEKIT_*`)
- [ ] 🟡 `vercel --prod` 배포 + 라이브 URL 검증
- [ ] 🟢 git 커밋 + 푸시
- 📌 체크포인트: 라이브 URL에서 엑셀·이미지 양쪽 변환 후 PDF·엑셀 다운로드까지 동작

---

## 외부 설정 필요 항목

### 필수 (Must Have)

| 항목 | 설명 | 획득 방법 |
|------|------|----------|
| `DATABASE_URL` | Supabase Postgres 연결 문자열 (pooler) | 사용자 제공 — Supabase Dashboard → Settings → Database → Connection string |
| `GEMINI_API_KEY` | Gemini API 키 (텍스트 + Vision) | 사용자 제공 — https://aistudio.google.com/app/apikey |
| `IMAGEKIT_PUBLIC_KEY` | ImageKit 공개 키 | 사용자 제공 — ImageKit Dashboard → Developer Options |
| `IMAGEKIT_PRIVATE_KEY` | ImageKit 비공개 키 (서버 서명용) | 동일 |
| `IMAGEKIT_URL_ENDPOINT` | ImageKit 업로드 endpoint URL | 사용자 제공 (`https://ik.imagekit.io/3um8y0hge`) |

### Vercel 배포 시

1. `vercel link` (기존 프로젝트 또는 신규 생성)
2. Vercel Dashboard → Project Settings → Environment Variables에 위 5개 등록 (Production / Preview / Development 모두 체크)
3. `vercel --prod`

---

## 시작하기

```bash
cd "week-9/거래내역서영문전환"
npm install
cp .env.example .env   # 값 채우기 (이미 .env가 있으면 스킵)
npm run dev            # node --watch single.js
# 브라우저: http://localhost:3002
```
