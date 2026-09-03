import { and, asc, desc, eq, gte, inArray, lte, max, min, sql } from "drizzle-orm";
import {
  buildRows,
  compareTargets,
  type ChangesResult,
  type CompareDates,
} from "@/lib/changes";
import type { IsoDate } from "@/lib/dates";
import { isTenor, tenorIndex, type Tenor } from "@/lib/tenors";
import type { Db } from "./client";
import { countries, ingestRuns, yields } from "./schema";

/** 국가 목록 (sort_order 순) */
export async function getCountries(db: Db) {
  return db.select().from(countries).orderBy(asc(countries.sortOrder));
}

export type CountryMeta = {
  code: string;
  nameKo: string;
  currency: string;
  firstDate: IsoDate | null;
  latestDate: IsoDate | null;
  tenors: Tenor[];
};

/** 국가별 최초·최신 데이터 날짜와 제공 만기 */
export async function getCountryMetas(db: Db): Promise<CountryMeta[]> {
  const list = await getCountries(db);
  const ranges = await db
    .select({
      countryCode: yields.countryCode,
      firstDate: min(yields.date),
      latestDate: max(yields.date),
    })
    .from(yields)
    .groupBy(yields.countryCode);
  const tenorRows = await db
    .selectDistinct({ countryCode: yields.countryCode, tenor: yields.tenor })
    .from(yields);

  return list.map((c) => {
    const r = ranges.find((x) => x.countryCode === c.code);
    const tenors = tenorRows
      .filter((x) => x.countryCode === c.code)
      .map((x) => x.tenor)
      .filter(isTenor)
      .sort((a, b) => tenorIndex(a) - tenorIndex(b));
    return {
      code: c.code,
      nameKo: c.nameKo,
      currency: c.currency,
      firstDate: r?.firstDate ?? null,
      latestDate: r?.latestDate ?? null,
      tenors,
    };
  });
}

/** 마지막으로 성공한 적재 시각 */
export async function getLastIngestedAt(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: max(ingestRuns.finishedAt) })
    .from(ingestRuns)
    .where(eq(ingestRuns.status, "success"));
  return row?.finishedAt ?? null;
}

export async function getLatestDate(db: Db, countryCode: string): Promise<IsoDate | null> {
  const [row] = await db
    .select({ d: max(yields.date) })
    .from(yields)
    .where(eq(yields.countryCode, countryCode));
  return row?.d ?? null;
}

/**
 * 기준일과 4개 비교 날짜를 한 번의 쿼리로 확정한다.
 * 각 목표 날짜에 대해 "그 날짜 이하(전일비는 미만)의 최근 영업일"을 구한다.
 */
export async function resolveDatesInDb(
  db: Db,
  countryCode: string,
  requestedDate: IsoDate,
): Promise<{ effectiveDate: IsoDate; compareDates: CompareDates } | null> {
  const [eff] = await db
    .select({ d: max(yields.date) })
    .from(yields)
    .where(and(eq(yields.countryCode, countryCode), lte(yields.date, requestedDate)));
  const effectiveDate = eff?.d ?? null;
  if (!effectiveDate) return null;

  const t = compareTargets(effectiveDate);
  const [row] = await db
    .select({
      d1: sql<string | null>`max(${yields.date}) filter (where ${yields.date} < ${t.d1}::date)`,
      w1: sql<string | null>`max(${yields.date}) filter (where ${yields.date} <= ${t.w1}::date)`,
      m1: sql<string | null>`max(${yields.date}) filter (where ${yields.date} <= ${t.m1}::date)`,
      y1: sql<string | null>`max(${yields.date}) filter (where ${yields.date} <= ${t.y1}::date)`,
    })
    .from(yields)
    .where(and(eq(yields.countryCode, countryCode), lte(yields.date, effectiveDate)));

  return {
    effectiveDate,
    compareDates: {
      d1: normalizeDate(row?.d1),
      w1: normalizeDate(row?.w1),
      m1: normalizeDate(row?.m1),
      y1: normalizeDate(row?.y1),
    },
  };
}

/** 여러 날짜의 전 만기 값을 한 쿼리로 가져온다. */
export async function getValuesForDates(
  db: Db,
  countryCode: string,
  dates: IsoDate[],
): Promise<Map<IsoDate, Map<Tenor, number>>> {
  const out = new Map<IsoDate, Map<Tenor, number>>();
  if (dates.length === 0) return out;
  const rows = await db
    .select({ date: yields.date, tenor: yields.tenor, value: yields.value })
    .from(yields)
    .where(and(eq(yields.countryCode, countryCode), inArray(yields.date, dates)));
  for (const r of rows) {
    if (!isTenor(r.tenor)) continue;
    let m = out.get(r.date);
    if (!m) {
      m = new Map();
      out.set(r.date, m);
    }
    m.set(r.tenor, Number(r.value));
  }
  return out;
}

/** 기준일의 만기별 수익률 + 등락률 */
export async function getChanges(
  db: Db,
  countryCode: string,
  requestedDate: IsoDate,
): Promise<ChangesResult | null> {
  const resolved = await resolveDatesInDb(db, countryCode, requestedDate);
  if (!resolved) return null;
  const { effectiveDate, compareDates } = resolved;
  const dates = [
    effectiveDate,
    ...Object.values(compareDates).filter((d): d is IsoDate => d !== null),
  ];
  const values = await getValuesForDates(db, countryCode, [...new Set(dates)]);
  return {
    countryCode,
    requestedDate,
    effectiveDate,
    compareDates,
    rows: buildRows(effectiveDate, compareDates, values),
  };
}

export type HistoryPoint = { date: IsoDate; value: number };

/** 만기 하나의 기간별 시계열 */
export async function getHistory(
  db: Db,
  countryCode: string,
  tenor: Tenor,
  from: IsoDate,
  to: IsoDate,
): Promise<HistoryPoint[]> {
  const rows = await db
    .select({ date: yields.date, value: yields.value })
    .from(yields)
    .where(
      and(
        eq(yields.countryCode, countryCode),
        eq(yields.tenor, tenor),
        gte(yields.date, from),
        lte(yields.date, to),
      ),
    )
    .orderBy(asc(yields.date));
  return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
}

/** 최근 적재 실행 기록 */
export async function getRecentIngestRuns(db: Db, limit = 20) {
  return db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(limit);
}

/** postgres 드라이버는 date를 문자열로 주지만, max() 결과가 Date로 올 가능성에 대비 */
function normalizeDate(v: string | Date | null | undefined): IsoDate | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v.slice(0, 10);
}
