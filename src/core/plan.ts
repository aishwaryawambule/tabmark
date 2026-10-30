// What a run does, and what it costs to download, decided before anything loads.

import type { Engine, KvFormat } from "./result";

export type Pack = "quick" | "full";

export interface PlannedTest {
  engine: Engine;
  model: string;
  weights: string;
  kv: KvFormat;
  webllmModelId?: string;
  ggufUrl?: string;
}

export const MODEL = "Qwen3-0.6B";
export const GGUF_URL = "https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf";
// Measured from the published files (Hugging Face), rounded to whole MB.
const DOWNLOAD_MB: Record<Engine, number> = { webllm: 352, wllama: 429 };

export const PROMPT_TOKENS = 512;
export const GEN_TOKENS = 128;
export const CONTEXT_WINDOWS = [4096, 8192, 16384, 32768];

export function planFor(pack: Pack, gpu: { shaderF16: boolean }): PlannedTest[] {
  const webllm: PlannedTest = {
    engine: "webllm",
    model: MODEL,
    weights: gpu.shaderF16 ? "q4f16_1" : "q4f32_1",
    kv: "f16",
    webllmModelId: gpu.shaderF16 ? "Qwen3-0.6B-q4f16_1-MLC" : "Qwen3-0.6B-q4f32_1-MLC",
  };
  if (pack === "quick") return [webllm];
  const wllama = (kv: KvFormat): PlannedTest => ({ engine: "wllama", model: MODEL, weights: "Q4_0", kv, ggufUrl: GGUF_URL });
  return [webllm, wllama("f16"), wllama("q8_0"), wllama("q4_0")];
}

export function downloadMB(plan: PlannedTest[]): number {
  return [...new Set(plan.map((t) => t.engine))].reduce((sum, e) => sum + DOWNLOAD_MB[e], 0);
}
