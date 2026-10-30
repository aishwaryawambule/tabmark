import { describe, expect, it } from "vitest";
import { tableRows } from "../src/core/aggregate";

const dev = (model: string, browserVersion = "148") => ({ kind: "computer", os: "macOS", osVersion: "26", browser: "Chrome", browserVersion, model,
  gpuVendor: "apple", gpuArchitecture: "metal-3", gpuDescription: "", cores: 14, memoryGB: 8 });
const res = (id: string, model: string, decode: number, extra: any = {}) => ({
  v: 1, id, createdAt: "2026-10-30T10:00:00Z", app: "0.1.0", device: dev(model),
  tests: [{ engine: "webllm", engineVersion: "0.2.86", model: "Qwen3-0.6B", weights: "q4f16_1", kv: "f16", status: "ok",
            promptTokens: 512, genTokens: 128, prefillTps: 1000, decodeTps: decode, ...extra }],
});

describe("tableRows", () => {
  it("combines runs from the same device, engine and format into one row with the median", () => {
    const rows = tableRows([res("r-aaaaaa1", "MacBook", 50), res("r-aaaaaa2", "MacBook", 60), res("r-aaaaaa3", "MacBook", 70)] as any);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ device: "MacBook", engine: "webllm", kv: "f16", runs: 3, decodeTps: 60, gpu: "Apple metal-3" });
  });
  it("keeps different devices apart and sorts fastest first", () => {
    const rows = tableRows([res("r-aaaaaa1", "Slow phone", 8), res("r-aaaaaa2", "MacBook", 60)] as any);
    expect(rows.map((r) => r.device)).toEqual(["MacBook", "Slow phone"]);
  });
  it("leaves out failed tests and invalid results", () => {
    const failed = res("r-aaaaaa1", "MacBook", 50, { status: "failed", decodeTps: undefined, error: "oom" });
    const bad = { ...res("r-aaaaaa2", "MacBook", 50), v: 9 };
    expect(tableRows([failed, bad] as any)).toEqual([]);
  });
  it("drops a duplicate submission of the same result id", () => {
    expect(tableRows([res("r-aaaaaa1", "MacBook", 50), res("r-aaaaaa1", "MacBook", 50)] as any)[0].runs).toBe(1);
  });
});

import { contextRows } from "../src/core/aggregate";

describe("device grouping and context", () => {
  it("rows carry the device key, shared by every engine and format from that device", () => {
    const r = res("r-aaaaaa1", "MacBook", 50);
    r.tests.push({ ...r.tests[0], engine: "wllama", kv: "q8_0", decodeTps: 40 });
    const rows = tableRows([r] as any);
    expect(rows).toHaveLength(2);
    expect(rows[0].dkey).toBe(rows[1].dkey);
    expect(rows[0].dkey).toContain("macbook");
  });
  it("contextRows keeps the largest window that loaded per device and model", () => {
    const a = { ...res("r-aaaaaa1", "MacBook", 50), context: { engine: "webllm", model: "Qwen3-0.6B", largestOk: 16384, firstFailed: 32768 } };
    const b = { ...res("r-aaaaaa2", "MacBook", 50), context: { engine: "webllm", model: "Qwen3-0.6B", largestOk: 32768, firstFailed: null } };
    const c = { ...res("r-aaaaaa3", "Phone", 9), context: { engine: "webllm", model: "Qwen3-0.6B", largestOk: null, firstFailed: 4096 } };
    const rows = contextRows([a, b, c] as any);
    expect(rows.map((r) => [r.device, r.model, r.largestOk, r.runs])).toEqual([["MacBook", "Qwen3-0.6B", 32768, 2], ["Phone", "Qwen3-0.6B", 0, 1]]);
  });
});
