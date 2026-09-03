# 국채 수익률 조회기 (bond-yields)

주요국 국채 수익률을 영업일 기준 일별로 조회하고, 기준일의 만기별 수익률과
전일비·전주비·전월비·전년비(bp)를 한 화면에서 비교하는 웹앱.

- 1단계 범위: 미국(FRED) + 한국(한국은행 ECOS) 수익률 테이블, 등락률, 일별 자동 적재, 만기별 1년 차트
- 2단계 이후: 일본, 유로존, 독일, 국가별 수요 지표

## 기술 스택

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase Postgres · Drizzle ORM · recharts · zod · vitest · Vercel

## 설치

(작성 예정)

## 환경변수

`.env.example`을 `.env`로 복사한 뒤 값을 채운다. `.env`는 커밋하지 않는다.

## 라이선스

Private
