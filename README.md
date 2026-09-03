# 국채 수익률 조회기 (bond-yields)

주요국 국채 수익률을 **영업일 기준 일별**로 조회하고, 선택한 기준일의 만기별 수익률과
**전일비·전주비·전월비·전년비**(bp)를 한 화면에서 비교하는 웹앱.

- **1단계(현재)**: 미국(FRED) + 한국(한국은행 ECOS) 수익률 테이블, 등락률, 일별 자동 적재, 만기별 1년 차트
- 2단계 이후: 일본, 유로존, 독일, 국가별 수요 지표, 국가 간 스프레드

## 기술 스택

| 구분 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) + TypeScript strict |
| 스타일 | Tailwind CSS v4 |
| DB | Supabase Postgres |
| ORM | Drizzle ORM + `postgres` 드라이버, 마이그레이션은 drizzle-kit |
| 차트 | recharts |
| 검증 | zod |
| 테스트 | vitest |
| 배포 | Vercel + Vercel Cron |
| 패키지 매니저 | pnpm |

## 프로젝트 구조

```
src/
  app/
    page.tsx                  # 단일 페이지 (서버 컴포넌트, 초기 데이터 주입)
    api/
      yields/route.ts         # GET /api/yields?country=&date=
      yields/history/route.ts # GET /api/yields/history?country=&tenor=&from=&to=
      meta/route.ts           # GET /api/meta
      cron/ingest/route.ts    # GET /api/cron/ingest (Bearer CRON_SECRET)
  components/                 # CountryTabs, DatePicker, YieldTable, TenorDrawer, YieldChart, Dashboard
  lib/
    db/  schema.ts client.ts queries.ts
    sources/  types.ts registry.ts http.ts fred.ts ecos.ts
    ingest.ts                 # 소스 → upsert, ingest_runs 기록
    changes.ts                # 등락률 계산 (순수 함수)
    tenors.ts dates.ts format.ts api.ts meta.ts
scripts/
  seed.ts                     # countries 시드
  backfill.ts                 # 과거 데이터 적재
  ecos-items.ts               # ECOS 항목코드 검증
drizzle/                      # 마이그레이션
tests/                        # vitest (외부 API 호출 없음, 픽스처만 사용)
```

## 설치

```bash
pnpm install
cp .env.example .env   # 값을 채운다 (아래 참고)
pnpm db:migrate        # Supabase에 테이블 생성
pnpm seed              # countries 마스터 시드 (US, KR)
```

### 환경변수 (`.env`)

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Supabase Postgres 연결 문자열. **Transaction pooler(port 6543)** 주소를 쓴다. Supabase 대시보드 → Project Settings → Database → Connection string → Transaction. |
| `FRED_API_KEY` | https://fred.stlouisfed.org/docs/api/api_key.html 에서 무료 발급 (계정 필요). |
| `ECOS_API_KEY` | https://ecos.bok.or.kr → 로그인 → 마이페이지 → 인증키 신청. 승인까지 보통 하루 이내. |
| `CRON_SECRET` | 크론 엔드포인트 보호용 랜덤 문자열. `openssl rand -hex 32` 등으로 생성. Vercel은 이 값을 크론 호출 헤더에 자동으로 넣어준다. |

`.env`는 절대 커밋하지 않는다(`.gitignore`에 포함).

## 데이터 적재

### ECOS 항목코드 검증 (한국 백필 전에 한 번)

```bash
pnpm ecos:items
```

817Y002(시장금리, 일별) 항목 목록을 실제 호출해 출력하고, `src/lib/sources/ecos.ts`의
`ECOS_ITEMS`에 적힌 예상 코드와 비교한다. 차이가 있으면 표시된 실제 코드로 상수를 갱신하고
주석에 확인 날짜를 적는다. ECOS 소스는 실행 시점에도 항목명으로 코드를 다시 확정하므로
예상 코드가 틀려도 적재는 되지만, 상수를 맞춰 두는 것이 안전하다.

### 백필

```bash
pnpm backfill --country US            # 기본: 오늘 기준 3년 전 ~ 오늘
pnpm backfill --country KR
pnpm backfill --country US --from 2020-01-01 --to 2020-12-31
```

- upsert 방식이라 여러 번 실행해도 안전하다.
- 실행 결과(`status`, `fetched`, `inserted`, `updated`, `run_id`)가 출력되고 `ingest_runs`에 기록된다.
- 결측값(FRED의 `"."`, ECOS의 빈값)은 행을 만들지 않는다. `yields`에 행이 있는 날짜 = 해당국 영업일.

### 일별 크론

`vercel.json`의 크론이 매일 **UTC 23:00 (KST 08:00)**에 `GET /api/cron/ingest`를 호출한다.
모든 소스에 대해 최근 10일을 다시 가져와 upsert 한다(소스 측 사후 수정·지연 반영 대비).
국가 하나가 실패해도 나머지는 진행되며 `ingest_runs`에 국가별로 기록된다.

- 미국 전일 데이터는 이 시점에 반영되어 있고, 한국 당일 데이터는 다음날 반영된다. 이 지연은 정상이며 UI에 "최근 데이터: YYYY-MM-DD"로 표시된다.

로컬 테스트:

```bash
pnpm dev
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ingest
```

응답 예:

```json
{
  "ok": true,
  "from": "2026-08-24",
  "to": "2026-09-03",
  "results": [
    { "countryCode": "US", "sourceName": "FRED", "status": "success", "fetched": 88, "inserted": 11, "updated": 77, "error": null, "runId": 12 },
    { "countryCode": "KR", "sourceName": "ECOS", "status": "success", "fetched": 49, "inserted": 7, "updated": 42, "error": null, "runId": 13 }
  ]
}
```

하나라도 실패하면 HTTP 207과 함께 해당 국가의 `status: "failed"` 및 `error`가 담긴다.
인증 헤더가 없거나 틀리면 401.

## API

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/yields?country=US&date=2026-09-03` | 기준일의 만기별 수익률과 전일비·전주비·전월비·전년비(bp). `date` 생략 시 최근 영업일. 비영업일이면 이하 최근 영업일로 보정되고 `effectiveDate`에 표시. |
| `GET /api/yields/history?country=KR&tenor=10Y&from=2025-09-03&to=2026-09-03` | `{ date, value }[]`. `to` 생략 시 최근 영업일, `from` 생략 시 `to` − 1년. |
| `GET /api/meta` | 국가 목록, 국가별 최초·최신 데이터 날짜와 제공 만기, 최근 적재 시각. |

파라미터는 zod로 검증하며 잘못되면 400 + 한국어 메시지.

### 등락률 정의

기준 영업일 `E`(= 요청일 이하 최근 영업일)에 대해

- 전일비: `E` 직전 영업일
- 전주비: `E − 7일` 이하 최근 영업일
- 전월비: `E − 1개월` 이하 최근 영업일 (date-fns `subMonths` 월말 규칙)
- 전년비: `E − 1년` 이하 최근 영업일

단위는 bp(차이 × 100), 소수점 1자리. 비교 대상 날짜가 없으면 `null`.

## 개발

```bash
pnpm dev          # http://localhost:3000
pnpm lint         # eslint + tsc --noEmit
pnpm test         # vitest (외부 API 호출 없음)
pnpm build
pnpm db:generate  # 스키마 변경 후 마이그레이션 파일 생성
pnpm db:studio
```

새 국가 추가 = `src/lib/sources/`에 `YieldSource` 구현체 추가 → `registry.ts`에 등록 →
`scripts/seed.ts`에 국가 추가. 크론·API·UI는 그대로 동작한다.

## CI

`.github/workflows/ci.yml`: PR과 `main` push 시 `pnpm install --frozen-lockfile`, `pnpm lint`,
`pnpm test`, `pnpm build`. 빌드는 DB 연결 없이 성공한다(DB 클라이언트는 요청 시점에 지연 생성).
CI에는 시크릿이 필요 없다.

## Vercel 연동·배포

1. https://vercel.com/new 에서 이 GitHub 저장소를 Import 한다. Framework는 Next.js로 자동 인식된다.
2. **Settings → Environment Variables**에 `DATABASE_URL`, `FRED_API_KEY`, `ECOS_API_KEY`, `CRON_SECRET`을
   Production(및 필요 시 Preview)에 등록한다.
3. Deploy. 이후 `main` 머지 = 프로덕션 배포, PR = 프리뷰 배포.
4. 크론(`vercel.json`)은 **프로덕션에서만** 동작한다. 프리뷰에서는 다음처럼 수동 호출해 확인한다.
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/ingest
   ```
5. 처음 배포 후에는 로컬에서 `pnpm backfill`로 3년치를 먼저 적재한다(크론은 최근 10일만 가져온다).

## 라이선스

Private
