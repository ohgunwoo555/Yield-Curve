import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

let cached: Db | undefined;

/**
 * DB 클라이언트를 지연 생성한다.
 * 모듈 로드 시점에는 연결을 열지 않으므로 DATABASE_URL 없이도 빌드가 가능하다.
 */
export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  }
  // Supabase transaction pooler(6543)는 prepared statement를 지원하지 않는다.
  const client = postgres(url, { prepare: false, max: 5 });
  cached = drizzle(client, { schema });
  return cached;
}
