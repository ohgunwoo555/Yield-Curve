import { SourceError } from "./types";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type FetchJsonOptions = {
  sourceName: string;
  series?: string;
  /** 재시도 횟수 (기본 3회) */
  retries?: number;
  /** 첫 백오프 대기(ms). 이후 2배씩 늘어난다. */
  baseDelayMs?: number;
  fetchImpl?: typeof fetch;
  /** 테스트에서 대기 시간을 없애기 위한 훅 */
  sleepImpl?: (ms: number) => Promise<void>;
};

/**
 * JSON을 가져온다. 네트워크 오류·5xx·429는 지수 백오프로 재시도하고,
 * 그 외 4xx는 즉시 실패한다. 응답 파싱은 호출자가 zod로 한다.
 */
export async function fetchJsonWithRetry(
  url: string,
  opts: FetchJsonOptions,
): Promise<unknown> {
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 500;
  const doFetch = opts.fetchImpl ?? fetch;
  const doSleep = opts.sleepImpl ?? sleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await doFetch(url, { headers: { accept: "application/json" } });
      if (res.ok) {
        return (await res.json()) as unknown;
      }
      const retryable = res.status === 429 || res.status >= 500;
      const body = await safeText(res);
      const err = new SourceError(
        opts.sourceName,
        `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        { series: opts.series },
      );
      if (!retryable) throw err;
      lastError = err;
    } catch (err) {
      if (err instanceof SourceError && !isRetryable(err)) throw err;
      lastError = err;
    }
    if (attempt < retries) {
      await doSleep(baseDelay * 2 ** attempt);
    }
  }
  throw new SourceError(
    opts.sourceName,
    `${retries + 1}회 시도 후 실패: ${describe(lastError)}`,
    { series: opts.series, cause: lastError },
  );
}

function isRetryable(err: SourceError): boolean {
  return /HTTP (429|5\d\d)/.test(err.message);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
