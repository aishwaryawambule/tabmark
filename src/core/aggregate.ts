// Turns submitted results into rows of the public table: one row per device, browser,
// engine, model and memory format, with the median of every run behind it.

import { deviceKey } from "./device";
import { deviceName } from "./format";
import { validateResult, type Engine, type KvFormat, type Result } from "./result";
import { median } from "./stats";
import { GARBLED, type Backend, type SpeechTask } from "./speech";

export interface TableRow {
  key: string;
  dkey: string; // the device and browser; shared by every engine and format from it
  device: string;
  kind: string;
  os: string;
  browser: string;
  gpu: string;
  engine: Engine;
  model: string;
  kv: KvFormat;
  decodeTps: number;
  prefillTps: number | null;
  runs: number;
  latest: string;
}

export function tableRows(results: unknown[]): TableRow[] {
  const seen = new Set<string>();
  const groups = new Map<string, { r: Result; decode: number[]; prefill: number[]; latest: string }>();
  for (const raw of results) {
    if (validateResult(raw).length) continue;
    const r = raw as Result;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    for (const t of r.tests) {
      if (t.status !== "ok" || !t.decodeTps) continue;
      const key = [deviceKey(r.device), t.engine, t.model, t.kv].join("|");
      const g = groups.get(key) ?? { r, decode: [], prefill: [], latest: r.createdAt };
      g.decode.push(t.decodeTps);
      if (t.prefillTps) g.prefill.push(t.prefillTps);
      if (r.createdAt > g.latest) g.latest = r.createdAt;
      groups.set(key, g);
    }
  }
  const rows: TableRow[] = [];
  for (const [key, g] of groups) {
    const d = g.r.device;
    const t = g.r.tests.find((x) => key.endsWith(`|${x.engine}|${x.model}|${x.kv}`))!;
    rows.push({
      key,
      dkey: deviceKey(d),
      device: deviceName(d).replace(/^This /, ""),
      kind: d.kind,
      os: d.os,
      browser: `${d.browser} ${d.browserVersion}`.trim(),
      gpu: d.gpuDescription || [cap(d.gpuVendor), d.gpuArchitecture].filter(Boolean).join(" "),
      engine: t.engine,
      model: t.model,
      kv: t.kv,
      decodeTps: median(g.decode)!,
      prefillTps: median(g.prefill),
      runs: g.decode.length,
      latest: g.latest,
    });
  }
  return rows.sort((a, b) => b.decodeTps - a.decodeTps);
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export interface ContextRow {
  dkey: string;
  device: string;
  kind: string;
  model: string;
  largestOk: number; // 0 when nothing loaded
  runs: number;
}

// The longest conversation that loaded, per device and model: the best any run reached.
export function contextRows(results: unknown[]): ContextRow[] {
  const seen = new Set<string>();
  const out = new Map<string, ContextRow>();
  for (const raw of results) {
    if (validateResult(raw).length) continue;
    const r = raw as Result;
    if (seen.has(r.id) || !r.context) continue;
    seen.add(r.id);
    const key = `${deviceKey(r.device)}|${r.context.model}`;
    const prev = out.get(key);
    const ok = r.context.largestOk ?? 0;
    out.set(key, {
      dkey: deviceKey(r.device), device: deviceName(r.device).replace(/^This /, ""), kind: r.device.kind,
      model: r.context.model, largestOk: Math.max(prev?.largestOk ?? 0, ok), runs: (prev?.runs ?? 0) + 1,
    });
  }
  return [...out.values()].sort((a, b) => b.largestOk - a.largestOk);
}

export interface SpeechRow {
  dkey: string;
  device: string;
  task: SpeechTask;
  model: string;
  backend: Backend;
  realTime: number; // median, audio seconds per second of work
  firstAudioMs: number | null; // speaking only, median
  wordErrors: number | null; // median
  garbled: boolean; // the median word errors are above the audio-check limit
  runs: number;
}

// One row per device, task, model and backend, with the median of every finished run.
export function speechRows(results: unknown[]): SpeechRow[] {
  const seen = new Set<string>();
  const groups = new Map<string, { r: Result; task: SpeechTask; model: string; backend: Backend; rt: number[]; first: number[]; err: number[] }>();
  for (const raw of results) {
    if (validateResult(raw).length) continue;
    const r = raw as Result;
    if (seen.has(r.id) || !r.speech) continue;
    seen.add(r.id);
    for (const s of r.speech) {
      if (s.status !== "ok" || !s.realTime) continue;
      const key = [deviceKey(r.device), s.task, s.model, s.backend].join("|");
      const g = groups.get(key) ?? { r, task: s.task, model: s.model, backend: s.backend, rt: [], first: [], err: [] };
      g.rt.push(s.realTime);
      if (s.firstAudioMs) g.first.push(s.firstAudioMs);
      if (s.wordErrors !== undefined) g.err.push(s.wordErrors);
      groups.set(key, g);
    }
  }
  return [...groups.values()].map((g) => {
    const wordErrors = median(g.err);
    return {
      dkey: deviceKey(g.r.device), device: deviceName(g.r.device).replace(/^This /, ""), task: g.task, model: g.model, backend: g.backend,
      realTime: median(g.rt)!, firstAudioMs: median(g.first), wordErrors, garbled: wordErrors !== null && wordErrors > GARBLED, runs: g.rt.length,
    };
  }).sort((a, b) => b.realTime - a.realTime);
}
