# PostgreSQL 테이블 목록 및 스키마 정리

DB: Supabase PostgreSQL | 총 9개 테이블

유용한점: 내가 만들었던 테이블과 테이블의 스키마를 찾아 볼 수 있다

---

## 1. entries (익명 연봉/지출 비교)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| job_category | varchar | O | - |
| years | integer | O | - |
| monthly_salary | integer | O | - |
| food | integer | - | 0 |
| housing | integer | - | 0 |
| transport | integer | - | 0 |
| subscription | integer | - | 0 |
| etc_expense | integer | - | 0 |
| total_expense | integer | - | 0 |
| created_at | timestamp | - | now() |

## 2. games (실시간 밸런스 게임)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| title | varchar | O | - |
| option_a | varchar | O | - |
| option_b | varchar | O | - |
| option_a_count | integer | - | 0 |
| option_b_count | integer | - | 0 |
| created_at | timestamp | - | now() |

## 3. ingredients (냉장고 재료 관리)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| name | varchar | O | - |
| quantity | varchar | - | - |
| category | varchar | - | - |
| exp_date | date | - | - |
| created_at | timestamp | - | now() |

## 4. posts (익명 고민/칭찬 게시판)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| nickname | varchar | - | '익명' |
| category | varchar | O | - |
| content | text | O | - |
| likes | integer | - | 0 |
| created_at | timestamp | - | now() |

## 5. recipes (레시피)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| title | varchar | O | - |
| ingredients | text | - | - |
| instructions | text | - | - |
| created_at | timestamp | - | now() |

## 6. todo_app_01_todos (할 일 - 사용자별)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| user_id | integer | O | - |
| text | text | O | - |
| done | boolean | - | false |
| created_at | timestamp | - | now() |

## 7. todo_app_01_users (사용자 계정)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| email | varchar | O | - |
| password | varchar | O | - |
| nickname | varchar | O | - |
| role | varchar | - | 'user' |
| created_at | timestamp | - | now() |

## 8. todos (할 일 - 간단 버전)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| user_id | integer | O | - |
| text | text | O | - |
| done | boolean | O | false |

## 9. users (사용자 - 간단 버전)

| 컬럼명 | 타입 | NOT NULL | 기본값 |
|---|---|---|---|
| id | integer | O | auto increment |
| name | text | O | - |
