import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { countryCodeSchema, handleRouteError, isoDateSchema, jsonError, parseQuery } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getChanges, getCountries, getLatestDate } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  country: countryCodeSchema,
  date: isoDateSchema.optional(),
});

/** GET /api/yields?country=US&date=2026-09-03 → ChangesResult. date 생략 시 최근 영업일. */
export async function GET(req: NextRequest) {
  const parsed = parseQuery(querySchema, req.nextUrl.searchParams);
  if (!parsed.ok) return parsed.response;
  const { country, date } = parsed.data;

  try {
    const db = getDb();
    const known = await getCountries(db);
    if (!known.some((c) => c.code === country)) {
      return jsonError(400, `지원하지 않는 국가입니다: ${country}`);
    }
    const requestedDate = date ?? (await getLatestDate(db, country));
    if (!requestedDate) {
      return jsonError(404, `${country} 데이터가 아직 없습니다. 백필을 먼저 실행하세요.`);
    }
    const result = await getChanges(db, country, requestedDate);
    if (!result) {
      return jsonError(404, `${requestedDate} 이전 ${country} 데이터가 없습니다.`);
    }
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
