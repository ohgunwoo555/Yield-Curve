import { describe, expect, it } from "vitest";
import {
  formatKoWithWeekday,
  fromCompactDate,
  isIsoDate,
  subDaysIso,
  subMonthsIso,
  subYearsIso,
  toCompactDate,
} from "@/lib/dates";

describe("dates", () => {
  it("isIsoDate는 실제 존재하는 날짜만 허용한다", () => {
    expect(isIsoDate("2026-09-03")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-9-3")).toBe(false);
    expect(isIsoDate("20260903")).toBe(false);
  });

  it("subMonthsIso는 date-fns 월말 규칙을 따른다", () => {
    expect(subMonthsIso("2026-03-31", 1)).toBe("2026-02-28");
    expect(subMonthsIso("2024-03-31", 1)).toBe("2024-02-29");
    expect(subMonthsIso("2026-09-03", 1)).toBe("2026-08-03");
  });

  it("subYearsIso는 윤일을 2/28로 당긴다", () => {
    expect(subYearsIso("2024-02-29", 1)).toBe("2023-02-28");
    expect(subYearsIso("2026-09-03", 1)).toBe("2025-09-03");
  });

  it("subDaysIso", () => {
    expect(subDaysIso("2026-09-03", 7)).toBe("2026-08-27");
    expect(subDaysIso("2026-01-01", 1)).toBe("2025-12-31");
  });

  it("compact ↔ iso 변환", () => {
    expect(fromCompactDate("20260903")).toBe("2026-09-03");
    expect(toCompactDate("2026-09-03")).toBe("20260903");
    expect(() => fromCompactDate("2026-09-03")).toThrow();
  });

  it("요일 표시", () => {
    expect(formatKoWithWeekday("2026-09-05")).toBe("2026-09-05(토)");
    expect(formatKoWithWeekday("2026-09-04")).toBe("2026-09-04(금)");
  });
});
