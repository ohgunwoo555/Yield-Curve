"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangesResult } from "@/lib/changes";
import { formatKoWithWeekday } from "@/lib/dates";
import type { CountryMeta } from "@/lib/db/queries";
import { formatKstDateTime } from "@/lib/format";
import type { Meta } from "@/lib/meta";
import { isTenor, type Tenor } from "@/lib/tenors";
import { CountryTabs } from "./CountryTabs";
import { DatePicker } from "./DatePicker";
import { TenorDrawer } from "./TenorDrawer";
import { YieldTable } from "./YieldTable";

export type DashboardProps = {
  meta: Meta;
  initialCountry: string;
  initialDate: string;
  /** 오늘(KST). 기준일 선택 상한. */
  today: string;
  initialTenor: Tenor | null;
  initialData: ChangesResult | null;
  initialError: string | null;
};

type Status = "idle" | "loading" | "error" | "empty";

function clampDate(date: string, today: string, c: CountryMeta | undefined): string {
  if (date > today) return today;
  if (c?.firstDate && date < c.firstDate) return c.firstDate;
  return date;
}

export function Dashboard(props: DashboardProps) {
  const { meta, today } = props;
  const [country, setCountry] = useState(props.initialCountry);
  const [date, setDate] = useState(props.initialDate);
  const [tenor, setTenor] = useState<Tenor | null>(props.initialTenor);
  const [data, setData] = useState<ChangesResult | null>(props.initialData);
  const [status, setStatus] = useState<Status>(
    props.initialError ? "error" : props.initialData ? "idle" : "empty",
  );
  const [error, setError] = useState<string | null>(props.initialError);
  const abortRef = useRef<AbortController | null>(null);
  const firstRender = useRef(true);

  const countryMeta = meta.countries.find((c) => c.code === country);

  // URL 쿼리 동기화 (country, date, tenor) — 링크 공유용
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("country", country);
    params.set("date", date);
    if (tenor) params.set("tenor", tenor);
    const url = `${window.location.pathname}?${params.toString()}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState(null, "", url);
    }
  }, [country, date, tenor]);

  // country/date 변경 시 API 재조회 (첫 렌더는 서버 데이터 사용)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus("loading");
    setError(null);

    const params = new URLSearchParams({ country, date });
    fetch(`/api/yields?${params.toString()}`, { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json()) as ChangesResult | { error: string };
        if (!res.ok || "error" in body) {
          const msg = "error" in body ? body.error : `요청 실패 (${res.status})`;
          if (res.status === 404) {
            setData(null);
            setStatus("empty");
            setError(msg);
          } else {
            setStatus("error");
            setError(msg);
          }
          return;
        }
        setData(body);
        setStatus("idle");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
        setError("데이터를 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.");
      });
    return () => ac.abort();
  }, [country, date]);

  const handleCountry = useCallback(
    (code: string) => {
      if (code === country) return;
      const next = meta.countries.find((c) => c.code === code);
      setCountry(code);
      setDate((d) => clampDate(d, today, next));
      // 새 국가가 제공하지 않는 만기면 선택 해제
      setTenor((t) => (t && next?.tenors.includes(t) ? t : null));
    },
    [country, meta.countries, today],
  );

  const handleDate = useCallback(
    (d: string) => setDate(clampDate(d, today, countryMeta)),
    [countryMeta, today],
  );

  const handleTenor = useCallback((t: Tenor) => {
    if (!isTenor(t)) return;
    setTenor((prev) => (prev === t ? null : t));
  }, []);
  const closeDrawer = useCallback(() => setTenor(null), []);

  const selectedRow = tenor && data ? data.rows.find((r) => r.tenor === tenor) : undefined;

  const adjusted = data && data.effectiveDate !== data.requestedDate;
  const sourceLabel = meta.sources
    .map((s) => (s.sourceName === "ECOS" ? "한국은행 ECOS" : s.sourceName))
    .join(", ");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">국채 수익률</h1>
          <CountryTabs countries={meta.countries} selected={country} onSelect={handleCountry} />
        </div>
        <DatePicker
          value={date}
          min={countryMeta?.firstDate ?? null}
          max={today}
          onChange={handleDate}
        />
      </header>

      <section className="mt-3 flex-1" aria-live="polite">
        {countryMeta && (
          <p className="mb-2 text-xs text-neutral-500">
            {countryMeta.nameKo} · 최근 데이터: {countryMeta.latestDate ?? "-"}
            {adjusted && data && (
              <span className="mt-1 block w-fit rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 sm:ml-2 sm:mt-0 sm:inline">
                기준일 <span className="whitespace-nowrap">{formatKoWithWeekday(data.requestedDate)}</span> →{" "}
                <span className="whitespace-nowrap">{formatKoWithWeekday(data.effectiveDate)}</span> 데이터 표시
              </span>
            )}
          </p>
        )}

        {status === "loading" && <TableSkeleton />}
        {status === "error" && (
          <StateMessage tone="error" title="데이터를 불러오지 못했습니다" detail={error} />
        )}
        {status === "empty" && (
          <StateMessage
            tone="muted"
            title="표시할 데이터가 없습니다"
            detail={error ?? "선택한 기준일 이전의 데이터가 없습니다. 다른 날짜를 선택해 주세요."}
          />
        )}
        {status === "idle" && data && (
          <YieldTable data={data} selectedTenor={tenor} onSelectTenor={handleTenor} />
        )}
      </section>

      {tenor && data && countryMeta && selectedRow && selectedRow.value !== null && (
        <TenorDrawer
          countryCode={country}
          countryName={countryMeta.nameKo}
          tenor={tenor}
          effectiveDate={data.effectiveDate}
          latestDate={countryMeta.latestDate}
          value={selectedRow.value}
          onClose={closeDrawer}
        />
      )}

      <footer className="mt-6 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        데이터: {sourceLabel} · 최근 적재 {formatKstDateTime(meta.lastIngestedAt)}
      </footer>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div role="status" aria-label="불러오는 중" className="animate-pulse space-y-2 pt-2">
      {Array.from({ length: 11 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-5 w-[13%] rounded bg-neutral-100" />
          <div className="h-5 w-[19%] rounded bg-neutral-100" />
          <div className="h-5 w-[17%] rounded bg-neutral-100" />
          <div className="h-5 w-[17%] rounded bg-neutral-100" />
          <div className="h-5 w-[17%] rounded bg-neutral-100" />
          <div className="h-5 w-[17%] rounded bg-neutral-100" />
        </div>
      ))}
      <span className="sr-only">불러오는 중…</span>
    </div>
  );
}

function StateMessage({
  tone,
  title,
  detail,
}: {
  tone: "error" | "muted";
  title: string;
  detail: string | null;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-6 text-center text-sm ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-neutral-200 bg-neutral-50 text-neutral-600"
      }`}
    >
      <p className="font-medium">{title}</p>
      {detail && <p className="mt-1 text-xs opacity-80">{detail}</p>}
    </div>
  );
}
