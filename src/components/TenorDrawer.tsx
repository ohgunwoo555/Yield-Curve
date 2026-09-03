"use client";

import { useEffect, useState } from "react";
import { subMonthsIso, subYearsIso } from "@/lib/dates";
import type { HistoryPoint } from "@/lib/db/queries";
import { formatPercent } from "@/lib/format";
import { tenorLabelKo, type Tenor } from "@/lib/tenors";
import { YieldChart } from "./YieldChart";

export type ChartRange = "3M" | "1Y" | "3Y";
const RANGES: { key: ChartRange; label: string }[] = [
  { key: "3M", label: "3개월" },
  { key: "1Y", label: "1년" },
  { key: "3Y", label: "3년" },
];

type Props = {
  countryCode: string;
  countryName: string;
  tenor: Tenor;
  /** 기준 영업일 (차트에 표시) */
  effectiveDate: string;
  /** 해당국 최신 데이터 날짜 (차트 범위의 끝) */
  latestDate: string | null;
  value: number | null;
  onClose: () => void;
};

function rangeStart(to: string, range: ChartRange): string {
  switch (range) {
    case "3M":
      return subMonthsIso(to, 3);
    case "1Y":
      return subYearsIso(to, 1);
    case "3Y":
      return subYearsIso(to, 3);
  }
}

export function TenorDrawer(props: Props) {
  const { countryCode, countryName, tenor, effectiveDate, latestDate, value, onClose } = props;
  const [range, setRange] = useState<ChartRange>("1Y");
  type Result = { key: string; points?: HistoryPoint[]; error?: string };
  const [result, setResult] = useState<Result | null>(null);

  const to = latestDate ?? effectiveDate;
  let from = rangeStart(to, range);
  if (effectiveDate < from) from = effectiveDate; // 기준일이 항상 차트 안에 들어오게
  const key = `${countryCode}|${tenor}|${from}|${to}`;

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams({ country: countryCode, tenor, from, to });
    fetch(`/api/yields/history?${params.toString()}`, { signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json()) as HistoryPoint[] | { error: string };
        if (!res.ok || !Array.isArray(body)) {
          setResult({ key, error: "error" in body ? body.error : `요청 실패 (${res.status})` });
          return;
        }
        setResult({ key, points: body });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({ key, error: "차트 데이터를 불러오지 못했습니다." });
      });
    return () => ac.abort();
  }, [key, countryCode, tenor, from, to]);

  // 현재 조건과 다른 결과는 로딩 상태로 취급한다.
  const current = result?.key === key ? result : null;
  const points = current?.points ?? null;
  const error = current?.error ?? null;

  return (
    <>
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/30 md:bg-black/10"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-xl md:inset-y-0 md:left-auto md:right-0 md:w-[440px] md:max-h-none md:rounded-none md:border-l md:border-neutral-200"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-300 md:hidden" />
        <header className="flex items-start justify-between px-5 pb-3 pt-3 md:pt-5">
          <div>
            <h2 id="drawer-title" className="text-base font-semibold">
              {countryName} 국채 {tenorLabelKo(tenor)}
              <span className="ml-1.5 text-sm font-normal text-neutral-500">{tenor}</span>
            </h2>
            <p className="mt-0.5 text-sm text-neutral-600">
              {effectiveDate} 기준{" "}
              <span className="font-semibold tabular-nums text-neutral-900">
                {formatPercent(value)}%
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 -mt-1 rounded p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-neutral-500">기간</span>
            <div role="radiogroup" aria-label="차트 기간" className="flex gap-1 rounded-md bg-neutral-100 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={range === r.key}
                  onClick={() => setRange(r.key)}
                  className={`rounded px-2 py-0.5 text-xs ${
                    range === r.key ? "bg-white font-medium shadow-sm" : "text-neutral-500"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="flex h-64 items-center justify-center rounded border border-red-200 bg-red-50 text-sm text-red-700">
              {error}
            </div>
          ) : points === null ? (
            <div role="status" aria-label="차트 불러오는 중" className="h-64 animate-pulse rounded bg-neutral-100" />
          ) : (
            <YieldChart data={points} markDate={effectiveDate} />
          )}

          <section className="mt-6 border-t border-neutral-200 pt-4">
            <h3 className="text-sm font-semibold text-neutral-800">수요 지표</h3>
            <p className="mt-1 rounded-md border border-dashed border-neutral-300 px-3 py-4 text-center text-xs text-neutral-500">
              2단계에서 제공 예정
            </p>
          </section>
        </div>
      </aside>
    </>
  );
}
