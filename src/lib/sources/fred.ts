import { z } from "zod";
import type { Tenor } from "@/lib/tenors";
import { isIsoDate } from "@/lib/dates";
import { fetchJsonWithRetry, sleep } from "./http";
import { SourceError, type YieldPoint, type YieldSource } from "./types";

export const FRED_SOURCE_NAME = "FRED";
export const FRED_COUNTRY_CODE = "US";
const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

/** 만기 → FRED 시리즈 ID (Treasury constant maturity, daily) */
export const FRED_SERIES = {
  "1M": "DGS1MO",
  "3M": "DGS3MO",
  "6M": "DGS6MO",
  "1Y": "DGS1",
  "2Y": "DGS2",
  "3Y": "DGS3",
  "5Y": "DGS5",
  "7Y": "DGS7",
  "10Y": "DGS10",
  "20Y": "DGS20",
  "30Y": "DGS30",
} as const satisfies Partial<Record<Tenor, string>>;

export type FredTenor = keyof typeof FRED_SERIES;
export const FRED_TENORS = Object.keys(FRED_SERIES) as FredTenor[];

const observationSchema = z.object({
  date: z.string(),
  value: z.string(),
});

const observationsResponseSchema = z.object({
  observations: z.array(observationSchema),
});

const errorResponseSchema = z.object({
  error_code: z.number(),
  error_message: z.string(),
});

export type FredObservation = { date: string; value: number };

/**
 * FRED observations 응답을 파싱한다.
 * 값이 "."인 관측치는 결측이므로 제외한다.
 */
export function parseFredObservations(json: unknown, series: string): FredObservation[] {
  const err = errorResponseSchema.safeParse(json);
  if (err.success) {
    throw new SourceError(FRED_SOURCE_NAME, `API 오류 ${err.data.error_code}: ${err.data.error_message}`, {
      series,
    });
  }
  const parsed = observationsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SourceError(FRED_SOURCE_NAME, `응답 형식이 예상과 다릅니다: ${parsed.error.message}`, {
      series,
    });
  }
  const out: FredObservation[] = [];
  for (const obs of parsed.data.observations) {
    if (obs.value === ".") continue;
    if (!isIsoDate(obs.date)) {
      throw new SourceError(FRED_SOURCE_NAME, `잘못된 날짜: ${obs.date}`, { series });
    }
    const value = Number(obs.value);
    if (!Number.isFinite(value)) {
      throw new SourceError(FRED_SOURCE_NAME, `잘못된 값(${obs.date}): ${obs.value}`, { series });
    }
    out.push({ date: obs.date, value });
  }
  return out;
}

export function buildFredUrl(series: string, apiKey: string, from: string, to: string): string {
  const params = new URLSearchParams({
    series_id: series,
    api_key: apiKey,
    file_type: "json",
    observation_start: from,
    observation_end: to,
  });
  return `${FRED_BASE_URL}?${params.toString()}`;
}

export type FredSourceOptions = {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  /** 요청 사이 대기(ms). 레이트리밋 대비. */
  delayMs?: number;
};

export function createFredSource(apiKey: string, opts: FredSourceOptions = {}): YieldSource {
  const delayMs = opts.delayMs ?? 150;
  const doSleep = opts.sleepImpl ?? sleep;

  return {
    countryCode: FRED_COUNTRY_CODE,
    sourceName: FRED_SOURCE_NAME,
    tenors: FRED_TENORS,
    async fetchRange(from, to) {
      const points: YieldPoint[] = [];
      // 시리즈 11개를 순차 호출한다(병렬 금지).
      for (let i = 0; i < FRED_TENORS.length; i++) {
        const tenor = FRED_TENORS[i]!;
        const series = FRED_SERIES[tenor];
        if (i > 0) await doSleep(delayMs);
        const json = await fetchJsonWithRetry(buildFredUrl(series, apiKey, from, to), {
          sourceName: FRED_SOURCE_NAME,
          series,
          fetchImpl: opts.fetchImpl,
          sleepImpl: opts.sleepImpl,
        });
        for (const obs of parseFredObservations(json, series)) {
          points.push({
            countryCode: FRED_COUNTRY_CODE,
            tenor,
            date: obs.date,
            value: obs.value,
            source: FRED_SOURCE_NAME,
          });
        }
      }
      return points;
    },
  };
}
