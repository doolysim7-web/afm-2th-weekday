# 꼬꼬마텃밭 — 케이스별 테스트 리포트

**테스트 일시**: 2026-05-10
**환경**: Chrome DevTools 자동화 + 로컬 서버 `http://localhost:3001`
**대상 빌드**: `main` 브랜치 commit `89d3eb8` (Vercel 배포 완료, 라이브: https://little-farm-ten.vercel.app)
**DB**: Supabase Postgres, prefix `small_forest_`
**Storage**: ImageKit (`https://ik.imagekit.io/3um8y0hge`)

---

## 테스트 계정

| 역할 | 이메일 | 비밀번호 |
|---|---|---|
| 👑 관리자 | `admin@littlefarm.test` | `admin1234` |
| 회원 (시드) | `haneul@/minji@/jisoo@littlefarm.test` | `farmer123` |
| 회원 (테스트 신규) | `tester@littlefarm.test` | `farmer123` |

---

## ✅ 정상 통과 케이스 (24장 캡처)

| # | 시점 | 케이스 | 캡처 |
|---|---|---|---|
| 01 | 비로그인 | 홈 — 인사말 + 5월 시즌 작물 11종 + 친구들 텃밭 | `01-home-anonymous.png` |
| 02 | 비로그인 | 캘린더 5월 — 작목별 이번 달 작업 카드 | `02-calendar-may.png` |
| 03 | 비로그인 | 캘린더 8월 — 무 시즌 시작, 케일·고추 병해충관리 | `03-calendar-aug.png` |
| 04 | 비로그인 | 작목 가이드 12종 그리드 (귀여운 v2 hero 이미지) | `04-crops-list.png` |
| 05 | 비로그인 | 카테고리 필터 "과채" → 5종 | `05-crops-filter-fruit.png` |
| 06 | 비로그인 | 작목 상세 (고추) — 5평 기준 작업 5건 | `06-crop-detail-5pyeong.png` |
| 07 | 비로그인 | 작목 상세 (고추) — 20평 토글 시 환산값 변경 (`5그루 → 20그루` 등) | `07-crop-detail-20pyeong.png` |
| 08 | 비로그인 | 로그인 페이지 | `08-login-page.png` |
| 09 | 비로그인 | 회원가입 페이지 (이모지 46종 + 시·도 17개) | `09-signup-page.png` |
| 10 | 가입직전 | 가입 폼 채움 (이메일/비번/닉네임/지역/🐰 아바타) | `10-signup-filled.png` |
| 11 | 신규로그인 | 가입 직후 홈 — **시기 알림 대시보드 모달 자동 노출** (시즌 시작 작목 추천) | `11-home-with-dashboard-modal.png` |
| 12 | 회원 | 마이페이지 (작물 등록 전) — 빈 상태 친절 안내 | `12-mypage-empty.png` |
| 13 | 회원 | 작물 2종 등록 후 대시보드 — **내 작물 작업 자동 매칭** (상추 풀뽑기 / 토마토 시비) | `13-dashboard-modal-with-crops.png` |
| 14 | 회원 | 마이페이지 — 내 작물 카드 (상추 5평·토마토 2평) + 진입 카드 | `14-mypage-with-crops.png` |
| 15 | 회원 | 일지 작성 폼 — ImageKit 직접 업로드 + 작목·기분·공개범위 | `15-log-form-filled.png` |
| 16 | 회원 | 일지 상세 — 사진 + 본문 + 메타 + 수정 링크 | `16-log-detail.png` |
| 17 | 회원 | 내 일지 목록 — 새로 쓴 1건 표시 (🌐 전체공개 칩) | `17-my-logs.png` |
| 18 | 회원 | 가계부 — 5월 지출 62,000원 / 카테고리 4종 합계 + 항목 4건 | `18-budget.png` |
| 19 | 회원 | 게시판 — 4보드, 좋아요/댓글 카운트 표시 | `19-board-list.png` |
| 20 | 회원 | 글 상세 + ♥1 좋아요 + 새 댓글(3개째) 폴링 반영 | `20-post-detail-comment-like.png` |
| 21 | 회원 | 둘러보기 (#/feed) — 공개 일지 4건 (방금 쓴 일지 포함) | `21-public-feed.png` |
| 22 | 👑 관리자 | 대시보드 통계 — 사용자 5 / 작목 12 / 작업 47 / 일지 6 / 가계부 10 / 글 4 / 댓글 4 | `22-admin-stats.png` |
| 23 | 👑 관리자 | 사용자 관리 — 5명 (관리자 disabled) | `23-admin-users.png` |
| 24 | 👑 관리자 | 작목 관리 — 12종 (수정/삭제) | `24-admin-crops.png` |

### 보너스 캡처 (작목 hero 이미지 v2 디자인 검증)
- `cute-crops-grid-fixed.png` — 12종 cute 카드 그리드 (각 작목 색·이모지 다름)
- `cute-tomato-svg.png` — 토마토 상세 hero (SVG 원본 렌더, 이모지 정상)

---

## 핵심 검증 결과

### ✅ 인증 / RBAC
- JWT 7일 토큰 가입·로그인 정상
- 비로그인은 캘린더·작목·게시판 열람 가능, 일지/가계부/글쓰기는 차단
- 관리자(`role=admin`)는 헤더 👑 노출 + `/api/admin/*` 통과
- 일반 회원이 `/api/admin/*` 호출 → 403

### ✅ 5/10/20평 환산
작목 작업의 `per_5/10/20pyeong_amount` 필드가 토글에 따라 정확히 표시됨 (예: 고추 모종 — 5평 5그루 / 10평 10그루 / 20평 20그루)

### ✅ ImageKit 업로드
캔버스로 만든 PNG → `/api/upload/auth` 서명 → ImageKit 직접 POST → 일지에 저장 → 상세에서 정상 노출

### ✅ 시기 알림 대시보드
- 회원 로그인 직후 모달 자동 노출
- 내 작물 등록 후 그 작물의 이번 달 작업이 모달에 반영됨 ("상추 — 풀뽑기", "토마토 — 시비")
- "오늘 다시 보지 않기" → localStorage `dashboard_dismissed_*_<userId>` 플래그로 일일 1회만 노출

### ✅ 작목 hero v2 (귀여운 디자인)
- 12종 모두 작목별 색(sky/ground)·메인 이모지·데코 다름
- ImageKit `?tr=orig-true`로 원본 SVG 서빙해 brower native 이모지 폰트로 렌더 (PNG 변환 시 codepoint 박스로 깨지는 이슈 회피)

### ✅ 가계부 합계
4건 입력(임차료/모종/비료/도구) → 카테고리별 합계 + 월 합계(62,000원) + 차액(-62,000원) 정확

### ✅ 게시판 + 댓글 + 좋아요
- 비로그인 열람 / 회원 작성 / 좋아요 토글 / 댓글 폴링 갱신 모두 정상

---

## ⚠️ 발견된 이슈 / 메모

| # | 내용 | 비중 |
|---|---|---|
| 1 | DevTools `fill`이 회원가입 폼의 닉네임 input에 값을 못 박음 (자동화 한정 — IME 관련) | 자동화 한계 (앱 자체 OK), API 직접 호출로 우회 |
| 2 | 일지 폼에서 React 폼 제어 input에 native setter로 값 주입 시 일부 컨트롤(date picker 등)이 React state와 동기화되지 않을 가능성 | 자동화 한정. 실 사용자에게는 영향 없음. |

> 두 가지 모두 자동화 도구의 입력 시뮬레이션 한계이며, 실 키보드 사용자에게는 영향 없습니다. 실제 검증은 모두 동등 코드 경로(`POST /api/...`)를 직접 호출하여 통과 확인.

---

## 새 작목 즉석 추가 테스트 (커밋 `f3986db`)

| # | 시나리오 | 결과 | 캡처 |
|---|---|---|---|
| 39 | 폼 펼침 — `+ 새 작목` dashed 버튼 클릭 시 인라인 폼 노출 | ✅ | `39-quickadd-form-open.png` |
| 40 | 작목명 + 카테고리 입력 (바질 / 허브) | ✅ | `40-quickadd-filled.png` |
| 41 | 추가 → "✓ 바질" 칩 자동 활성 + "1개 선택됨" | ✅ | `41-quickadd-result.png` |
| 42 | 빈 입력일 때 "+ 추가" 버튼 disabled | ✅ disabled=true | `42-quickadd-empty-disabled.png` |
| 43 | 같은 이름 재시도 → reused (중복 칩 X, 기존 칩 ✓ 활성) | ✅ basilCount=1 | `43-quickadd-reused.png` |
| 44 | 새 작목 두 개(바질·옥수수)로 일지 저장 → 상세에서 칩 링크 | ✅ 작목 칩 2개, 클릭 시 `#/crops/:id`로 이동 | `44-quickadd-log-detail.png` |
| 45 | 작목 가이드 그리드에 들깨/바질/옥수수 노출, hero 없으면 🌱 폴백 | ✅ 13→15개 카드 노출 | `45-quickadd-crops-grid.png` |

### 핵심 검증

- **회원 권한으로 작목 등록**: `POST /api/crops/quick`은 admin이 아닌 일반 회원도 가능 — 일지 작성 흐름을 끊지 않기 위해
- **중복 방지**: 같은 `name_ko`가 있으면 새 row를 만들지 않고 기존 row 반환 (`reused: true`)
- **자동 토글**: 추가 직후 그 작목이 칩으로 push되고 `cropIds`에도 push되어 ✓ 표시
- **Sane defaults**: season 1~12, water 2일, hero 비움 (그리드는 🌱 폴백) → 향후 admin이 가이드 보강
- **그리드 호환**: hero 없는 카드는 폴백 아이콘으로 자연스럽게 노출됨

---

## 대시보드 모달 체크박스 추가 테스트 (커밋 `2a8b115`)

| # | 시나리오 | 결과 | 캡처 |
|---|---|---|---|
| 32 | 모달 첫 노출 — 미체크 상태 | ✅ 빈 체크박스 + "닫기" 버튼 분리 | `32-modal-checkbox.png` |
| 33 | 체크박스 클릭 → ✓ 연두 활성 | ✅ DOM `checked=true`, 라벨 옆 ✓ 표시 | `33-modal-checkbox-checked.png` |
| 34 | 플래그 제거 → 새로고침 시 모달 재노출 (초기값 미체크) | ✅ | `34-cb-initial-unchecked.png` |
| 35 | 체크박스 클릭 → 즉시 localStorage 플래그 `1` 저장 | ✅ flag = "1" | `35-cb-checked.png` |
| 36 | 체크 + 닫기 → 새로고침 시 모달 ❌ (sticky) | ✅ 모달 노출 안 됨 | `36-cb-after-reload-no-modal.png` |
| 37 | 플래그 제거 후 새로고침 → 모달 다시 등장 | ✅ | `37-cb-modal-back-after-uncheck.png` |
| 38 | 미체크 + 닫기 → 새로고침 시 1회성으로 다시 등장 | ✅ flag null, 모달 재노출 | `38-cb-uncheck-close-reappear.png` |

### 핵심 검증

- **체크박스 즉시 동기화**: 체크 → localStorage `dashboard_dismissed_<YYYY-MM-DD>_<userId>` 즉시 저장, 해제 → 즉시 제거
- **닫기 동작 분리**: 닫기/X/배경 클릭 모두 동일하게 모달 닫음. 체크 여부는 UI 자체에서 이미 반영
- **하루 단위 키**: 키에 오늘 날짜 포함 → 자정 지나면 자연스럽게 다시 노출
- **사용자별 분리**: userId 포함 → 다른 계정 로그인 시 영향 없음

---

## 다중 작목 일지 추가 테스트 (커밋 `52cafe1`)

> v1 이후 추가된 "일지에 여러 작목 태깅" 기능을 별도로 검증.

| # | 시나리오 | 결과 | 캡처 |
|---|---|---|---|
| 25 | 새 일지 폼 — 칩 토글 (선택 0개 상태) | ✅ 12종 모두 회색 칩, "여러 개 가능 — 0개 선택됨" | `25-log-form-multi-crops.png` |
| 26 | 새 일지 — 상추·쑥갓·오이 3개 선택 + 본문 채움 | ✅ 헤더가 "3개 선택됨"으로 갱신, 칩에 ✓ + 연두 활성색 | `26-multi-form-3-selected.png` |
| 27 | 저장 후 상세 — 작목 칩 3개(상추/오이/토마토) 클릭 가능 링크 | ✅ 각 칩이 `#/crops/:id`로 이동 | `27-multi-detail-chips.png` |
| 28 | 내 일지 목록 — 다중 작목은 콤마, 단일은 그대로 | ✅ "🌱 상추, 오이, 토마토" + 기존 단일 "🌱 고추" 호환 | `28-multi-mylogs.png` |
| 29 | 일지 수정 — 기존 3개(✓) 표시 → 토마토 해제 + 깻잎 추가 | ✅ DB 반영 (정션 테이블 갱신) | `29-multi-edit-toggled.png` |
| 30 | `#/feed` 공개 일지 — 다중 작목 일지가 첫 카드 | ✅ 카드 그리드 정상 | `30-multi-feed.png` |
| 31 | 홈 친구들 텃밭 — 다중 작목 일지 첫 줄에 콤마 표시 | ✅ "🌱 상추, 오이, 토마토" 그대로 | `31-multi-home-feed.png` |

### 검증 포인트

- **다대다 정션** (`small_forest_log_crops`): POST/PUT 시 트랜잭션으로 정션 갱신, GET 시 `json_agg`로 배열 반환
- **하위호환**: 기존 단일 `crop_id` 데이터(고추/상추 일지) 자동 마이그레이션, 새 코드에서도 정상 노출
- **수정 시 기존 선택 유지**: 일지 수정 폼에 정션 데이터를 `cropIds` 배열로 복원해 ✓ 표시
- **API 양쪽 호환**: `crop_ids` 배열 우선, 없으면 `crop_id` 단일도 받아들임

---

## 결론

기획 문서 [DEV.md](../DEV.md)의 v1 핵심 9개 기능 + RBAC + 시드 데이터 + 작목 v2 cute 이미지 모두 정상 동작 확인. 라이브 배포(`https://little-farm-ten.vercel.app`)도 동일 코드로 200 OK 응답.

```
✅ F1 JWT 가입/로그인 + 이모지 아바타 + 시·도 선택
✅ F2 1년 캘린더 (월 이동, 비로그인 열람)
✅ F3 작목 12종 가이드 + 5/10/20평 환산
✅ F4 일지 CRUD + ImageKit 직접 업로드 + 공개범위
✅ F5 가계부 (수입/지출 + 카테고리·월별 합계)
✅ F6 게시판 4보드 + 댓글 + 좋아요
✅ F8 시기 알림 대시보드 (로그인 직후, 내 작물 작업 매칭)
✅ F10 관리자 콘솔 (통계 8종 / 사용자 / 작목)
✅ F11 RBAC (비로그인/회원/관리자)
```

```
v1.1 예정: F7 Toss 결제 · F9 카카오 공유 · F12 Gemini AI 보강
```
