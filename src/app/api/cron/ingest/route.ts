import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { subDaysIso, todayIso } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { ingestSource, type IngestResult } from "@/lib/ingest";
import { getRegisteredCountryCodes, getSource } from "@/lib/sources/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 소스 측 사후 수정·지연 반영에 대비해 최근 N일을 다시 가져온다. */
const LOOKBACK_DAYS = 10;

/**
 * GET /api/cron/ingest
 * Vercel Cron이 매일 UTC 23:00(KST 08:00)에 호출한다.
 * 인증: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError(500, "CRON_SECRET 환경변수가 설정되지 않았습니다.");
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return jsonError(401, "인증에 실패했습니다.");

  const to = todayIso();
  const from = subDaysIso(to, LOOKBACK_DAYS);
  const startedAt = new Date();

  let db;
  try {
    db = getDb();
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : String(err));
  }

  // 국가 하나가 실패해도 나머지는 계속 진행한다.
  const results: IngestResult[] = [];
  for (const source of getSourcesSafely()) {
    if ("error" in source) {
      results.push({
        countryCode: source.countryCode,
        sourceName: "-",
        status: "failed",
        from,
        to,
        fetched: 0,
        inserted: 0,
        updated: 0,
        error: source.error,
        runId: null,
      });
      continue;
    }
    results.push(await ingestSource(db, source, from, to));
  }

  const ok = results.every((r) => r.status === "success");
  return NextResponse.json(
    {
      ok,
      from,
      to,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      results,
    },
    { status: ok ? 200 : 207 },
  );
}

/** 소스 생성(API 키 누락 등) 실패를 국가별 실패로 바꿔 나머지 국가는 진행되게 한다. */
function getSourcesSafely() {
  return getRegisteredCountryCodes().map((code) => {
    try {
      const s = getSource(code);
      return s ?? { countryCode: code, error: "소스를 찾을 수 없습니다." };
    } catch (err) {
      return { countryCode: code, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
