import type { PlannedTest } from "../core/plan";
import type { ContextResult, TestResult } from "../core/result";

export interface Hooks {
  /** Loading progress: a line of text and, when known, a fraction from 0 to 1. */
  status(text: string, fraction?: number): void;
  /** Called with performance.now() as each generated token arrives. */
  token(atMs: number): void;
}

export type SpeedTest = (test: PlannedTest, hooks: Hooks) => Promise<TestResult>;
export type ContextProbe = (test: PlannedTest, windows: number[], hooks: Hooks) => Promise<ContextResult>;

export function failure(test: PlannedTest, version: string, e: unknown): TestResult {
  const message = (e instanceof Error ? e.message : String(e)).replace(/[^\p{L}\p{N} .,:;()_+\-/'#@&]/gu, " ").slice(0, 200);
  return { engine: test.engine, engineVersion: version, model: test.model, weights: test.weights, kv: test.kv, status: "failed", error: message };
}
