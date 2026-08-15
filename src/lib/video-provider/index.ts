import type { VideoGenerationProvider } from "./types";
import { mockProvider } from "./mock-provider";
import { dreaminaProvider } from "./dreamina-provider";

export function getVideoProvider(): VideoGenerationProvider {
  const useMock = process.env.DREAMINA_MOCK_MODE === "1" || !process.env.DREAMINA_API_KEY;
  return useMock ? mockProvider : dreaminaProvider;
}

export * from "./types";
