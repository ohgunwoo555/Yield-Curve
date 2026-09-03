import "dotenv/config";
import { fetchJsonWithRetry } from "../src/lib/sources/http";
import {
  ECOS_ITEMS,
  ECOS_STAT_CODE,
  ECOS_TENORS,
  buildEcosItemListUrl,
  parseEcosItemList,
  resolveEcosItemCodes,
} from "../src/lib/sources/ecos";

/**
 * ECOS 817Y002 항목 목록을 실제로 호출해 출력하고,
 * ecos.ts의 ECOS_ITEMS 예상 코드와 비교한다.
 * 사용법: pnpm ecos:items
 */
async function main() {
  const apiKey = process.env.ECOS_API_KEY;
  if (!apiKey) throw new Error("ECOS_API_KEY 환경변수가 설정되지 않았습니다.");

  const json = await fetchJsonWithRetry(buildEcosItemListUrl(apiKey), {
    sourceName: "ECOS",
    series: "StatisticItemList",
  });
  const items = parseEcosItemList(json);

  console.log(`\n[${ECOS_STAT_CODE}] 항목 ${items.length}개\n`);
  console.log("ITEM_CODE     ITEM_NAME                     CYCLE  START     END");
  for (const it of items) {
    console.log(
      `${it.ITEM_CODE.padEnd(13)} ${it.ITEM_NAME.padEnd(28)} ${(it.CYCLE ?? "").padEnd(6)} ${it.START_TIME ?? ""}  ${it.END_TIME ?? ""}`,
    );
  }

  console.log("\n만기 매핑 검증:");
  let mismatches = 0;
  const resolved = resolveEcosItemCodes(items, (tenor, expected, actual) => {
    mismatches++;
    console.log(`  ${tenor.padEnd(4)} ${ECOS_ITEMS[tenor].itemName}: 예상 ${expected} → 실제 ${actual}  ✗`);
  });
  for (const tenor of ECOS_TENORS) {
    const r = resolved[tenor];
    if (r.itemCode === ECOS_ITEMS[tenor].itemCode) {
      console.log(`  ${tenor.padEnd(4)} ${r.itemName}: ${r.itemCode}  ✓`);
    }
  }
  if (mismatches > 0) {
    console.log(
      `\n예상 코드와 다른 항목이 ${mismatches}개 있습니다. src/lib/sources/ecos.ts의 ECOS_ITEMS를 실제 값으로 갱신하세요.`,
    );
  } else {
    console.log("\n모든 항목코드가 예상값과 일치합니다. ecos.ts 주석에 확인 날짜를 기록하세요.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
