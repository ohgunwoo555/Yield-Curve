import { Dashboard } from "@/components/Dashboard";
import type { ChangesResult } from "@/lib/changes";
import { isIsoDate } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { getChanges } from "@/lib/db/queries";
import { getMeta, type Meta } from "@/lib/meta";
import { isTenor, type Tenor } from "@/lib/tenors";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EMPTY_META: Meta = {
  countries: [],
  sources: [
    { countryCode: "US", sourceName: "FRED" },
    { countryCode: "KR", sourceName: "ECOS" },
  ],
  lastIngestedAt: null,
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tenorParam = first(sp.tenor)?.toUpperCase();
  const initialTenor: Tenor | null = tenorParam && isTenor(tenorParam) ? tenorParam : null;

  let meta: Meta = EMPTY_META;
  let initialData: ChangesResult | null = null;
  let initialError: string | null = null;
  let country = first(sp.country)?.toUpperCase() ?? "US";
  let date = first(sp.date) ?? "";

  try {
    const db = getDb();
    meta = await getMeta(db);
    const known = meta.countries.find((c) => c.code === country) ?? meta.countries[0];
    if (known) {
      country = known.code;
      if (!isIsoDate(date)) date = known.latestDate ?? date;
      if (known.latestDate && date > known.latestDate) date = known.latestDate;
      if (date) initialData = await getChanges(db, country, date);
    }
  } catch (err) {
    console.error(err);
    initialError =
      err instanceof Error && err.message.includes("DATABASE_URL")
        ? "데이터베이스 설정이 없습니다. DATABASE_URL 환경변수를 확인하세요."
        : "서버에서 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-4 sm:px-6 sm:py-6">
      <Dashboard
        meta={meta}
        initialCountry={country}
        initialDate={date}
        initialTenor={initialTenor}
        initialData={initialData}
        initialError={initialError}
      />
    </main>
  );
}
