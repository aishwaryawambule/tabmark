import { describe, expect, it } from "vitest";
import { GARBLED, SPEECH_MODELS, realTime, speechDownloadMB, speechPlan, wordErrorRate, words } from "../src/core/speech";

describe("words", () => {
  it("lower-cases and drops punctuation", () => {
    expect(words("Ask not, what your COUNTRY can do!")).toEqual(["ask", "not", "what", "your", "country", "can", "do"]);
  });
  it("joins contractions so 'don't' and 'dont' match", () => {
    expect(words("Don't stop")).toEqual(["dont", "stop"]);
  });
});

describe("wordErrorRate", () => {
  it("is 0 for the same words, whatever the punctuation", () => {
    expect(wordErrorRate("And so, my fellow Americans.", "and so my fellow americans")).toBe(0);
  });
  it("counts a substitution", () => {
    expect(wordErrorRate("the river is loud", "the river is proud")).toBeCloseTo(0.25);
  });
  it("counts a missing and an extra word", () => {
    expect(wordErrorRate("we reached the lake", "we the lake today")).toBeCloseTo(0.5);
  });
  it("is 1 when nothing was heard", () => {
    expect(wordErrorRate("the trail climbs", "")).toBe(1);
  });
  it("never goes above 1 for noise", () => {
    expect(wordErrorRate("hi", "a b c d e f")).toBe(1);
  });
  it("calls clear speech fine and noise garbled", () => {
    expect(wordErrorRate("every morning the river is loud with melting snow", "every morning the river is loud with melting snow") < GARBLED).toBe(true);
    expect(wordErrorRate("every morning the river is loud with melting snow", "you") > GARBLED).toBe(true);
  });
});

describe("realTime", () => {
  it("is audio seconds per second of work", () => {
    expect(realTime(10, 500)).toBe(20);
  });
  it("is 0 when no time was measured", () => {
    expect(realTime(10, 0)).toBe(0);
  });
});

describe("speechPlan", () => {
  it("speaks then listens on the graphics chip by default", () => {
    expect(speechPlan("Kokoro-82M", "Whisper-base.en", false).map((s) => `${s.task}/${s.model}/${s.backend}`))
      .toEqual(["speak/Kokoro-82M/webgpu", "listen/Whisper-base.en/webgpu"]);
  });
  it("adds the processor when asked", () => {
    expect(speechPlan("Kokoro-82M", "Whisper-base.en", true).map((s) => s.backend)).toEqual(["webgpu", "webgpu", "wasm", "wasm"]);
  });
  it("runs on the processor only without WebGPU", () => {
    expect(speechPlan("Kokoro-82M", "Moonshine-tiny", false, false).map((s) => s.backend)).toEqual(["wasm", "wasm"]);
  });
  it("skips the processor for models too big to run there", () => {
    expect(speechPlan("Supertonic", "Whisper-large-v3-turbo", true).map((s) => `${s.model}/${s.backend}`))
      .toEqual(["Supertonic/webgpu", "Whisper-large-v3-turbo/webgpu", "Supertonic/wasm"]);
  });
  it("adds up the downloads", () => {
    expect(speechDownloadMB(speechPlan("Kokoro-82M", "Whisper-base.en", false))).toBe(532);
    expect(speechDownloadMB(speechPlan("Kokoro-82M", "Whisper-base.en", true))).toBe(701);
  });
  it("lists only open models, each with a licence and a GPU build", () => {
    for (const m of SPEECH_MODELS) {
      expect(m.licence).toMatch(/^(MIT|Apache-2.0|CC-BY-4.0|OpenRAIL-M)$/);
      expect(m.gpu.mb).toBeGreaterThan(0);
    }
  });
});
