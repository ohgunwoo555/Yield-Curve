"use client";

type Props = {
  value: string;
  min: string | null;
  max: string | null;
  onChange: (date: string) => void;
};

export function DatePicker({ value, min, max, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="base-date" className="text-sm text-neutral-600">
        기준일
      </label>
      <input
        id="base-date"
        type="date"
        value={value}
        min={min ?? undefined}
        max={max ?? undefined}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm tabular-nums focus:border-neutral-500 focus:outline-none"
      />
      {max && value !== max && (
        <button
          type="button"
          onClick={() => onChange(max)}
          className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
        >
          오늘
        </button>
      )}
    </div>
  );
}
