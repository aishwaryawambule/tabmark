// How the numbers are made, what is shared, and what the test cannot tell you.

import { GEN_TOKENS, PROMPT_TOKENS } from "../core/plan";
import { h } from "./dom";

export function renderMethod(root: HTMLElement) {
  const field = (name: string, what: string) => [h("dt", {}, name), h("dd", {}, what)];
  root.append(h("div", { class: "page pass" }, h("div", { class: "prose" },
    h("h1", {}, "Method"),
    h("p", { class: "lead", style: "margin-top:16px" },
      "Every number comes from a real run in someone's browser. This page says how a run works, what it measures, and what it cannot tell you."),

    h("section", { class: "section" },
      h("h2", {}, "What a run does"),
      h("ol", {},
        h("li", {}, "Downloads Qwen3 0.6B, a small open language model with 4-bit weights, into this tab. The browser keeps the copy, so the next run starts sooner."),
        h("li", {}, `Gives it the same prompt of about ${PROMPT_TOKENS} tokens and asks for exactly ${GEN_TOKENS} new tokens.`),
        h("li", {}, "Sends one short untimed request first. The first request on a fresh engine also prepares the graphics chip's programs, which would make it look slower than it is."),
        h("li", {}, "Reads the timings the engine itself reports, so the numbers match what each engine's own tools would say."),
        h("li", {}, "In the full test, runs the same model in a second engine, wllama, three times: with its conversation memory stored in 16, 8 and 4 bits."),
        h("li", {}, "If you ask for it, loads the model with room for 4,096, 8,192, 16,384 and 32,768 tokens of conversation and stops at the first size that does not fit."))),

    h("section", { class: "section" },
      h("h2", {}, "What the numbers mean"),
      h("p", {}, h("strong", {}, "Writing"), " is how many new tokens a second the model produces once it starts answering. It is what you feel while text appears. A token is about three quarters of an English word."),
      h("p", { style: "margin-top:12px" }, h("strong", {}, "Reading"), " is how many prompt tokens a second it takes in before the first word appears. Long documents and long chats depend on it."),
      h("p", { style: "margin-top:12px" }, h("strong", {}, "Memory format"), " is how the model's conversation memory (its KV cache) is stored. Fewer bits fit longer conversations in the same memory and can be slower or less accurate. Speed is measured here; accuracy is not.")),

    h("section", { class: "section" },
      h("h2", {}, "What gets shared"),
      h("p", {}, "Nothing, unless you press Add to public results and then submit the GitHub issue it opens. The issue holds one JSON block, and you see all of it first. It contains:"),
      h("dl", { class: "fieldlist" },
        field("Device", "Phone, tablet or computer; operating system and version; the name you typed, if any; CPU core count; the rounded memory size the browser reports."),
        field("Browser", "Name and major version."),
        field("Graphics", "The vendor, architecture and description WebGPU reports. Browsers often leave these vague on purpose."),
        field("Each test", "Engine and version, model, weights, memory format, token counts, reading and writing speeds, load time, or the error if it failed."),
        field("Not included", "Your name, IP address, location, or anything typed into the model. GitHub shows the username of whoever opens the issue.")),
      h("p", { style: "margin-top:12px" }, "A GitHub Action checks every submission against the same rules the page uses and rejects anything else, then adds it to ",
        h("code", {}, "public/data/results.json"), ", which anyone can download.")),

    h("section", { class: "section" },
      h("h2", {}, "What it cannot tell you"),
      h("ul", {},
        h("li", {}, "Phones slow down when they get warm or the battery is low, and laptops in power-saving mode do too. One run is one moment; the table shows the median when there are several."),
        h("li", {}, "Browsers hide the exact device model. A row is only as specific as the name people type."),
        h("li", {}, "Memory sizes from the browser are rounded and capped at 8 GB."),
        h("li", {}, "The longest-conversation check measures what loads, not how well the model uses a long conversation."),
        h("li", {}, "One model only for now. Bigger models will behave differently; the code is set up to add more."))),

    h("section", { class: "section" },
      h("h2", {}, "Run it yourself"),
      h("p", {}, "Tabmark is open source under the MIT licence. Clone it, run ", h("code", {}, "npm install"), " and ", h("code", {}, "npm run dev"),
        ", and the same test runs on your own machine. Adding an engine means writing one function that loads a model and reports its timings.")))));
}
