// What a run does, and what it costs to download, decided before anything loads.

import type { Engine, KvFormat } from "./result";

export type Pack = "quick" | "full";

export interface ModelChoice {
  id: string; // stored in results
  name: string; // shown to people
  note: string;
  // From the model's published config; sets how much memory each token of conversation takes.
  shape: { layers: number; kvHeads: number; headDim: number };
  webllm: { f16: string; f32: string; mb: number };
  // A GGUF for wllama, or null when none fits wllama's 2 GB single-file limit.
  gguf: { url: string; weights: string; mb: number } | null;
}

// Download sizes are the published files on Hugging Face, rounded to whole MB.
export const MODELS: ModelChoice[] = [
  {
    id: "SmolLM2-360M", name: "SmolLM2 360M", note: "The smallest. A result even on older phones.",
    shape: { layers: 32, kvHeads: 5, headDim: 64 },
    webllm: { f16: "SmolLM2-360M-Instruct-q4f16_1-MLC", f32: "SmolLM2-360M-Instruct-q4f32_1-MLC", mb: 207 },
    gguf: { url: "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_0.gguf", weights: "Q4_0", mb: 230 },
  },
  {
    id: "Qwen3-0.6B", name: "Qwen3 0.6B", note: "The default, so most rows compare. Fine on most phones.",
    shape: { layers: 28, kvHeads: 8, headDim: 128 },
    webllm: { f16: "Qwen3-0.6B-q4f16_1-MLC", f32: "Qwen3-0.6B-q4f32_1-MLC", mb: 352 },
    gguf: { url: "https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf", weights: "Q4_0", mb: 429 },
  },
  {
    id: "Llama-3.2-1B", name: "Llama 3.2 1B", note: "Another model family, a size up. Newer phones and laptops.",
    shape: { layers: 16, kvHeads: 8, headDim: 64 },
    webllm: { f16: "Llama-3.2-1B-Instruct-q4f16_1-MLC", f32: "Llama-3.2-1B-Instruct-q4f32_1-MLC", mb: 705 },
    gguf: { url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_0.gguf", weights: "Q4_0", mb: 773 },
  },
  {
    id: "Qwen3-1.7B", name: "Qwen3 1.7B", note: "For laptops. Shows where memory starts to matter.",
    shape: { layers: 28, kvHeads: 8, headDim: 128 },
    webllm: { f16: "Qwen3-1.7B-q4f16_1-MLC", f32: "Qwen3-1.7B-q4f32_1-MLC", mb: 984 },
    gguf: { url: "https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf", weights: "Q4_K_M", mb: 1282 },
  },
  {
    id: "Qwen3-4B", name: "Qwen3 4B", note: "Laptops with plenty of memory. WebLLM only: its llama.cpp file is over wllama's 2 GB limit.",
    shape: { layers: 36, kvHeads: 8, headDim: 128 },
    webllm: { f16: "Qwen3-4B-q4f16_1-MLC", f32: "Qwen3-4B-q4f32_1-MLC", mb: 2279 },
    gguf: null,
  },
];

export const DEFAULT_MODEL = "Qwen3-0.6B";
export const modelById = (id: string) => MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!;

export interface PlannedTest {
  engine: Engine;
  model: string;
  weights: string;
  kv: KvFormat;
  downloadMB: number;
  webllmModelId?: string;
  ggufUrl?: string;
}

export const PROMPT_TOKENS = 512;
export const GEN_TOKENS = 128;
export const CONTEXT_WINDOWS = [4096, 8192, 16384, 32768];

export function planFor(pack: Pack, gpu: { shaderF16: boolean }, modelId = DEFAULT_MODEL): PlannedTest[] {
  const m = modelById(modelId);
  const webllm: PlannedTest = {
    engine: "webllm", model: m.id, kv: "f16", downloadMB: m.webllm.mb,
    weights: gpu.shaderF16 ? "q4f16_1" : "q4f32_1",
    webllmModelId: gpu.shaderF16 ? m.webllm.f16 : m.webllm.f32,
  };
  if (pack === "quick" || !m.gguf) return [webllm];
  const g = m.gguf;
  const wllama = (kv: KvFormat): PlannedTest => ({ engine: "wllama", model: m.id, weights: g.weights, kv, downloadMB: g.mb, ggufUrl: g.url });
  return [webllm, wllama("f16"), wllama("q8_0"), wllama("q4_0")];
}

export function downloadMB(plan: PlannedTest[]): number {
  const seen = new Map<string, number>();
  for (const t of plan) seen.set(`${t.engine}|${t.model}`, t.downloadMB);
  return [...seen.values()].reduce((a, b) => a + b, 0);
}

// Bytes per stored number: f16 is 2; llama.cpp's q8_0 and q4_0 keep 32 numbers in
// 34 and 18 bytes (the values plus one 16-bit scale per block).
const BYTES_PER_NUMBER: Record<"f16" | "q8_0" | "q4_0", number> = { f16: 2, q8_0: 34 / 32, q4_0: 18 / 32 };

export function chatMemoryGB(modelId: string, tokens: number, format: "f16" | "q8_0" | "q4_0"): number {
  const { layers, kvHeads, headDim } = modelById(modelId).shape;
  return (tokens * layers * 2 * kvHeads * headDim * BYTES_PER_NUMBER[format]) / 2 ** 30;
}
