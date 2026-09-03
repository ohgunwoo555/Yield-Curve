import { describe, expect, it, vi } from "vitest";
import { fetchJsonWithRetry } from "@/lib/sources/http";
import { SourceError } from "@/lib/sources/types";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchJsonWithRetry", () => {
  const noSleep = async () => {};

  it("성공하면 JSON을 반환한다", async () => {
    const fetchImpl = vi.fn(async () => response(200, { ok: true }));
    const json = await fetchJsonWithRetry("https://x", {
      sourceName: "T",
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(json).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("5xx는 지수 백오프로 재시도한다", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(503, "down"))
      .mockResolvedValueOnce(response(500, "down"))
      .mockResolvedValueOnce(response(200, { ok: 1 }));
    const sleeps: number[] = [];
    const json = await fetchJsonWithRetry("https://x", {
      sourceName: "T",
      series: "S1",
      fetchImpl,
      baseDelayMs: 100,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(json).toEqual({ ok: 1 });
    expect(sleeps).toEqual([100, 200]);
  });

  it("네트워크 오류도 재시도하고, 3회 재시도 후 SourceError를 던진다", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    await expect(
      fetchJsonWithRetry("https://x", {
        sourceName: "T",
        series: "S1",
        fetchImpl,
        sleepImpl: noSleep,
      }),
    ).rejects.toMatchObject({
      name: "SourceError",
      sourceName: "T",
      series: "S1",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("4xx(429 제외)는 재시도하지 않는다", async () => {
    const fetchImpl = vi.fn(async () => response(400, { error: "bad" }));
    await expect(
      fetchJsonWithRetry("https://x", { sourceName: "T", fetchImpl, sleepImpl: noSleep }),
    ).rejects.toBeInstanceOf(SourceError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
