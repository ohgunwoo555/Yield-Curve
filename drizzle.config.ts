import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit 명령을 실행할 때만 읽는다. 빌드에는 필요 없다.
    // 마이그레이션은 Supabase Session pooler(5432) 주소(DIRECT_URL)를 권장한다.
    // 없으면 앱과 같은 DATABASE_URL(Transaction pooler, 6543)을 쓴다.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
