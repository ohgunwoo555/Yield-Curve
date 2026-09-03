import type { YieldSource } from "./types";

/**
 * 등록된 YieldSource 목록.
 * 새 국가 추가 = 구현체를 만들고 여기에 등록 + countries 시드 추가.
 * API 키는 호출 시점에 env에서 읽으므로 모듈 로드 시 부작용이 없다.
 */
type SourceFactory = () => YieldSource;

const factories: SourceFactory[] = [];

export function registerSource(factory: SourceFactory): void {
  factories.push(factory);
}

export function getSources(): YieldSource[] {
  return factories.map((f) => f());
}

export function getSource(countryCode: string): YieldSource | undefined {
  return getSources().find((s) => s.countryCode === countryCode);
}

export function getRegisteredCountryCodes(): string[] {
  return getSources().map((s) => s.countryCode);
}
