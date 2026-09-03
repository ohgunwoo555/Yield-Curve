import {
  addDays,
  format,
  isValid,
  parse,
  subDays,
  subMonths,
  subYears,
} from "date-fns";

/**
 * 날짜 유틸. 앱 내부에서는 항상 'YYYY-MM-DD' 문자열(ISO date)로 날짜를 주고받고,
 * 계산이 필요할 때만 date-fns로 변환한다. 시간대 문제를 피하기 위해
 * 문자열 ↔ Date 변환은 로컬 자정 기준으로만 한다.
 */

export type IsoDate = string; // 'YYYY-MM-DD'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const d = parse(value, "yyyy-MM-dd", new Date(0));
  return isValid(d) && format(d, "yyyy-MM-dd") === value;
}

export function parseIsoDate(value: IsoDate): Date {
  if (!isIsoDate(value)) {
    throw new Error(`잘못된 날짜 형식입니다: ${value}`);
  }
  return parse(value, "yyyy-MM-dd", new Date(0));
}

export function formatIsoDate(d: Date): IsoDate {
  return format(d, "yyyy-MM-dd");
}

export function todayIso(now: Date = new Date()): IsoDate {
  return formatIsoDate(now);
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  return formatIsoDate(addDays(parseIsoDate(date), days));
}

export function subDaysIso(date: IsoDate, days: number): IsoDate {
  return formatIsoDate(subDays(parseIsoDate(date), days));
}

/** 월말 처리는 date-fns 규칙을 따른다 (3/31 − 1개월 = 2/28 또는 2/29). */
export function subMonthsIso(date: IsoDate, months: number): IsoDate {
  return formatIsoDate(subMonths(parseIsoDate(date), months));
}

export function subYearsIso(date: IsoDate, years: number): IsoDate {
  return formatIsoDate(subYears(parseIsoDate(date), years));
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' (ECOS 응답 형식) */
export function fromCompactDate(value: string): IsoDate {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`잘못된 YYYYMMDD 형식입니다: ${value}`);
  }
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (!isIsoDate(iso)) throw new Error(`잘못된 날짜입니다: ${value}`);
  return iso;
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
export function toCompactDate(date: IsoDate): string {
  return parseIsoDate(date) && date.replaceAll("-", "");
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** '2026-09-05' → '2026-09-05(토)' */
export function formatKoWithWeekday(date: IsoDate): string {
  const d = parseIsoDate(date);
  return `${date}(${WEEKDAY_KO[d.getDay()]})`;
}

/** 문자열 비교로 날짜 순서를 정한다. ISO date는 사전순 = 시간순. */
export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
