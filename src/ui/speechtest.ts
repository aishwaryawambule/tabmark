// "Test speaking and listening": the second sidebar card. Speaks a short passage with
// Kokoro, listens with Whisper, on the graphics chip and optionally the processor, checks
// the voice came out as words, and lets you hear it.

import { describeDevice, readBrowser, type Device } from "../core/device";
import { newResultId, type Result, type SpeechResult } from "../core/result";
import { DEFAULT_LISTEN, DEFAULT_SPEAK, GARBLED, listeners, speakers, speechDownloadMB, speechModel, speechPlan, type SpeechModel, type SpeechStep } from "../core/speech";
import type { Hooks } from "../engines/types";
import { h } from "./dom";
import { shareActions } from "./share";

const BACKEND = { webgpu: "graphics chip", wasm: "processor" } as const;
const TASK = { speak: "Speaking", listen: "Listening" } as const;
const fmtX = (x: number) => (x >= 10 ? Math.round(x).toString() : x.toFixed(1));
const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
// Below 1× the work takes longer than the audio lasts: say so plainly.
const pace = (x: number) => (x >= 1 ? `${fmtX(x)} times faster than real time.` : `slower than real time: ten seconds of audio take about ${Math.round(10 / x)} seconds.`);

export function renderSpeechTester(root: HTMLElement, onResult: (r: Result) => void, onModels: (speak: string, listen: string) => void) {
  let device: Device | null = null;
  let running = false;
  let gpu = false;
  let speakId = DEFAULT_SPEAK, listenId = DEFAULT_LISTEN;
  const planNow = () => speechPlan(speakId, listenId, cpu.checked, gpu);
  const card = h("section", { class: "card", id: "speech-test", "aria-labelledby": "speech-h" });
  root.append(card);

  const cpu = h("input", { type: "checkbox", id: "speech-cpu", checked: true });
  const start = h("button", { class: "btn primary block", type: "button", disabled: true }, "Start the speech test");
  const note = h("p", { class: "note" });
  const steps = h("ol", { class: "steps", hidden: true, "aria-label": "Speech test steps" });
  const after = h("div");
  // Two pickers: one voice model and one listening model, all open, all run in this tab.
  const picker = (legend: string, name: string, list: SpeechModel[], current: () => string, set: (id: string) => void) => {
    const fs = h("fieldset", {}, h("legend", {}, legend));
    const biggest = Math.max(...list.map((m) => m.gpu.mb));
    for (const m of list) {
      const input = h("input", { type: "radio", name, value: m.id, checked: m.id === current() });
      input.addEventListener("change", () => { set(m.id); onModels(speakId, listenId); draw(); });
      fs.append(h("label", { class: "opt" }, input,
        h("span", {}, m.name, h("small", {}, `${m.note} ${m.licence}.`), h("span", { class: "size", "aria-hidden": "true" }, h("i", { style: `width:${(m.gpu.mb / biggest) * 100}%` }))),
        h("span", { class: "mb" }, `${m.gpu.mb.toLocaleString("en-US")} MB`)));
    }
    return fs;
  };
  const speakPick = picker("Voice model", "speak-model", speakers(), () => speakId, (id) => (speakId = id));
  const listenPick = picker("Listening model", "listen-model", listeners(), () => listenId, (id) => (listenId = id));
  card.append(
    h("h2", { id: "speech-h" }, "Test speaking and listening"),
    h("p", { class: "intro" }, "A voice model reads a short passage aloud and a listening model writes down what it hears, both in this tab. Then the listener checks the voice, so broken audio shows up."),
    speakPick, listenPick,
    h("label", { class: "chk", for: "speech-cpu" }, cpu, h("span", {}, "Also run them on the processor, to compare with the graphics chip (skipped for models too big for it)")),
    start, note, steps, after);

  const draw = () => (note.textContent = `Downloads ${speechDownloadMB(planNow()).toLocaleString("en-US")} MB the first time; later runs use the saved copy.`);
  cpu.addEventListener("change", draw);

  function stepRow(s: SpeechStep) {
    const st = h("span", { class: "st" }, "Waiting"), sp = h("span", { class: "sp" }), bar = h("span", { class: "bar", hidden: true }, h("i"));
    const li = h("li", {}, h("span", { class: "nm" }, `${speechModel(s.model)?.name ?? s.model}, ${BACKEND[s.backend]}`), st, sp, bar);
    const hooks: Hooks = {
      status(text, fraction) {
        st.textContent = text;
        if (fraction !== undefined) { bar.hidden = false; (bar.firstElementChild as HTMLElement).style.width = `${Math.round(fraction * 100)}%`; }
      },
      token() { bar.hidden = true; },
    };
    return { li, st, sp, bar, hooks };
  }

  async function run() {
    if (!device || running) return;
    running = true;
    start.disabled = cpu.disabled = true;
    for (const el of card.querySelectorAll<HTMLInputElement>("input[type=radio]")) el.disabled = true;
    after.replaceChildren();
    const plan = planNow();
    const rows = plan.map(stepRow);
    steps.replaceChildren(...rows.map((r) => r.li));
    steps.hidden = false;

    const eng = await import("../engines/speech");
    const clip = await eng.loadClip();
    const results: SpeechResult[] = [];
    const voices: { at: number; audio16k: Float32Array; audio: Float32Array; rate: number }[] = [];
    for (const [i, s] of plan.entries()) {
      const row = rows[i];
      row.li.className = "running";
      if (s.task === "speak") {
        const out = await eng.runSpeak(s, row.hooks);
        results.push(out.result);
        if (out.audio && out.sampleRate) voices.push({ at: results.length - 1, audio16k: await eng.to16k(out.audio, out.sampleRate), audio: out.audio, rate: out.sampleRate });
      } else {
        // Check the voices that have not been checked yet (those spoken on the same backend).
        const unchecked = voices.filter((v) => results[v.at].wordErrors === undefined && results[v.at].backend === s.backend);
        const out = await eng.runListen(s, row.hooks, clip, unchecked.map((v) => v.audio16k));
        results.push(out.result);
        unchecked.forEach((v, k) => { if (out.voiceErrors[k] !== undefined) results[v.at].wordErrors = out.voiceErrors[k]; });
      }
      const r = results[results.length - 1];
      row.bar.hidden = true;
      row.li.className = r.status === "ok" ? "done" : "failed";
      row.st.textContent = r.status === "ok" ? (r.task === "speak" ? `First sentence in ${fmtMs(r.firstAudioMs!)}` : `Missed ${Math.round((r.wordErrors ?? 0) * 100)}% of words`) : (r.error ?? "Failed");
      row.sp.replaceChildren(...(r.status === "ok" ? [h("b", {}, fmtX(r.realTime!)), h("em", {}, "× real time")] : []));
    }
    finish(results, voices);
    running = false;
    start.disabled = false;
    cpu.disabled = !gpu;
    for (const el of card.querySelectorAll<HTMLInputElement>("input[type=radio]")) el.disabled = false;
    start.textContent = "Run again";
    start.className = "btn outline block";
  }

  function finish(speech: SpeechResult[], voices: { at: number; audio: Float32Array; rate: number }[]) {
    const nameInput = document.getElementById("device-name") as HTMLInputElement | null;
    const clean = (nameInput?.value ?? "").replace(/[^\p{L}\p{N} .,:;()_+\-/'#@&]/gu, "").trim().slice(0, 60);
    const named: Device = { ...device!, model: clean || device!.model };
    const result: Result = { v: 1, id: newResultId(), createdAt: new Date().toISOString(), app: __APP_VERSION__, device: named, tests: [], speech };
    (window as unknown as { __TABMARK_SPEECH__: Result }).__TABMARK_SPEECH__ = result; // read by scripts/e2e-speech.mjs
    onResult(result);

    const ok = speech.filter((s) => s.status === "ok");
    const speakGpu = ok.find((s) => s.task === "speak" && s.backend === "webgpu");
    const lines: string[] = [];
    for (const s of ok) lines.push(`${speechModel(s.model)?.name ?? s.model}, ${TASK[s.task].toLowerCase()} on the ${BACKEND[s.backend]}: ${pace(s.realTime!)}`);
    const checks = ok.filter((s) => s.task === "speak" && s.wordErrors !== undefined);
    const bad = checks.filter((s) => s.wordErrors! > GARBLED);
    const check = !checks.length ? null
      : bad.length ? h("p", { class: "warn" }, `Audio check failed on the ${bad.map((s) => BACKEND[s.backend]).join(" and ")}: the listening model could not make out the words. The voice may come out garbled on this device. Listen below.`)
      : h("p", {}, `Audio check passed: the listening model understood ${Math.round((1 - Math.max(...checks.map((s) => s.wordErrors!))) * 100)}% of the spoken words.`);
    const players = voices.map((v) => {
      const s = speech[v.at];
      const b = h("button", { class: "btn outline", type: "button" }, `Hear it (${BACKEND[s.backend]})`);
      b.addEventListener("click", () => {
        const ctx = new AudioContext();
        const buf = ctx.createBuffer(1, v.audio.length, v.rate);
        buf.copyToChannel(v.audio as Float32Array<ArrayBuffer>, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(ctx.destination); src.start();
      });
      return b;
    });
    after.replaceChildren(h("div", { class: "readout", role: "status" },
      speakGpu ? h("div", {}, h("span", { class: "big" }, `${fmtX(speakGpu.realTime!)}×`), " ", h("span", { class: "u" }, "real time, speaking")) : null,
      ...lines.map((l) => h("p", {}, l)),
      check,
      players.length ? h("div", { class: "row2" }, ...players) : null,
      ...shareActions(result, ok.length > 0)));
  }

  start.addEventListener("click", run);
  (async () => {
    device = describeDevice(await readBrowser());
    gpu = !!(await navigator.gpu?.requestAdapter().catch(() => null));
    if (!gpu) { cpu.checked = true; cpu.disabled = true; note.before(h("p", { class: "note" }, "No WebGPU here, so the test runs on the processor only.")); }
    draw();
    start.disabled = false;
  })();

  return {
    setModels(speak?: string, listen?: string) {
      if (running) return;
      if (speak) { speakId = speak; card.querySelector<HTMLInputElement>(`input[name="speak-model"][value="${speak}"]`)!.checked = true; }
      if (listen) { listenId = listen; card.querySelector<HTMLInputElement>(`input[name="listen-model"][value="${listen}"]`)!.checked = true; }
      draw();
    },
    prepare() {
      if (running) return;
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      start.focus({ preventScroll: true });
    },
  };
}
