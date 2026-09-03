import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  countryCodeSchema,
  handleRouteError,
  isoDateSchema,
  jsonError,
  parseQuery,
  tenorSchema,
} from "@/lib/api";
import { subYearsIso } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { getHistory, getLatestDate } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  country: countryCodeSchema,
  tenor: tenorSchema,
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/** GET /api/yields/history?country=KR&tenor=10Y&from=&to= → { date, value }[] */
export async function GET(req: NextRequest) {
  const parsed = parseQuery(querySchema, req.nextUrl.searchParams);
  if (!parsed.ok) return parsed.response;
  const { country, tenor } = parsed.data;

  try {
    const db = getDb();
    const to = parsed.data.to ?? (await getLatestDate(db, country));
    if (!to) return jsonError(404, `${country} 데이터가 아직 없습니다.`);
    const from = parsed.data.from ?? subYearsIso(to, 1);
    if (from > to) return jsonError(400, "from 이 to 보다 늦습니다.");
    const points = await getHistory(db, country, tenor, from, to);
    return NextResponse.json(points);
  } catch (err) {
    return handleRouteError(err);
  }
}
