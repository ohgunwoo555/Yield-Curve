import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ECOS_ITEMS,
  ECOS_TENORS,
  buildEcosSearchUrl,
  createEcosSource,
  parseEcosItemList,
  parseEcosSearch,
  resolveEcosItemCodes,
} from "@/lib/sources/ecos";
import { SourceError } from "@/lib/sources/types";

const loadFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("ECOS 항목 목록", () => {
  it("항목 목록을 파싱하고 ITEM_NAME으로 만기별 코드를 확정한다", () => {
    const items = parseEcosItemList(loadFixture("ecos-itemlist.json"));
    expect(items).toHaveLength(12);
    const mismatch = vi.fn();
    const resolved = resolveEcosItemCodes(items, mismatch);
    expect(mismatch).not.toHaveBeenCalled();
    for (const tenor of ECOS_TENORS) {
      expect(resolved[tenor]).toEqual(ECOS_ITEMS[tenor]);
    }
  });

  it("예상 코드와 다르면 실제 코드를 쓰고 콜백을 호출한다", () => {
    const items = parseEcosItemList(loadFixture("ecos-itemlist.json")).map((it) =>
      it.ITEM_NAME === "국고채(10년)" ? { ...it, ITEM_CODE: "999999999" } : it,
    );
    const mismatch = vi.fn();
    const resolved = resolveEcosItemCodes(items, mismatch);
    expect(mismatch).toHaveBeenCalledWith("10Y", "010210000", "999999999");
    expect(resolved["10Y"].itemCode).toBe("999999999");
  });

  it("필요한 항목명이 없으면 SourceError", () => {
    const items = parseEcosItemList(loadFixture("ecos-itemlist.json")).filter(
      (it) => it.ITEM_NAME !== "국고채(30년)",
    );
    expect(() => resolveEcosItemCodes(items)).toThrow(/국고채\(30년\)/);
  });

  it("인증키 오류(RESULT)는 SourceError", () => {
    expect(() => parseEcosItemList(loadFixture("ecos-error.json"))).toThrow(/INFO-100/);
  });
});

describe("ECOS 검색 파싱", () => {
  it("TIME을 ISO 날짜로 바꾸고 빈 DATA_VALUE는 건너뛴다", () => {
    const { total, rows } = parseEcosSearch(loadFixture("ecos-search-10y.json"), "010210000");
    expect(total).toBe(6);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ date: "2026-08-25", value: 3.512 });
    expect(rows.find((r) => r.date === "2026-08-28")).toBeUndefined();
    expect(rows.at(-1)).toEqual({ date: "2026-09-01", value: 3.541 });
  });

  it("INFO-200(데이터 없음)은 빈 결과", () => {
    expect(parseEcosSearch(loadFixture("ecos-nodata.json"), "x")).toEqual({ total: 0, rows: [] });
  });

  it("예상 밖 형식은 SourceError", () => {
    expect(() => parseEcosSearch({ foo: 1 }, "x")).toThrowError(SourceError);
  });

  it("URL 구성", () => {
    expect(buildEcosSearchUrl("KEY", "010210000", "2026-01-01", "2026-02-01", 1, 1000)).toBe(
      "https://ecos.bok.or.kr/api/StatisticSearch/KEY/json/kr/1/1000/817Y002/D/20260101/20260201/010210000",
    );
  });
});

describe("ECOS 소스", () => {
  function makeSearchPage(itemCode: string, dates: string[], total: number) {
    return {
      StatisticSearch: {
        list_total_count: total,
        row: dates.map((d) => ({
          ITEM_CODE1: itemCode,
          ITEM_NAME1: "x",
          TIME: d,
          DATA_VALUE: "3.5",
        })),
      },
    };
  }

  it("항목 목록을 한 번만 조회하고, 만기별로 페이지네이션하며 가져온다", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/StatisticItemList/")) {
        return new Response(JSON.stringify(loadFixture("ecos-itemlist.json")), { status: 200 });
      }
      const m = url.match(/\/kr\/(\d+)\/(\d+)\/817Y002\/D\/\d+\/\d+\/(\d+)$/)!;
      const start = Number(m[1]);
      const itemCode = m[3]!;
      // 총 5행, 페이지 크기 2 → 3페이지
      const all = ["20260825", "20260826", "20260827", "20260828", "20260831"];
      const page = all.slice(start - 1, start - 1 + 2);
      return new Response(JSON.stringify(makeSearchPage(itemCode, page, all.length)), {
        status: 200,
      });
    });

    const src = createEcosSource("KEY", { fetchImpl, sleepImpl: async () => {}, pageSize: 2 });
    expect(src.countryCode).toBe("KR");
    expect(src.tenors).toEqual(ECOS_TENORS);

    const points = await src.fetchRange("2026-08-25", "2026-08-31");
    expect(calls.filter((u) => u.includes("/StatisticItemList/"))).toHaveLength(1);
    expect(calls.filter((u) => u.includes("/StatisticSearch/"))).toHaveLength(7 * 3);
    expect(points).toHaveLength(7 * 5);
    expect(points[0]).toEqual({
      countryCode: "KR",
      tenor: "1Y",
      date: "2026-08-25",
      value: 3.5,
      source: "ECOS",
    });

    // 두 번째 호출에서는 항목 목록을 다시 조회하지 않는다.
    await src.fetchRange("2026-08-25", "2026-08-31");
    expect(calls.filter((u) => u.includes("/StatisticItemList/"))).toHaveLength(1);
  });
});
