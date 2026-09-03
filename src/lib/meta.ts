import type { Db } from "./db/client";
import { getCountryMetas, getLastIngestedAt, type CountryMeta } from "./db/queries";
import { getSources } from "./sources/registry";

export type Meta = {
  countries: CountryMeta[];
  sources: { countryCode: string; sourceName: string }[];
  lastIngestedAt: string | null; // ISO 8601
};

export async function getMeta(db: Db): Promise<Meta> {
  const [countries, lastIngestedAt] = await Promise.all([
    getCountryMetas(db),
    getLastIngestedAt(db),
  ]);
  return {
    countries,
    sources: safeSources(),
    lastIngestedAt: lastIngestedAt ? lastIngestedAt.toISOString() : null,
  };
}

/** API 키가 없어도 메타 조회는 되어야 하므로 소스 생성 실패는 무시한다. */
function safeSources() {
  try {
    return getSources().map((s) => ({ countryCode: s.countryCode, sourceName: s.sourceName }));
  } catch {
    return [
      { countryCode: "US", sourceName: "FRED" },
      { countryCode: "KR", sourceName: "ECOS" },
    ];
  }
}
