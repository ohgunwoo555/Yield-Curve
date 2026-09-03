"use client";

import type { ChangeKey, ChangesResult } from "@/lib/changes";
import { bpColorClass, formatBp, formatPercent, shortDate } from "@/lib/format";
import type { Tenor } from "@/lib/tenors";

const CHANGE_COLUMNS: { key: ChangeKey; label: string }[] = [
  { key: "d1", label: "전일비" },
  { key: "w1", label: "전주비" },
  { key: "m1", label: "전월비" },
  { key: "y1", label: "전년비" },
];

type Props = {
  data: ChangesResult;
  selectedTenor: Tenor | null;
  onSelectTenor: (tenor: Tenor) => void;
};

export function YieldTable({ data, selectedTenor, onSelectTenor }: Props) {
  return (
    <table className="w-full table-fixed border-collapse text-xs sm:text-sm">
      <colgroup>
        <col className="w-[13%]" />
        <col className="w-[19%]" />
        <col className="w-[17%]" />
        <col className="w-[17%]" />
        <col className="w-[17%]" />
        <col className="w-[17%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-neutral-200 text-neutral-500">
          <th scope="col" className="py-2 pl-2 text-left font-medium">
            만기
          </th>
          <th scope="col" className="py-2 pr-2 text-right font-medium">
            <div>수익률</div>
            <div className="text-[10px] font-normal text-neutral-400">(%)</div>
          </th>
          {CHANGE_COLUMNS.map((c) => (
            <th key={c.key} scope="col" className="py-2 pr-2 text-right font-medium">
              <div>{c.label}</div>
              <div
                className="text-[10px] font-normal tabular-nums text-neutral-400"
                title={data.compareDates[c.key] ?? "비교 대상 없음"}
              >
                <span className="sm:hidden">{shortDate(data.compareDates[c.key])}</span>
                <span className="hidden sm:inline">{data.compareDates[c.key] ?? "-"}</span>
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {data.rows.map((row) => {
          const available = row.value !== null;
          const selected = row.tenor === selectedTenor;
          return (
            <tr
              key={row.tenor}
              onClick={available ? () => onSelectTenor(row.tenor) : undefined}
              aria-selected={selected}
              className={`border-b border-neutral-100 ${
                available ? "cursor-pointer hover:bg-neutral-50" : "text-neutral-300"
              } ${selected ? "bg-blue-50/70" : ""}`}
            >
              <th scope="row" className="py-2 pl-2 text-left font-medium">
                {row.tenor}
              </th>
              <td className="py-2 pr-2 text-right font-semibold">
                {formatPercent(row.value)}
              </td>
              {CHANGE_COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={`py-2 pr-2 text-right ${bpColorClass(row.changes[c.key])}`}
                >
                  {formatBp(row.changes[c.key])}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
