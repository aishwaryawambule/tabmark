import * as webllm from "@mlc-ai/web-llm";
import { GEN_TOKENS, type PlannedTest } from "../core/plan";
import type { ContextResult, TestResult } from "../core/result";
import { PROMPT } from "./prompt";
import { failure, type Hooks } from "./types";

export const WEBLLM_VERSION = __WEBLLM_VERSION__;

const load = (test: PlannedTest, hooks: Hooks, contextWindow?: number) =>
  webllm.CreateMLCEngine(
    test.webllmModelId!,
    { initProgressCallback: (p) => hooks.status(p.text, p.progress) },
    contextWindow ? { context_window_size: contextWindow } : undefined,
  );

export async function runWebllm(test: PlannedTest, hooks: Hooks): Promise<TestResult> {
  let engine: webllm.MLCEngineInterface | undefined;
  try {
    const t0 = performance.now();
    engine = await load(test, hooks);
    const loadMs = Math.round(performance.now() - t0);
    // Untimed warm-up: the first request also compiles the GPU shaders, which would
    // make reading speed look several times slower than it is.
    hooks.status("Warming up");
    await engine.chat.completions.create({ messages: [{ role: "user", content: "Hi" }], max_tokens: 4, temperature: 0 });
    await engine.resetChat();
    hooks.status("Running");
    const stream = await engine.chat.completions.create({
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: GEN_TOKENS,
      temperature: 0,
      ignore_eos: true, // always write GEN_TOKENS, so every device does the same work
      stream: true,
      stream_options: { include_usage: true },
    });
    let usage: webllm.CompletionUsage | undefined;
    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta) hooks.token(performance.now());
      if (chunk.usage) usage = chunk.usage;
    }
    if (!usage?.extra) throw new Error("WebLLM returned no timings");
    return {
      engine: "webllm", engineVersion: WEBLLM_VERSION, model: test.model, weights: test.weights, kv: test.kv, status: "ok",
      promptTokens: usage.prompt_tokens, genTokens: usage.completion_tokens,
      prefillTps: round(usage.extra.prefill_tokens_per_s), decodeTps: round(usage.extra.decode_tokens_per_s), loadMs,
    };
  } catch (e) {
    return failure(test, WEBLLM_VERSION, e);
  } finally {
    await engine?.unload().catch(() => {});
  }
}

// MLC reserves the KV cache for the whole context window when the model loads, so a
// window that loads is a window that fits. Stops at the first one that does not.
export async function probeContext(test: PlannedTest, windows: number[], hooks: Hooks): Promise<ContextResult> {
  let largestOk: number | null = null;
  let firstFailed: number | null = null;
  for (const w of windows) {
    hooks.status(`Loading with room for ${w.toLocaleString("en-US")} tokens`);
    let engine: webllm.MLCEngineInterface | undefined;
    try {
      engine = await load(test, hooks, w);
      largestOk = w;
    } catch {
      firstFailed = w;
      break;
    } finally {
      await engine?.unload().catch(() => {});
    }
  }
  return { engine: "webllm", model: test.model, largestOk, firstFailed };
}

const round = (x: number) => Math.round(x * 100) / 100;
