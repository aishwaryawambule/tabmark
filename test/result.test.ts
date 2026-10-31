import { describe, expect, it } from "vitest";
import { issueUrl, parseIssueBody, validateResult, type Result } from "../src/core/result";

const good = (): Result => ({
  v: 1,
  id: "r-2026-10-30-abc123",
  createdAt: "2026-10-30T10:00:00.000Z",
  app: "0.1.0",
  device: { kind: "computer", os: "macOS", osVersion: "26.5", browser: "Chrome", browserVersion: "148", model: "MacBook Pro",
            gpuVendor: "apple", gpuArchitecture: "metal-3", gpuDescription: "", cores: 14, memoryGB: 8 },
  tests: [
    { engine: "webllm", engineVersion: "0.2.86", model: "Qwen3-0.6B", weights: "q4f16_1", kv: "f16",
      status: "ok", promptTokens: 1012, genTokens: 64, prefillTps: 1380.2, decodeTps: 58.1, loadMs: 4200 },
    { engine: "wllama", engineVersion: "3.8.1", model: "Qwen3-0.6B", weights: "Q4_0", kv: "q4_0",
      status: "failed", error: "out of memory" },
  ],
  context: { engine: "webllm", model: "Qwen3-0.6B", largestOk: 16384, firstFailed: 32768 },
});

describe("validateResult", () => {
  it("accepts a well-formed result", () => {
    expect(validateResult(good())).toEqual([]);
  });
  it("rejects an unknown schema version, engine or memory format", () => {
    expect(validateResult({ ...good(), v: 2 })).toContain("v must be 1");
    const r = good(); (r.tests[0] as any).engine = "ollama";
    expect(validateResult(r)).toContain("tests[0].engine is not a known engine");
    const r2 = good(); (r2.tests[0] as any).kv = "fp8";
    expect(validateResult(r2)).toContain("tests[0].kv is not a known memory format");
  });
  it("rejects speeds outside a plausible range", () => {
    const r = good(); r.tests[0].decodeTps = 50000;
    expect(validateResult(r)).toContain("tests[0].decodeTps is out of range");
    const r2 = good(); r2.tests[0].prefillTps = -1;
    expect(validateResult(r2)).toContain("tests[0].prefillTps is out of range");
  });
  it("an ok test needs its numbers", () => {
    const r = good(); delete (r.tests[0] as any).decodeTps;
    expect(validateResult(r)).toContain("tests[0].decodeTps is missing");
  });
  it("rejects long or markup-bearing text fields", () => {
    const r = good(); r.device.model = "x".repeat(81);
    expect(validateResult(r)).toContain("device.model is too long");
    const r2 = good(); r2.device.model = "<img src=x onerror=alert(1)>";
    expect(validateResult(r2)).toContain("device.model has characters that are not allowed");
  });
  it("rejects extra fields, so nothing else can ride along", () => {
    expect(validateResult({ ...good(), email: "a@b.c" } as any)).toContain("unexpected field email");
  });
  it("needs at least one test and at most twelve", () => {
    expect(validateResult({ ...good(), tests: [] })).toContain("tests must have 1 to 12 entries");
  });
});

describe("GitHub issue round trip", () => {
  it("builds a new-issue URL that prefills the result issue form", () => {
    const url = new URL(issueUrl("someone/tabmark", good()));
    expect(url.origin + url.pathname).toBe("https://github.com/someone/tabmark/issues/new");
    // The form (.github/ISSUE_TEMPLATE/result.yml) applies the label for everyone;
    // a labels= parameter only works for people with write access.
    expect(url.searchParams.get("template")).toBe("result.yml");
    expect(url.searchParams.get("title")).toBe("Result: MacBook Pro, Chrome 148");
    expect(JSON.parse(url.searchParams.get("result")!)).toEqual(good());
  });
  it("parses the body GitHub writes for the form", () => {
    const body = "### Result\n\n```json\n" + JSON.stringify(good()) + "\n```\n";
    expect(parseIssueBody(body)).toEqual(good());
  });
  it("keeps the URL under GitHub's practical length limit", () => {
    expect(issueUrl("someone/tabmark", good()).length).toBeLessThan(8000);
  });
  it("finds the JSON block even when the person adds a note around it", () => {
    const body = "Ran this on battery.\n\n```json\n" + JSON.stringify(good()) + "\n```\nthanks";
    expect(parseIssueBody(body)).toEqual(good());
  });
  it("returns null when there is no JSON block or it does not parse", () => {
    expect(parseIssueBody("no data here")).toBeNull();
    expect(parseIssueBody("```json\n{nope\n```")).toBeNull();
  });
});

describe("speech results", () => {
  const base = () => JSON.parse(JSON.stringify(good())) as Record<string, unknown>;
  const step = { task: "speak", engineVersion: "3.8.1", model: "Kokoro-82M", backend: "webgpu", dtype: "fp32", status: "ok", loadMs: 4200, audioSec: 9.6, computeMs: 640, realTime: 15, firstAudioMs: 230, wordErrors: 0 };
  it("accepts a speech-only run", () => {
    const r = { ...base(), tests: [], speech: [step, { ...step, task: "listen", model: "Whisper-base.en", firstAudioMs: undefined }] };
    expect(validateResult(JSON.parse(JSON.stringify(r)))).toEqual([]);
  });
  it("still needs a test when there is no speech", () => {
    expect(validateResult({ ...base(), tests: [] })).toContain("tests must have 1 to 12 entries");
  });
  it("rejects unknown backends and fields", () => {
    const errs = validateResult({ ...base(), speech: [{ ...step, backend: "cuda", secret: 1 }] });
    expect(errs).toContain("speech[0].backend is not valid");
    expect(errs).toContain("unexpected field speech[0].secret");
  });
  it("requires timings on a finished step but not on a failed one", () => {
    expect(validateResult({ ...base(), speech: [{ ...step, realTime: undefined }] })).toContain("speech[0].realTime is missing");
    expect(validateResult({ ...base(), speech: [{ task: "listen", engineVersion: "3.8.1", model: "Whisper-base.en", backend: "wasm", dtype: "q8", status: "failed", error: "out of memory" }] })).toEqual([]);
  });
  it("keeps word errors between 0 and 1", () => {
    expect(validateResult({ ...base(), speech: [{ ...step, wordErrors: 1.5 }] })).toContain("speech[0].wordErrors is out of range");
  });
});
