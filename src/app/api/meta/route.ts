import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { getMeta } from "@/lib/meta";

export const dynamic = "force-dynamic";

/** GET /api/meta → 국가 목록 + 국가별 최초/최신 데이터 날짜 + 최근 적재 시각 */
export async function GET() {
  try {
    return NextResponse.json(await getMeta(getDb()));
  } catch (err) {
    return handleRouteError(err);
  }
}
