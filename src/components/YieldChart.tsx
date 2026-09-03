"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryPoint } from "@/lib/db/queries";

type Props = {
  data: HistoryPoint[];
  /** 기준일 (차트에 점으로 표시) */
  markDate: string | null;
};

const SERIES_COLOR = "#2563eb"; // blue-600
const GRID_COLOR = "#e5e7eb"; // neutral-200
const TEXT_COLOR = "#6b7280"; // neutral-500

/** 값 범위를 0.05 단위의 깔끔한 눈금으로 감싼다. */
function niceDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 0.1;
    max += 0.1;
  }
  const pad = (max - min) * 0.08;
  const step = niceStep((max - min + pad * 2) / 4);
  return [Math.floor((min - pad) / step) * step, Math.ceil((max + pad) / step) * step];
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * pow;
}

function formatTick(date: string, span: number): string {
  // 3개월 이하는 MM-DD, 그 이상은 YYYY-MM
  return span <= 100 ? date.slice(5) : date.slice(0, 7);
}

export function YieldChart({ data, markDate }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-neutral-500">
        표시할 데이터가 없습니다.
      </div>
    );
  }
  const domain = niceDomain(data.map((d) => d.value));
  const mark = markDate ? data.find((d) => d.date === markDate) : undefined;
  const span = data.length;

  return (
    <div className="h-64 w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={GRID_COLOR} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatTick(v, span)}
            tick={{ fill: TEXT_COLOR, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID_COLOR }}
            minTickGap={32}
          />
          <YAxis
            domain={domain}
            tickCount={5}
            tickFormatter={(v: number) => v.toFixed(2)}
            tick={{ fill: TEXT_COLOR, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: TEXT_COLOR, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as HistoryPoint | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded border border-neutral-200 bg-white px-2 py-1 shadow-sm">
                  <div className="text-neutral-500">{p.date}</div>
                  <div className="font-semibold tabular-nums text-neutral-900">
                    {p.value.toFixed(3)}%
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="linear"
            dataKey="value"
            stroke={SERIES_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4, fill: SERIES_COLOR, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {mark && (
            <>
              <ReferenceLine x={mark.date} stroke={TEXT_COLOR} strokeWidth={1} />
              <ReferenceDot
                x={mark.date}
                y={mark.value}
                r={5}
                fill={SERIES_COLOR}
                stroke="#fff"
                strokeWidth={2}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
