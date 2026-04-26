# DEV.md — 꼬꼬마텃밭 (LittleFarm) 개발 계획

> 작성일: 2026-04-26
> 기간: **2주(14일) + 데모데이**
> 1인 개발 + 일평균 4~6시간 작업 가정
> 컨셉: **주말농장러를 위한 작고 따뜻한 텃밭 동반자**

---

## 1. 핵심 기능 (요구사항 매핑)

| # | 기능 | 사용자 가치 | 권한 |
|---|---|---|---|
| F1 | **로그인 / 회원가입 (JWT)** | 일지·가계부 본인만 보관 | Public → Member |
| F2 | **1년 텃밭 캘린더 (공개)** | 비로그인도 "이번 주말에 뭘 심지?" 한눈에 | Public |
| F3 | **작목별 가이드 (5/10/20평 단위)** | 토양·시비·물주기 정량 안내 (소규모 환산) | Public + Member 즐겨찾기 |
| F4 | **농사일기** (CRUD + 사진 업로드/AI 생성) | 토·일에 사진 한 장 + 한 줄 메모 | Member |
| F5 | **농사 가계부** (수입/지출, 카테고리·월별) | "올해 텃밭에 얼마 썼지?" 즉답 | Member |
| F6 | **게시판 + 댓글** | 질문·자랑·정보 공유 | 비로그인 열람 / Member 작성 |
| F7 | **자재 결제** (모종/비료/호미·장갑 등) | 큐레이션 + Toss 결제 | Member |
| F8 | **시기 알림** (로그인 팝업) | "이번 주말은 고추 모종 심을 때예요" | Member |
| F9 | **카카오 친구 공유** | 지인에게 링크 1번에 전달 | Public |
| F10 | **관리자 콘솔** | 작목 콘텐츠 CRUD, 신고 처리, 매출 조회 | Admin |
| F11 | **권한별 조회 / RBAC** | 비로그인 / 회원 / 관리자 분리 | All |
| F12 | **AI 일지 보강 + 가이드 이미지 생성** | "토 오전 풀 뽑음 → Gemini가 정돈된 일지로" | Member / Admin |

---

## 2. 기술 스택

### 프론트엔드
- **React 18 (CDN) + Tailwind CSS (CDN)** — 단일 `index.html` SPA
- **해시 라우팅** — `#/`, `#/calendar`, `#/crops/:id`, `#/log`, `#/budget`, `#/board`, `#/shop`, `#/me`, `#/admin`
- **PWA 매니페스트 + Service Worker** — 모바일 홈 화면 추가, 오프라인 1차 캐시
- **CDN 라이브러리**: `xlsx` (가계부 엑셀), `chart.js` (지출 그래프), `dompurify` (마크다운 안전)
- **톤·스타일**:
  - 색상: 연두(#A7D49C) · 베이지(#FBF6E9) · 주황(#FF9A55)
  - 폰트: Pretendard / Apple SD Gothic Neo, 기본 16px (모바일은 17px)
  - 둥근 모서리(rounded-2xl), 가벼운 그림자, 큰 여백
  - 마이크로카피 친절체("이번 주말은 어땠나요?", "오늘은 어떤 일을 하셨어요?")

### 백엔드
- **Express.js 5 + Node 20** — 단일 `server.js`, Vercel Serverless Functions로 배포
- **JWT (jsonwebtoken) + bcryptjs** — 인증 7일 토큰
- **PostgreSQL (Supabase)** — 모든 데이터, 테이블 prefix **`little_farm_`**
- **`pg` 풀 + Lazy 스키마 init** (memo-app 패턴 답습)

### 외부 서비스
- **Google Gemini API** — 일지 보강(`gemini-2.5-flash`), 가이드 이미지 프롬프트 생성, 챗봇
- **ImageKit** — 사진 직접 업로드 (서버는 HMAC 서명만 발급)
- **TossPayments v2** — 자재 결제, 서버사이드 confirm (Secret Key 노출 X)
- **Kakao SDK (Kakao Share)** — 카카오톡 친구 공유
- **OpenWeather (선택)** — 시·도 단위 기상 데이터 → 알림 정확도 향상

### 배포
- **Vercel** (`@vercel/node` + `@vercel/static`, vercel.json은 memo-app 패턴 그대로)
- 환경변수: `DATABASE_URL`, `GEMINI_API_KEY`, `JWT_SECRET`, `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `IMAGEKIT_PUBLIC_KEY/PRIVATE_KEY/URL_ENDPOINT`, `KAKAO_JS_KEY`

### 알림 채널 (1순위)
- **로그인 팝업** — 사용자 지역·내 작물 기준 "이번 주말 할 일" 카드 (모달)
- **이메일 다이제스트** (Resend, 선택) — 매주 금요일 저녁 발송
- **Web Push** (v1.5) — 노출 빈도 적게 (주 1회 캡)

---

## 3. 데이터베이스 스키마 (모든 테이블 prefix: `little_farm_`)

```sql
-- 사용자
little_farm_users (id, email, password_hash, display_name, role[member|admin],
                   region_sido, region_sigungu, joined_at)

-- 내가 키우는 작물
little_farm_user_crops (id, user_id, crop_id, planted_at, area_pyeong,
                        status[active|done], note)

-- 작목 마스터
little_farm_crops (id, name_ko, name_en, category[과채|엽채|근채|곡류|허브],
                   season_start_month, season_end_month,
                   sunlight, water_freq_days, soil_pref,
                   summary_md, hero_image_url, beginner_friendly bool)

-- 작목별 작업(시기별)
little_farm_crop_tasks (id, crop_id, task_type[모종|시비|관수|수확|병해충관리|풀뽑기],
                        month, day_from, day_to,
                        instructions_md, fertilizer_recipe_md,
                        per_5pyeong_amount, per_10pyeong_amount,
                        image_url)

-- 농사일기
little_farm_logs (id, user_id, crop_id NULL, log_date,
                  title, body_md, image_urls jsonb,
                  weather, mood[좋음|보통|힘듦],
                  visibility[private|friends|public],
                  created_at, updated_at)

-- 가계부
little_farm_budgets (id, user_id, kind[income|expense],
                     amount, category, memo, occurred_at,
                     log_id NULL, receipt_image_url NULL,
                     created_at)

-- 게시판
little_farm_posts (id, user_id, board[질문|자랑|정보|자유],
                   title, body_md, image_urls jsonb,
                   pinned bool, hidden bool,
                   created_at, updated_at)
little_farm_comments (id, post_id, user_id, body, hidden bool, created_at)
little_farm_post_likes (post_id, user_id, created_at)

-- 자재 쇼핑
little_farm_products (id, name, category[모종|비료|도구|기타],
                      price_krw, stock, image_url,
                      description_md, vendor, status[active|hidden])
little_farm_orders (id, user_id, status[PENDING|PAID|SHIPPED|DELIVERED|CANCELLED],
                    total_amount, recipient_name, address, phone, memo, created_at)
little_farm_order_items (order_id, product_id, qty, unit_price)
little_farm_payments (id, order_id, user_id,
                      order_id_toss, payment_key,
                      amount, status[PENDING|DONE|FAILED],
                      raw jsonb, created_at)

-- 알림
little_farm_notifications (id, user_id, type, title, body, link,
                           scheduled_at, shown_at NULL, dismissed_at NULL,
                           created_at)

-- 카카오 공유 추적
little_farm_share_links (id, user_id, token, target_url,
                         clicks, signups,
                         created_at)

-- 신고 처리
little_farm_reports (id, target_type[post|comment], target_id,
                     reporter_id, reason, status[OPEN|RESOLVED|DISMISSED],
                     handled_by NULL, handled_at NULL, created_at)
```

총 **13개 테이블**. 모든 자세한 컬럼·인덱스는 D1에 확정.

---

## 4. 권한 매트릭스 (RBAC)

| 자원 / 동작 | 비로그인 | 회원 | 관리자 |
|---|---|---|---|
| 1년 캘린더 열람 | ✓ | ✓ | ✓ |
| 작목 가이드 열람 | ✓ | ✓ + 즐겨찾기 | ✓ + 편집 |
| 게시판 열람 | ✓ | ✓ | ✓ |
| 게시판 작성/댓글 | ✗ | ✓ | ✓ |
| 농사일기 작성/조회 | ✗ | 본인만 (visibility 따라 친구 공개 가능) | 모든 일지 (모더레이션) |
| 가계부 | ✗ | 본인만 | ✗ (개인정보 보호) |
| 자재 구매 | ✗ | ✓ | ✓ |
| 작목 콘텐츠 CRUD | ✗ | ✗ | ✓ |
| 신고 처리 / 게시글 숨김 | ✗ | ✗ | ✓ |
| 매출/사용자 통계 | ✗ | ✗ | ✓ |

---

## 5. 주요 API 엔드포인트

```
# Public
GET  /api/health
GET  /api/calendar?month=YYYY-MM         # 월별 추천 작목·작업 카드
GET  /api/crops                           # 작목 목록 (필터: 초보용/계절)
GET  /api/crops/:id                       # 작목 상세 + 5/10/20평 환산
GET  /api/posts?board=...&page=...        # 게시판 (열람만)
GET  /api/share/:token                    # 카카오 공유 링크 추적

# Auth
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me

# Member
GET  /api/me/dashboard                    # 로그인 팝업용 "이번 주말 할 일"
POST /api/me/crops / GET / DELETE         # 내가 키우는 작물 등록
POST /api/logs / GET / PUT / DELETE       # 일지 CRUD
POST /api/budgets / GET (월·카테고리)
POST /api/posts / POST /api/comments
GET  /api/imagekit-auth                   # 이미지 업로드 서명
POST /api/ai/log-helper                   # Gemini로 일지 본문 보강
POST /api/ai/image-generate               # Gemini Imagen으로 가이드 이미지
GET  /api/products
POST /api/orders/prepare → POST /api/payments/confirm
GET  /api/notifications                   # 내 알림 목록
PATCH /api/notifications/:id              # 읽음/닫기

# Admin
GET  /api/admin/stats
POST /api/admin/crops (CRUD)
POST /api/admin/crop-tasks (CRUD)
POST /api/admin/products (CRUD)
POST /api/admin/posts/:id/hide
GET  /api/admin/reports
PATCH /api/admin/reports/:id
```

---

## 6. 14일 WBS (데모데이 포함)

> 색깔 표기: **DB · 백엔드 · 프론트 · AI/결제 · 폴리시·발표**

### 1주차 — 토대 만들기

**D1 (월) — 프로젝트 셋업 + 스키마 확정**
- `app/` 폴더 + Vercel 프로젝트 링크
- `package.json`, `vercel.json`, `.env.example`, `.gitignore`
- 13개 테이블 lazy init 함수 (모두 prefix `little_farm_`)
- 시드: 작목 12개 — **상추, 깻잎, 부추, 쪽파, 시금치, 쑥갓, 케일, 고추, 토마토, 가지, 오이, 무**
   (주말농장에서 흔하고 5~10평 단위로 환산하기 쉬운 것들)
- 농사 작업 시드: 위 12 작목 × 월별 평균 3~5개 작업 = 약 200건

**D2 (화) — 인증 + RBAC**
- `/api/auth/register`, `/login`, `/me` (JWT 7일)
- bcrypt 해시
- 미들웨어 `authRequired`, `adminOnly`
- 관리자 시드 1명 + 일반 회원 시드 3명

**D3 (수) — 공개 캘린더 + 작목 가이드 (백엔드)**
- `GET /api/calendar?month=` — 월별 작목·작업 카드 묶음 반환
- `GET /api/crops`, `GET /api/crops/:id` (5/10/20평 시비량 자동 환산)
- 비로그인 접근 가능

**D4 (목) — 공개 캘린더 + 작목 가이드 (프론트)**
- `index.html` SPA 셸 + 해시 라우터
- `#/` 메인: 이번 달 카드 (비로그인도 보임), 인사말 친절체
- `#/calendar/:month`: 월별 카드 그리드
- `#/crops/:id`: 작목 상세 (사진, 시비 레시피, 5/10/20평 토글)
- 모바일 우선 디자인, 친절한 톤

**D5 (금) — 농사일기 (백 + 프론트)**
- `POST/GET/PUT/DELETE /api/logs`
- ImageKit 서명 엔드포인트 + 클라이언트 직접 업로드
- 일지 캘린더 뷰 + 카드 리스트
- 공개범위 토글: 비공개/친구공개/전체공개
- 친구공개: 카카오 공유 링크로 들어온 사람만 열람

**D6 (토) — 농사 가계부 (백 + 프론트)**
- `little_farm_budgets` CRUD
- 영수증 사진 첨부 옵션 (ImageKit)
- 카테고리: 모종/씨앗, 비료/퇴비, 농약, 도구, 임차료, 운반비, 기타
- 월별·카테고리별 집계 + Chart.js 도넛/라인 차트
- 엑셀 내보내기 (xlsx CDN)

**D7 (일) — 게시판 + 댓글 + 첫 회고**
- `little_farm_posts`, `little_farm_comments` CRUD + 좋아요
- 보드: 질문 / 자랑 / 정보 / 자유
- 비로그인 열람 / 회원 작성 / 마크다운 + DOMPurify
- 신고 버튼
- **1주차 회고**: 일지·캘린더·가계부·게시판 굴러가는가 → v1 핵심은 굳어짐

### 2주차 — 차별화 + 폴리시 + 데모

**D8 (월) — 시기별 알림 시스템**
- `little_farm_notifications` 테이블 + 스케줄 룰 (작목·월·지역 기준)
- `GET /api/me/dashboard`: 오늘·이번 주말 할 일 카드
- 로그인 직후 모달: "이번 주말은 고추 모종 심기 좋은 때예요" + "다시 보지 않기"
- 친절체 마이크로카피

**D9 (화) — AI 보강 (Gemini)**
- 일지 작성 도우미: "토요일 풀뽑기, 상추 1줄 더 심음" → Gemini가 정돈된 일지 + 해시태그
- 작목 가이드 이미지 생성: 관리자가 작목 등록 시 이미지 없으면 Imagen으로 생성
- AI 챗봇 (선택, 시간 남으면): 짧은 Q&A "비료 얼마나 줘야 하나요?"

**D10 (수) — 자재 결제 (Toss)**
- `little_farm_products` 시드: 모종 6 (상추/깻잎/고추/토마토/가지/오이) + 비료 4 + 도구 5
- 장바구니 → `POST /api/orders/prepare` (orderId 발급)
- TossPayments v2 위젯 + **서버사이드 confirm** (Secret Key 노출 X)
- 결제 완료 → 주문 내역 페이지

**D11 (목) — 카카오 공유 + 관리자 콘솔**
- 카카오 SDK로 친구 공유 (메인·작목 가이드·내 일지[공개])
- 공유 시 share_token 발급 → 클릭/가입 추적
- `#/admin`: 작목 CRUD, 게시글 숨김, 신고 처리, 매출·가입자 카드

**D12 (금) — 모바일 PWA + 접근성**
- `manifest.json`, 앱 아이콘 (꼬꼬마텃밭 로고: 작은 새싹+해)
- 홈 화면 추가 안내 배너
- "큰 글씨 모드" 토글 (어르신 사용자용)
- 모바일 사파리/크롬 실기기 테스트
- 라이트하우스 90+ 목표

**D13 (토) — 통합 테스트 + 시드 + 데모 시나리오**
- 데모용 가짜 사용자 5명 + 일지 데이터 30건
- 데모 스크립트: 비로그인 캘린더 → 가입 → 내 작물 등록 → 일지 작성(AI 보강) → 가계부 입력 → 게시판 댓글 → 자재 결제 → 시기 알림 팝업 → 카카오 공유
- E2E를 Chrome MCP로 한 번 더 검증
- 알려진 버그 마무리

**D14 (일) — 데모데이**
- **오전**: 발표 슬라이드 10장
- **오후**: 라이브 데모 (지인 3~5명에게 직접 시연 + 카카오 링크 발송)
- 피드백 노트 → 백로그
- 첫 1주 운영 모드 진입

---

## 7. 기능별 산출물 체크리스트

- [ ] DB 13개 테이블 + 시드 (작목 12, 작업 200건, 자재 15)
- [ ] 회원 가입/로그인/JWT
- [ ] 비로그인 캘린더·작목 가이드 (5/10/20평 환산)
- [ ] 농사일기 CRUD + 사진 업로드 (ImageKit) + 공개범위
- [ ] AI 이미지 생성 (Gemini Imagen) — 가이드용
- [ ] AI 일지 보강 (Gemini Flash)
- [ ] 농사 가계부 + 차트 + 엑셀
- [ ] 게시판 + 댓글 + 좋아요 + 신고
- [ ] 자재 결제 (Toss v2 server-side confirm)
- [ ] 시기 알림 (로그인 팝업)
- [ ] 카카오 공유 링크 + 추적
- [ ] 관리자 콘솔 (작목·자재·신고·통계)
- [ ] PWA 매니페스트 + 모바일 점검
- [ ] Vercel 배포 + 환경변수
- [ ] 데모 시나리오 + 슬라이드

---

## 8. 위험요소 & 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| 작목 콘텐츠 작성에 시간 폭주 | 일정 지연 | D1에 12개 작목 우선, Gemini로 초안 → 사람 검수 |
| Gemini 이미지 품질 들쭉날쭉 | UX 저하 | 1차는 Unsplash 스톡 + 농진청 자료, AI는 보조 |
| Toss 결제 환불·CS | 시간 소모 | 단가 5만원 이하만, 7일 무조건 환불 |
| 알림 노이즈로 사용자 피로 | 이탈 | 빈도 주 1회 캡, "받지 않기" 토글 |
| 카카오 공유 어뷰징 | 스팸 | share_token 하루 한도 + user 묶기 |
| 농사 정보 오류 → 작물 죽음 | 평판 | 가이드 페이지에 "참고용 / 지역 보정 권고" 명시 |
| 1인 개발 일정 지연 | 모든 것 | D5/D7/D11 강제 회고 → 비핵심 v1.1로 미룸 |

---

## 9. 데모데이 발표 흐름 (10분)

1. **문제 (1분)** — "토요일 아침에 텃밭 가서 뭘 해야 하지?"
2. **타깃 (1분)** — 주말농장 부부, 도시 마당 텃밭, 귀촌 초보, 시골 부모님(자녀가 깔아드림)
3. **경쟁사 빈틈 (1분)** — 농사로(어렵다) / 팜모닝(전업농 위주) / Planta(한국 X)
4. **데모 (5분)** — 비로그인 캘린더 → 가입 → 내 작물 → 일지(AI) → 가계부 → 게시판 → 자재 결제 → 알림 팝업 → 카카오 공유
5. **지표 (1분)** — 6개월 800 가입 / 150 WAU / 시즌 복귀율 35%
6. **다음 (1분)** — v1.1 푸시 알림·번개장터식 자재 거래·지역 모임

---

## 한 페이지 결론

> 단일 `index.html` + `server.js` + Postgres(`little_farm_*`)로 14일에 9개 핵심 기능을 굴린다. 비로그인 캘린더가 진입을 잡고, 일지·가계부·결제로 묶어두고, 카카오 공유로 더 끌어온다. **꼬꼬마텃밭** 톤은 "어르신 서비스 같지 않으면서도 친절한 말투" — 마이크로카피와 색채로 차별화한다.
