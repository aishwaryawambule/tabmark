import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module shared with the GitHub Action
import { ingest, serialize } from "../scripts/ingest.mjs";
import { issueBody, type Result } from "../src/core/result";

const result = (id = "r-2026-10-30-abc123"): Result => ({
  v: 1, id, createdAt: "2026-10-30T10:00:00.000Z", app: "0.1.0",
  device: { kind: "phone", os: "Android", osVersion: "16", browser: "Chrome", browserVersion: "147", model: "Pixel 8",
            gpuVendor: "arm", gpuArchitecture: "valhall", gpuDescription: "", cores: 9, memoryGB: 8 },
  tests: [{ engine: "webllm", engineVersion: "0.2.86", model: "Qwen3-0.6B", weights: "q4f16_1", kv: "f16", status: "ok",
            promptTokens: 512, genTokens: 128, prefillTps: 210, decodeTps: 14.2, loadMs: 9000 }],
});

describe("ingest", () => {
  it("adds a valid result to the list", () => {
    const out = ingest(issueBody(result()), []);
    expect(out.status).toBe("added");
    expect(out.results).toEqual([result()]);
  });
  it("does not add the same result twice", () => {
    const out = ingest(issueBody(result()), [result()]);
    expect(out.status).toBe("duplicate");
    expect(out.results).toHaveLength(1);
  });
  it("rejects an issue without the JSON block, with a message the person can act on", () => {
    const out = ingest("I edited this away", []);
    expect(out.status).toBe("invalid");
    expect(out.message).toMatch(/could not find the result block/i);
  });
  it("rejects a result that fails validation and lists why", () => {
    const bad = result(); (bad.tests[0] as any).decodeTps = 99999;
    const out = ingest(issueBody(bad), []);
    expect(out.status).toBe("invalid");
    expect(out.message).toContain("tests[0].decodeTps is out of range");
  });
  it("serializes one result per line so pull-request diffs stay readable", () => {
    const text = serialize([result("r-2026-10-30-aaaaaa"), result("r-2026-10-30-bbbbbb")]);
    expect(text.split("\n")).toHaveLength(4);
    expect(JSON.parse(text)).toHaveLength(2);
  });
});
