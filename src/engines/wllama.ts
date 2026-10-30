import { Wllama } from "@wllama/wllama";
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import { GEN_TOKENS, type PlannedTest } from "../core/plan";
import type { TestResult } from "../core/result";
import { tokensPerSecond } from "../core/stats";
import { PROMPT } from "./prompt";
import { failure, type Hooks } from "./types";

export const WLLAMA_VERSION = __WLLAMA_VERSION__;

export async function runWllama(test: PlannedTest, hooks: Hooks): Promise<TestResult> {
  const w = new Wllama({ default: wasmUrl }, { suppressNativeLog: true });
  try {
    const t0 = performance.now();
    await w.loadModelFromUrl(test.ggufUrl!, {
      n_ctx: 2048,
      cache_type_k: test.kv as "f16" | "q8_0" | "q4_0",
      cache_type_v: test.kv as "f16" | "q8_0" | "q4_0",
      flash_attn: true, // llama.cpp needs flash attention for a quantized V cache
      n_gpu_layers: 999,
      n_parallel: 1,
      progressCallback: ({ loaded, total }) => hooks.status(`Downloading ${mb(loaded)} of ${mb(total)}`, total ? loaded / total : undefined),
    });
    const loadMs = Math.round(performance.now() - t0);
    // Untimed warm-up, as for WebLLM: the first request pays one-off GPU setup.
    hooks.status("Warming up");
    await w.createChatCompletion({ messages: [{ role: "user", content: "Hi" }], max_tokens: 4, temperature: 0, cache_prompt: false });
    hooks.status("Running");
    const stream = await w.createChatCompletion({
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: GEN_TOKENS,
      temperature: 0,
      stream: true,
      cache_prompt: false,
    });
    const arrivals: number[] = [];
    let timings: { prompt_n?: number; prompt_per_second?: number; predicted_n?: number; predicted_per_second?: number } | undefined;
    for await (const chunk of stream) {
      if (chunk.choices?.[0]?.delta) {
        const now = performance.now();
        arrivals.push(now);
        hooks.token(now);
      }
      if (chunk.timings) timings = chunk.timings;
    }
    const genTokens = timings?.predicted_n ?? arrivals.length;
    const decodeTps = timings?.predicted_per_second
      ?? tokensPerSecond(arrivals.length - 1, arrivals[arrivals.length - 1] - arrivals[0]);
    if (!decodeTps || !genTokens) throw new Error("wllama returned no tokens");
    return {
      engine: "wllama", engineVersion: WLLAMA_VERSION, model: test.model, weights: test.weights, kv: test.kv, status: "ok",
      promptTokens: timings?.prompt_n ?? undefined, genTokens,
      prefillTps: timings?.prompt_per_second ? round(timings.prompt_per_second) : undefined,
      decodeTps: round(decodeTps), loadMs,
    };
  } catch (e) {
    return failure(test, WLLAMA_VERSION, e);
  } finally {
    await w.exit().catch(() => {});
  }
}

const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
const round = (x: number) => Math.round(x * 100) / 100;
