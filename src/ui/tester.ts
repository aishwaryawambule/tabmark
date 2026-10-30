// "Test your device": the sidebar card. Runs the plan, shows each step with a live
// writing-speed trace, then the readout and the share actions. Every finished run is
// handed to onResult so the charts can show it as "You".

import { describeDevice, readBrowser, type Device } from "../core/device";
import { answerSentence, engineName, fmtSpeed, kvName } from "../core/format";
import { CONTEXT_WINDOWS, DEFAULT_MODEL, MODELS, downloadMB, modelById, planFor, type Pack, type PlannedTest } from "../core/plan";
import { issueUrl, newResultId, validateResult, type ContextResult, type Result, type TestResult } from "../core/result";
import { rollingRates, tracePath } from "../core/trace";
import type { Hooks } from "../engines/types";
import { h, svg } from "./dom";

const REPO = (import.meta.env.VITE_RESULTS_REPO as string | undefined) ?? "";
const PHONE_LIMIT_MB = 900;
const TRACE = { width: 64, height: 22 };

interface Step { test: PlannedTest; li: HTMLLIElement; st: HTMLElement; sp: HTMLElement; bar: HTMLElement }

export function renderTester(root: HTMLElement, onResult: (r: Result) => void, onModel: (id: string) => void) {
  let device: Device | null = null;
  let shaderF16 = false;
  let pack: Pack = "quick";
  let modelId = DEFAULT_MODEL;
  let running = false;

  const card = h("section", { class: "card", "aria-labelledby": "test-h" });
  root.append(card);

  const models = h("fieldset", {}, h("legend", {}, "Model"));
  for (const m of MODELS) {
    const input = h("input", { type: "radio", name: "model", value: m.id, checked: m.id === modelId });
    input.addEventListener("change", () => { modelId = m.id; onModel(m.id); draw(); });
    const biggest = Math.max(...MODELS.map((x) => x.webllm.mb));
    models.append(h("label", { class: "opt" }, input,
      h("span", {}, m.name, h("small", {}, m.note), h("span", { class: "size", "aria-hidden": "true" }, h("i", { style: `width:${(m.webllm.mb / biggest) * 100}%` }))),
      h("span", { class: "mb" }, `${m.webllm.mb.toLocaleString("en-US")} MB`)));
  }
  const warn = h("p", { class: "warn", hidden: true });
  const packs = h("fieldset", {}, h("legend", {}, "Test"));
  const packOpt = (value: Pack, title: string, what: string) => {
    const input = h("input", { type: "radio", name: "pack", value, checked: value === pack });
    input.addEventListener("change", () => { pack = value; draw(); });
    const mb = h("span", { class: "mb" });
    mb.dataset.pack = value;
    return h("label", { class: "opt" }, input, h("span", {}, title, h("small", {}, what)), mb);
  };
  packs.append(
    packOpt("quick", "Quick", "WebLLM, 16-bit memory"),
    packOpt("full", "Full", "Adds wllama at 16, 8 and 4-bit memory"),
  );
  const probe = h("input", { type: "checkbox", id: "probe" });
  const nameField = h("input", { class: "field", id: "device-name", maxlength: 60, autocomplete: "off", placeholder: "For example Pixel 8 or MacBook Air M2" });
  const start = h("button", { class: "btn primary block", type: "button", disabled: true }, "Start the test");
  const startNote = h("p", { class: "note" });
  const steps = h("ol", { class: "steps", hidden: true, "aria-label": "Test steps" });
  const after = h("div");
  const facts = h("dl");

  card.append(
    h("h2", { id: "test-h" }, "Test your device"),
    h("p", { class: "intro" }, "Runs in this tab. Nothing is sent unless you share it."),
    models, warn, packs,
    h("label", { class: "chk", for: "probe" }, probe, h("span", {}, "Also find the longest conversation it can hold (loads the model up to four more times; a phone tab may close)")),
    h("label", { class: "field-l", for: "device-name" }, "Device name, optional"),
    nameField,
    start, startNote, steps, after,
    h("details", { class: "dev" }, h("summary", {}, "What this browser reports"), facts));

  function draw() {
    const plan = planFor(pack, { shaderF16 }, modelId);
    for (const el of packs.querySelectorAll<HTMLElement>(".mb")) {
      el.textContent = `${downloadMB(planFor(el.dataset.pack as Pack, { shaderF16 }, modelId)).toLocaleString("en-US")} MB`;
    }
    const m = modelById(modelId);
    const big = device && device.kind !== "computer" && m.webllm.mb > PHONE_LIMIT_MB;
    warn.hidden = !big;
    warn.textContent = big ? `${m.name} is large for a ${device!.kind}. The tab may close if memory runs out.` : "";
    startNote.textContent = `Downloads ${downloadMB(plan).toLocaleString("en-US")} MB the first time; later runs use the saved copy.`;
  }

  function stepFor(test: PlannedTest, title?: string): Step {
    const st = h("span", { class: "st" }, "Waiting");
    const sp = h("span", { class: "sp" });
    const bar = h("span", { class: "bar", hidden: true }, h("i"));
    const li = h("li", {}, h("span", { class: "nm" }, title ?? `${engineName(test.engine)}, ${kvName(test.kv)}`), st, sp, bar);
    return { test, li, st, sp, bar };
  }

  function hooks(step: Step): Hooks {
    const arrivals: number[] = [];
    const path = svg("path", { d: "" });
    const live = h("b", {});
    let started = false;
    return {
      status(text, fraction) {
        step.st.textContent = text.length > 46 ? `${text.slice(0, 43)}...` : text;
        if (fraction !== undefined) {
          step.bar.hidden = false;
          (step.bar.firstElementChild as HTMLElement).style.width = `${Math.round(fraction * 100)}%`;
        }
      },
      token(at) {
        if (!started) {
          started = true;
          step.bar.hidden = true;
          step.st.textContent = "Writing";
          step.sp.replaceChildren(svg("svg", { class: "trace", viewBox: `0 0 ${TRACE.width} ${TRACE.height}`, "aria-hidden": "true" }, path), live, h("em", {}, "tok/s"));
        }
        arrivals.push(at);
        const rates = rollingRates(arrivals, 8);
        if (!rates.length) return;
        path.setAttribute("d", tracePath(rates, { ...TRACE, max: Math.max(...rates) * 1.15 }));
        live.textContent = fmtSpeed(rates[rates.length - 1]);
      },
    };
  }

  const setState = (s: Step, state: string, text: string) => {
    s.li.className = state;
    s.st.textContent = text;
  };

  async function run() {
    if (!device || running) return;
    running = true;
    start.disabled = true;
    for (const el of card.querySelectorAll<HTMLInputElement>("input")) el.disabled = true;
    after.replaceChildren();
    const plan = planFor(pack, { shaderF16 }, modelId);
    const list = plan.map((t) => stepFor(t));
    steps.replaceChildren(...list.map((s) => s.li));
    steps.hidden = false;

    const [{ runWebllm, probeContext }, { runWllama }] = await Promise.all([import("../engines/webllm"), import("../engines/wllama")]);
    const results: TestResult[] = [];
    for (const s of list) {
      setState(s, "running", "Starting");
      const r = await (s.test.engine === "webllm" ? runWebllm : runWllama)(s.test, hooks(s));
      results.push(r);
      s.bar.hidden = true;
      if (r.status === "ok") {
        setState(s, "done", `Reading ${fmtSpeed(r.prefillTps ?? 0)} tok/s`);
        s.sp.replaceChildren(h("b", {}, fmtSpeed(r.decodeTps!)), h("em", {}, "tok/s"));
      } else {
        setState(s, "failed", r.error ?? "Failed");
        s.sp.replaceChildren();
      }
    }
    let context: ContextResult | undefined;
    if (probe.checked) {
      const s = stepFor(plan[0], "Longest conversation");
      steps.append(s.li);
      setState(s, "running", "Starting");
      context = await probeContext(plan[0], CONTEXT_WINDOWS, hooks(s));
      s.bar.hidden = true;
      setState(s, context.largestOk ? "done" : "failed", context.firstFailed ? `${context.firstFailed.toLocaleString("en-US")} did not fit` : "Every size fit");
      s.sp.replaceChildren(h("b", {}, (context.largestOk ?? 0).toLocaleString("en-US")), h("em", {}, "tokens"));
    }
    finish(results, context);
    running = false;
    for (const el of card.querySelectorAll<HTMLInputElement>("input")) el.disabled = false;
    start.disabled = false;
    start.textContent = "Run again";
    start.className = "btn outline block";
  }

  function finish(tests: TestResult[], context?: ContextResult) {
    const clean = nameField.value.replace(/[^\p{L}\p{N} .,:;()_+\-/'#@&]/gu, "").trim().slice(0, 60);
    const named: Device = { ...device!, model: clean || device!.model };
    const result: Result = { v: 1, id: newResultId(), createdAt: new Date().toISOString(), app: __APP_VERSION__, device: named, tests, ...(context ? { context } : {}) };
    (window as unknown as { __TABMARK_RESULT__: Result }).__TABMARK_RESULT__ = result; // read by scripts/e2e.mjs
    onResult(result);

    const ok = tests.filter((t) => t.status === "ok" && t.decodeTps);
    const best = ok.length ? Math.max(...ok.map((t) => t.decodeTps!)) : null;
    const canShare = !!REPO && ok.length > 0 && validateResult(result).length === 0;
    const share = h("button", { class: "btn primary", type: "button", disabled: !canShare }, "Add to public results");
    const copy = h("button", { class: "btn outline", type: "button" }, "Copy result");
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2)).catch(() => {});
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy result"), 1600);
    });
    const why = !REPO ? "Sharing opens once this site is published with a results repository." : ok.length ? "" : "Only runs with a finished test can be shared.";
    share.addEventListener("click", () => {
      share.parentElement!.replaceWith(h("div", { class: "review" },
        h("p", {}, h("b", {}, "This is everything that gets shared. "), "No name, account or IP address; GitHub shows your username on the issue you open."),
        h("pre", {}, JSON.stringify(result, null, 2)),
        h("a", { class: "btn primary block", href: issueUrl(REPO, result), target: "_blank", rel: "noopener" }, "Open GitHub to submit"),
        h("p", { class: "note" }, "A check adds it to the charts within a few minutes.")));
    });
    after.replaceChildren(h("div", { class: "readout", role: "status" },
      best ? h("div", {}, h("span", { class: "big" }, fmtSpeed(best)), " ", h("span", { class: "u" }, "tokens a second")) : null,
      h("p", {}, answerSentence(named, tests)),
      h("div", { class: "row2" }, share, copy),
      why ? h("p", { class: "note" }, why) : null));
  }

  start.addEventListener("click", run);

  (async () => {
    device = describeDevice(await readBrowser());
    const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
    shaderF16 = !!adapter?.features.has("shader-f16");
    if (device.model) nameField.value = device.model;
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    facts.append(
      h("dt", {}, "Device"), h("dd", {}, `${device.os} ${device.kind}`),
      h("dt", {}, "Browser"), h("dd", {}, `${device.browser} ${device.browserVersion}`),
      h("dt", {}, "Graphics"), h("dd", {}, device.gpuDescription || [cap(device.gpuVendor), device.gpuArchitecture].filter(Boolean).join(", ") || "Not reported"),
      h("dt", {}, "Memory"), h("dd", {}, device.memoryGB ? `${device.memoryGB} GB or more (browsers round and cap this)` : "Not reported"),
      h("dt", {}, "WebGPU"), h("dd", {}, adapter ? (shaderF16 ? "Yes, with 16-bit shaders" : "Yes") : "No"));
    if (!adapter) {
      start.replaceWith(h("p", { class: "warn" }, "This browser cannot run the test: it needs WebGPU (recent Chrome or Edge, Safari 26 and later, or Firefox on Windows). The charts still work."));
      return;
    }
    draw();
    start.disabled = false;
  })();

  return {
    setModel(id: string) {
      const input = models.querySelector<HTMLInputElement>(`input[value="${id}"]`);
      if (input && !running) { input.checked = true; modelId = id; draw(); }
    },
    // Ticks the options a chart needs, then brings the card into view with Start focused.
    prepare(opts: { pack?: Pack; probe?: boolean }) {
      if (running) return;
      if (opts.pack) {
        pack = opts.pack;
        packs.querySelector<HTMLInputElement>(`input[value="${opts.pack}"]`)!.checked = true;
      }
      if (opts.probe) probe.checked = true;
      draw();
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      start.focus({ preventScroll: true });
    },
  };
}
