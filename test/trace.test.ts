import { describe, expect, it } from "vitest";
import { rollingRates, tracePath } from "../src/core/trace";

describe("rollingRates", () => {
  it("is tokens per second over the last few gaps", () => {
    // tokens every 50 ms = 20 tokens a second
    const t = Array.from({ length: 10 }, (_, i) => i * 50);
    const r = rollingRates(t, 4);
    expect(r).toHaveLength(9);
    expect(r.every((x) => Math.abs(x - 20) < 1e-9)).toBe(true);
  });
  it("needs two tokens before it has a rate", () => {
    expect(rollingRates([0], 4)).toEqual([]);
  });
});

describe("tracePath", () => {
  it("maps rates into an SVG path in the given box, highest rate at the top", () => {
    const d = tracePath([10, 20], { width: 100, height: 20, max: 20 });
    expect(d).toBe("M0.0 10.0 L100.0 0.0");
  });
  it("is empty for no data", () => {
    expect(tracePath([], { width: 100, height: 20, max: 20 })).toBe("");
  });
});
