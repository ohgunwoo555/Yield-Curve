/** 수익률(%) 표시: 소수점 3자리 */
export function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return value.toFixed(3);
}

/** bp 등락: 부호 명시, 소수점 1자리. null은 '-'. */
export function formatBp(bp: number | null): string {
  if (bp === null) return "-";
  if (bp === 0) return "0.0";
  const sign = bp > 0 ? "+" : "−"; // U+2212 minus
  return `${sign}${Math.abs(bp).toFixed(1)}`;
}

/** 상승 빨강·하락 파랑(국내 관행), 0은 회색 */
export function bpColorClass(bp: number | null): string {
  if (bp === null) return "text-neutral-400";
  if (bp > 0) return "text-red-600";
  if (bp < 0) return "text-blue-600";
  return "text-neutral-500";
}

/** 'YYYY-MM-DD' → 'MM-DD' (모바일 좁은 헤더용) */
export function shortDate(date: string | null): string {
  return date ? date.slice(5) : "-";
}

/** ISO 시각 → 'YYYY-MM-DD HH:mm' (KST) */
export function formatKstDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
