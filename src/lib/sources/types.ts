import type { Tenor } from "@/lib/tenors";

export type YieldPoint = {
  countryCode: string;
  tenor: Tenor;
  date: string; // 'YYYY-MM-DD'
  value: number; // %
  source: string;
};

export interface YieldSource {
  readonly countryCode: string;
  readonly sourceName: string;
  /** 이 소스가 제공하는 만기 */
  readonly tenors: readonly Tenor[];
  /** [from, to] 구간(양 끝 포함)의 모든 만기 데이터를 가져온다. 결측값은 포함하지 않는다. */
  fetchRange(from: string, to: string): Promise<YieldPoint[]>;
}

/** 어떤 소스의 어떤 시리즈/항목에서 실패했는지 담는 에러 */
export class SourceError extends Error {
  readonly sourceName: string;
  readonly series: string | undefined;

  constructor(
    sourceName: string,
    message: string,
    options?: { series?: string; cause?: unknown },
  ) {
    super(`[${sourceName}${options?.series ? `:${options.series}` : ""}] ${message}`, {
      cause: options?.cause,
    });
    this.name = "SourceError";
    this.sourceName = sourceName;
    this.series = options?.series;
  }
}
