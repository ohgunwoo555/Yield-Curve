import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  FRED_SERIES,
  FRED_TENORS,
  buildFredUrl,
  createFredSource,
  parseFredObservations,
} from "@/lib/sources/fred";
import { SourceError } from "@/lib/sources/types";

const loadFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));

describe("FRED 파싱", () => {
  it("관측치를 파싱하고 '.'(결측)은 건너뛴다", () => {
    const obs = parseFredObservations(loadFixture("fred-dgs10.json"), "DGS10");
    expect(obs).toHaveLength(6);
    expect(obs[0]).toEqual({ date: "2026-08-24", value: 4.28 });
    expect(obs.find((o) => o.date === "2026-08-31")).toBeUndefined();
    expect(obs.at(-1)).toEqual({ date: "2026-09-01", value: 4.21 });
  });

  it("API 오류 응답은 시리즈 정보를 담은 SourceError를 던진다", () => {
    expect(() => parseFredObservations(loadFixture("fred-error.json"), "DGS10")).toThrow(
      /\[FRED:DGS10\] API 오류 400/,
    );
  });

  it("예상 밖 형식은 SourceError", () => {
    expect(() => parseFredObservations({ foo: 1 }, "DGS2")).toThrowError(SourceError);
  });

  it("URL 구성", () => {
    const url = new URL(buildFredUrl("DGS10", "KEY", "2026-01-01", "2026-02-01"));
    expect(url.origin + url.pathname).toBe("https://api.stlouisfed.org/fred/series/observations");
    expect(url.searchParams.get("series_id")).toBe("DGS10");
    expect(url.searchParams.get("file_type")).toBe("json");
    expect(url.searchParams.get("observation_start")).toBe("2026-01-01");
    expect(url.searchParams.get("observation_end")).toBe("2026-02-01");
  });
});

describe("FRED 소스", () => {
  it("11개 시리즈를 순차 호출하고 YieldPoint로 변환한다", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(JSON.stringify(loadFixture("fred-dgs10.json")), { status: 200 });
    });
    const src = createFredSource("KEY", { fetchImpl, sleepImpl: async () => {} });
    expect(src.countryCode).toBe("US");
    expect(src.tenors).toEqual(FRED_TENORS);

    const points = await src.fetchRange("2026-08-24", "2026-09-01");
    expect(calls).toHaveLength(11);
    expect(calls.map((u) => new URL(u).searchParams.get("series_id"))).toEqual(
      FRED_TENORS.map((t) => FRED_SERIES[t]),
    );
    expect(points).toHaveLength(11 * 6);
    expect(points[0]).toEqual({
      countryCode: "US",
      tenor: "1M",
      date: "2026-08-24",
      value: 4.28,
      source: "FRED",
    });
  });
});
