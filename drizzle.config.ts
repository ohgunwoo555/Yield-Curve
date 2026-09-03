import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit 명령을 실행할 때만 읽는다. 빌드에는 필요 없다.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
