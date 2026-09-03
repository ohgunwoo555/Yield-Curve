import { sql } from "drizzle-orm";
import {
  bigserial,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** 국가 마스터 */
export const countries = pgTable("countries", {
  code: text("code").primaryKey(), // 'US', 'KR'
  nameKo: text("name_ko").notNull(), // '미국', '한국'
  currency: text("currency").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

/** 일별 수익률 (핵심 테이블). 행이 존재하는 날짜 = 해당국 영업일. */
export const yields = pgTable(
  "yields",
  {
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    tenor: text("tenor").notNull(), // 표준 만기 키 ('1M' … '30Y')
    date: date("date").notNull(), // 해당국 기준 영업일 (YYYY-MM-DD)
    value: numeric("value", { precision: 8, scale: 4 }).notNull(), // % 단위
    source: text("source").notNull(), // 'FRED', 'ECOS'
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.countryCode, t.tenor, t.date] }),
    index("yields_country_date_idx").on(t.countryCode, t.date.desc()),
  ],
);

/** 적재 로그 */
export const ingestRuns = pgTable("ingest_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  countryCode: text("country_code").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // 'success' | 'failed' | 'partial'
  rowsUpserted: integer("rows_upserted").default(0),
  fromDate: date("from_date"),
  toDate: date("to_date"),
  error: text("error"),
});

export type Country = typeof countries.$inferSelect;
export type YieldRow = typeof yields.$inferSelect;
export type IngestRun = typeof ingestRuns.$inferSelect;
