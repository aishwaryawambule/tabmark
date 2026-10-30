import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, MODELS, downloadMB, modelById, planFor } from "../src/core/plan";

const f16 = { shaderF16: true };

describe("model list", () => {
  it("has five models, smallest first, with Qwen3 0.6B the default", () => {
    expect(MODELS.map((m) => m.id)).toEqual(["SmolLM2-360M", "Qwen3-0.6B", "Llama-3.2-1B", "Qwen3-1.7B", "Qwen3-4B"]);
    expect(DEFAULT_MODEL).toBe("Qwen3-0.6B");
    const sizes = MODELS.map((m) => m.webllm.mb);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });
  it("every GGUF a model offers is under wllama's 2 GB single-file limit", () => {
    for (const m of MODELS) if (m.gguf) expect(m.gguf.mb).toBeLessThan(2000);
  });
  it("unknown ids fall back to the default model", () => {
    expect(modelById("nope").id).toBe(DEFAULT_MODEL);
  });
});

describe("planFor", () => {
  it("quick is one WebLLM test with f16 weights when the GPU supports f16 shaders", () => {
    const p = planFor("quick", f16);
    expect(p.map((t) => `${t.engine}/${t.kv}`)).toEqual(["webllm/f16"]);
    expect(p[0].webllmModelId).toBe("Qwen3-0.6B-q4f16_1-MLC");
  });
  it("falls back to f32 activations on GPUs without shader-f16", () => {
    expect(planFor("quick", { shaderF16: false })[0].webllmModelId).toBe("Qwen3-0.6B-q4f32_1-MLC");
    expect(planFor("quick", { shaderF16: false }, "Llama-3.2-1B")[0].webllmModelId).toBe("Llama-3.2-1B-Instruct-q4f32_1-MLC");
  });
  it("full adds wllama with three memory formats, same model", () => {
    const p = planFor("full", f16, "Llama-3.2-1B");
    expect(p.map((t) => `${t.engine}/${t.kv}`)).toEqual(["webllm/f16", "wllama/f16", "wllama/q8_0", "wllama/q4_0"]);
    expect(new Set(p.map((t) => t.model))).toEqual(new Set(["Llama-3.2-1B"]));
    expect(p[1].ggufUrl).toContain("Llama-3.2-1B-Instruct-Q4_0.gguf");
  });
  it("a model with no wllama file runs WebLLM only, even in the full test", () => {
    expect(planFor("full", f16, "Qwen3-4B").map((t) => t.engine)).toEqual(["webllm"]);
  });
});

describe("downloadMB", () => {
  it("counts each engine's weights once, however many tests use them", () => {
    expect(downloadMB(planFor("quick", f16))).toBe(352);
    expect(downloadMB(planFor("full", f16))).toBe(352 + 429);
    expect(downloadMB(planFor("full", f16, "SmolLM2-360M"))).toBe(207 + 230);
  });
});

import { chatMemoryGB } from "../src/core/plan";

describe("chatMemoryGB", () => {
  it("is layers x 2 x kv heads x head size x bytes per number, for the conversation length", () => {
    // Qwen3-0.6B: 28 layers, 8 KV heads of 128 -> 112 KB a token at 16-bit
    expect(chatMemoryGB("Qwen3-0.6B", 32768, "f16")).toBeCloseTo(3.5, 2);
    // llama.cpp blocks: q8_0 is 34 bytes per 32 numbers, q4_0 is 18
    expect(chatMemoryGB("Qwen3-0.6B", 32768, "q8_0")).toBeCloseTo(3.5 * 34 / 64, 3);
    expect(chatMemoryGB("Qwen3-0.6B", 32768, "q4_0")).toBeCloseTo(3.5 * 18 / 64, 3);
  });
  it("a bigger model can need less memory per token", () => {
    expect(chatMemoryGB("Llama-3.2-1B", 32768, "f16")).toBeCloseTo(1.0, 2);
    expect(chatMemoryGB("Llama-3.2-1B", 32768, "f16")).toBeLessThan(chatMemoryGB("Qwen3-0.6B", 32768, "f16"));
  });
});
