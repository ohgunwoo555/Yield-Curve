"use client";

import type { CountryMeta } from "@/lib/db/queries";

type Props = {
  countries: CountryMeta[];
  selected: string;
  onSelect: (code: string) => void;
};

export function CountryTabs({ countries, selected, onSelect }: Props) {
  return (
    <div role="tablist" aria-label="국가 선택" className="flex gap-1 rounded-lg bg-neutral-100 p-1">
      {countries.map((c) => {
        const active = c.code === selected;
        return (
          <button
            key={c.code}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onSelect(c.code)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {c.nameKo}
          </button>
        );
      })}
    </div>
  );
}
