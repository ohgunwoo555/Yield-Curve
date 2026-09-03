import { NextResponse } from "next/server";
import { z } from "zod";
import { isIsoDate } from "./dates";
import { isTenor } from "./tenors";

/** 'YYYY-MM-DD' 이면서 실제 존재하는 날짜 */
export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: "날짜는 YYYY-MM-DD 형식이어야 합니다." });

export const countryCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(3)
  .transform((s) => s.toUpperCase());

export const tenorSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine(isTenor, { message: "지원하지 않는 만기입니다. (1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y)" });

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * URLSearchParams를 zod 스키마로 검증한다.
 * 실패하면 400 + 한국어 메시지를 담은 Response를 반환한다.
 */
export function parseQuery<S extends z.ZodTypeAny>(
  schema: S,
  searchParams: URLSearchParams,
): { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse } {
  const raw: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) raw[k] = v;
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const first = result.error.issues[0];
  const path = first?.path.join(".") ?? "";
  const message = first
    ? `잘못된 요청입니다${path ? ` (${path})` : ""}: ${first.message}`
    : "잘못된 요청입니다.";
  return { ok: false, response: jsonError(400, message) };
}

export function handleRouteError(err: unknown) {
  console.error(err);
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("DATABASE_URL")) {
    return jsonError(500, "데이터베이스 설정이 없습니다. DATABASE_URL 환경변수를 확인하세요.");
  }
  return jsonError(500, "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
}
