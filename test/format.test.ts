import { describe, expect, it } from "vitest";
import { answerSentence, deviceName, fmtSpeed } from "../src/core/format";

const d = (over = {}) => ({ kind: "computer" as const, os: "macOS", osVersion: "26.5", browser: "Chrome", browserVersion: "148", model: "",
  gpuVendor: "apple", gpuArchitecture: "metal-3", gpuDescription: "", cores: 14, memoryGB: 8, ...over });

describe("deviceName", () => {
  it("prefers the model name, then the OS and kind", () => {
    expect(deviceName(d({ model: "Pixel 8", kind: "phone", os: "Android" }))).toBe("Pixel 8");
    expect(deviceName(d())).toBe("This Mac");
    expect(deviceName(d({ os: "Windows" }))).toBe("This Windows computer");
    expect(deviceName(d({ kind: "phone", os: "Android" }))).toBe("This Android phone");
  });
});

describe("fmtSpeed", () => {
  it("one decimal under 10, whole numbers above", () => {
    expect(fmtSpeed(4.26)).toBe("4.3");
    expect(fmtSpeed(58.14)).toBe("58");
    expect(fmtSpeed(1380.2)).toBe("1,380");
  });
});

describe("answerSentence", () => {
  it("names the fastest writer, its engine and memory format", () => {
    const tests = [
      { engine: "webllm", kv: "f16", status: "ok", decodeTps: 58.1 },
      { engine: "wllama", kv: "q8_0", status: "ok", decodeTps: 61.4 },
      { engine: "wllama", kv: "q4_0", status: "failed" },
    ] as any;
    expect(answerSentence(d(), tests)).toBe("This Mac writes 61 tokens a second, with wllama and 8-bit memory.");
  });
  it("one test only", () => {
    expect(answerSentence(d({ model: "Pixel 8" }), [{ engine: "webllm", kv: "f16", status: "ok", decodeTps: 9.4 }] as any))
      .toBe("Pixel 8 writes 9.4 tokens a second, with WebLLM.");
  });
  it("says so plainly when nothing ran", () => {
    expect(answerSentence(d(), [{ engine: "webllm", kv: "f16", status: "failed" }] as any))
      .toBe("No test finished on this Mac. The table says what went wrong.");
  });
});
