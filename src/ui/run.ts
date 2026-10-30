// The Run screen. The plan table is the page: each row runs in turn, the running row
// draws its writing speed as tokens arrive, and the answer is written above the table.

import { describeDevice, readBrowser, type Device } from "../core/device";
import { answerSentence, deviceName, engineName, fmtSpeed, kvName } from "../core/format";
import { CONTEXT_WINDOWS, downloadMB, planFor, type Pack, type PlannedTest } from "../core/plan";
import { issueUrl, newResultId, validateResult, type ContextResult, type Result, type TestResult } from "../core/result";
import { rollingRates, tracePath } from "../core/trace";
import type { Hooks } from "../engines/types";
import { h, svg } from "./dom";

const REPO = (import.meta.env.VITE_RESULTS_REPO as string | undefined) ?? "";
const MINUTES: Record<Pack, string> = { quick: "about a minute", full: "about 4 minutes" };
const TRACE = { width: 120, height: 28 };

interface Row { test: PlannedTest; tr: HTMLTableRowElement; sub: HTMLElement; bar: HTMLElement; reading: HTMLElement; writing: HTMLElement; status: HTMLElement }

export function renderRun(root: HTMLElement) {
  const page = h("div", { class: "page pass stack" });
  root.append(page);

  const head = h("div", { class: "stack" },
    h("h1", {}, "How fast does AI run in this tab?"),
    h("p", { class: "lead" },
      "Tabmark downloads a small language model, Qwen3 0.6B, into this tab and times it on this device's graphics chip. ",
      "Nothing leaves the tab unless you choose to share the result."));
  const answerSlot = h("div", { class: "stack", hidden: true });
  page.append(head, answerSlot);

  const facts = h("dl", { class: "facts" });
  const nameField = h("input", { class: "field", id: "device-name", maxlength: 60, autocomplete: "off", placeholder: "For example Pixel 8 or MacBook Air M2" });
  const deviceBlock = h("section", { class: "section stack", "aria-labelledby": "device-h" },
    h("h2", { id: "device-h" }, "This device"), facts);

  const packs = h("fieldset", { class: "choice" }, h("legend", {}, "What to run"));
  const contextBox = h("input", { type: "checkbox", id: "probe" });
  const startBtn = h("button", { class: "btn primary", type: "button", disabled: true }, "Start the test");
  const startNote = h("span", { class: "note" });
  const tableSlot = h("div");
  const afterSlot = h("div", { class: "stack" });
  const setup = h("section", { class: "section stack", "aria-labelledby": "plan-h" },
    h("h2", { id: "plan-h" }, "The test"), packs,
    h("label", { class: "check", for: "probe" }, contextBox,
      h("span", {}, "Also find the longest conversation this device can hold. It loads the model up to four more times, and on a phone it can close the tab if memory runs out.")),
    h("div", { class: "actions" }, startBtn, startNote),
    tableSlot, afterSlot);
  page.append(setup, deviceBlock);

  let device: Device | null = null;
  let shaderF16 = false;
  let pack: Pack = "quick";
  let rows: Row[] = [];
  let running = false;

  const packOption = (value: Pack, title: string, what: string) => {
    const input = h("input", { type: "radio", name: "pack", value, checked: value === pack });
    input.addEventListener("change", () => { pack = value; drawPlan(); });
    const cost = h("span", { class: "cost num" });
    cost.dataset.pack = value;
    return h("label", { class: "option" }, input, h("span", {}, h("strong", {}, title), h("span", { class: "what" }, what)), cost);
  };
  packs.append(
    packOption("quick", "Quick", "WebLLM with 16-bit memory. One download, one result."),
    packOption("full", "Full", "WebLLM, then wllama with 16-bit, 8-bit and 4-bit memory, on the same model."),
  );

  function drawPlan() {
    const plan = planFor(pack, { shaderF16 });
    for (const el of packs.querySelectorAll<HTMLElement>(".cost")) {
      const p = el.dataset.pack as Pack;
      el.textContent = `${downloadMB(planFor(p, { shaderF16 }))} MB, ${MINUTES[p]}`;
    }
    startNote.textContent = `Downloads ${downloadMB(plan)} MB the first time. Later runs use the copy in this browser.`;
    rows = plan.map(planRow);
    const table = h("table", { class: "plan", "aria-labelledby": "rows-h" },
      h("thead", {}, h("tr", {},
        h("th", { scope: "col" }, "Engine"), h("th", { scope: "col" }, "Memory"),
        h("th", { scope: "col", class: "r" }, "Reading"), h("th", { scope: "col", class: "r" }, "Writing"),
        h("th", { scope: "col", class: "r" }, "Status"))),
      h("tbody", {}, rows.map((r) => r.tr)));
    tableSlot.replaceChildren(h("h3", { id: "rows-h", style: "margin-bottom:8px" }, "Each row runs in turn"), table);
  }

  function planRow(test: PlannedTest): Row {
    const sub = h("span", { class: "sub" }, test.engine === "webllm" ? `${test.model}, ${test.weights}` : `${test.model}, ${test.weights} GGUF`);
    const bar = h("span", { class: "bar", hidden: true }, h("i"));
    const reading = h("td", { class: "r reading num" }, h("span", { class: "wait" }, "Waiting"));
    const writing = h("td", { class: "r writing num" }, h("span", { class: "wait" }, "Waiting"));
    const status = h("td", { class: "r status" }, h("span", { class: "state waiting" }, "Waiting"));
    const tr = h("tr", { "data-state": "waiting" },
      h("td", { class: "eng-cell" }, h("span", { class: "eng" }, engineName(test.engine)), sub, bar),
      h("td", { class: "mem" }, kvName(test.kv)), reading, writing, status);
    return { test, tr, sub, bar, reading, writing, status };
  }

  const setState = (row: Row, state: "waiting" | "running" | "done" | "failed", label: string) => {
    row.tr.dataset.state = state;
    row.status.replaceChildren(h("span", { class: `state ${state}` }, label));
  };

  const speedCell = (tps: number | undefined) =>
    tps ? [h("span", { class: "speed" }, fmtSpeed(tps)), h("span", { class: "unit" }, "tok/s")] : [h("span", { class: "wait" }, "Not reported")];

  function hooksFor(row: Row): Hooks {
    const arrivals: number[] = [];
    const path = svg("path", { d: "" });
    const live = h("span", { class: "speed" }, "");
    const trace = svg("svg", { class: "trace", viewBox: `0 0 ${TRACE.width} ${TRACE.height}`, "aria-hidden": "true" },
      svg("line", { x1: 0, y1: TRACE.height - 0.5, x2: TRACE.width, y2: TRACE.height - 0.5 }), path);
    let started = false;
    return {
      status(text, fraction) {
        row.sub.textContent = text.length > 70 ? `${text.slice(0, 67)}...` : text;
        if (fraction !== undefined) {
          row.bar.hidden = false;
          (row.bar.firstElementChild as HTMLElement).style.width = `${Math.round(fraction * 100)}%`;
        }
      },
      token(at) {
        if (!started) {
          started = true;
          row.bar.hidden = true;
          row.sub.textContent = "Writing";
          row.writing.replaceChildren(h("span", { class: "live" }, trace, h("span", {}, live, h("span", { class: "unit" }, "tok/s"))));
        }
        arrivals.push(at);
        const rates = rollingRates(arrivals, 8);
        if (!rates.length) return;
        const max = Math.max(...rates) * 1.15;
        path.setAttribute("d", tracePath(rates, { ...TRACE, max }));
        live.textContent = fmtSpeed(rates[rates.length - 1]);
      },
    };
  }

  async function run() {
    if (!device || running) return;
    running = true;
    startBtn.disabled = true;
    for (const el of setup.querySelectorAll<HTMLInputElement>("input")) el.disabled = true;
    nameField.disabled = true;
    answerSlot.hidden = true;
    afterSlot.replaceChildren();
    drawPlan();

    const [{ runWebllm, probeContext }, { runWllama }] = await Promise.all([import("../engines/webllm"), import("../engines/wllama")]);
    const results: TestResult[] = [];
    for (const row of rows) {
      setState(row, "running", "Running");
      row.reading.replaceChildren(h("span", { class: "wait" }, "Measuring"));
      row.writing.replaceChildren(h("span", { class: "wait" }, "Loading"));
      row.tr.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const fn = row.test.engine === "webllm" ? runWebllm : runWllama;
      const r = await fn(row.test, hooksFor(row));
      results.push(r);
      row.bar.hidden = true;
      if (r.status === "ok") {
        row.sub.textContent = row.test.engine === "webllm" ? `${row.test.model}, ${row.test.weights}` : `${row.test.model}, ${row.test.weights} GGUF`;
        row.reading.replaceChildren(...speedCell(r.prefillTps));
        row.writing.replaceChildren(...speedCell(r.decodeTps));
        setState(row, "done", "Done");
      } else {
        row.sub.replaceChildren(h("span", { class: "err" }, r.error ?? "Failed"));
        row.reading.replaceChildren(h("span", { class: "wait" }, "None"));
        row.writing.replaceChildren(h("span", { class: "wait" }, "None"));
        setState(row, "failed", "Failed");
      }
    }

    let context: ContextResult | undefined;
    if (contextBox.checked) {
      const test = rows[0].test;
      const row = planRow(test);
      row.tr.querySelector(".eng")!.textContent = "Longest conversation";
      row.tr.querySelector(".mem")!.textContent = `${engineName(test.engine)}, ${kvName(test.kv)}`;
      tableSlot.querySelector("tbody")!.append(row.tr);
      setState(row, "running", "Running");
      row.reading.replaceChildren(h("span", { class: "wait" }, ""));
      row.writing.replaceChildren(h("span", { class: "wait" }, "Loading"));
      context = await probeContext(test, CONTEXT_WINDOWS, hooksFor(row));
      row.bar.hidden = true;
      row.sub.textContent = context.firstFailed
        ? `${context.firstFailed.toLocaleString("en-US")} tokens did not fit`
        : `Every size up to ${CONTEXT_WINDOWS.at(-1)!.toLocaleString("en-US")} tokens fit`;
      row.writing.replaceChildren(context.largestOk
        ? h("span", {}, h("span", { class: "speed" }, context.largestOk.toLocaleString("en-US")), h("span", { class: "unit" }, "tokens"))
        : h("span", { class: "wait" }, "None fit"));
      setState(row, context.largestOk ? "done" : "failed", context.largestOk ? "Done" : "Failed");
    }

    finish(results, context);
    running = false;
    nameField.disabled = false;
    for (const el of setup.querySelectorAll<HTMLInputElement>("input")) el.disabled = false;
    startBtn.disabled = false;
    startBtn.textContent = "Run again";
  }

  function finish(tests: TestResult[], context?: ContextResult) {
    const named: Device = { ...device!, model: clean(nameField.value) || device!.model };
    const result: Result = {
      v: 1, id: newResultId(), createdAt: new Date().toISOString(), app: __APP_VERSION__, device: named, tests,
      ...(context ? { context } : {}),
    };
    const ctx = context?.largestOk ? ` It held a conversation of ${context.largestOk.toLocaleString("en-US")} tokens.` : "";
    const ok = tests.filter((t) => t.status === "ok" && t.decodeTps);
    const best = ok.length ? Math.max(...ok.map((t) => t.decodeTps!)) : null;
    answerSlot.replaceChildren(
      ...(best ? [h("div", { class: "readout", "aria-hidden": "true" }, h("span", { class: "big" }, fmtSpeed(best)), h("span", { class: "u" }, "tokens a second"))] : []),
      h("p", { class: "answer", role: "status" }, answerSentence(named, tests)),
      h("p", { class: "answer-sub" }, `Qwen3 0.6B, ${named.browser} ${named.browser === "Unknown" ? "" : named.browserVersion}. Writing is how fast it produces new text; reading is how fast it takes in your prompt.${ctx}`.replace("  ", " ")));
    answerSlot.hidden = false;
    head.hidden = true;
    window.scrollTo({ top: 0, behavior: "smooth" });

    (window as unknown as { __TABMARK_RESULT__: Result }).__TABMARK_RESULT__ = result; // read by scripts/e2e.mjs
    const problems = validateResult(result);
    const copyBtn = h("button", { class: "btn outline", type: "button" }, "Copy result");
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2)).catch(() => {});
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy result"), 1600);
    });
    const shareBtn = h("button", { class: "btn primary", type: "button", disabled: !REPO || problems.length > 0 || !tests.some((t) => t.status === "ok") }, "Add to public results");
    const why = !REPO ? "Sharing opens once this site is published with a results repository."
      : !tests.some((t) => t.status === "ok") ? "Only runs with at least one finished test can be shared." : "";
    const actions = h("div", { class: "actions" }, shareBtn, copyBtn, why ? h("span", { class: "note" }, why) : null);
    shareBtn.addEventListener("click", () => {
      shareBtn.remove();
      afterSlot.append(review(result));
    });
    afterSlot.replaceChildren(actions);
  }

  function review(result: Result) {
    return h("div", { class: "review stack" },
      h("h3", {}, "This is everything that gets shared"),
      h("p", { class: "muted" }, "The result holds no name, account details or IP address. The device name is what you typed, if anything. GitHub shows your username on the issue you open."),
      h("pre", {}, JSON.stringify(result, null, 2)),
      h("div", { class: "actions" },
        h("a", { class: "btn primary", href: issueUrl(REPO, result), target: "_blank", rel: "noopener" }, "Open GitHub to submit"),
        h("span", { class: "note" }, "A check adds it to the table within a few minutes.")));
  }

  const clean = (s: string) => s.replace(/[^\p{L}\p{N} .,:;()_+\-/'#@&]/gu, "").trim().slice(0, 60);

  startBtn.addEventListener("click", run);

  (async () => {
    const input = await readBrowser();
    device = describeDevice(input);
    const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
    shaderF16 = !!adapter?.features.has("shader-f16");
    if (device.model) nameField.value = device.model;
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    const gpuText = device.gpuDescription || [cap(device.gpuVendor), device.gpuArchitecture].filter(Boolean).join(", ") || "Not reported";
    facts.append(
      h("dt", {}, h("label", { for: "device-name" }, "Name")),
      h("dd", {}, nameField, h("p", { class: "hint" }, "Browsers rarely say which model a device is. Add it so others can find it in the results.")),
      h("dt", {}, "Device"), h("dd", {}, deviceName({ ...device, model: "" }).replace(/^This /, "")),
      h("dt", {}, "Browser"), h("dd", {}, `${device.browser} ${device.browserVersion}`),
      h("dt", {}, "Graphics"), h("dd", {}, gpuText),
      h("dt", {}, "WebGPU"), h("dd", {}, adapter ? (shaderF16 ? "Yes, with 16-bit shaders" : "Yes, without 16-bit shaders") : "No"));
    if (!adapter) {
      setup.replaceChildren(h("div", { class: "notice bad" },
        h("strong", {}, "This browser cannot run the test. "),
        "It needs WebGPU, which is in recent Chrome and Edge, Safari 26 and later, and Firefox on Windows. ",
        "You can still browse the ", h("a", { href: "#/results" }, "results"), " from other devices."));
      return;
    }
    drawPlan();
    startBtn.disabled = false;
  })();
}
