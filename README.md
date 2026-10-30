# Tabmark

How fast does AI run in your browser tab? Tabmark times a small language model on your own phone or computer, right in the browser, and adds the result to a public table so you can compare devices.

- **Runs in the tab.** The model downloads into the browser and runs on the device's graphics chip through WebGPU. No server, no account.
- **Two engines, three memory formats.** [WebLLM](https://github.com/mlc-ai/web-llm) and [wllama](https://github.com/ngxson/wllama) (llama.cpp) on the same model, with wllama's conversation memory (KV cache) in 16, 8 and 4 bits.
- **Five models to pick from.** SmolLM2 360M, Qwen3 0.6B (default), Llama 3.2 1B, Qwen3 1.7B and Qwen3 4B, from about 0.2 to 2.3 GB. Qwen3 4B runs in WebLLM only: its llama.cpp file is over wllama's 2 GB single-file limit.
- **Longest conversation.** Optionally loads the model with room for 4k to 32k tokens and reports the largest that fits.
- **Crowdsourced and open.** Sharing opens a prefilled GitHub issue. A GitHub Action validates it and appends it to [`public/data/results.json`](public/data/results.json), which anyone can download.

Why: browser LLM benchmarks so far come from one machine at a time, and phone leaderboards cover native apps. There is no public table of in-browser numbers across the phones and laptops people actually use.

## The page

One page, read like a news graphic: pick a model, see writing speed by device (WebLLM and wllama), what 8-bit and 4-bit memory cost in speed, the longest conversation each device loaded, and how much memory a long chat needs for each model. The test sits beside the charts; your own run appears on them, highlighted, before you share it.

## What is measured

| Number | Meaning |
| --- | --- |
| Writing (tok/s) | New tokens a second once the answer starts (decode). |
| Reading (tok/s) | Prompt tokens a second before the first word (prefill). |
| Longest conversation | Largest context window the model loads with, from 4,096 to 32,768 tokens. |

Every engine gets the same prompt (about 500 tokens) and writes exactly 128 tokens, after one untimed warm-up request. The warm-up matters: the first request on a fresh engine also compiles GPU shaders, and without it WebLLM's reading speed looked about ten times slower than it is. Speeds are the engines' own timings. See the Method page for the full details and limits.

## What gets shared

Only when you press **Add to public results** and submit the GitHub issue it opens. You see the exact JSON first. It holds the device kind, OS, browser, the GPU strings WebGPU reports, core count, the rounded memory size, the name you typed (if any), and each test's speeds. No name, IP address or prompt text. GitHub shows the username of whoever opens the issue.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # static site in dist/
```

End-to-end check in Chrome with WebGPU (downloads about 780 MB the first time):

```sh
node scripts/e2e.mjs http://localhost:5173/ full probe result.json shots
```

It fails on any uncaptured WebGPU error. Those are only console warnings, and the GPU silently skips the work, so a run can otherwise "pass" with garbage.

## Publish your own copy

1. Push to GitHub and enable **Pages** with **GitHub Actions** as the source.
2. The `Publish site` workflow builds with `VITE_RESULTS_REPO` set to the repository, so the share button points at your issues.
3. The `Add result` workflow runs on issues labelled `result` (the issue form applies the label), validates the JSON with the same rules as the page, commits it, comments, closes the issue, and republishes the site.

## Project layout

```
src/core/      pure logic, unit tested: device detection, result format and validation, plan, results table, trace
src/engines/   WebLLM and wllama adapters: load, warm up, stream, report timings
src/ui/        the page (story.ts), the SVG charts (charts.ts) and the test card (tester.ts); no framework
scripts/       ingest.mjs (GitHub Action), e2e.mjs, shots.mjs
.github/       issue form and the two workflows
```

Adding an engine means one function that loads a model, streams one completion and returns its timings (`src/engines/types.ts`).

## Licence

MIT. Models: Qwen3 (Alibaba Qwen team, Apache 2.0), Llama 3.2 (Meta, Llama 3.2 Community License), SmolLM2 (Hugging Face, Apache 2.0). Designed using [Design Lounge](https://www.designlounge.live).
