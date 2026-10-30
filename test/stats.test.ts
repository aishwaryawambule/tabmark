import { describe, expect, it } from "vitest";
import { median, quartiles, tokensPerSecond } from "../src/core/stats";

describe("stats", () => {
  it("median of odd and even lists, ignoring order", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("median of an empty list is null", () => {
    expect(median([])).toBeNull();
  });
  it("quartiles use linear interpolation", () => {
    expect(quartiles([1, 2, 3, 4, 5])).toEqual([2, 4]);
  });
  it("tokens per second from a count and milliseconds", () => {
    expect(tokensPerSecond(64, 1000)).toBe(64);
    expect(tokensPerSecond(10, 0)).toBeNull();
  });
});
