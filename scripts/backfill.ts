import "dotenv/config";
import { parseArgs } from "node:util";
import { getDb } from "../src/lib/db/client";
import { subYearsIso, todayIso, isIsoDate } from "../src/lib/dates";
import { ingestSource } from "../src/lib/ingest";
import { getRegisteredCountryCodes, getSource } from "../src/lib/sources/registry";

/**
 * 사용법: pnpm backfill --country US [--from 2023-01-01] [--to 2026-09-03]
 * 기본 시작일은 오늘 기준 3년 전(전년비 계산 여유분 포함).
 * upsert 방식이라 여러 번 실행해도 안전하다.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      country: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
    },
  });

  const country = values.country?.toUpperCase();
  if (!country) {
    throw new Error(`--country 인자가 필요합니다. (등록된 국가: ${getRegisteredCountryCodes().join(", ")})`);
  }
  const source = getSource(country);
  if (!source) {
    throw new Error(`등록되지 않은 국가입니다: ${country} (등록된 국가: ${getRegisteredCountryCodes().join(", ")})`);
  }

  const to = values.to ?? todayIso();
  const from = values.from ?? subYearsIso(to, 3);
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error("--from / --to 는 YYYY-MM-DD 형식이어야 합니다.");
  }
  if (from > to) throw new Error("--from 이 --to 보다 늦습니다.");

  console.log(`[backfill] ${country} (${source.sourceName}) ${from} ~ ${to}`);
  const started = Date.now();
  const result = await ingestSource(getDb(), source, from, to);
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log(
    `[backfill] status=${result.status} fetched=${result.fetched} inserted=${result.inserted} updated=${result.updated} run_id=${result.runId} (${secs}s)`,
  );
  if (result.error) {
    console.error(`[backfill] error: ${result.error}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    // postgres 커넥션 풀이 열려 있으면 프로세스가 끝나지 않으므로 명시적으로 종료
    setTimeout(() => process.exit(process.exitCode ?? 0), 100);
  });
