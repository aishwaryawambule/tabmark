// The page, told as a data story: headline, the charts (filtered by model), every
// result in a table, and how it was measured. The tester sits beside the charts.

import { contextRows, tableRows, type ContextRow, type TableRow } from "../core/aggregate";
import { deviceKey } from "../core/device";
import { engineName, fmtSpeed, kvName } from "../core/format";
import { DEFAULT_MODEL, GEN_TOKENS, MODELS, PROMPT_TOKENS, chatMemoryGB, modelById } from "../core/plan";
import type { Result } from "../core/result";
import { barChart, dotPlot, groupBars, type DotRow, type Series } from "./charts";
import { h } from "./dom";
import { renderTester } from "./tester";

const ENGINE_SERIES: Series[] = [
  { key: "webllm", label: "WebLLM", color: "var(--webllm)" },
  { key: "wllama", label: "wllama", color: "var(--wllama)" },
];
const KV_SERIES: Series[] = [
  { key: "f16", label: "16-bit memory", color: "var(--kv-16)" },
  { key: "q8_0", label: "8-bit memory", color: "var(--kv-8)" },
  { key: "q4_0", label: "4-bit memory", color: "var(--kv-4)" },
];
const modelName = (id: string) => (modelById(id).id === id ? modelById(id).name : id);

export function renderStory(root: HTMLElement) {
  let published: unknown[] = [];
  const local: Result[] = [];
  let model = DEFAULT_MODEL;
  let loadState: "loading" | "ok" | "failed" = "loading";
  const cleanups: (() => void)[] = [];

  const meta = h("p", { class: "meta" }, "Loading results");
  const head = h("header", { class: "head" },
    h("h1", {}, "How fast can a browser tab run AI?"),
    h("p", { class: "deck" }, "Real phones and laptops, timing small AI models inside a web page."),
    meta);

  const tabs = h("div", { class: "tabs", role: "group", "aria-label": "Model" }, h("span", { class: "lab" }, "Model"));
  const tabButtons = MODELS.map((m) => {
    const b = h("button", { class: "tab", type: "button", "aria-pressed": String(m.id === model) }, m.name);
    b.addEventListener("click", () => { setModel(m.id); tester.setModel(m.id); });
    tabs.append(b);
    return b;
  });

  const stats = h("div", { class: "stats" });
  const figs = h("div");
  const tableSec = h("section", { class: "section", id: "results", "aria-labelledby": "res-h" });
  const main = h("div", {}, tabs, stats, figs, tableSec, method());
  const aside = h("aside", { class: "aside", id: "test" });
  root.append(h("div", { class: "story" }, head, h("div", { class: "cols" }, main, aside)));

  const tester = renderTester(aside, (r) => { local.push(r); draw(); }, (id) => setModel(id));

  function setModel(id: string) {
    model = id;
    tabButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(MODELS[i].id === id)));
    draw();
  }

  function all() { return [...published, ...local]; }

  function draw() {
    for (const c of cleanups.splice(0)) c();
    const rows = tableRows(all());
    const youKeys = new Set(local.map((r) => deviceKey(r.device)));
    const runs = (published as Result[]).length;
    const devices = new Set(tableRows(published).map((r) => r.dkey)).size;
    const latest = tableRows(published).reduce((a, r) => (r.latest > a ? r.latest : a), "");
    meta.textContent = loadState === "failed" ? "The published results did not load. Your own runs still appear on the charts."
      : loadState === "loading" ? "Loading results"
      : runs ? `Updated ${new Date(latest).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. ${runs} ${runs === 1 ? "run" : "runs"} from ${devices} ${devices === 1 ? "device" : "devices"}.`
      : "No results yet. Be the first dot on the chart.";

    const name = modelName(model);
    const ctx = contextRows(all()).filter((r) => r.model === model);
    drawStats(rows.filter((r) => r.model === model), ctx);
    figs.replaceChildren(
      figure("Writing speed", "Tokens per second, 16-bit memory", ENGINE_SERIES,
        speedRows(rows, youKeys), (host, data) => dotPlot(host, data, ENGINE_SERIES, { unit: "tok/s", title: `Writing speed by device, ${name}` }), name),
      figure("Smaller memory, same model", "wllama, tokens per second", KV_SERIES,
        memoryRows(rows, youKeys), (host, data) => dotPlot(host, data, KV_SERIES, { unit: "tok/s", title: `Writing speed by memory format, ${name}` }), name),
      contextFigure(ctx, youKeys, name),
      memoryFigure());
    drawTable(rows, youKeys);
  }

  function drawStats(rows: TableRow[], ctx: ContextRow[]) {
    if (!rows.length) return void stats.replaceChildren();
    const best = rows.reduce((a, b) => (b.decodeTps > a.decodeTps ? b : a));
    const devices = new Set(rows.map((r) => r.dkey)).size;
    const longest = ctx[0];
    const stat = (value: string, unit: string, label: string) =>
      h("div", { class: "stat" }, h("div", { class: "v num" }, value, h("span", {}, unit)), h("div", { class: "l" }, label));
    stats.replaceChildren(...[
      stat(fmtSpeed(best.decodeTps), "tok/s", `fastest, ${best.device}`),
      stat(String(devices), devices === 1 ? "device" : "devices", "tested"),
      longest?.largestOk ? stat(`${Math.round(longest.largestOk / 1024)}K`, "tokens", `longest chat, ${longest.device}`) : null,
    ].filter((x): x is HTMLDivElement => x !== null));
  }

  function memoryFigure() {
    const host = h("div", { class: "plot" });
    const data = MODELS.map((m) => ({
      id: m.id, label: m.name, you: m.id === model,
      values: KV_SERIES.map((s) => {
        const gb = chatMemoryGB(m.id, 32768, s.key as "f16" | "q8_0" | "q4_0");
        return { series: s.key, value: gb, detail: `${gb.toFixed(1)} GB` };
      }),
    }));
    requestAnimationFrame(() => cleanups.push(groupBars(host, data, KV_SERIES, { unit: "GB", title: "Memory a 32,768-token conversation needs, by model and memory format" })));
    return h("figure", { class: "fig" },
      h("h2", {}, "Memory one long chat needs"),
      h("p", { class: "sub" }, "32,768 tokens of conversation, on top of the model itself"),
      h("div", { class: "legend", "aria-hidden": "true" }, KV_SERIES.map((s) => h("span", {}, h("i", { style: `background:${s.color}` }), s.label))),
      host);
  }

  function speedRows(rows: TableRow[], you: Set<string>): DotRow[] {
    return group(rows.filter((r) => r.model === model && r.kv === "f16"), you, (r) => r.engine);
  }
  function memoryRows(rows: TableRow[], you: Set<string>): DotRow[] {
    return group(rows.filter((r) => r.model === model && r.engine === "wllama"), you, (r) => r.kv);
  }
  function group(rows: TableRow[], you: Set<string>, series: (r: TableRow) => string): DotRow[] {
    // Label a row with the device alone; add the browser only when one device appears twice.
    const browsers = new Map<string, Set<string>>();
    for (const r of rows) browsers.set(r.device, (browsers.get(r.device) ?? new Set()).add(r.browser));
    const by = new Map<string, DotRow>();
    for (const r of rows) {
      const label = browsers.get(r.device)!.size > 1 ? `${r.device}, ${r.browser}` : r.device;
      const row = by.get(r.dkey) ?? { id: r.dkey, label, you: you.has(r.dkey), values: [] };
      row.values.push({ series: series(r), value: r.decodeTps, detail: `${fmtSpeed(r.decodeTps)} tok/s, ${r.runs} ${r.runs === 1 ? "run" : "runs"}` });
      by.set(r.dkey, row);
    }
    return [...by.values()].sort((a, b) => Math.max(...b.values.map((v) => v.value)) - Math.max(...a.values.map((v) => v.value)));
  }

  function figure(title: string, sub: string, series: Series[], data: DotRow[], draw: (host: HTMLElement, data: DotRow[]) => () => void, name: string) {
    const host = h("div", { class: "plot" });
    const fig = h("figure", { class: "fig" },
      h("h2", {}, title), h("p", { class: "sub" }, sub),
      data.length ? h("div", { class: "legend", "aria-hidden": "true" }, series.map((s) => h("span", {}, h("i", { style: `background:${s.color}` }), s.label))) : null,
      data.length ? host : h("p", { class: "empty-plot" }, `No ${name} runs yet. Run the test to add the first.`));
    if (data.length) requestAnimationFrame(() => cleanups.push(draw(host, data)));
    return fig;
  }

  function contextFigure(rows: ContextRow[], you: Set<string>, name: string) {
    const host = h("div", { class: "plot" });
    const data = rows.map((r) => ({ id: r.dkey, label: r.device, you: you.has(r.dkey), value: r.largestOk,
      detail: r.largestOk ? `${r.largestOk.toLocaleString("en-US")} tokens loaded` : "Not even 4,096 tokens loaded" }));
    const fig = h("figure", { class: "fig" },
      h("h2", {}, "Longest conversation that loaded"),
      h("p", { class: "sub" }, "Tokens, WebLLM"),
      data.length ? host : h("p", { class: "empty-plot" }, `No ${name} runs with the conversation check yet.`));
    if (data.length) requestAnimationFrame(() => cleanups.push(barChart(host, data, { unit: "tokens", title: `Longest conversation, ${name}`, color: "var(--webllm)" })));
    return fig;
  }

  let sort: { key: "decodeTps" | "prefillTps" | "device"; dir: 1 | -1 } = { key: "decodeTps", dir: -1 };
  function drawTable(rows: TableRow[], you: Set<string>) {
    const th = (label: string, key?: typeof sort.key, cls = "") => {
      const cell = h("th", { scope: "col", class: cls || undefined, "aria-sort": key && sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined },
        key ? h("button", { type: "button" }, label) : label);
      if (key) cell.querySelector("button")!.addEventListener("click", () => {
        sort = sort.key === key ? { key, dir: (sort.dir * -1) as 1 | -1 } : { key, dir: key === "device" ? 1 : -1 };
        drawTable(rows, you);
      });
      return cell;
    };
    const sorted = [...rows].sort((a, b) => {
      const x = a[sort.key] ?? -1, y = b[sort.key] ?? -1;
      return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir;
    });
    tableSec.replaceChildren(
      h("h2", { id: "res-h" }, "Every result"),
      h("p", { class: "sub", hidden: !you.size }, "Yellow rows are your own runs, not yet shared."),
      rows.length ? h("div", { class: "tbl-wrap", tabindex: 0, "aria-label": "Results table" },
        h("table", { class: "tbl" },
          h("thead", {}, h("tr", {}, th("Device", "device"), th("Model"), th("Engine"), th("Memory", undefined, "wide"),
            th("Writing, tok/s", "decodeTps", "r"), th("Reading, tok/s", "prefillTps", "r wide"), th("Browser", undefined, "wide"), th("Runs", undefined, "r wide"))),
          h("tbody", {}, sorted.map((r) => h("tr", { class: you.has(r.dkey) ? "you" : undefined },
            h("td", {}, r.device), h("td", {}, modelName(r.model)),
            h("td", { class: "eng" }, h("span", { class: "key", style: `background:var(--${r.engine})` }), engineName(r.engine),
              h("span", { class: "narrow" }, `, ${kvName(r.kv).replace(" memory", "")}`)),
            h("td", { class: "wide" }, kvName(r.kv).replace(" memory", "")),
            h("td", { class: "r num" }, fmtSpeed(r.decodeTps)),
            h("td", { class: "r num wide" }, r.prefillTps ? fmtSpeed(r.prefillTps) : "Not reported"),
            h("td", { class: "wide" }, r.browser),
            h("td", { class: "r num wide" }, r.runs))))))
        : h("p", { class: "empty-plot" }, "No results yet. Run the test to add the first row."));
  }

  async function load() {
    try {
      const res = await fetch("./data/results.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(String(res.status));
      published = await res.json();
      loadState = "ok";
    } catch {
      loadState = "failed";
    }
    draw();
  }
  draw();
  load();
}

function method() {
  return h("section", { class: "section prose", id: "method", "aria-labelledby": "m-h" },
    h("h2", { id: "m-h" }, "How we measured"),
    h("ul", { class: "facts" },
      h("li", {}, h("b", {}, "Same work everywhere. "), `One untimed warm-up, then a ${PROMPT_TOKENS}-token prompt and exactly ${GEN_TOKENS} new tokens.`),
      h("li", {}, h("b", {}, "Writing "), "is new tokens per second. ", h("b", {}, "Reading "), "is prompt tokens per second. A token is about three quarters of a word."),
      h("li", {}, h("b", {}, "Memory format "), "is how the model stores the conversation (its KV cache). Speed is measured; accuracy is not."),
      h("li", {}, h("b", {}, "Shared only if you choose. "), "The record holds device type, OS, browser, graphics chip, the name you typed and the speeds. No name, IP address or prompt."),
      h("li", {}, h("b", {}, "Open data. "), "Every result is in ", h("code", {}, "public/data/results.json"), ". MIT licence.")));
}
