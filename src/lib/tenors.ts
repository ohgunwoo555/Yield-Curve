/** 앱 전체에서 쓰는 표준 만기 키. 배열 순서가 정렬 순서다. */
export const TENORS = [
  "1M",
  "3M",
  "6M",
  "1Y",
  "2Y",
  "3Y",
  "5Y",
  "7Y",
  "10Y",
  "20Y",
  "30Y",
] as const;

export type Tenor = (typeof TENORS)[number];

const TENOR_INDEX: Record<Tenor, number> = Object.fromEntries(
  TENORS.map((t, i) => [t, i]),
) as Record<Tenor, number>;

export function isTenor(value: unknown): value is Tenor {
  return typeof value === "string" && value in TENOR_INDEX;
}

export function tenorIndex(tenor: Tenor): number {
  return TENOR_INDEX[tenor];
}

/** 표준 만기 순서로 정렬한 새 배열을 반환한다. */
export function sortTenors<T extends { tenor: Tenor }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => tenorIndex(a.tenor) - tenorIndex(b.tenor));
}

/** '1M' → '1개월', '10Y' → '10년' */
export function tenorLabelKo(tenor: Tenor): string {
  const n = tenor.slice(0, -1);
  return tenor.endsWith("M") ? `${n}개월` : `${n}년`;
}
