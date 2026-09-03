import { eq, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { ingestRuns, yields } from "./db/schema";
import type { YieldPoint, YieldSource } from "./sources/types";

export type IngestResult = {
  countryCode: string;
  sourceName: string;
  status: "success" | "failed" | "partial";
  from: string;
  to: string;
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
  runId: number | null;
};

/** 한 번의 INSERT에 넣을 최대 행 수 (파라미터 한도 65535 / 6열 여유) */
const CHUNK_SIZE = 1000;

/**
 * yields에 upsert 한다. (country, tenor, date) 충돌 시 value·source·ingested_at을 갱신한다.
 * Postgres의 xmax 트릭으로 신규/갱신 행 수를 구분한다.
 */
export async function upsertYields(
  db: Db,
  points: YieldPoint[],
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const chunk = points.slice(i, i + CHUNK_SIZE);
    const rows = await db
      .insert(yields)
      .values(
        chunk.map((p) => ({
          countryCode: p.countryCode,
          tenor: p.tenor,
          date: p.date,
          value: p.value.toFixed(4),
          source: p.source,
        })),
      )
      .onConflictDoUpdate({
        target: [yields.countryCode, yields.tenor, yields.date],
        set: {
          value: sql`excluded.value`,
          source: sql`excluded.source`,
          ingestedAt: sql`now()`,
        },
      })
      .returning({ isInsert: sql<boolean>`(xmax = 0)` });
    for (const r of rows) {
      if (r.isInsert) inserted++;
      else updated++;
    }
  }
  return { inserted, updated };
}

/**
 * 소스 하나의 [from, to] 구간을 가져와 upsert 하고 ingest_runs에 기록한다.
 * 실패해도 throw 하지 않고 결과 객체의 status/error로 알린다.
 */
export async function ingestSource(
  db: Db,
  source: YieldSource,
  from: string,
  to: string,
): Promise<IngestResult> {
  const startedAt = new Date();
  const base: IngestResult = {
    countryCode: source.countryCode,
    sourceName: source.sourceName,
    status: "failed",
    from,
    to,
    fetched: 0,
    inserted: 0,
    updated: 0,
    error: null,
    runId: null,
  };

  let runId: number | null = null;
  try {
    const [run] = await db
      .insert(ingestRuns)
      .values({
        countryCode: source.countryCode,
        startedAt,
        status: "running",
        fromDate: from,
        toDate: to,
      })
      .returning({ id: ingestRuns.id });
    runId = run?.id ?? null;
  } catch (err) {
    return { ...base, error: `ingest_runs 기록 실패: ${message(err)}` };
  }

  let points: YieldPoint[] = [];
  try {
    points = await source.fetchRange(from, to);
  } catch (err) {
    const error = message(err);
    await finishRun(db, runId, { status: "failed", rowsUpserted: 0, error });
    return { ...base, runId, error };
  }

  try {
    const { inserted, updated } = await upsertYields(db, points);
    await finishRun(db, runId, { status: "success", rowsUpserted: inserted + updated, error: null });
    return { ...base, runId, status: "success", fetched: points.length, inserted, updated };
  } catch (err) {
    const error = `upsert 실패: ${message(err)}`;
    await finishRun(db, runId, { status: "partial", rowsUpserted: 0, error });
    return { ...base, runId, status: "partial", fetched: points.length, error };
  }
}

async function finishRun(
  db: Db,
  runId: number | null,
  patch: { status: string; rowsUpserted: number; error: string | null },
) {
  if (runId === null) return;
  await db
    .update(ingestRuns)
    .set({ ...patch, finishedAt: new Date() })
    .where(eq(ingestRuns.id, runId));
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
