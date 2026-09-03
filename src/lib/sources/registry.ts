import { createFredSource } from "./fred";
import type { YieldSource } from "./types";

/**
 * 등록된 YieldSource 목록.
 * 새 국가 추가 = 구현체를 만들고 이 목록에 팩토리 추가 + countries 시드 추가.
 * API 키는 팩토리 호출 시점에 env에서 읽으므로 모듈 로드 시 부작용이 없다.
 */
type SourceFactory = { countryCode: string; create: () => YieldSource };

const factories: SourceFactory[] = [
  { countryCode: "US", create: () => createFredSource(requireEnv("FRED_API_KEY")) },
];

export function getSources(): YieldSource[] {
  return factories.map((f) => f.create());
}

export function getSource(countryCode: string): YieldSource | undefined {
  const f = factories.find((x) => x.countryCode === countryCode);
  return f?.create();
}

export function getRegisteredCountryCodes(): string[] {
  return factories.map((f) => f.countryCode);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  return v;
}
