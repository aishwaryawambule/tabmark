// Words and numbers as people read them.

import type { Device } from "./device";
import type { TestResult } from "./result";

const ENGINE_NAME: Record<string, string> = { webllm: "WebLLM", wllama: "wllama" };
const KV_NAME: Record<string, string> = { f16: "16-bit memory", q8_0: "8-bit memory", q4_0: "4-bit memory", int8: "8-bit memory" };
const OS_NOUN: Record<string, string> = { macOS: "Mac", Windows: "Windows computer", Linux: "Linux computer", ChromeOS: "Chromebook" };

export const engineName = (e: string) => ENGINE_NAME[e] ?? e;
export const kvName = (k: string) => KV_NAME[k] ?? k;

export function deviceName(d: Device): string {
  if (d.model) return d.model;
  if (d.kind === "computer") return `This ${OS_NOUN[d.os] ?? "computer"}`;
  return `This ${d.os === "Unknown" ? "" : `${d.os} `}${d.kind}`;
}

export function fmtSpeed(tps: number): string {
  return tps < 10 ? tps.toFixed(1) : Math.round(tps).toLocaleString("en-US");
}

export function answerSentence(d: Device, tests: Pick<TestResult, "engine" | "kv" | "status" | "decodeTps">[]): string {
  const ok = tests.filter((t) => t.status === "ok" && t.decodeTps);
  const name = deviceName(d);
  if (!ok.length) {
    const lower = name.startsWith("This ") ? `this ${name.slice(5)}` : name;
    return `No test finished on ${lower}. The table says what went wrong.`;
  }
  const best = ok.reduce((a, b) => (b.decodeTps! > a.decodeTps! ? b : a));
  // Name the memory format only when the run compared more than one.
  const formats = new Set(tests.map((t) => t.kv)).size;
  const how = formats > 1 ? `with ${engineName(best.engine)} and ${kvName(best.kv)}` : `with ${engineName(best.engine)}`;
  return `${name} writes ${fmtSpeed(best.decodeTps!)} tokens a second, ${how}.`;
}
