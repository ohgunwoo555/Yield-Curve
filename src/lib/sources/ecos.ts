import { z } from "zod";
import type { Tenor } from "@/lib/tenors";
import { fromCompactDate, toCompactDate } from "@/lib/dates";
import { fetchJsonWithRetry, sleep } from "./http";
import { SourceError, type YieldPoint, type YieldSource } from "./types";

export const ECOS_SOURCE_NAME = "ECOS";
export const ECOS_COUNTRY_CODE = "KR";
const ECOS_BASE_URL = "https://ecos.bok.or.kr/api";

/** 통계표: 817Y002 시장금리(일별) */
export const ECOS_STAT_CODE = "817Y002";

/** 한 호출당 최대 행 수 (ECOS 제한 1,000) */
export const ECOS_PAGE_SIZE = 1000;

/**
 * 만기 → ECOS 항목명·항목코드.
 *
 * 2026-09-08 `pnpm ecos:items`로 StatisticItemList(817Y002)를 실제 호출해 검증했다.
 * 항목 27개 중 국고채(1년/2년/3년/5년/10년/20년/30년) 7개의 ITEM_CODE가 아래와 모두 일치했다.
 *
 * 소스는 실행 시점에도 StatisticItemList를 호출해 ITEM_NAME 기준으로 실제 코드를 확정하며
 * (resolveEcosItemCodes), 아래 값과 다르면 경고를 남기고 실제 코드를 쓴다.
 */
export const ECOS_ITEMS = {
  "1Y": { itemName: "국고채(1년)", itemCode: "010190000" },
  "2Y": { itemName: "국고채(2년)", itemCode: "010195000" },
  "3Y": { itemName: "국고채(3년)", itemCode: "010200000" },
  "5Y": { itemName: "국고채(5년)", itemCode: "010200001" },
  "10Y": { itemName: "국고채(10년)", itemCode: "010210000" },
  "20Y": { itemName: "국고채(20년)", itemCode: "010220000" },
  "30Y": { itemName: "국고채(30년)", itemCode: "010230000" },
} as const satisfies Partial<Record<Tenor, { itemName: string; itemCode: string }>>;

export type EcosTenor = keyof typeof ECOS_ITEMS;
export const ECOS_TENORS = Object.keys(ECOS_ITEMS) as EcosTenor[];

// ---- 응답 스키마 -----------------------------------------------------------

/** ECOS는 오류도 HTTP 200으로 내려준다. */
const resultSchema = z.object({
  RESULT: z.object({ CODE: z.string(), MESSAGE: z.string() }),
});

const itemRowSchema = z.object({
  STAT_CODE: z.string(),
  ITEM_CODE: z.string(),
  ITEM_NAME: z.string(),
  CYCLE: z.string().nullish(),
  START_TIME: z.string().nullish(),
  END_TIME: z.string().nullish(),
});

const itemListSchema = z.object({
  StatisticItemList: z.object({
    list_total_count: z.number(),
    row: z.array(itemRowSchema),
  }),
});

const searchRowSchema = z.object({
  ITEM_CODE1: z.string(),
  ITEM_NAME1: z.string(),
  TIME: z.string(),
  DATA_VALUE: z.string().nullable(),
});

const searchSchema = z.object({
  StatisticSearch: z.object({
    list_total_count: z.number(),
    row: z.array(searchRowSchema),
  }),
});

/** "데이터 없음"은 오류가 아니라 빈 결과로 본다. */
const NO_DATA_CODE = "INFO-200";

export type EcosItem = z.infer<typeof itemRowSchema>;
export type EcosObservation = { date: string; value: number };

function throwIfResultError(json: unknown, context: string, series?: string): boolean {
  const r = resultSchema.safeParse(json);
  if (!r.success) return false;
  if (r.data.RESULT.CODE === NO_DATA_CODE) return true;
  throw new SourceError(
    ECOS_SOURCE_NAME,
    `${context} API 오류 ${r.data.RESULT.CODE}: ${r.data.RESULT.MESSAGE}`,
    { series },
  );
}

/** StatisticItemList 응답을 파싱한다. */
export function parseEcosItemList(json: unknown): EcosItem[] {
  if (throwIfResultError(json, "StatisticItemList")) return [];
  const parsed = itemListSchema.safeParse(json);
  if (!parsed.success) {
    throw new SourceError(
      ECOS_SOURCE_NAME,
      `StatisticItemList 응답 형식이 예상과 다릅니다: ${parsed.error.message}`,
    );
  }
  return parsed.data.StatisticItemList.row;
}

export type ResolvedEcosItems = Record<EcosTenor, { itemName: string; itemCode: string }>;

/**
 * 항목 목록에서 ITEM_NAME으로 만기별 항목코드를 확정한다.
 * 필요한 항목명이 하나라도 없으면 SourceError.
 * 예상 코드와 다르면 onMismatch 콜백을 호출한다(기본: console.warn).
 */
export function resolveEcosItemCodes(
  items: readonly EcosItem[],
  onMismatch: (tenor: EcosTenor, expected: string, actual: string) => void = defaultMismatch,
): ResolvedEcosItems {
  const byName = new Map<string, EcosItem>();
  for (const it of items) {
    if (it.STAT_CODE !== ECOS_STAT_CODE) continue;
    byName.set(normalizeName(it.ITEM_NAME), it);
  }
  const resolved = {} as ResolvedEcosItems;
  const missing: string[] = [];
  for (const tenor of ECOS_TENORS) {
    const expected = ECOS_ITEMS[tenor];
    const found = byName.get(normalizeName(expected.itemName));
    if (!found) {
      missing.push(expected.itemName);
      continue;
    }
    if (found.ITEM_CODE !== expected.itemCode) {
      onMismatch(tenor, expected.itemCode, found.ITEM_CODE);
    }
    resolved[tenor] = { itemName: found.ITEM_NAME, itemCode: found.ITEM_CODE };
  }
  if (missing.length > 0) {
    throw new SourceError(
      ECOS_SOURCE_NAME,
      `${ECOS_STAT_CODE} 항목 목록에서 다음 항목명을 찾지 못했습니다: ${missing.join(", ")}`,
    );
  }
  return resolved;
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, "");
}

function defaultMismatch(tenor: EcosTenor, expected: string, actual: string) {
  console.warn(
    `[ECOS] ${tenor} 항목코드가 예상값과 다릅니다: 예상 ${expected}, 실제 ${actual}. 실제 코드를 사용합니다.`,
  );
}

/**
 * StatisticSearch 응답 한 페이지를 파싱한다.
 * DATA_VALUE가 빈 문자열/null이면 결측이므로 제외한다.
 */
export function parseEcosSearch(
  json: unknown,
  series: string,
): { total: number; rows: EcosObservation[] } {
  if (throwIfResultError(json, "StatisticSearch", series)) return { total: 0, rows: [] };
  const parsed = searchSchema.safeParse(json);
  if (!parsed.success) {
    throw new SourceError(
      ECOS_SOURCE_NAME,
      `StatisticSearch 응답 형식이 예상과 다릅니다: ${parsed.error.message}`,
      { series },
    );
  }
  const rows: EcosObservation[] = [];
  for (const row of parsed.data.StatisticSearch.row) {
    const raw = row.DATA_VALUE?.trim() ?? "";
    if (raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new SourceError(ECOS_SOURCE_NAME, `잘못된 값(${row.TIME}): ${raw}`, { series });
    }
    let date: string;
    try {
      date = fromCompactDate(row.TIME);
    } catch (err) {
      throw new SourceError(ECOS_SOURCE_NAME, `잘못된 날짜: ${row.TIME}`, { series, cause: err });
    }
    rows.push({ date, value });
  }
  return { total: parsed.data.StatisticSearch.list_total_count, rows };
}

export function buildEcosItemListUrl(apiKey: string): string {
  return `${ECOS_BASE_URL}/StatisticItemList/${apiKey}/json/kr/1/100/${ECOS_STAT_CODE}`;
}

export function buildEcosSearchUrl(
  apiKey: string,
  itemCode: string,
  from: string,
  to: string,
  start: number,
  end: number,
): string {
  return `${ECOS_BASE_URL}/StatisticSearch/${apiKey}/json/kr/${start}/${end}/${ECOS_STAT_CODE}/D/${toCompactDate(from)}/${toCompactDate(to)}/${itemCode}`;
}

export type EcosSourceOptions = {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  delayMs?: number;
  pageSize?: number;
  onMismatch?: (tenor: EcosTenor, expected: string, actual: string) => void;
};

export function createEcosSource(apiKey: string, opts: EcosSourceOptions = {}): YieldSource {
  const delayMs = opts.delayMs ?? 150;
  const pageSize = opts.pageSize ?? ECOS_PAGE_SIZE;
  const doSleep = opts.sleepImpl ?? sleep;
  const fetchOpts = { fetchImpl: opts.fetchImpl, sleepImpl: opts.sleepImpl };
  let resolvedItems: ResolvedEcosItems | undefined;

  async function getItems(): Promise<ResolvedEcosItems> {
    if (resolvedItems) return resolvedItems;
    const json = await fetchJsonWithRetry(buildEcosItemListUrl(apiKey), {
      sourceName: ECOS_SOURCE_NAME,
      series: "StatisticItemList",
      ...fetchOpts,
    });
    resolvedItems = resolveEcosItemCodes(parseEcosItemList(json), opts.onMismatch);
    return resolvedItems;
  }

  return {
    countryCode: ECOS_COUNTRY_CODE,
    sourceName: ECOS_SOURCE_NAME,
    tenors: ECOS_TENORS,
    async fetchRange(from, to) {
      const items = await getItems();
      const points: YieldPoint[] = [];
      for (const tenor of ECOS_TENORS) {
        const { itemCode, itemName } = items[tenor];
        const series = `${itemCode}(${itemName})`;
        // 한 호출당 최대 1,000행이므로 start/end로 페이지네이션한다.
        let start = 1;
        for (;;) {
          await doSleep(delayMs);
          const end = start + pageSize - 1;
          const json = await fetchJsonWithRetry(
            buildEcosSearchUrl(apiKey, itemCode, from, to, start, end),
            { sourceName: ECOS_SOURCE_NAME, series, ...fetchOpts },
          );
          const page = parseEcosSearch(json, series);
          for (const obs of page.rows) {
            points.push({
              countryCode: ECOS_COUNTRY_CODE,
              tenor,
              date: obs.date,
              value: obs.value,
              source: ECOS_SOURCE_NAME,
            });
          }
          if (end >= page.total || page.total === 0) break;
          start = end + 1;
        }
      }
      return points;
    },
  };
}
