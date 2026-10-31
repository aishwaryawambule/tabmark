import { describe, expect, it } from "vitest";
import { GARBLED, realTime, speechDownloadMB, speechPlan, wordErrorRate, words } from "../src/core/speech";

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
  it("runs the graphics chip only by default", () => {
    expect(speechPlan(false).map((s) => `${s.task}/${s.backend}`)).toEqual(["speak/webgpu", "listen/webgpu"]);
  });
  it("adds the processor when asked", () => {
    expect(speechPlan(true).map((s) => s.backend)).toEqual(["webgpu", "webgpu", "wasm", "wasm"]);
  });
  it("adds up the downloads", () => {
    expect(speechDownloadMB(speechPlan(false))).toBe(532);
    expect(speechDownloadMB(speechPlan(true))).toBe(701);
  });
});
