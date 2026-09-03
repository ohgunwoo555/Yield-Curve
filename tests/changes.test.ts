import { describe, expect, it } from "vitest";
import {
  computeChangesFromObservations,
  toBp,
  type YieldObservation,
} from "@/lib/changes";
import { TENORS, type Tenor } from "@/lib/tenors";

/**
 * 픽스처: 2025-08-01 ~ 2026-09-04 사이의 평일(월~금) 데이터.
 * 미국(US)은 30Y를 제외한 10개 만기, 한국(KR)은 7Y를 제외한 7개 국고채 만기.
 * 값 = 기본값 + (날짜 인덱스 × 0.01) 이라 차이가 결정적이다.
 * 2026-08-27(목)은 휴장일로 비워둔다 (→ -7일 휴장 케이스).
 */
const US_TENORS: Tenor[] = TENORS.filter((t) => t !== "30Y");
const KR_TENORS: Tenor[] = ["1Y", "2Y", "3Y", "5Y", "10Y", "20Y", "30Y"];
const HOLIDAYS = new Set(["2026-08-27"]);

function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const dow = d.getUTCDay();
    const iso = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !HOLIDAYS.has(iso)) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function fixture(tenors: Tenor[], from: string, to: string): YieldObservation[] {
  const obs: YieldObservation[] = [];
  weekdays(from, to).forEach((date, i) => {
    tenors.forEach((tenor, j) => {
      obs.push({ tenor, date, value: Number((3 + j * 0.1 + i * 0.01).toFixed(4)) });
    });
  });
  return obs;
}

const US = fixture(US_TENORS, "2025-08-01", "2026-09-04");
const KR = fixture(KR_TENORS, "2025-08-01", "2026-09-04");

function valueOf(obs: YieldObservation[], date: string, tenor: Tenor): number {
  const o = obs.find((x) => x.date === date && x.tenor === tenor);
  if (!o) throw new Error(`no fixture value for ${date} ${tenor}`);
  return o.value;
}

describe("toBp", () => {
  it("차이 × 100, 소수점 1자리", () => {
    expect(toBp(4.235, 4.21)).toBe(2.5);
    expect(toBp(4.21, 4.235)).toBe(-2.5);
    expect(toBp(3.1, 3.1)).toBe(0);
    expect(toBp(3.5, 3.4)).toBe(10);
  });
});

describe("computeChangesFromObservations", () => {
  it("1. 평일 기준일, 모든 비교일 존재", () => {
    const r = computeChangesFromObservations("US", "2026-09-03", US)!;
    expect(r).not.toBeNull();
    expect(r.effectiveDate).toBe("2026-09-03");
    expect(r.compareDates).toEqual({
      d1: "2026-09-02",
      w1: "2026-08-26", // 9/3 − 7일 = 8/27(휴장) → 8/26
      m1: "2026-08-03",
      y1: "2025-09-03",
    });
    const row10 = r.rows.find((x) => x.tenor === "10Y")!;
    const v = valueOf(US, "2026-09-03", "10Y");
    expect(row10.value).toBe(v);
    expect(row10.changes.d1).toBe(toBp(v, valueOf(US, "2026-09-02", "10Y")));
    expect(row10.changes.w1).toBe(toBp(v, valueOf(US, "2026-08-26", "10Y")));
    expect(row10.changes.m1).toBe(toBp(v, valueOf(US, "2026-08-03", "10Y")));
    expect(row10.changes.y1).toBe(toBp(v, valueOf(US, "2025-09-03", "10Y")));
    // 행은 표준 만기 순서
    expect(r.rows.map((x) => x.tenor)).toEqual([...TENORS]);
  });

  it("2. 기준일이 주말 → 금요일로 당겨짐", () => {
    const r = computeChangesFromObservations("US", "2026-09-05", US)!; // 토요일
    expect(r.requestedDate).toBe("2026-09-05");
    expect(r.effectiveDate).toBe("2026-09-04");
    expect(r.compareDates.d1).toBe("2026-09-03");
    expect(r.compareDates.w1).toBe("2026-08-28"); // 금요일 − 7일 = 전주 금요일
    const sunday = computeChangesFromObservations("US", "2026-09-06", US)!;
    expect(sunday.effectiveDate).toBe("2026-09-04");
  });

  it("3. -7일이 휴장일 → 그 이전 영업일 사용", () => {
    // 2026-09-03(목) − 7일 = 2026-08-27(목, 휴장) → 2026-08-26(수)
    const r = computeChangesFromObservations("KR", "2026-09-03", KR)!;
    expect(r.compareDates.w1).toBe("2026-08-26");
    const row = r.rows.find((x) => x.tenor === "3Y")!;
    expect(row.changes.w1).toBe(
      toBp(valueOf(KR, "2026-09-03", "3Y"), valueOf(KR, "2026-08-26", "3Y")),
    );
  });

  it("4. 데이터 시작 직후라 전년 비교 불가 → y1: null", () => {
    const r = computeChangesFromObservations("US", "2025-08-15", US)!;
    expect(r.effectiveDate).toBe("2025-08-15");
    expect(r.compareDates.y1).toBeNull();
    expect(r.compareDates.m1).toBeNull(); // 7/15 이하 데이터도 없음
    expect(r.compareDates.w1).toBe("2025-08-08");
    expect(r.compareDates.d1).toBe("2025-08-14");
    for (const row of r.rows) {
      expect(row.changes.y1).toBeNull();
      expect(row.changes.m1).toBeNull();
    }
    const row2 = r.rows.find((x) => x.tenor === "2Y")!;
    expect(row2.changes.d1).not.toBeNull();
  });

  it("5. 미국은 30Y, 한국은 7Y 미제공 → 해당 행 value null", () => {
    const us = computeChangesFromObservations("US", "2026-09-03", US)!;
    const us30 = us.rows.find((x) => x.tenor === "30Y")!;
    expect(us30.value).toBeNull();
    expect(us30.changes).toEqual({ d1: null, w1: null, m1: null, y1: null });

    const kr = computeChangesFromObservations("KR", "2026-09-03", KR)!;
    const kr7 = kr.rows.find((x) => x.tenor === "7Y")!;
    expect(kr7.value).toBeNull();
    expect(kr7.changes).toEqual({ d1: null, w1: null, m1: null, y1: null });
    // 한국은 1M/3M/6M도 미제공
    for (const t of ["1M", "3M", "6M"] as const) {
      expect(kr.rows.find((x) => x.tenor === t)!.value).toBeNull();
    }
    expect(kr.rows).toHaveLength(TENORS.length);
  });

  it("기준일 이하 데이터가 전혀 없으면 null", () => {
    expect(computeChangesFromObservations("US", "2025-07-31", US)).toBeNull();
  });

  it("전월비는 date-fns 월말 규칙(3/31 → 2/28)을 따른다", () => {
    const r = computeChangesFromObservations("US", "2026-03-31", US)!;
    expect(r.effectiveDate).toBe("2026-03-31");
    expect(r.compareDates.m1).toBe("2026-02-27"); // 2/28은 토요일 → 2/27(금)
  });
});
