import "dotenv/config";
import { getDb } from "../src/lib/db/client";
import { countries } from "../src/lib/db/schema";

/** countries 마스터 시드. 여러 번 실행해도 안전하다(upsert). */
const COUNTRIES = [
  { code: "US", nameKo: "미국", currency: "USD", sortOrder: 1 },
  { code: "KR", nameKo: "한국", currency: "KRW", sortOrder: 2 },
] as const;

async function main() {
  const db = getDb();
  for (const c of COUNTRIES) {
    await db
      .insert(countries)
      .values(c)
      .onConflictDoUpdate({
        target: countries.code,
        set: { nameKo: c.nameKo, currency: c.currency, sortOrder: c.sortOrder },
      });
    console.log(`seeded ${c.code} (${c.nameKo})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
