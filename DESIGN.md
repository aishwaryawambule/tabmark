# Tabmark design sheet

## Brief

Request: build the product for this gap with a considered design, and check with the owner before publishing it.

Product: Tabmark (working name, replace). An open-source page that measures how fast a small AI language model runs in this browser tab on this device, compares engines (WebLLM, wllama) and KV-cache memory formats (f16, q8_0, q4_0), finds the longest context the device can load, and adds the result to a public results table. The gap it fills: there are browser benchmarks from one machine, and phone leaderboards for native apps, but no public, crowdsourced table of browser numbers across phones and laptops.
For: a developer deciding whether in-browser AI is fast enough on the devices their users have, or a hobbyist curious what their phone can do. In the first ten seconds they want to know how long the test takes, how much it downloads, and what they will get.
World: a test bench, a stopwatch, a public record book
The one thing: the test plan is a table that fills itself in. Each row runs in turn, the running row draws its speed live as tokens arrive, and when the last row finishes the answer is written above it in one sentence.
Ambition: finished, because it is a public tool people should trust and finish, not a show.
Mode: Kit
Named aesthetic: none
Stack: Vite + TypeScript, no UI framework. WebLLM (@mlc-ai/web-llm) and wllama (@wllama/wllama) run the models. Results are submitted as a prefilled GitHub issue; a GitHub Action validates it and appends it to `public/data/results.json`. No server.
Missing: the GitHub owner/repo for submissions (set `VITE_RESULTS_REPO`), the final product name, a real logo.

Hard limits:
- No stock photos or external images. Visuals are drawn with HTML, CSS and SVG.
- No placeholder copy and no invented numbers. The results table only shows real submitted runs; any drawn data is labelled as an example.
- Works at 1280x800 and on a 390x844 phone.
- prefers-reduced-motion stills every effect.

Decide everything yourself. Do not ask. Work in one pass and aim for your best possible work.

Done means: Run, Results and Method screens, plus the empty and failed-load states, opened in a browser at both sizes, fixed, and the closing block written.

## Pick

- Recipe: `web-app`, direction **Records** ("A public tool, pale and plain, one table people finish"). World words (test bench, stopwatch, record book) match "one table people finish". Recent: dashboard/civic used today for another product; web-app has no recent line.
- Theme (replaced, see Defaults set aside): Ice Station, "Pale, northern, a little severe. Blue-gray air." https://www.designlounge.live/themes/ice-station
- Pairing (replaced): Academic, Literata display + Public Sans text, no mono, numbers in Public Sans tabular. https://www.designlounge.live/type/academic
- Family: Quiet. Radius 6px controls, 8px cards. One solid primary, outline secondary, 40px web / 44px phone. Hairlines 1px, no shadow on tables. Focus ring 2px accent, 3px offset.

## Sources

- Hero (run plan table): Tasks table with inline editing, https://www.designlounge.live/demo/table-tasks-inline (structure only: grouped rows, state in the row, keyboard)
- Results table: Dense data table, https://www.designlounge.live/demo/dense-data-table (pinned header, 40px rows, sort buttons, selection action bar used for Compare)
- Filters: Filter toolbar, https://www.designlounge.live/demo/filter-toolbar
- Copy result: Copy, share and copy-email buttons, https://www.designlounge.live/demo/button-copy-share
- Empty list: https://www.designlounge.live/demo/list-empty-plain
- Failed load: https://www.designlounge.live/demo/load-failed-retry

## Decide the screen

Run
- Who: someone who just landed, knows roughly what an LLM is, not how this test works.
- The decision: start the test, knowing its cost (time, download).
- First thing they see: "Test how fast AI runs in this tab" and the plan table with the download size per row.
- Next action: "Start the test" (one primary). After the run: "Add to public results" (primary), "Copy result" (outline).

Results
- Who: someone comparing devices.
- The decision: which devices are fast enough for a given model and engine.
- First thing they see: the sorted table, fastest writing speed first.
- Next action: filter, or select two or three rows and "Compare".

Method
- Who: a sceptic.
- The decision: whether to trust the numbers and what gets shared.
- First thing they see: what is measured and the exact fields that are submitted.

## Idea and signature

Idea: the test plan is the page. A table of four or five rows (engine, memory format, prompt speed, writing speed) that you watch fill in, one row at a time, like a record book being written.
Signature: the running row's writing-speed cell is a live trace. Each token adds a tick to a small line drawn in the cell, so you see the speed settle before the number appears. When the run ends, the answer sentence is set in Literata above the table: "This MacBook writes 58 tokens a second with WebLLM."
Avoiding: a dark terminal "benchmark" look with a giant speedometer gauge and a neon accent, and a hero of three feature cards.

## Tokens

Colour (Ice Station, light; pair Polar Night is not used: this is not a page people leave open):
- page `--bg` #e8eef2, rows `--surface` #f7fafc, hover `--surface-2` #d5dee6
- ink #14202b / #445564 / #5e6d7a, hairline #c5d0da, strong #828d98
- primary #2a6f97 (the action and the live trace), primary-soft #cddce5 (pressed chip, selected row)
- secondary #5a7a8a (second series in Compare), tertiary #b86a1a (warning only)
- feedback colours only for live state (running, done, failed)

Type: Literata 600 for h1, h2 and the answer sentence. Public Sans for everything else. All numbers Public Sans with tabular figures (`.num`). No uppercase labels, no letter-spaced eyebrows, no mono for labels.

Scale: 14 body / 16 lead / 20 h3 / 28 h2 / 44 h1 (32 on phone). The answer sentence is the one display size on the Run screen after a run.

Layout: one 720px pass column on Run and Method, a 1080px column on Results (the table needs it). Page padding 48px 64px web, 20px 16px phone. Top bar 56px with the wordmark and three nav links (Run, Results, Method); on a phone the same three links sit in the bar, no drawer.

Motion: UI 200ms, layout 320ms, `cubic-bezier(0.2, 0.7, 0.2, 1)`. The only moving things are the live trace (driven by tokens, not a loop) and the Compare bar. Reduced motion: trace still draws, no transitions.

## Defaults set aside

- 2026-10-31, at the owner's request ("so it does not feel wholly Design Lounge"): the Ice Station theme and Academic pairing were replaced with Tabmark's own tokens (`src/styles/tokens.css`): neutral paper #f2f3f0, ink #16191d, lane green #0b6e4f, and one family, Archivo, at three widths (wide headings, condensed readouts, normal text). Corners 4px / 6px. Layout, structure and the piece briefs it was built from are unchanged.

- The dense-data-table brief uses uppercase 11px headers. Headers here are sentence case 13px, because all-caps labels read as template chrome.

Designed using Design Lounge (https://www.designlounge.live).

## Match

Column: Run and Method 720px, Results 1080px (the table needs it), on every screen
Page padding: 48px 64px web, 20px 16px phone
Control height / radius: 40px web, 44px phone / 6px controls, 8px cards
Amount face: Public Sans, tabular figures
Shell: top bar, no sidebar
Nav: Run, Results, Method
Phone nav: same three links in the bar, same order
Fails: none

## Checked

- Full run end to end in Chrome (WebGPU, Apple M5 Pro): WebLLM and wllama in 16, 8 and 4-bit memory, plus the longest-conversation probe (32,768 tokens fit). No WebGPU errors. Same on the production build.
- Phone 390x844: run, finished state, results with selection and compare. No horizontal overflow on any screen.
- Found and fixed while looking: shader compilation inflated the first request (reading speed 177 instead of about 1,700 tok/s), so each engine now gets an untimed warm-up; the sticky bar could cover a scrolled-to control (scroll-padding-top); ticking a results checkbox rebuilt the table and dropped keyboard focus.


## Redesign, 2026-10-31: data journalism

At the owner's request the page became a news-style data story: headline, model tabs, a strip of three big numbers, four charts (writing speed by device, speed by memory format, longest conversation, memory one long chat needs), every result in a table, and a short method list. The test is a sticky sidebar card. White page and black ink; colour only for data (WebLLM #2a78d6, wllama #eb6834, memory formats an orange ramp #a8421b / #eb6834 / #f2a07b), each palette checked for colour-blind separation and contrast. Type: Newsreader for text, IBM Plex Sans for charts and controls. Charts are hand-built SVG: hairline grid, dots with a page-colour ring, bars with 4px rounded ends, labels only where they help, a tooltip on every mark (hover or keyboard). No captions or filler copy.
