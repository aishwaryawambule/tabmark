// Turns submitted results into rows of the public table: one row per device, browser,
// engine, model and memory format, with the median of every run behind it.

import { deviceKey } from "./device";
import { deviceName } from "./format";
import { validateResult, type Engine, type KvFormat, type Result } from "./result";
import { median } from "./stats";

export interface TableRow {
  key: string;
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
