// The page, told as a data story: headline, the charts (filtered by model), every
// result in a table, and how it was measured. The tester sits beside the charts.

import { contextRows, speechRows, tableRows, type ContextRow, type SpeechRow, type TableRow } from "../core/aggregate";
import { deviceKey } from "../core/device";
import { engineName, fmtSpeed, kvName } from "../core/format";
import { DEFAULT_MODEL, GEN_TOKENS, MODELS, PROMPT_TOKENS, chatMemoryGB, modelById } from "../core/plan";
import type { Result } from "../core/result";
import { DEFAULT_LISTEN, DEFAULT_SPEAK, listeners, speakers, speechModel } from "../core/speech";
import { barChart, dotPlot, groupBars, type DotRow, type Series } from "./charts";
import { h } from "./dom";
import { renderSpeechTester } from "./speechtest";
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
const SPEECH_SERIES: Series[] = [
  { key: "webgpu", label: "Graphics chip (WebGPU)", color: "var(--gpu)" },
  { key: "wasm", label: "Processor (WebAssembly)", color: "var(--cpu)" },
];
const modelName = (id: string) => (modelById(id).id === id ? modelById(id).name : id);

export function renderStory(root: HTMLElement) {
  let published: unknown[] = [];
  const local: Result[] = [];
  let model = DEFAULT_MODEL;
  let view: "text" | "speech" = location.hash === "#speech" ? "speech" : "text";
  let speakModel = DEFAULT_SPEAK, listenModel = DEFAULT_LISTEN;
  let loadState: "loading" | "ok" | "failed" = "loading";
  const cleanups: (() => void)[] = [];

  const meta = h("p", { class: "meta" }, "Loading results");
  const head = h("header", { class: "head" },
    h("h1", {}, "How fast can a browser tab run AI?"),
    h("p", { class: "deck" }, "Real phones and laptops, timing small open AI models inside a web page: language models that write, and speech models that talk and listen."),
    meta);

  const tabs = h("div", { class: "tabs", role: "group", "aria-label": "Model" }, h("span", { class: "lab" }, "Model"));
  const tabButtons = MODELS.map((m) => {
    const b = h("button", { class: "tab", type: "button", "aria-pressed": String(m.id === model) }, m.name);
    b.addEventListener("click", () => { setModel(m.id); tester.setModel(m.id); });
    tabs.append(b);
    return b;
  });

  const viewText = h("button", { type: "button", role: "tab", id: "view-text" }, "Text models");
  const viewSpeech = h("button", { type: "button", role: "tab", id: "view-speech" }, "Speech models");
  const views = h("div", { class: "views", role: "tablist", "aria-label": "What to compare" }, viewText, viewSpeech);
  viewText.addEventListener("click", () => setView("text"));
  viewSpeech.addEventListener("click", () => setView("speech"));
  addEventListener("hashchange", () => { if (location.hash === "#speech" || location.hash === "#text") setView(location.hash.slice(1) as "text" | "speech", false); });

  const speechTabRow = (label: string, list: ReturnType<typeof speakers>, current: () => string, set: (id: string) => void) => {
    const row = h("div", { class: "tabs", role: "group", "aria-label": label }, h("span", { class: "lab" }, label));
    const buttons = list.map((m) => {
      const b = h("button", { class: "tab", type: "button", "aria-pressed": String(m.id === current()) }, m.name);
      b.addEventListener("click", () => { set(m.id); speechTester.setModels(speakModel, listenModel); draw(); });
      row.append(b);
      return { b, id: m.id };
    });
    return { row, sync: () => buttons.forEach(({ b, id }) => b.setAttribute("aria-pressed", String(id === current()))) };
  };
  const voiceTabs = speechTabRow("Voice", speakers(), () => speakModel, (id) => (speakModel = id));
  const listenTabs = speechTabRow("Listening", listeners(), () => listenModel, (id) => (listenModel = id));
  const speechFigs = h("div");
  const speechTable = h("section", { class: "section", "aria-labelledby": "sres-h" });

  const stats = h("div", { class: "stats" });
  const figs = h("div");
  const tableSec = h("section", { class: "section", id: "results", "aria-labelledby": "res-h" });
  const textMain = h("div", { id: "text" }, tabs, stats, figs, tableSec);
  const speechMain = h("div", { id: "speech-view" }, voiceTabs.row, listenTabs.row, speechFigs, speechTable);
  const main = h("div", {}, views, textMain, speechMain, method());
  const aside = h("aside", { class: "aside", id: "test" });
  root.append(h("div", { class: "story" }, head, h("div", { class: "cols" }, main, aside)));

  const tester = renderTester(aside, (r) => { local.push(r); draw(); }, (id) => setModel(id));
  const speechTester = renderSpeechTester(aside, (r) => { local.push(r); draw(); }, (sp, li) => { speakModel = sp; listenModel = li; draw(); });
  const textCard = aside.querySelector<HTMLElement>("section[aria-labelledby='test-h']")!, speechCard = aside.querySelector<HTMLElement>("#speech-test")!;

  function setView(v: "text" | "speech", push = true) {
    view = v;
    if (push) history.replaceState(null, "", v === "speech" ? "#speech" : "#text");
    draw();
  }

  function setModel(id: string) {
    model = id;
    tabButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(MODELS[i].id === id)));
    draw();
  }

  function all() { return [...published, ...local]; }

  function draw() {
    for (const c of cleanups.splice(0)) c();
    viewText.setAttribute("aria-selected", String(view === "text"));
    viewSpeech.setAttribute("aria-selected", String(view === "speech"));
    textMain.hidden = textCard.hidden = view !== "text";
    speechMain.hidden = speechCard.hidden = view !== "speech";
    voiceTabs.sync(); listenTabs.sync();
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
      figure("Writing speed", "How fast each device writes new text. Tokens per second, 16-bit memory.", ENGINE_SERIES,
        speedRows(rows, youKeys), (host, data) => dotPlot(host, data, ENGINE_SERIES, { unit: "tok/s", title: `Writing speed by device, ${name}` }),
        { text: `No ${name} runs yet.`, action: "Set up the test", prep: {} }),
      figure("Smaller memory, same model", "How much speed you lose by storing the conversation in 8 or 4 bits instead of 16. Fewer bits fit longer chats. Tokens per second, wllama.", KV_SERIES,
        memoryRows(rows, youKeys), (host, data) => dotPlot(host, data, KV_SERIES, { unit: "tok/s", title: `Writing speed by memory format, ${name}` }),
        { text: `No ${name} runs of the Full test yet. It runs wllama with 16, 8 and 4-bit memory.`, action: "Set up the Full test", prep: { pack: "full" } }),
      contextFigure(ctx, youKeys, name),
      memoryFigure());
    drawTable(rows, youKeys);
    const sRows = speechRows(all());
    speechFigs.replaceChildren(...speechFigures(sRows, youKeys));
    drawSpeechTable(sRows, youKeys);
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

  // Speech does not depend on the model tabs: one voice model and one listening model.
  function speechFigures(rows: SpeechRow[], you: Set<string>) {
    const make = (task: "speak" | "listen", title: string, sub: string) => {
      const by = new Map<string, DotRow>();
      const chosen = task === "speak" ? speakModel : listenModel;
      for (const r of rows.filter((x) => x.task === task && x.model === chosen)) {
        const row = by.get(r.dkey) ?? { id: r.dkey, label: r.device, you: you.has(r.dkey), values: [] };
        const extra = task === "speak"
          ? `${r.firstAudioMs ? `, first sentence in ${r.firstAudioMs < 1000 ? `${Math.round(r.firstAudioMs)} ms` : `${(r.firstAudioMs / 1000).toFixed(1)} s`}` : ""}${r.garbled ? ". Audio check failed: garbled" : ""}`
          : r.wordErrors !== null ? `, ${Math.round(r.wordErrors * 100)}% of words missed` : "";
        row.values.push({ series: r.backend, value: r.realTime, detail: `${r.realTime >= 10 ? Math.round(r.realTime) : r.realTime.toFixed(1)}× real time${extra}, ${r.runs} ${r.runs === 1 ? "run" : "runs"}` });
        by.set(r.dkey, row);
      }
      const data = [...by.values()].sort((a, b) => Math.max(...b.values.map((v) => v.value)) - Math.max(...a.values.map((v) => v.value)));
      const host = h("div", { class: "plot" });
      // Picks this chart's model in the test card and takes you there; Start stays the only button that runs.
      const button = h("button", { class: "btn outline", type: "button" }, `Try ${speechModel(chosen)?.name ?? chosen} on this device`);
      button.addEventListener("click", () => { speechTester.setModels(speakModel, listenModel); speechTester.prepare(); });
      const fig = h("figure", { class: "fig" },
        h("h2", {}, title), h("p", { class: "sub" }, sub),
        data.length ? h("div", { class: "legend", "aria-hidden": "true" }, SPEECH_SERIES.map((s) => h("span", {}, h("i", { style: `background:${s.color}` }), s.label))) : null,
        data.length ? host : h("div", { class: "empty-plot" }, h("p", {}, `No ${speechModel(chosen)?.name ?? chosen} runs yet. The speech test runs it in this tab on the graphics chip, and the processor if you tick it.`), button));
      if (data.length) requestAnimationFrame(() => cleanups.push(dotPlot(host, data, SPEECH_SERIES, { unit: "× real time", title })));
      return fig;
    };
    return [
      make("speak", `Speaking speed, ${speechModel(speakModel)!.name}`, "How fast each device turns text into a voice, as a multiple of real time: 10× makes ten seconds of speech in one second. Dots over 1× can talk live."),
      make("listen", `Listening speed, ${speechModel(listenModel)!.name}`, "How fast each device writes down eleven seconds of recorded speech, as a multiple of real time."),
    ];
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

  type Empty = { text: string; action: string; prep: { pack?: "quick" | "full"; probe?: boolean } };
  function emptyBox(e: Empty) {
    const b = h("button", { class: "btn outline", type: "button" }, e.action);
    b.addEventListener("click", () => tester.prepare(e.prep));
    return h("div", { class: "empty-plot" }, h("p", {}, e.text), b);
  }

  function figure(title: string, sub: string, series: Series[], data: DotRow[], draw: (host: HTMLElement, data: DotRow[]) => () => void, empty: Empty) {
    const host = h("div", { class: "plot" });
    const fig = h("figure", { class: "fig" },
      h("h2", {}, title), h("p", { class: "sub" }, sub),
      data.length ? h("div", { class: "legend", "aria-hidden": "true" }, series.map((s) => h("span", {}, h("i", { style: `background:${s.color}` }), s.label))) : null,
      data.length ? host : emptyBox(empty));
    if (data.length) requestAnimationFrame(() => cleanups.push(draw(host, data)));
    return fig;
  }

  function contextFigure(rows: ContextRow[], you: Set<string>, name: string) {
    const host = h("div", { class: "plot" });
    const data = rows.map((r) => ({ id: r.dkey, label: r.device, you: you.has(r.dkey), value: r.largestOk,
      detail: r.largestOk ? `${r.largestOk.toLocaleString("en-US")} tokens loaded` : "Not even 4,096 tokens loaded" }));
    const fig = h("figure", { class: "fig" },
      h("h2", {}, "Longest conversation that loaded"),
      h("p", { class: "sub" }, "The longest chat each device's memory could hold. Tokens, WebLLM."),
      data.length ? host : emptyBox({ text: `No ${name} runs with the conversation check yet. It loads the model with room for 4,096 up to 32,768 tokens.`, action: "Set up the conversation check", prep: { probe: true } }));
    if (data.length) requestAnimationFrame(() => cleanups.push(barChart(host, data, { unit: "tokens", title: `Longest conversation, ${name}`, color: "var(--webllm)" })));
    return fig;
  }

  // Every speech result, all models: one row per device, model and chip.
  function drawSpeechTable(rows: ReturnType<typeof speechRows>, you: Set<string>) {
    const fx = (x: number) => (x >= 10 ? String(Math.round(x)) : x.toFixed(1));
    const sorted = [...rows].sort((a, b) => a.task.localeCompare(b.task) || b.realTime - a.realTime);
    speechTable.replaceChildren(
      h("h2", { id: "sres-h" }, "Every speech result"),
      h("p", { class: "sub", hidden: !rows.some((r) => you.has(r.dkey)) }, "Yellow rows are your own runs, not yet shared."),
      rows.length ? h("div", { class: "tbl-wrap", tabindex: 0, "aria-label": "Speech results table" },
        h("table", { class: "tbl" },
          h("thead", {}, h("tr", {}, ...["Device", "Model", "Chip", "× real time", "First sentence", "Words missed", "Runs"].map((x, i) => h("th", { scope: "col", class: i >= 3 ? "r" : undefined }, x)))),
          h("tbody", {}, sorted.map((r) => h("tr", { class: you.has(r.dkey) ? "you" : undefined },
            h("td", {}, r.device),
            h("td", {}, `${speechModel(r.model)?.name ?? r.model} (${r.task === "speak" ? "voice" : "listening"})`),
            h("td", { class: "eng" }, h("span", { class: "key", style: `background:var(--${r.backend === "webgpu" ? "gpu" : "cpu"})` }), r.backend === "webgpu" ? "Graphics chip" : "Processor"),
            h("td", { class: "r num" }, fx(r.realTime)),
            h("td", { class: "r num" }, r.firstAudioMs ? (r.firstAudioMs < 1000 ? `${Math.round(r.firstAudioMs)} ms` : `${(r.firstAudioMs / 1000).toFixed(1)} s`) : "—"),
            h("td", { class: "r num" }, r.wordErrors === null ? "—" : `${Math.round(r.wordErrors * 100)}%${r.garbled ? " (garbled)" : ""}`),
            h("td", { class: "r num" }, r.runs))))))
        : h("p", { class: "empty-plot" }, "No speech results yet. Run the speech test to add the first row."));
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
      h("p", { class: "sub", hidden: !rows.some((r) => you.has(r.dkey)) }, "Yellow rows are your own runs, not yet shared."),
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
      h("li", {}, h("b", {}, "Speech test. "), "The voice model you pick reads three sentences, about ten seconds of speech, after one untimed warm-up. The listening model you pick transcribes an eleven-second recording (President Kennedy, 1961, public domain). Every model is open and runs through transformers.js, on the graphics chip and, if you tick it, the processor. The processor runs single-threaded, as on most published sites. Speed is × real time: seconds of audio per second of work."),
      h("li", {}, h("b", {}, "Audio check. "), "The listening model also transcribes the voice the speaking model made. If it misses more than 30% of the words, the voice is marked garbled. Some graphics chips silently produce broken audio; this catches it."),
      h("li", {}, h("b", {}, "Shared only if you choose. "), "The record holds device type, OS, browser, graphics chip, the name you typed and the speeds. No name, IP address or prompt."),
      h("li", {}, h("b", {}, "Open data. "), "Every result is in ", h("code", {}, "public/data/results.json"), ". MIT licence.")));
}
