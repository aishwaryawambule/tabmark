import { describe, expect, it } from "vitest";
import { downloadMB, planFor } from "../src/core/plan";

describe("planFor", () => {
  it("quick is one WebLLM test with f16 weights when the GPU supports f16 shaders", () => {
    const p = planFor("quick", { shaderF16: true });
    expect(p.map((t) => `${t.engine}/${t.kv}`)).toEqual(["webllm/f16"]);
    expect(p[0].webllmModelId).toBe("Qwen3-0.6B-q4f16_1-MLC");
  });
  it("falls back to f32 activations on GPUs without shader-f16", () => {
    expect(planFor("quick", { shaderF16: false })[0].webllmModelId).toBe("Qwen3-0.6B-q4f32_1-MLC");
  });
  it("full adds wllama with three memory formats, same model", () => {
    const p = planFor("full", { shaderF16: true });
    expect(p.map((t) => `${t.engine}/${t.kv}`)).toEqual(["webllm/f16", "wllama/f16", "wllama/q8_0", "wllama/q4_0"]);
    expect(new Set(p.map((t) => t.model))).toEqual(new Set(["Qwen3-0.6B"]));
  });
});

describe("downloadMB", () => {
  it("counts each engine's weights once, however many tests use them", () => {
    expect(downloadMB(planFor("quick", { shaderF16: true }))).toBe(352);
    expect(downloadMB(planFor("full", { shaderF16: true }))).toBe(352 + 429);
  });
});
