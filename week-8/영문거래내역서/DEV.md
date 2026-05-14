# DEV.md — 개발 가이드

> **kr2en-statement 앱의 증권 거래내역서 모듈 (Securities Module)**
> 한국 증권사 거래내역서를 해외 세무·계좌 개설·이민 증빙용 공식 영문 PDF로 변환하는 모듈을 **기존 운영 중인 kr2en-statement 상용 앱에 통합**한다.
> Architecture: **Option 1 — Single-File Architecture** (기존 앱 구조 그대로)

---

## Requirements

MISSION.md에서 추출한 요구사항. 빌드 완료 시점에 모두 체크되어야 한다.

### 업로드 & 양식 인식
- [ ] 증권사 거래내역서 업로드 흐름 (기존 kr2en-statement 업로드 UI 재사용)
- [ ] 업로드 시 사용자가 "은행 거래내역서 / 증권 거래내역서" 분기 선택 (자동 감지는 v1 범위 밖, 향후 옵션)
- [ ] 한국 주요 증권사 양식 식별 (키움·미래에셋·삼성·한국투자·NH·KB·신한 중 v1 지원 범위 추후 확정)
- [ ] 페이지 단위 결제 연동 (기존 Toss Payments 흐름 그대로)

### 8개 항목 추출 & 영문 변환
- [ ] 종목명 + 영문명/티커 매핑 (예: 삼성전자 → Samsung Electronics Co., Ltd. / 005930.KS)
- [ ] 매수/매도 구분 (Buy / Sell)
- [ ] 수량·단가·거래금액 (Quantity / Unit Price / Trade Amount, KRW + USD 환산 옵션)
- [ ] 평가금액·평가손익 (Market Value / Unrealized Gain·Loss)
- [ ] 배당금 내역 (Dividend Income — 지급일, 종목, 세전·세후)
- [ ] 양도소득세·거래세 (Capital Gains Tax / Transaction Tax)
- [ ] 입출금(예수금) 내역 (Deposit / Withdrawal, Cash Balance)
- [ ] 환전 내역 (Currency Exchange — KRW ↔ USD 등, 환율 포함)

### 영문 PDF 생성
- [ ] 해외 기관 수용 가능한 표준 포맷 (컬럼 정렬, 합계 행, 통화 표기 명확화)
- [ ] 변환 결과 미리보기 + 항목별 인라인 편집
- [ ] 원본 한글 ↔ 변환 영문 매핑 보기 (검증용)
- [ ] PDF 다운로드

### 통합
- [ ] 기존 결제 흐름과 단절 없이 연결 (페이지 수 산정 후 결제 → 결과 제공)
- [ ] 기존 JWT 인증 그대로 사용
- [ ] DB 테이블에 `document_type` 컬럼 추가하여 은행/증권 변환 이력 구분

---

## Non-goals

명시적으로 v1에서 하지 않을 것 (MISSION.md Anti-Scope 그대로).

- 별도 도메인/서비스로 분리하지 않음 — kr2en-statement 내부 모듈로만 동작
- 실시간 증권사 API 연동(OAuth/스크래핑) 금지 — 사용자가 직접 다운받은 파일 업로드만 지원
- 미국 세무 신고서(Form 1040, Schedule D, Form 8938 등) 자동 작성 금지
- 암호화폐 거래내역 미지원 (주식·ETF·채권 등 전통 증권만)
- 번역공증·영사확인 등 법적 인증 서비스 미제공
- 투자 자문·세무 자문 미제공

---

## Style

- 기존 kr2en-statement의 시각 언어를 그대로 따른다 (Tailwind, 흰 배경, 단순한 카드 레이아웃).
- 증권 모드 진입 시 상단에 "Securities Statement" 배지로 명시적 분기 표시.
- 영문 PDF는 IRS·해외 KYC 제출을 의식해 **흑백·고대비·sans-serif** 기본. 컬러는 합계행 강조 정도까지만.
- 테이블은 컬럼 정렬을 명확히 하고 통화 단위(KRW / USD)를 셀마다 명시.
- 인라인 편집은 셀 클릭 → 입력 → blur 저장의 직관적 패턴.

---

## Key Concepts

- **증권사 양식 (Brokerage Format)**: 키움·미래에셋·삼성 등 각 증권사별 거래내역서 PDF 레이아웃. v1에서는 양식 자동 감지보다는 추출 항목 자체에 집중.
- **종목 매핑 (Ticker Mapping)**: 한글 종목명을 정식 영문 회사명 + 거래소 티커(예: `005930.KS`)로 변환. KRX 상장 종목 기준 정적 사전(`KR_TICKER_MAP`) + Gemini fallback.
- **8개 항목 (8 Items)**: MISSION.md에서 정의한 종목·매수매도·수량단가·평가손익·배당·세금·입출금·환전. v1 필수 추출 대상.
- **분기 토글 (StatementTypeToggle)**: 업로드 직전 사용자가 "은행" / "증권" 중 선택. UI 분기와 백엔드 프롬프트 분기를 동시에 트리거.
- **인라인 편집 (Inline Editor)**: 추출 결과 미리보기 표의 셀을 직접 수정. AI 추출 정확도가 100%가 아닐 때를 대비한 안전망.

---

## Open Questions

빌드 착수 전 또는 v1 베타 중 확정 필요 (MISSION.md 그대로).

1. **주 사용처 우선순위** — 미국 세무 신고용 1순위 가정, 실제 사용 데이터로 검증 필요.
2. **우선 지원 증권사 양식 범위** — v1 출시 시 최소 몇 개 증권사 양식을 커버할지 확정 필요.
3. **성공 지표 수치 기준선** — 95% 정확도, 98% 매핑, 60초 처리의 적정성 확정 필요.
4. **영문 PDF 표준 포맷** — IRS / KYC / 이민국용을 단일 범용 포맷으로 갈지, 사용처별 템플릿으로 갈지.
5. **분기 방식** — 사용자 선택 / 자동 감지 / 양쪽 지원 중 결정 필요. (v1은 "사용자 선택" 우선 가정)

---

## 선택된 개발 구조

**Option 1 — Single-File Architecture**

선택 이유:
- 기존 kr2en-statement가 이미 이 구조로 운영 중 (`index.html` + `server.js` 단일 파일 쌍)
- 별도 프레임워크 도입 없이 컴포넌트만 추가하면 됨
- Vercel 배포·결제·인증·DB·이미지 업로드 인프라가 모두 그대로 재사용됨
- 증권 모듈은 "변환 화면 추가"이므로 라우팅 복잡도가 낮음

기존 인프라 스택:
- Frontend: `index.html` (React 18 CDN + Tailwind CDN + Babel standalone)
- Backend: `server.js` (Express + Postgres + Gemini API + Toss Payments + ImageKit + JWT)
- 배포: Vercel
- DB: Postgres (Vercel 연결)

---

## 개발 에이전트

본 모듈 작업은 다음 두 에이전트로 분담한다.

### `single-react-dev` — 프론트엔드 (`index.html`) 전담
- **규칙**: 모든 프론트엔드 코드(컴포넌트, Tailwind 클래스, 상태 관리)는 `index.html` 한 파일에 포함.
- **금지**: 별도 `.js`, `.jsx`, `.css` 파일 분리. `js/`, `css/`, `components/` 폴더 생성 금지.
- **컴포넌트 추가 위치**: 기존 `<script type="text/babel">` 블록 내부, 다음 6구역 구조를 유지하며 적절한 구역에 추가.
  1. React Hooks Destructuring
  2. Design System Components
  3. Common/Layout Components
  4. **Page Components** ← 증권 관련 컴포넌트는 주로 여기
  5. App Component (라우팅·상태)
  6. Rendering
- **금지 변경**: 기존 결제 흐름·인증 흐름·은행 모드 코드는 가능한 한 건드리지 않고, 분기 토글로 새 모드를 얹는다.

### `single-server-specialist` — 백엔드 (`server.js`) 전담
- **규칙**: 모든 백엔드 코드는 `server.js` 한 파일에 포함.
- **금지**: `routes/`, `controllers/`, `services/` 폴더로 분리 금지.
- **추가 위치**: 기존 라우트 정의 영역에 증권 전용 라우트 (`/api/securities/extract`, `/api/securities/pdf`) 추가.
- **프롬프트 상수**: 파일 상단의 프롬프트 상수 영역에 `SECURITIES_EXTRACT_PROMPT` 추가.
- **DB 마이그레이션**: `conversions` 테이블에 `document_type VARCHAR(20) DEFAULT 'bank'` 컬럼 추가하는 ALTER 문을 명시.
- **결제 흐름 보존**: 기존 Toss 결제 검증 로직 그대로 재사용, 증권 모드라고 별도 로직 만들지 않음.

---

## 프로젝트 구조

기존 앱 구조 그대로. 증권 모듈은 신규 파일을 최소화하고 기존 두 파일에 추가하는 방식.

```
/  (기존 kr2en-statement 앱 루트)
├── index.html                  # ← 증권 컴포넌트들이 여기에 추가됨 (single-react-dev 담당)
├── server.js                   # ← SECURITIES_EXTRACT_PROMPT, extractSecuritiesData() 추가 (single-server-specialist 담당)
├── kr_ticker_map.json          # ← 신규: KOSPI/KOSDAQ 종목명-영문명-티커 매핑 정적 사전
├── package.json                # 변경 없음 (PDF 생성 라이브러리 추가 시에만 수정)
├── vercel.json                 # 변경 없음
└── .env                        # 변경 없음 (기존 키 그대로)
```

**프로토타이핑 단계에서만 별도 폴더 사용**:
```
/Users/sugnyeo/Downloads/afm/week-8/영문거래내역서/
├── MISSION.md
├── DEV.md
└── prototype-v1.html           # Phase 1 산출물. 브라우저에서 직접 열어 확인. Phase 2에서 본 앱 index.html에 흡수.
```

---

## TODO List

바이브 코딩 최적화 순서 (기존 앱 모듈 추가에 맞춰 조정).

### Phase 1 — 디자인 & 프로토타이핑

목적: 동작하는 화면 모양을 먼저 잡는다. 기존 앱 코드는 건드리지 않는다. 서버 불필요.

- [ ] 🟢 `prototype-v1.html` 단일 파일 생성 — React 18 CDN + Tailwind CDN + Babel standalone, 기존 `index.html`의 디자인 토큰만 복사
- [ ] 🟢 `StatementTypeToggle` 컴포넌트 (Bank / Securities 분기 라디오·토글)
- [ ] 🟢 `SecuritiesUploadFlow` — 업로드 영역 (실제 업로드 없이 더미 트리거)
- [ ] 🟢 `SecuritiesPreview` — 8개 항목 표 미리보기 (더미 JSON 하드코딩)
  - 종목/매수매도/수량/단가/거래금액/평가손익/배당/세금/입출금/환전 컬럼 정렬과 합계행 디자인 확정
- [ ] 🟢 `SecuritiesItemEditor` — 셀 클릭 시 인라인 편집 UI (더미 상태 변경)
- [ ] 🟢 `BilingualMappingView` — 한↔영 매핑 보기 (좌측 한국어 원본, 우측 영문 변환, 더미 데이터)
- [ ] 🟢 `SecuritiesPDFExport` — 다운로드 버튼 (Phase 1에서는 동작 안 함, 자리만 잡기)
- 📌 **체크포인트**: `prototype-v1.html`을 브라우저에서 직접 열면 더미 데이터로 전체 증권 흐름 화면이 모두 보이고, 토글·인라인 편집이 시각적으로 동작
- 📌 **git commit**: `prototype-v1.html` 커밋 — 세이브 포인트

### Phase 2 — 기본 기능 (쉬운 것부터, AI 학습 데이터 풍부한 영역)

목적: `prototype-v1.html` 컴포넌트들을 기존 `index.html`로 흡수하고, 운영 인프라(인증·결제·DB·Gemini)에 연결.

> 프로젝트 초기화 태스크는 **없음** — 이미 운영 중인 앱이므로 `npm install`, Express 셋업, Vercel 연결 모두 완료 상태.

- [ ] 🟢 기존 앱에서 신규 브랜치 분기: `git checkout -b feat/securities-module`
- [ ] 🟢 `index.html`에 `StatementTypeToggle` 컴포넌트 추가 (Page Components 구역) — 업로드 화면 진입 시 모드 선택
- [ ] 🟢 `index.html`에 `SecuritiesUploadFlow` 추가 — 기존 업로드 핸들러 재사용, FormData에 `document_type=securities` 필드 추가
- [ ] 🟢 `index.html`에 `SecuritiesPreview` 추가 — Phase 1 디자인 그대로 이식, 데이터는 백엔드 응답 연결
- [ ] 🟢 `index.html`에 `SecuritiesItemEditor` 추가 — 로컬 상태 기반 인라인 편집, 저장 시 conversion row 업데이트
- [ ] 🟢 `index.html`에 `BilingualMappingView` 추가 — 추출 결과의 원본/영문 병기
- [ ] 🟡 `server.js`에 `SECURITIES_EXTRACT_PROMPT` 상수 추가 (8개 항목 추출 지시 + JSON 출력 스키마 명시, few-shot 예제는 Phase 3에서 보강)
- [ ] 🟡 `server.js`에 `extractSecuritiesData(buffer)` 함수 추가 — Gemini 호출, JSON 파싱, 후처리
- [ ] 🟡 `server.js`의 업로드 라우트 분기: `document_type === 'securities'` 인 경우 `extractSecuritiesData()` 호출
- [ ] 🟡 DB 마이그레이션: `ALTER TABLE conversions ADD COLUMN document_type VARCHAR(20) DEFAULT 'bank';` (Vercel Postgres에 실행)
- [ ] 🟡 `server.js`의 conversion 저장 로직에 `document_type` 컬럼 함께 저장
- 📌 **체크포인트**: 로컬 dev 환경에서 증권 PDF 업로드 → 8개 항목이 JSON으로 추출되어 화면에 표로 표시 (매핑·PDF는 아직 거칠어도 됨)
- 📌 **git commit**: 기본 추출 흐름 동작 — 다음 단계에서 실패해도 이 지점으로 롤백 가능

### Phase 2.5 — 플랫폼 연결 검증 (Vercel + 기존 결제·인증)

목적: Phase 3의 어려운 기능 시도 전에, 운영 환경에서 기존 인프라와 정상 결합되는지 미리 확인.

- [ ] 🟡 Vercel preview 배포 — `vercel --prod=false` 또는 PR 자동 preview
- [ ] 🟡 preview 환경에서 JWT 로그인 → 증권 모드 업로드 → 페이지 수 산정 → Toss 결제 → 결과 제공 전체 흐름 확인
- [ ] 🟡 `DEV_SKIP_TOSS_CONFIRM=true` 분기가 preview에서도 동작하는지 확인
- [ ] 🟡 conversions 테이블에 `document_type='securities'` 행이 정상 기록되는지 DB 직접 확인
- [ ] 🟡 기존 은행 모드가 회귀 없이 그대로 동작하는지 검증 (가장 중요)
- 📌 **체크포인트**: preview URL에서 증권/은행 두 모드 모두 결제·인증과 정상 연동
- 📌 **git commit**: 플랫폼 검증 완료 — Phase 3의 어려운 기능 진입 직전 세이브 포인트

### Phase 3 — 핵심 & 어려운 기능 (불확실도 높은 순서대로)

목적: 이 앱만의 도메인 특화 난제 해결. 가장 리스크 큰 것부터 시도해 일찍 우회 결정을 내릴 수 있게 함.

- [ ] 🔴 **(1) 종목명 → 영문명/티커 매핑 정확도 확보**
  - `kr_ticker_map.json` 정적 사전 구축 (KOSPI/KOSDAQ + 주요 ETF, KRX 데이터 기반)
  - `server.js`에 `KR_TICKER_MAP` 로딩 및 `mapTickerSymbols(rawName)` 함수 구현
  - 정적 사전에 없으면 Gemini fallback (`KRX 상장 종목 "X"의 정식 영문 회사명과 .KS/.KQ 티커를 알려줘` 형식)
  - ⚠️ **실패 시 우회**: 매핑 정확도가 목표(98%)에 못 미치면 `SecuritiesItemEditor`의 인라인 편집을 전면에 노출하고 "AI 추출은 초안이며 사용자 확인 필요" UX로 전환
- [ ] 🔴 **(2) 영문 PDF 표 레이아웃**
  - PDF 생성 라이브러리 결정 (pdfkit / puppeteer / @react-pdf/renderer 중 택1, 서버사이드 권장)
  - `server.js`에 `generateSecuritiesPDF(conversionData)` 함수 추가
  - 컬럼 정렬, 합계 행, 통화 표기(KRW/USD), 페이지 분할(거래 50건마다 새 페이지 등) 구현
  - 표지 페이지에 변환 일시·원본 파일명·페이지 수 메타데이터
  - ⚠️ **실패 시 우회**: 복잡한 PDF 레이아웃이 어려우면 단순 HTML 출력으로 전환하고 "브라우저 인쇄 → PDF 저장" 안내로 대체. 단, 인쇄용 CSS는 깔끔하게 정리.
- [ ] 🔴 **(3) 8개 항목 추출 정확도**
  - `SECURITIES_EXTRACT_PROMPT`에 few-shot 예제 3~5개 추가 (실제 증권사 양식 샘플 기반)
  - JSON 출력 스키마를 엄격하게 정의 (각 항목별 필수 필드, 누락 시 null)
  - 추출 후 검증 함수: 합계 행 검산, 음수 가능 여부, 통화 단위 일관성
  - ⚠️ **실패 시 우회**: 항목별 정확도 편차가 크면 우선순위 매겨서 "안 되는 항목은 명시적으로 빈 칸 + 사용자 입력 유도". 즉 추출은 best-effort, 편집은 무조건 가능.
- [ ] 🟡 **(4) 양도소득세·거래세 계산 검증**
  - 추출된 양도세·거래세 값이 거래금액과의 비율 측면에서 비상식적이지 않은지 sanity check
  - 검증 실패 시 빨간 경고 마크 + 인라인 편집 유도
- [ ] 🟡 **(5) 환전 내역 환율 표기**
  - KRW ↔ USD 등 환전 내역의 환율을 추출하고 영문 표에는 `Exchange Rate: 1 USD = 1,380.50 KRW` 형식으로 명시
  - 환전 일자·금액·환율 모두 표시
- 📌 **체크포인트**: 실제 증권사 양식 샘플 PDF로 end-to-end 테스트 → 영문 PDF가 다운로드되고 8개 항목이 모두 들어 있음
- 📌 **git commit**: 핵심 기능 완료

### Phase 4 — 마무리 & 배포

- [ ] 🟡 UI 폴리싱 — 로딩 스피너, 빈 상태, 에러 토스트, 모바일 레이아웃
- [ ] 🟡 에러 처리 — Gemini 타임아웃·JSON 파싱 실패·PDF 생성 실패 시 사용자에게 명확한 메시지
- [ ] 🟡 `kr_ticker_map.json` 데이터 보강 — 누락 종목 추가, 영문명 표기 통일 (예: `Co., Ltd.` vs `Inc.`)
- [ ] 🟡 기존 은행 모드 회귀 테스트 — 분기 토글이 기본 "은행"으로 동작하는지, 기존 사용자에게 영향 없는지
- [ ] 🟡 README / 마케팅 카피 업데이트 (증권 거래내역서 지원 안내)
- [ ] 🟡 최종 Vercel production 배포 — `vercel --prod`
- [ ] 🟡 production smoke test — 실제 결제 1건으로 증권 흐름 끝까지 확인
- 📌 **체크포인트**: kr2en-statement.vercel.app에서 일반 사용자가 증권 모드를 선택해 영문 PDF를 다운로드할 수 있음
- 📌 **git commit + main 머지 + 태그**: `v1.x-securities`

---

## 외부 설정 필요 항목

기존 kr2en-statement 운영 인프라를 그대로 활용하므로 **새로 발급받아야 하는 시크릿/키는 없다.** 신규로 필요한 것은 **정적 데이터(종목 매핑)** 이다.

### 기존 보유 — 추가 작업 없음

| 항목 | 용도 | 상태 |
|------|------|------|
| `DATABASE_URL` | Postgres 연결 (conversions 테이블 사용) | 기존 보유. ALTER TABLE만 1회 실행 |
| `GEMINI_API_KEY` | Gemini로 거래내역 추출 + 종목 매핑 fallback | 기존 보유 |
| `JWT_SECRET` | 사용자 인증 토큰 | 기존 보유 |
| `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` | 페이지 단위 결제 (기존 흐름 재사용) | 기존 보유 |
| `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` | 업로드 파일 저장 | 기존 보유 |
| `DEV_SKIP_TOSS_CONFIRM` | 개발 환경에서 결제 우회 | 기존 보유 |

### 신규 필요 — 데이터/자료 (env 아님)

| 항목 | 내용 | 획득 방법 |
|------|------|-----------|
| **KOSPI/KOSDAQ 상장 종목 매핑** | 종목코드(예: 005930) + 한글명(삼성전자) + 영문명(Samsung Electronics Co., Ltd.) + 거래소 접미사(.KS / .KQ) | (1) KRX 정보데이터시스템(http://data.krx.co.kr) 에서 상장법인목록 CSV 다운로드. (2) 영문명은 KRX 영문 페이지 또는 yfinance/Yahoo Finance에서 종목코드로 조회해 정식 영문명 매핑. (3) `kr_ticker_map.json` 으로 저장 |
| **주요 ETF 영문명 매핑** | 국내 상장 ETF (TIGER, KODEX, ARIRANG 등)의 영문 표기 | 운용사 공식 자료(미래에셋·삼성자산운용 등) 또는 KRX ETF 페이지에서 영문명 확보 후 위 JSON에 통합 |
| **증권사 거래내역서 샘플 PDF** | 프롬프트 few-shot 예제용 + Phase 3 추출 정확도 테스트용 | 키움·미래에셋·삼성·한국투자·NH·KB·신한 중 가능한 양식을 사용자 본인 계좌나 베타 테스터로부터 수집. **개인정보 마스킹 필수.** |

### 신규 env 변수 — **없음**

증권 모듈은 기존 환경 변수만으로 동작한다. 추가 env가 필요하다면 그 시점에만 별도로 정의한다 (예: PDF 생성 라이브러리가 외부 서비스를 쓰는 경우 등).

### 신규 npm 패키지 — 추후 결정

Phase 3에서 PDF 생성 방식 결정 후 다음 중 하나를 `package.json`에 추가:
- `pdfkit` — 서버사이드 PDF 직접 그리기, 컬럼 제어 강함
- `puppeteer` — HTML → PDF, 디자인 자유도 높지만 Vercel serverless에서 무거움
- `@react-pdf/renderer` — React 컴포넌트로 PDF 정의, 학습 곡선 있음

권장: **pdfkit 우선 시도** → 표 레이아웃이 너무 까다로우면 puppeteer로 전환.

---

## 시작하기

기존 운영 앱에 작업을 시작하는 명령. 신규 `npm init` 단계는 없다.

```bash
# 1) 기존 kr2en-statement 앱 폴더로 이동
cd "/Users/sugnyeo/Downloads/afm/week-6/quest/경쟁 서비스 3곳 크롬 MCP 리서치/app"

# 2) 작업 브랜치 분기
git checkout -b feat/securities-module

# 3) 현재 상태 확인 (의존성·환경 변수는 이미 설치/설정되어 있음)
npm ls --depth=0
cat .env | grep -E 'DATABASE_URL|GEMINI|JWT|TOSS|IMAGEKIT' | sed 's/=.*/=***/'

# 4) 로컬 dev 서버 기동 (기존 그대로)
npm run dev   # 또는 node server.js

# 5) Phase 1 프로토타입은 본 앱 폴더가 아니라 영문거래내역서 폴더에서 별도 실험
#    (기존 앱 코드를 건드리지 않기 위함)
cd "/Users/sugnyeo/Downloads/afm/week-8/영문거래내역서"
#    여기에 prototype-v1.html 을 생성하고 브라우저로 직접 열어서 디자인 검증

# 6) Phase 2부터 다시 본 앱 폴더로 돌아와 index.html / server.js 에 컴포넌트·라우트 추가
cd "/Users/sugnyeo/Downloads/afm/week-6/quest/경쟁 서비스 3곳 크롬 MCP 리서치/app"

# 7) DB 컬럼 추가 (Phase 2 중간) — Vercel Postgres 대시보드 SQL Runner 또는 psql
#    ALTER TABLE conversions ADD COLUMN document_type VARCHAR(20) DEFAULT 'bank';

# 8) Phase 2.5 — preview 배포
vercel    # preview URL 받아서 결제 + 인증 + 증권 흐름 검증

# 9) Phase 4 — production 배포
vercel --prod
```

### 작업 분담 메모

- **`single-react-dev` 에이전트 호출 시점**: Phase 1 전반, Phase 2의 컴포넌트 추가, Phase 3의 인라인 편집 UX 강화, Phase 4의 UI 폴리싱.
- **`single-server-specialist` 에이전트 호출 시점**: Phase 2의 `SECURITIES_EXTRACT_PROMPT` / `extractSecuritiesData()` 추가, DB 마이그레이션, Phase 3의 `mapTickerSymbols()` / `generateSecuritiesPDF()` 구현, Phase 4의 에러 처리.

### 다음 한 줄

**바로 시작할 일**: `/Users/sugnyeo/Downloads/afm/week-8/영문거래내역서/prototype-v1.html` 를 생성하고 8개 항목 표 + 인라인 편집 UI를 더미 데이터로 그려본다 (Phase 1).
