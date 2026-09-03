import { describe, expect, it } from "vitest";
import { TENORS, isTenor, sortTenors, tenorIndex, tenorLabelKo } from "@/lib/tenors";

describe("tenors", () => {
  it("표준 만기 순서를 유지한다", () => {
    expect(TENORS).toEqual([
      "1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y",
    ]);
    expect(tenorIndex("1M")).toBe(0);
    expect(tenorIndex("30Y")).toBe(10);
  });

  it("isTenor는 표준 키만 허용한다", () => {
    expect(isTenor("10Y")).toBe(true);
    expect(isTenor("10y")).toBe(false);
    expect(isTenor("4Y")).toBe(false);
    expect(isTenor(10)).toBe(false);
  });

  it("sortTenors는 표준 순서로 정렬한다", () => {
    const sorted = sortTenors([{ tenor: "30Y" }, { tenor: "1M" }, { tenor: "5Y" }]);
    expect(sorted.map((s) => s.tenor)).toEqual(["1M", "5Y", "30Y"]);
  });

  it("한국어 라벨", () => {
    expect(tenorLabelKo("1M")).toBe("1개월");
    expect(tenorLabelKo("10Y")).toBe("10년");
  });
});
