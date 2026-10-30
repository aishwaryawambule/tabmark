// The one record a run produces. It is exactly what gets shared: the person sees this
// JSON before submitting, and the ingest Action accepts nothing else.

import type { Device } from "./device";

export const ENGINES = ["webllm", "wllama"] as const;
export const KV_FORMATS = ["f16", "q8_0", "q4_0", "int8"] as const;
export type Engine = (typeof ENGINES)[number];
export type KvFormat = (typeof KV_FORMATS)[number];

export interface TestResult {
  engine: Engine;
  engineVersion: string;
  model: string;
  weights: string;
  kv: KvFormat;
  status: "ok" | "failed" | "skipped";
  promptTokens?: number;
  genTokens?: number;
  prefillTps?: number;
  decodeTps?: number;
  loadMs?: number;
  error?: string;
}

export interface ContextResult {
  engine: Engine;
  model: string;
  largestOk: number | null;
  firstFailed: number | null;
}

export interface Result {
  v: 1;
  id: string;
  createdAt: string;
  app: string;
  device: Device;
  tests: TestResult[];
  context?: ContextResult;
}

const TOP = ["v", "id", "createdAt", "app", "device", "tests", "context"];
const DEVICE = ["kind", "os", "osVersion", "browser", "browserVersion", "model", "gpuVendor", "gpuArchitecture", "gpuDescription", "cores", "memoryGB"];
const TEST = ["engine", "engineVersion", "model", "weights", "kv", "status", "promptTokens", "genTokens", "prefillTps", "decodeTps", "loadMs", "error"];
const CONTEXT = ["engine", "model", "largestOk", "firstFailed"];
const SAFE_TEXT = /^[\p{L}\p{N} .,:;()_+\-/'#@&]*$/u;

export function validateResult(r: unknown): string[] {
  const errs: string[] = [];
  const obj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  const extra = (o: Record<string, unknown>, allowed: string[], at: string) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) errs.push(`unexpected field ${at}${k}`);
  };
  const text = (v: unknown, at: string, max = 80, required = true) => {
    if (v === undefined && !required) return;
    if (typeof v !== "string") return void errs.push(`${at} is missing`);
    if (v.length > max) errs.push(`${at} is too long`);
    else if (!SAFE_TEXT.test(v)) errs.push(`${at} has characters that are not allowed`);
  };
  const num = (v: unknown, at: string, lo: number, hi: number, required: boolean) => {
    if (v === undefined || v === null) return void (required && errs.push(`${at} is missing`));
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) errs.push(`${at} is out of range`);
  };

  if (!obj(r)) return ["result is not an object"];
  extra(r, TOP, "");
  if (r.v !== 1) errs.push("v must be 1");
  if (typeof r.id !== "string" || !/^r-[\w-]{6,60}$/.test(r.id)) errs.push("id is not valid");
  if (typeof r.createdAt !== "string" || Number.isNaN(Date.parse(r.createdAt))) errs.push("createdAt is not a date");
  text(r.app, "app", 20);

  if (!obj(r.device)) errs.push("device is missing");
  else {
    const d = r.device;
    extra(d, DEVICE, "device.");
    if (!["phone", "tablet", "computer"].includes(d.kind as string)) errs.push("device.kind is not valid");
    for (const k of ["os", "osVersion", "browser", "browserVersion", "model", "gpuVendor", "gpuArchitecture", "gpuDescription"]) text(d[k], `device.${k}`);
    if (d.cores !== null) num(d.cores, "device.cores", 1, 256, true);
    if (d.memoryGB !== null) num(d.memoryGB, "device.memoryGB", 0.25, 1024, true);
  }

  if (!Array.isArray(r.tests) || r.tests.length < 1 || r.tests.length > 12) errs.push("tests must have 1 to 12 entries");
  else r.tests.forEach((t, i) => {
    const at = `tests[${i}]`;
    if (!obj(t)) return void errs.push(`${at} is not an object`);
    extra(t, TEST, `${at}.`);
    if (!ENGINES.includes(t.engine as Engine)) errs.push(`${at}.engine is not a known engine`);
    if (!KV_FORMATS.includes(t.kv as KvFormat)) errs.push(`${at}.kv is not a known memory format`);
    for (const k of ["engineVersion", "model", "weights"]) text(t[k], `${at}.${k}`, 40);
    if (!["ok", "failed", "skipped"].includes(t.status as string)) errs.push(`${at}.status is not valid`);
    const ok = t.status === "ok";
    num(t.promptTokens, `${at}.promptTokens`, 1, 1_000_000, ok);
    num(t.genTokens, `${at}.genTokens`, 1, 100_000, ok);
    num(t.prefillTps, `${at}.prefillTps`, 0.01, 100_000, ok);
    num(t.decodeTps, `${at}.decodeTps`, 0.01, 5_000, ok);
    num(t.loadMs, `${at}.loadMs`, 0, 3_600_000, false);
    text(t.error, `${at}.error`, 200, false);
  });

  if (r.context !== undefined) {
    if (!obj(r.context)) errs.push("context is not an object");
    else {
      const c = r.context;
      extra(c, CONTEXT, "context.");
      if (!ENGINES.includes(c.engine as Engine)) errs.push("context.engine is not a known engine");
      text(c.model, "context.model", 40);
      for (const k of ["largestOk", "firstFailed"]) if (c[k] !== null) num(c[k], `context.${k}`, 1, 10_000_000, true);
    }
  }
  return errs;
}

export function resultTitle(r: Result): string {
  const d = r.device;
  const name = d.model || `${d.os} ${d.kind}`;
  return `Result: ${name}, ${d.browser} ${d.browserVersion}`.trim();
}

export function issueBody(r: Result): string {
  return [
    "This result was produced by the Tabmark test page. Please do not edit the block below.",
    "",
    "```json",
    JSON.stringify(r),
    "```",
  ].join("\n");
}

// Prefills the "result" issue form (.github/ISSUE_TEMPLATE/result.yml). The form's
// textarea renders as a json block, which parseIssueBody reads back.
export function issueUrl(repo: string, r: Result): string {
  const u = new URL(`https://github.com/${repo}/issues/new`);
  u.searchParams.set("template", "result.yml");
  u.searchParams.set("title", resultTitle(r));
  u.searchParams.set("result", JSON.stringify(r));
  return u.toString();
}

export function parseIssueBody(body: string): unknown | null {
  const m = body.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

export function newResultId(now = new Date(), rand = Math.random): string {
  const day = now.toISOString().slice(0, 10);
  return `r-${day}-${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0")}`;
}
