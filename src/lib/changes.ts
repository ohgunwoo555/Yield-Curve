import { subDaysIso, subMonthsIso, subYearsIso, type IsoDate } from "./dates";
import { TENORS, type Tenor } from "./tenors";

/**
 * 등락률 계산 (순수 함수).
 *
 * 기준일 D에 대해
 * - 기준 수익률: D 이하 최근 영업일(effectiveDate)의 값
 * - 전일비(d1): effectiveDate 직전 영업일
 * - 전주비(w1): effectiveDate − 7일 이하 최근 영업일
 * - 전월비(m1): effectiveDate − 1개월 이하 최근 영업일 (date-fns subMonths 규칙)
 * - 전년비(y1): effectiveDate − 1년 이하 최근 영업일
 * 단위는 bp(차이 × 100), 소수점 1자리. 비교 대상이 없으면 null.
 */

export type ChangeKey = "d1" | "w1" | "m1" | "y1";
export const CHANGE_KEYS: readonly ChangeKey[] = ["d1", "w1", "m1", "y1"];

export type TenorRow = {
  tenor: Tenor;
  value: number | null;
  changes: Record<ChangeKey, number | null>;
};

export type CompareDates = Record<ChangeKey, IsoDate | null>;

export type ChangesResult = {
  countryCode: string;
  requestedDate: IsoDate;
  effectiveDate: IsoDate; // 실제 기준 영업일
  compareDates: CompareDates;
  rows: TenorRow[]; // 표준 만기 순서, 미제공 만기는 value null
};

/** 특정 날짜 이하(또는 미만)의 가장 최근 영업일을 찾는 함수 */
export type LatestDateLookup = (onOrBefore: IsoDate, opts?: { exclusive?: boolean }) => IsoDate | null;

/** 비교 기준이 되는 목표 날짜(영업일 보정 전) */
export function compareTargets(effectiveDate: IsoDate): Record<ChangeKey, IsoDate> {
  return {
    d1: effectiveDate, // exclusive 조회
    w1: subDaysIso(effectiveDate, 7),
    m1: subMonthsIso(effectiveDate, 1),
    y1: subYearsIso(effectiveDate, 1),
  };
}

/**
 * 기준일과 4개 비교 날짜를 확정한다. 기준일 이하 데이터가 없으면 null.
 * DB 구현은 lookup을 한 번의 쿼리로 처리해도 되고, 여기서는 순수하게 다룬다.
 */
export function resolveDates(
  requestedDate: IsoDate,
  lookup: LatestDateLookup,
): { effectiveDate: IsoDate; compareDates: CompareDates } | null {
  const effectiveDate = lookup(requestedDate);
  if (!effectiveDate) return null;
  const targets = compareTargets(effectiveDate);
  return {
    effectiveDate,
    compareDates: {
      d1: lookup(targets.d1, { exclusive: true }),
      w1: lookup(targets.w1),
      m1: lookup(targets.m1),
      y1: lookup(targets.y1),
    },
  };
}

/** 날짜 → (만기 → 값) */
export type ValuesByDate = ReadonlyMap<IsoDate, ReadonlyMap<Tenor, number>>;

/** % 차이를 bp(소수점 1자리)로 */
export function toBp(current: number, previous: number): number {
  return Math.round((current - previous) * 1000) / 10;
}

export function buildRows(
  effectiveDate: IsoDate,
  compareDates: CompareDates,
  values: ValuesByDate,
): TenorRow[] {
  const base = values.get(effectiveDate);
  return TENORS.map((tenor) => {
    const value = base?.get(tenor) ?? null;
    const changes = {} as Record<ChangeKey, number | null>;
    for (const key of CHANGE_KEYS) {
      const cmpDate = compareDates[key];
      const prev = cmpDate ? (values.get(cmpDate)?.get(tenor) ?? null) : null;
      changes[key] = value !== null && prev !== null ? toBp(value, prev) : null;
    }
    return { tenor, value, changes };
  });
}

export type YieldObservation = { tenor: Tenor; date: IsoDate; value: number };

/**
 * 한 국가의 관측치 배열(픽스처·DB 결과)에서 바로 ChangesResult를 만든다.
 * DB 경로는 resolveDates + buildRows를 개별 쿼리 결과로 조합해 사용한다.
 */
export function computeChangesFromObservations(
  countryCode: string,
  requestedDate: IsoDate,
  observations: readonly YieldObservation[],
): ChangesResult | null {
  const values = groupByDate(observations);
  const dates = [...values.keys()].sort();
  const lookup: LatestDateLookup = (onOrBefore, opts) => {
    let found: IsoDate | null = null;
    for (const d of dates) {
      if (opts?.exclusive ? d < onOrBefore : d <= onOrBefore) found = d;
      else break;
    }
    return found;
  };
  const resolved = resolveDates(requestedDate, lookup);
  if (!resolved) return null;
  return {
    countryCode,
    requestedDate,
    effectiveDate: resolved.effectiveDate,
    compareDates: resolved.compareDates,
    rows: buildRows(resolved.effectiveDate, resolved.compareDates, values),
  };
}

export function groupByDate(observations: readonly YieldObservation[]): Map<IsoDate, Map<Tenor, number>> {
  const out = new Map<IsoDate, Map<Tenor, number>>();
  for (const o of observations) {
    let m = out.get(o.date);
    if (!m) {
      m = new Map();
      out.set(o.date, m);
    }
    m.set(o.tenor, o.value);
  }
  return out;
}
